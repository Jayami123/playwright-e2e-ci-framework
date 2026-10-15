import { AxeBuilder } from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import {
  buildAxeReport,
  formatAxeReport,
  isBlocking,
  targetToString,
  type AxeReport,
  type AxeViolationLike,
} from "./axe-format.js";

export const AXE_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

export interface AxeAllowlistEntry {
  readonly rule: string;
  /** CSS selector. Matches a node's axe target, or its `data-testid` when written as [data-testid="x"]. */
  readonly target: string;
  readonly finding: string;
  /** Playwright project names this entry applies to; omitted means every project. */
  readonly viewports?: readonly string[];
}

/** Known product bugs. Each entry needs a finding; an entry that matches nothing fails the scan (stale). */
export const AXE_ALLOWLIST: readonly AxeAllowlistEntry[] = [
  {
    rule: "button-name",
    target: '[data-testid="overlay-calendar-switch"]',
    finding: "Cal switch has no accessible name (PRODUCT BUG, found Phase 3 task 1)",
    // The switch is not rendered at the mobile width.
    viewports: ["visual-tablet", "visual-desktop"],
  },
];

/** Pure. Entries limited to other viewports are dropped, so they are never reported stale here. */
export function allowlistForProject(
  allowlist: readonly AxeAllowlistEntry[],
  project: string | undefined,
): AxeAllowlistEntry[] {
  return allowlist.filter(
    (e) => e.viewports === undefined || (project !== undefined && e.viewports.includes(project)),
  );
}

export interface AxePartition<T extends AxeViolationLike> {
  /** Serious/critical violations (only their non-allowlisted nodes) that need a fix or an allowlist entry. */
  readonly blocking: T[];
  /** Serious/critical nodes covered by an allowlist entry. */
  readonly allowed: T[];
  /** Allowlist entries that matched no node. */
  readonly staleAllowlist: AxeAllowlistEntry[];
}

const TEST_ID_SELECTOR = /^\[data-testid="([^"]+)"\]$/;
const TEST_ID_ATTRIBUTE = /\[data-testid="([^"]*)"\]/g;

/** Extra axe selectors per allowlist target (see resolveAllowlistTargets), keyed by AxeAllowlistEntry.target. */
export type ResolvedTargets = ReadonlyMap<string, readonly string[]>;

/** True when the selector holds the exact attribute [data-testid="<testId>"] (whole value, not a prefix). */
function selectorHasTestId(selector: string, testId: string): boolean {
  return [...selector.matchAll(TEST_ID_ATTRIBUTE)].some((m) => m[1] === testId);
}

/** Matches on node.target only; node.html is truncated by axe and never decides. */
function nodeMatches(
  node: AxeViolationLike["nodes"][number],
  entry: AxeAllowlistEntry,
  resolved: ResolvedTargets,
): boolean {
  const selectors = node.target.map(targetToString);
  const testId = TEST_ID_SELECTOR.exec(entry.target)?.[1];
  const extra = resolved.get(entry.target) ?? [];
  return selectors.some(
    (selector) =>
      selector === entry.target ||
      extra.includes(selector) ||
      (testId !== undefined && selectorHasTestId(selector, testId)),
  );
}

/** Pure. Only serious and critical violations are partitioned; others are ignored. */
export function partitionViolations<T extends AxeViolationLike>(
  violations: readonly T[],
  allowlist: readonly AxeAllowlistEntry[],
  resolved: ResolvedTargets = new Map(),
): AxePartition<T> {
  const used = new Set<AxeAllowlistEntry>();
  const blocking: T[] = [];
  const allowed: T[] = [];
  for (const violation of violations) {
    if (!isBlocking(violation.impact)) {
      continue;
    }
    const open: T["nodes"][number][] = [];
    const covered: T["nodes"][number][] = [];
    for (const node of violation.nodes) {
      const entry = allowlist.find(
        (e) => e.rule === violation.id && nodeMatches(node, e, resolved),
      );
      if (entry === undefined) {
        open.push(node);
      } else {
        used.add(entry);
        covered.push(node);
      }
    }
    if (open.length > 0) {
      blocking.push({ ...violation, nodes: open });
    }
    if (covered.length > 0) {
      allowed.push({ ...violation, nodes: covered });
    }
  }
  return { blocking, allowed, staleAllowlist: allowlist.filter((e) => !used.has(e)) };
}

export function describeViolation(violation: AxeViolationLike): string {
  const targets = violation.nodes.flatMap((n) => n.target.map(targetToString)).join(", ");
  return `${violation.id} (${String(violation.impact)}) at ${targets}`;
}

interface ElementWithId {
  readonly id: string;
}

/**
 * axe reports #id selectors, not data-testid ones. Turn each test-id allowlist target into the ids
 * of the elements currently matching it, so partitionViolations can compare whole target selectors.
 */
export async function resolveAllowlistTargets(
  page: Page,
  allowlist: readonly AxeAllowlistEntry[],
): Promise<ResolvedTargets> {
  const resolved = new Map<string, readonly string[]>();
  for (const entry of allowlist) {
    const ids = await page
      .locator(entry.target)
      .evaluateAll((elements: readonly ElementWithId[]) => elements.map((e) => e.id));
    const selectors = ids.filter((id) => id !== "").map((id) => `#${id}`);
    resolved.set(entry.target, selectors);
  }
  return resolved;
}

export interface AxeScanOptions {
  readonly rules?: readonly string[];
  readonly include?: readonly string[];
  readonly allowlist?: readonly AxeAllowlistEntry[];
  /** Playwright project name (testInfo.project.name); selects viewport-scoped allowlist entries. */
  readonly project?: string;
}

export interface AxeScanResult {
  readonly report: AxeReport;
  readonly partition: AxePartition<AxeViolationLike>;
  readonly blockingCount: number;
  readonly totalViolations: number;
  readonly passes: number;
}

export async function axeScan(page: Page, opts: AxeScanOptions = {}): Promise<AxeScanResult> {
  let builder = new AxeBuilder({ page });
  // withRules and withTags both set axe runOnly; use one, never both.
  builder =
    opts.rules !== undefined && opts.rules.length > 0
      ? builder.withRules([...opts.rules])
      : builder.withTags([...AXE_WCAG_TAGS]);
  for (const selector of opts.include ?? []) {
    builder = builder.include(selector);
  }
  const results = await builder.analyze();
  const allowlist = allowlistForProject(opts.allowlist ?? AXE_ALLOWLIST, opts.project);
  const partition = partitionViolations(
    results.violations,
    allowlist,
    await resolveAllowlistTargets(page, allowlist),
  );
  return {
    report: buildAxeReport(page.url(), results.violations, new Date().toISOString()),
    partition,
    blockingCount: partition.blocking.length,
    totalViolations: results.violations.length,
    passes: results.passes.length,
  };
}

export async function attachAxeReport(
  testInfo: TestInfo,
  name: string,
  report: AxeReport,
): Promise<void> {
  await testInfo.attach(`${name}.json`, {
    body: formatAxeReport(report),
    contentType: "application/json",
  });
}
