import type { VisualProduct } from "./masks.js";

export type VisualMode = "update" | "test";
export type VisualTarget = VisualProduct | "all";

export const VISUAL_PROJECTS = ["visual-mobile", "visual-tablet", "visual-desktop"] as const;
export const CONTAINER_WORKDIR = "/work";
export const DOCUMENSO_PUBLIC_HOST = "p1.lvh.me";
/** Playwright positional filters; "all" runs every visual/a11y/i18n spec. */
export const VISUAL_TEST_DIRS: Readonly<Record<VisualProduct, string>> = {
  cal: "tests/cal",
  documenso: "tests/documenso",
  twenty: "tests/twenty",
  medusa: "tests/medusa",
};

export interface VisualArgs {
  readonly mode: VisualMode;
  readonly target: VisualTarget;
  readonly extraArgs: readonly string[];
}

/** argv after "tsx scripts/visual-docker.mts": <update|test> [--product=<p>] [playwright args…]. */
export function parseVisualArgs(argv: readonly string[]): VisualArgs {
  const [mode, ...rest] = argv;
  if (mode !== "update" && mode !== "test") {
    throw new Error(
      "usage: visual-docker.mts <update|test> [--product=cal|documenso|twenty|medusa|all] [playwright args]",
    );
  }
  let target: VisualTarget = "all";
  const extraArgs: string[] = [];
  for (const arg of rest) {
    const m = /^--product=(cal|documenso|twenty|medusa|all)$/.exec(arg);
    if (m?.[1] !== undefined) {
      target = m[1] as VisualTarget;
    } else if (arg.startsWith("--product")) {
      throw new Error(`unknown --product value: ${arg}`);
    } else {
      extraArgs.push(arg);
    }
  }
  return { mode, target, extraArgs };
}

export function productsFor(target: VisualTarget): VisualProduct[] {
  return target === "all" ? ["cal", "documenso", "twenty", "medusa"] : [target];
}

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

/** Only http://127.0.0.1:<port>. "localhost" can resolve to ::1 in the container; the proxy binds IPv4. */
export function portFromLoopbackUrl(envName: string, raw: string): number {
  const url = new URL(raw);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "") {
    throw new Error(`Visual runs need ${envName}=http://127.0.0.1:<port>, got ${raw}`);
  }
  return Number(url.port);
}

export function calPortFromBaseUrl(baseUrl: string): number {
  return portFromLoopbackUrl("CAL_E2E_BASE_URL", baseUrl);
}

/** Documenso: the public URL must be http://p1.lvh.me:<same port as the listen URL>. */
export function documensoPortFromUrls(listenUrl: string, publicUrl: string): number {
  const port = portFromLoopbackUrl("DOCUMENSO_BASE_URL", listenUrl);
  const pub = new URL(publicUrl);
  if (pub.hostname !== DOCUMENSO_PUBLIC_HOST || Number(pub.port) !== port) {
    throw new Error(
      `DOCUMENSO_PUBLIC_URL must be http://${DOCUMENSO_PUBLIC_HOST}:${String(port)}, got ${publicUrl}`,
    );
  }
  return port;
}

export function dbPortFromUrl(dbUrl: string): number {
  const port = new URL(dbUrl).port;
  if (port === "") {
    throw new Error(`Cal DB URL needs an explicit port, got ${dbUrl}`);
  }
  return Number(port);
}

/** Harness loadConfig() requires every product dir under PRODUCTS_ROOT (seen in Step 0). */
export const CONTAINER_PRODUCTS_ROOT = "/tmp/p1-products";
const STUB_PRODUCTS = ["cal", "documenso", "medusa-dtc-starter", "twenty-CRM"] as const;

/** Keep the configured credentials, port, database and query; only the host moves to IPv4 loopback. */
export function containerDbUrl(dbUrl: string): string {
  const url = new URL(dbUrl);
  if (url.port === "") {
    throw new Error(`DB URL needs an explicit port, got ${dbUrl}`);
  }
  url.hostname = "127.0.0.1";
  return url.toString();
}

export interface VisualEnvInput {
  readonly cal?: {
    readonly port: number;
    readonly dbUrl: string;
    readonly webMode: string;
    /** Seed logins; Cal's loadConfig() needs them in every Cal test. Local runs also get them from the mounted .env. */
    readonly credentials?: Readonly<Record<string, string>>;
  };
  readonly documenso?: {
    readonly listenUrl: string;
    readonly publicUrl: string;
    readonly dbUrl: string;
    readonly inbucketOrigin: string;
  };
  readonly twenty?: {
    readonly baseUrl: string;
    readonly email?: string;
    readonly password?: string;
  };
  readonly medusa?: {
    readonly baseUrl: string;
    readonly email?: string;
    readonly password?: string;
  };
  /** Host env CI / P1_PW_REPORT_ID, passed through so CI writes blob/JSON reports. */
  readonly ci?: string;
  readonly reportId?: string;
}

/** Container env for a visual run: IPv4 URLs only (localhost can be ::1; the proxies bind 127.0.0.1). */
export function buildVisualDockerEnv(input: VisualEnvInput): Record<string, string> {
  const env: Record<string, string> = {
    P1_PLAYWRIGHT_HARNESS: "0",
    HOME: "/tmp",
    PRODUCTS_ROOT: CONTAINER_PRODUCTS_ROOT,
  };
  if (input.cal !== undefined) {
    env.CAL_E2E_BASE_URL = `http://127.0.0.1:${String(input.cal.port)}`;
    env.CAL_WEB_MODE = input.cal.webMode;
    env.CAL_DB_URL = containerDbUrl(input.cal.dbUrl);
    Object.assign(env, input.cal.credentials ?? {});
  }
  if (input.documenso !== undefined) {
    env.DOCUMENSO_BASE_URL = input.documenso.listenUrl;
    env.DOCUMENSO_PUBLIC_URL = input.documenso.publicUrl;
    env.DOCUMENSO_DB_URL = containerDbUrl(input.documenso.dbUrl);
    env.DOCUMENSO_INBUCKET_ORIGIN = input.documenso.inbucketOrigin;
  }
  if (input.twenty !== undefined) {
    env.TWENTY_BASE_URL = input.twenty.baseUrl;
    if (input.twenty.email !== undefined && input.twenty.email !== "") {
      env.TWENTY_EMAIL = input.twenty.email;
    }
    if (input.twenty.password !== undefined && input.twenty.password !== "") {
      env.TWENTY_PASSWORD = input.twenty.password;
    }
  }
  if (input.medusa !== undefined) {
    env.MEDUSA_BASE_URL = input.medusa.baseUrl;
    if (input.medusa.email !== undefined && input.medusa.email !== "") {
      env.MEDUSA_ADMIN_EMAIL = input.medusa.email;
    }
    if (input.medusa.password !== undefined && input.medusa.password !== "") {
      env.MEDUSA_ADMIN_PASSWORD = input.medusa.password;
    }
  }
  if (input.ci !== undefined && input.ci !== "") env.CI = input.ci;
  if (input.reportId !== undefined && input.reportId !== "") env.P1_PW_REPORT_ID = input.reportId;
  return env;
}

export const CAL_CREDENTIAL_ENV = [
  "CAL_E2E_EMAIL",
  "CAL_E2E_PASSWORD",
  "CAL_DST_EMAIL",
  "CAL_DST_PASSWORD",
] as const;

/** Pure. The Cal seed credentials present (non-empty) in the host env; passed into the container. */
export function calCredentialsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CAL_CREDENTIAL_ENV) {
    const value = env[key];
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

export interface DockerRunInput {
  readonly mode: VisualMode;
  readonly image: string;
  readonly hostRoot: string;
  readonly hostPlatform: NodeJS.Platform;
  /** Host ports the container must reach on 127.0.0.1 (web, DB, mail). */
  readonly forwardPorts: readonly number[];
  /** "--add-host" entries, e.g. "p1.lvh.me:127.0.0.1". */
  readonly extraHosts: readonly string[];
  /** Playwright positional path filters (VISUAL_TEST_DIRS values); empty = all. */
  readonly testPaths: readonly string[];
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
    ...input.testPaths.map(shQuote),
    ...input.extraArgs.map(shQuote),
  ].join(" ");
  const stubs = `mkdir -p ${STUB_PRODUCTS.map((p) => `${CONTAINER_PRODUCTS_ROOT}/${p}`).join(" ")} && `;
  const proxies = [...new Set(input.forwardPorts)]
    .map(
      (port) =>
        `node scripts/visual-docker-proxy.mjs ${String(port)} host.docker.internal ${String(port)} & ` +
        `until (exec 3<>/dev/tcp/127.0.0.1/${String(port)}) 2>/dev/null; do sleep 0.2; done; `,
    )
    .join("");
  const inner = linuxHost ? `${stubs}${playwright}` : `${stubs}${proxies}${playwright}`;

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
  for (const host of input.extraHosts) {
    args.push("--add-host", host);
  }
  for (const [key, value] of Object.entries(input.env)) {
    args.push("-e", `${key}=${value}`);
  }
  args.push(input.image, "bash", "-c", inner);
  return args;
}

/**
 * Copy of docker argv that is safe to print: masks the password in any KEY=scheme://user:pass@host
 * value, and the whole value of any KEY containing PASSWORD, SECRET or TOKEN.
 */
export function redactDockerArgs(args: readonly string[]): string[] {
  return args.map((arg) =>
    arg
      .replace(/^([A-Za-z0-9_]+=[a-z][a-z0-9+.-]*:\/\/[^:/@\s]*:)\S*@/, "$1***@")
      .replace(/^([A-Za-z0-9_]*(?:PASSWORD|SECRET|TOKEN)[A-Za-z0-9_]*=).*$/, "$1***"),
  );
}
