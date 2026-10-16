import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertEvidenceFile,
  collectEvidence,
  pickRepresentative,
  type AttachmentRef,
  type EvidenceItem,
} from "../src/support/report/bug-evidence.js";
import { findingId } from "../src/support/visual/axe.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRef(ref: AttachmentRef | undefined): Buffer | undefined {
  if (ref === undefined) return undefined;
  if (ref.path !== undefined) return fs.readFileSync(ref.path);
  if (ref.bodyBase64 !== undefined) return Buffer.from(ref.bodyBase64, "base64");
  return undefined;
}

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outDir = outIdx >= 0 ? argv[outIdx + 1] : undefined;
const reports = argv.filter((_, i) => i !== outIdx && i !== outIdx + 1);
if (outDir === undefined || reports.length === 0) {
  console.error("usage: export-bug-evidence.mts --out <dir> <results.json>...");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const items: EvidenceItem[] = [];
for (const file of reports) {
  items.push(...collectEvidence(JSON.parse(fs.readFileSync(file, "utf8")) as unknown, ROOT));
}

const written: string[] = [];
function write(name: string, bytes: Buffer | string): void {
  const buf = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  assertEvidenceFile(name, buf, name.endsWith(".json") ? buf.toString("utf8") : undefined);
  fs.writeFileSync(path.join(outDir as string, name), buf);
  written.push(name);
}

// known-bug: one PNG + JSON per bug id
const known = new Map<string, EvidenceItem[]>();
for (const it of items.filter((i) => i.kind === "known-bug")) {
  known.set(it.id, [...(known.get(it.id) ?? []), it]);
}
for (const [id, group] of known) {
  const rep = pickRepresentative(group);
  const png = readRef(rep.png);
  const json = readRef(rep.json);
  if (png === undefined || json === undefined) continue;
  write(`${id}.png`, png);
  write(`${id}.json`, json);
}

// axe: one PNG + JSON per allowlisted finding id
interface AxeGroup extends EvidenceItem {
  readonly nodes: string[];
}
const perFinding = new Map<string, AxeGroup[]>();
for (const it of items.filter((i) => i.kind === "axe")) {
  const body = readRef(it.json);
  if (body === undefined) continue;
  const parsed = JSON.parse(body.toString("utf8")) as { findings?: Record<string, string[]> };
  for (const [finding, nodes] of Object.entries(parsed.findings ?? {})) {
    const id = findingId(finding).replace(/^PRODUCT BUG\s+/, "");
    perFinding.set(id, [...(perFinding.get(id) ?? []), { ...it, nodes }]);
  }
}
for (const [id, group] of perFinding) {
  const rep = pickRepresentative(group);
  const png = readRef(rep.png);
  if (png === undefined) continue;
  write(`${id}.png`, png);
  write(
    `${id}.json`,
    `${JSON.stringify(
      { finding: id, test: rep.testTitle, project: rep.project, nodes: rep.nodes },
      null,
      2,
    )}\n`,
  );
}

for (const name of written.sort()) console.log(name);
console.log(`${String(written.length)} files written to ${outDir}`);
