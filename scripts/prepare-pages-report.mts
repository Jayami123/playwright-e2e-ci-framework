import fs from "node:fs";
import path from "node:path";

/** Removes traces and videos from a merged HTML report before it is published to Pages. */
const dir = process.argv[2];
if (dir === undefined) {
  console.error("usage: prepare-pages-report.mts <report-dir>");
  process.exit(2);
}

function walk(target: string, out: string[]): void {
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

fs.rmSync(path.join(dir, "trace"), { recursive: true, force: true });
const files: string[] = [];
walk(dir, files);
for (const file of files) {
  const inData = path.relative(dir, file).split(path.sep)[0] === "data";
  if ((inData && file.endsWith(".zip")) || /\.(webm|mp4)$/i.test(file)) {
    fs.rmSync(file, { force: true });
  }
}

const left: string[] = [];
walk(dir, left);
const remaining = left.filter(
  (f) => /\.(webm|mp4|zip)$/i.test(f) || path.relative(dir, f).startsWith(`trace${path.sep}`),
);
if (remaining.length > 0) {
  console.error(`Still present after scrub: ${remaining.join(", ")}`);
  process.exit(1);
}
console.log(`scrubbed ${dir}: ${String(left.length)} files remain, no traces or videos`);
