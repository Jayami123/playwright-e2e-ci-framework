import path from "node:path";
import { findSecretHits } from "./secret-scan.js";

export const MAX_EVIDENCE_PNG_BYTES = 500 * 1024;

/** Where a Playwright JSON attachment keeps its bytes. */
export interface AttachmentRef {
  readonly path?: string;
  readonly bodyBase64?: string;
}

export interface EvidenceItem {
  /** File base name, e.g. "DOC-VIS-X03" or "TW-VIS-001-F3". */
  readonly id: string;
  readonly kind: "known-bug" | "axe";
  readonly project: string;
  /** "light" | "dark" when the attachment name carries it. */
  readonly scheme?: "light" | "dark";
  readonly testTitle: string;
  readonly png?: AttachmentRef;
  /** known-bug: the evidence JSON. axe: the whole axe-evidence JSON (findings keyed by id). */
  readonly json?: AttachmentRef;
}

/** "P1-DOC-VIS-X03" -> "DOC-VIS-X03"; "PRODUCT BUG TW-VIS-001-F3" -> "TW-VIS-001-F3". */
export function evidenceBaseName(id: string): string {
  return id
    .trim()
    .replace(/^P1-/, "")
    .replace(/^PRODUCT BUG\s+/, "");
}

const PROJECT_RANK: Readonly<Record<string, number>> = {
  "visual-desktop": 0,
  "visual-tablet": 1,
  "visual-mobile": 2,
};

function rank(item: { project: string; scheme?: "light" | "dark" }): number {
  return (PROJECT_RANK[item.project] ?? 9) * 2 + (item.scheme === "dark" ? 1 : 0);
}

/** One bug is seen in several projects: prefer desktop > tablet > mobile, light > dark. */
export function pickRepresentative<T extends { project: string; scheme?: "light" | "dark" }>(
  items: readonly T[],
): T {
  const sorted = [...items].sort((a, b) => rank(a) - rank(b));
  const first = sorted[0];
  if (first === undefined) throw new Error("pickRepresentative needs at least one item");
  return first;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mapPath(raw: string, repoRoot: string): string {
  return raw.startsWith("/work/") ? path.join(repoRoot, raw.slice("/work/".length)) : raw;
}

function toRef(att: Record<string, unknown>, repoRoot: string): AttachmentRef | undefined {
  if (typeof att.path === "string") return { path: mapPath(att.path, repoRoot) };
  if (typeof att.body === "string") return { bodyBase64: att.body };
  return undefined;
}

function testIdOf(annotations: unknown): string | undefined {
  if (!Array.isArray(annotations)) return undefined;
  for (const a of annotations) {
    if (isRecord(a) && a.type === "testId" && typeof a.description === "string") {
      return a.description;
    }
  }
  return undefined;
}

/** Pure. Walks a Playwright JSON report and lists known-bug and axe evidence attachments. */
export function collectEvidence(report: unknown, repoRoot: string): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  const visitSuite = (suite: unknown): void => {
    if (!isRecord(suite)) return;
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) visitSuite(child);
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!isRecord(spec)) continue;
      for (const t of Array.isArray(spec.tests) ? spec.tests : []) {
        if (!isRecord(t)) continue;
        const project = typeof t.projectName === "string" ? t.projectName : "";
        const title = typeof spec.title === "string" ? spec.title : "";
        const results = Array.isArray(t.results) ? (t.results as unknown[]) : [];
        const last = results[results.length - 1];
        if (!isRecord(last)) continue;
        const atts = (
          Array.isArray(last.attachments) ? (last.attachments as unknown[]) : []
        ).filter(isRecord);
        const named = (n: string): Record<string, unknown> | undefined =>
          atts.find((a) => a.name === n);
        const shot = named("known-bug-screenshot");
        const evidence = named("known-bug-evidence");
        const testId = testIdOf(t.annotations);
        if (shot !== undefined && evidence !== undefined && testId !== undefined) {
          const png = toRef(shot, repoRoot);
          const json = toRef(evidence, repoRoot);
          out.push({
            id: evidenceBaseName(testId),
            kind: "known-bug",
            project,
            testTitle: title,
            ...(png === undefined ? {} : { png }),
            ...(json === undefined ? {} : { json }),
          });
        }
        for (const att of atts) {
          const m = /^axe-evidence-(.+)\.json$/.exec(String(att.name));
          const evidenceName = m?.[1];
          if (evidenceName === undefined) continue;
          const png = atts.find((a) => a.name === `axe-evidence-${evidenceName}.png`);
          const json = toRef(att, repoRoot);
          const pngRef = png === undefined ? undefined : toRef(png, repoRoot);
          const scheme = /-(light|dark)$/.exec(evidenceName)?.[1] as "light" | "dark" | undefined;
          out.push({
            id: evidenceName,
            kind: "axe",
            project,
            testTitle: title,
            ...(scheme === undefined ? {} : { scheme }),
            ...(pngRef === undefined ? {} : { png: pngRef }),
            ...(json === undefined ? {} : { json }),
          });
        }
      }
    }
  };
  if (isRecord(report))
    for (const s of Array.isArray(report.suites) ? report.suites : []) visitSuite(s);
  return out;
}

/** Throws when an evidence file is too big or holds a secret pattern. Never prints the match. */
export function assertEvidenceFile(name: string, bytes: Uint8Array, text?: string): void {
  if (name.endsWith(".png") && bytes.byteLength > MAX_EVIDENCE_PNG_BYTES) {
    throw new Error(
      `${name}: ${String(bytes.byteLength)} bytes exceeds ${String(MAX_EVIDENCE_PNG_BYTES)} (report it; do not crop to fit)`,
    );
  }
  if (name.endsWith(".json")) {
    const hits = findSecretHits(name, text ?? Buffer.from(bytes).toString("utf8"));
    if (hits.length > 0) {
      throw new Error(
        `${name}: secret patterns found (${hits.map((h) => `${h.pattern} x${String(h.count)}`).join(", ")})`,
      );
    }
  }
}
