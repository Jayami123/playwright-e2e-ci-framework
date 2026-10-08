import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

export const AUTH_STATE_PATH = path.join(ROOT, ".auth", "cal-pro.json");

export function calBaseUrl(): string {
  return (process.env.CAL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
}

export function calCredentials(): { email: string; password: string } {
  const email = process.env.CAL_E2E_EMAIL ?? "pro@example.com";
  const password = process.env.CAL_E2E_PASSWORD;
  if (!password) {
    throw new Error(
      "Set CAL_E2E_PASSWORD in .env. The cal.diy README documents the seed user password (same as the username).",
    );
  }
  return { email, password };
}

export function skipLiveCal(): boolean {
  if (process.env.CAL_E2E === "0") return true;
  if (process.env.CI && !process.env.CAL_E2E_BASE_URL) return true;
  return false;
}

/** webpack / next-dev first-compile waits. Default is next start (short). */
export function isCalWebDev(): boolean {
  return process.env.CAL_WEB_MODE === "dev";
}

/** Page/shell waits. 180s is CAL_WEB_MODE=dev first compile only. */
export function calWaitMs(): number {
  return isCalWebDev() ? 180_000 : 15_000;
}

/** Editor warmup and FW-003 wall clock. 600s is CAL_WEB_MODE=dev first compile only. */
export function calEditorWaitMs(): number {
  return isCalWebDev() ? 600_000 : 30_000;
}

export function calTestTimeoutMs(): number {
  return isCalWebDev() ? 180_000 : 60_000;
}

export function calExpectTimeoutMs(): number {
  return isCalWebDev() ? 20_000 : 5_000;
}

export function calNavigationTimeoutMs(): number {
  return isCalWebDev() ? 180_000 : 30_000;
}

export function calActionTimeoutMs(): number {
  return isCalWebDev() ? 60_000 : 10_000;
}

export function calCsrfTimeoutMs(): number {
  return isCalWebDev() ? 120_000 : 15_000;
}

export function calWarmupTimeoutMs(pathname: string): number {
  const editor = pathname.includes("/event-types/") && /\/\d+$/.test(pathname);
  if (isCalWebDev()) return editor ? 600_000 : 180_000;
  return 15_000;
}

export function calUpDeadlineMs(): number {
  return isCalWebDev() ? 180_000 : 60_000;
}
