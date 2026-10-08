import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

dotenv.config({ path: path.join(ROOT, ".env") });

export function repoRoot(): string {
  return ROOT;
}

export function collectMissingEnv(entries: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(entries)
    .filter(([, value]) => value === undefined || value.trim() === "")
    .map(([name]) => name);
}

export function failOnMissingEnv(missing: readonly string[]): void {
  if (missing.length === 0) {
    return;
  }
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

export function normalizeOrigin(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Invalid base URL: ${url}`, { cause: error });
  }
  if (parsed.hostname === "localhost") {
    parsed.hostname = "127.0.0.1";
  }
  const combined = `${parsed.origin}${parsed.pathname}`;
  return combined.endsWith("/") ? combined.slice(0, -1) : combined;
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${raw}`);
  }
  return parsed;
}
