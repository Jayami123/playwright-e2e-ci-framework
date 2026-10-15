import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getStatus } from "../src/core/http-status.js";
import {
  buildDockerRunArgs,
  calPortFromBaseUrl,
  playwrightImage,
  type VisualMode,
} from "../src/support/visual/docker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function parseMode(arg: string | undefined): VisualMode {
  if (arg === "update" || arg === "test") {
    return arg;
  }
  console.error("usage: tsx scripts/visual-docker.mts <update|test> [extra playwright args]");
  process.exit(2);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2]);
  const baseUrl =
    process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL ?? "http://127.0.0.1:3000";
  const calPort = calPortFromBaseUrl(baseUrl);
  const csrf = await getStatus(`${baseUrl.replace(/\/$/, "")}/api/auth/csrf`, 120_000);
  if (csrf !== 200) {
    console.error(
      `Cal is not healthy at ${baseUrl} (GET /api/auth/csrf -> ${String(csrf)}). Start it through the harness:\n` +
        "  PRODUCTS_ROOT=D:/Jayami/Portfolio/products node node_modules/qa-portfolio-harness/scripts/up.mjs cal",
    );
    process.exit(2);
  }
  const image = playwrightImage(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const userInfo = process.platform === "linux" ? os.userInfo() : undefined;
  const args = buildDockerRunArgs({
    mode,
    image,
    hostRoot: ROOT,
    hostPlatform: process.platform,
    calPort,
    ...(userInfo === undefined
      ? {}
      : { uidGid: `${String(userInfo.uid)}:${String(userInfo.gid)}` }),
    env: {
      P1_PLAYWRIGHT_HARNESS: "0",
      CAL_E2E_BASE_URL: `http://127.0.0.1:${String(calPort)}`,
      CAL_WEB_MODE: process.env.CAL_WEB_MODE ?? "prod",
      HOME: "/tmp",
    },
    extraArgs: process.argv.slice(3),
  });
  console.log(`docker ${args.slice(0, -1).join(" ")} '<inner command>'`);
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error !== undefined) {
    console.error(`docker failed to start (is Docker Desktop running?): ${result.error.message}`);
    process.exit(2);
  }
  process.exit(result.status ?? 1);
}

await main();
