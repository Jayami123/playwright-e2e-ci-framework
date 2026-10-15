export type VisualMode = "update" | "test";

export const VISUAL_PROJECTS = ["visual-mobile", "visual-tablet", "visual-desktop"] as const;
export const CONTAINER_WORKDIR = "/work";

export function playwrightImage(packageJsonText: string): string {
  const pkg = JSON.parse(packageJsonText) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const version =
    pkg.devDependencies?.["@playwright/test"] ?? pkg.dependencies?.["@playwright/test"];
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `@playwright/test must be pinned to an exact version in package.json (got ${String(version)}); the Docker image tag must match it (ADR 0017)`,
    );
  }
  return `mcr.microsoft.com/playwright:v${version}-jammy`;
}

/** Only http://127.0.0.1:<port>. "localhost" can resolve to ::1 in the container, and the proxy binds IPv4. */
export function calPortFromBaseUrl(baseUrl: string): number {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "") {
    throw new Error(`Visual runs need CAL_E2E_BASE_URL=http://127.0.0.1:<port>, got ${baseUrl}`);
  }
  return Number(url.port);
}

export interface DockerRunInput {
  readonly mode: VisualMode;
  readonly image: string;
  readonly hostRoot: string;
  readonly hostPlatform: NodeJS.Platform;
  readonly calPort: number;
  readonly uidGid?: string; // "1001:1001" on Linux; omitted elsewhere
  readonly env: Readonly<Record<string, string>>;
  readonly extraArgs: readonly string[];
}

function shQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function buildDockerRunArgs(input: DockerRunInput): string[] {
  const linuxHost = input.hostPlatform === "linux";
  const projects = VISUAL_PROJECTS.map((p) => `--project=${p}`);
  const update = input.mode === "update" ? ["--update-snapshots=all"] : [];
  const playwright = [
    "node node_modules/@playwright/test/cli.js test",
    ...projects,
    ...update,
    ...input.extraArgs.map(shQuote),
  ].join(" ");
  const proxy =
    `node scripts/visual-docker-proxy.mjs ${String(input.calPort)} host.docker.internal ${String(input.calPort)} & ` +
    `until (exec 3<>/dev/tcp/127.0.0.1/${String(input.calPort)}) 2>/dev/null; do sleep 0.2; done; `;
  const inner = linuxHost ? playwright : `${proxy}${playwright}`;

  const args = ["run", "--rm", "--init", "--ipc=host"];
  args.push("--mount", `type=bind,source=${input.hostRoot},target=${CONTAINER_WORKDIR}`);
  args.push("-w", CONTAINER_WORKDIR);
  if (linuxHost) {
    args.push("--network", "host");
    if (input.uidGid !== undefined) {
      args.push("--user", input.uidGid);
    }
  } else {
    args.push("--add-host", "host.docker.internal:host-gateway");
  }
  for (const [key, value] of Object.entries(input.env)) {
    args.push("-e", `${key}=${value}`);
  }
  args.push(input.image, "bash", "-c", inner);
  return args;
}
