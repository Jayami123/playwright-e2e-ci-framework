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
