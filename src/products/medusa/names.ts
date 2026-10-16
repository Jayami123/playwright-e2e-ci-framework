import { fakeOrg } from "qa-portfolio-harness";

export function medusaQaPrefix(seed: number | string, worker: number | string): string {
  return `P1-QA-${String(seed)}-${String(worker)}`;
}

export function medusaQaTitle(prefix: string, leaf?: string): string {
  const suffix = leaf ?? fakeOrg().name;
  return `${prefix}-${suffix}`;
}

/** Prefixed so QA options never touch the seeded global "Size" / "Color". */
export function medusaQaOptionTitle(prefix: string, name: string): string {
  return `${prefix}-${name}`;
}

export function medusaQaEmail(prefix: string, leaf: string): string {
  return `${prefix}-${leaf}@qa.local`.toLowerCase().replace(/[^a-z0-9@.-]/g, "-");
}

/**
 * Title of exactly `length` UTF-16 units that starts with the QA prefix, so the sweep still matches it.
 * Fill is repeated by code point and a surrogate pair is never split; any leftover unit is an ASCII "x".
 */
export function medusaQaTitleOfLength(prefix: string, length: number, fill: string): string {
  const head = `${prefix}-L${String(length)}-`;
  if (head.length > length) {
    throw new Error(`prefix "${prefix}" is longer than the requested ${String(length)} units`);
  }
  const points = Array.from(fill);
  if (points.length === 0) {
    throw new Error("fill must not be empty");
  }
  let title = head;
  for (let i = 0; title.length < length; i += 1) {
    const point = points[i % points.length] ?? "x";
    if (title.length + point.length > length) {
      break;
    }
    title += point;
  }
  return title.padEnd(length, "x");
}

/** Constant per worker and leaf: visual baselines must not change with the run (plan D2). */
export function medusaQaVisualEmail(worker: number | string, leaf: string): string {
  return `p1-qa-vis-${String(worker)}-${leaf}@qa.local`.toLowerCase();
}
