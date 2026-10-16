import fs from "node:fs";
import path from "node:path";
import { findSecretHits, type SecretHit } from "../src/support/report/secret-scan.js";

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i;

function walk(target: string, out: string[]): void {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) walk(path.join(target, entry), out);
  } else if (!BINARY.test(target)) {
    out.push(target);
  }
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: scan-report-secrets.mts <dir|file>...");
  process.exit(2);
}
const files: string[] = [];
for (const t of targets) walk(t, files);

const hits: SecretHit[] = [];
for (const file of files) hits.push(...findSecretHits(file, fs.readFileSync(file, "utf8")));

// Pattern names and counts only; never the matched value.
for (const h of hits) console.log(`${h.file} ${h.pattern} ${String(h.count)}`);
console.log(`scanned ${String(files.length)} files, ${String(hits.length)} hits`);
process.exit(hits.length > 0 ? 1 : 0);
