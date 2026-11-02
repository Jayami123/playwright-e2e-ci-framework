import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAudit,
  findingsFromAuditReport,
  parseAllowlist,
} from "../src/support/audit/audit-gate.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = path.join(root, ".github", "audit-allowlist.json");

const run = spawnSync("npm", ["audit", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

let report: unknown;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("npm audit did not return JSON. stderr:");
  console.error(run.stderr);
  process.exit(1);
}

const error = (report as { error?: { summary?: string } }).error;
if (error !== undefined) {
  console.error(`npm audit failed: ${error.summary ?? "unknown error"}`);
  process.exit(1);
}

const allowlist = parseAllowlist(JSON.parse(fs.readFileSync(allowlistPath, "utf8")));
const today = new Date().toISOString().slice(0, 10);
const result = evaluateAudit(findingsFromAuditReport(report), allowlist, today);

for (const f of result.allowed) {
  console.log(`allowed (allowlisted): ${f.id} ${f.package} ${f.severity}`);
}
for (const f of result.blocking) {
  console.error(`::error::blocking advisory: ${f.id} ${f.package} ${f.severity} ${f.url}`);
}
for (const e of result.expired) {
  console.error(`::error::allowlist entry expired ${e.expires}: ${e.id} ${e.package}`);
}
for (const e of result.stale) {
  console.error(`::error::allowlist entry no longer reported, remove it: ${e.id} ${e.package}`);
}

if (!result.ok) {
  console.error("audit gate failed");
  process.exit(1);
}
console.log(
  `audit gate passed (${String(result.allowed.length)} allowlisted advisories, as of ${today})`,
);
