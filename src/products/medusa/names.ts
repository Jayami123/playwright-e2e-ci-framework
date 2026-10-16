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
