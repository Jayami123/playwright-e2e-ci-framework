import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getAdapter } from "qa-portfolio-harness";
import { getStatus } from "../src/core/http-status.js";
import {
  buildDockerRunArgs,
  buildVisualDockerEnv,
  calCredentialsFromEnv,
  calPortFromBaseUrl,
  dbPortFromUrl,
  documensoPortFromUrls,
  DOCUMENSO_PUBLIC_HOST,
  parseVisualArgs,
  playwrightImage,
  portFromLoopbackUrl,
  productsFor,
  redactDockerArgs,
  VISUAL_TEST_DIRS,
  type VisualArgs,
  type VisualEnvInput,
} from "../src/support/visual/docker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function requireHealthy(name: string, url: string, product: string): Promise<void> {
  const status = await getStatus(url, 120_000);
  if (status !== 200) {
    console.error(
      `${name} is not healthy (GET ${url} -> ${String(status)}). Start it through the harness:\n` +
        `  PRODUCTS_ROOT=D:/Jayami/Portfolio/products node node_modules/qa-portfolio-harness/scripts/up.mjs ${product}`,
    );
    process.exit(2);
  }
}

function parseArgsOrExit(): VisualArgs {
  try {
    return parseVisualArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const args = parseArgsOrExit();
  const parts: { -readonly [K in keyof VisualEnvInput]: VisualEnvInput[K] } = {};
  const forwardPorts: number[] = [];
  const extraHosts: string[] = [];

  for (const product of productsFor(args.target)) {
    if (product === "cal") {
      const baseUrl =
        process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL ?? "http://127.0.0.1:3000";
      const port = calPortFromBaseUrl(baseUrl);
      await requireHealthy("Cal", `${baseUrl.replace(/\/$/, "")}/api/auth/csrf`, "cal");
      const dbUrl = getAdapter("cal").dbUrl;
      forwardPorts.push(port, dbPortFromUrl(dbUrl));
      parts.cal = {
        port,
        dbUrl,
        webMode: process.env.CAL_WEB_MODE ?? "prod",
        credentials: calCredentialsFromEnv(process.env),
      };
    } else if (product === "documenso") {
      const listenUrl = process.env.DOCUMENSO_BASE_URL ?? "http://127.0.0.1:3001";
      const publicUrl = process.env.DOCUMENSO_PUBLIC_URL ?? `http://${DOCUMENSO_PUBLIC_HOST}:3001`;
      const dbUrl = process.env.DOCUMENSO_DB_URL;
      if (dbUrl === undefined || dbUrl === "") {
        console.error("DOCUMENSO_DB_URL is required for Documenso visual runs (see .env).");
        process.exit(2);
      }
      const inbucketOrigin = process.env.DOCUMENSO_INBUCKET_ORIGIN ?? "http://127.0.0.1:9003";
      const port = documensoPortFromUrls(listenUrl, publicUrl);
      await requireHealthy("Documenso", `${publicUrl.replace(/\/$/, "")}/signin`, "documenso");
      forwardPorts.push(
        port,
        dbPortFromUrl(dbUrl),
        portFromLoopbackUrl("DOCUMENSO_INBUCKET_ORIGIN", inbucketOrigin),
      );
      extraHosts.push(`${DOCUMENSO_PUBLIC_HOST}:127.0.0.1`);
      parts.documenso = { listenUrl, publicUrl, dbUrl, inbucketOrigin };
    } else if (product === "medusa") {
      const baseUrl = process.env.MEDUSA_BASE_URL ?? "http://127.0.0.1:9000";
      forwardPorts.push(portFromLoopbackUrl("MEDUSA_BASE_URL", baseUrl));
      await requireHealthy("Medusa", `${baseUrl.replace(/\/$/, "")}/health`, "medusa");
      parts.medusa = {
        baseUrl,
        ...(process.env.MEDUSA_ADMIN_EMAIL === undefined
          ? {}
          : { email: process.env.MEDUSA_ADMIN_EMAIL }),
        ...(process.env.MEDUSA_ADMIN_PASSWORD === undefined
          ? {}
          : { password: process.env.MEDUSA_ADMIN_PASSWORD }),
      };
    } else {
      const baseUrl = process.env.TWENTY_BASE_URL ?? "http://127.0.0.1:3002";
      forwardPorts.push(portFromLoopbackUrl("TWENTY_BASE_URL", baseUrl));
      await requireHealthy("Twenty", `${baseUrl.replace(/\/$/, "")}/healthz`, "twenty");
      parts.twenty = {
        baseUrl,
        ...(process.env.TWENTY_EMAIL === undefined ? {} : { email: process.env.TWENTY_EMAIL }),
        ...(process.env.TWENTY_PASSWORD === undefined
          ? {}
          : { password: process.env.TWENTY_PASSWORD }),
      };
    }
  }

  const image = playwrightImage(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const userInfo = process.platform === "linux" ? os.userInfo() : undefined;
  const dockerArgs = buildDockerRunArgs({
    mode: args.mode,
    image,
    hostRoot: ROOT,
    hostPlatform: process.platform,
    forwardPorts,
    extraHosts,
    testPaths: args.target === "all" ? [] : [VISUAL_TEST_DIRS[args.target]],
    ...(userInfo === undefined
      ? {}
      : { uidGid: `${String(userInfo.uid)}:${String(userInfo.gid)}` }),
    env: buildVisualDockerEnv({
      ...parts,
      ...(process.env.CI === undefined ? {} : { ci: process.env.CI }),
      ...(process.env.P1_PW_REPORT_ID === undefined
        ? {}
        : { reportId: process.env.P1_PW_REPORT_ID }),
    }),
    extraArgs: args.extraArgs,
  });
  console.log(`docker ${redactDockerArgs(dockerArgs).slice(0, -1).join(" ")} '<inner command>'`);
  const result = spawnSync("docker", dockerArgs, { stdio: "inherit" });
  if (result.error !== undefined) {
    console.error(`docker failed to start (is Docker Desktop running?): ${result.error.message}`);
    process.exit(2);
  }
  process.exit(result.status ?? 1);
}

await main();
