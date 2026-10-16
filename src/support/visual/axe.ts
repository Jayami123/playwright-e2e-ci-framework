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
  /**
   * CSS selector. Matches a node's axe target, its `data-testid` when written as [data-testid="x"],
   * or (in page) `element.matches(target)` for the node's axe target.
   */
  readonly target: string;
  /** "PRODUCT BUG <id>: …" — <id> is the issue reference recorded in docs/observations. */
  readonly finding: string;
  /** Playwright project names this entry applies to; omitted means every project. */
  readonly viewports?: readonly string[];
  /** Scan contexts this entry applies to (e.g. "light", "dark"); omitted = every context. */
  readonly contexts?: readonly string[];
}

/** Known product bugs. Each entry needs a finding; an entry that matches nothing fails the scan (stale). */
export const AXE_ALLOWLIST: readonly AxeAllowlistEntry[] = [
  {
    rule: "button-name",
    target: '[data-testid="overlay-calendar-switch"]',
    finding:
      "PRODUCT BUG CAL-A11Y-SMOKE-overlay-switch: Cal switch has no accessible name (found Phase 3 task 1)",
    // The switch is not rendered at the mobile width.
    viewports: ["visual-tablet", "visual-desktop"],
  },
];

/** Pure. Drops entries for other viewports or contexts so they are never reported stale. */
export function allowlistFor(
  allowlist: readonly AxeAllowlistEntry[],
  project: string | undefined,
  context?: string,
): AxeAllowlistEntry[] {
  return allowlist.filter(
    (e) =>
      (e.viewports === undefined || (project !== undefined && e.viewports.includes(project))) &&
      (e.contexts === undefined || (context !== undefined && e.contexts.includes(context))),
  );
}

/** Entries limited to other viewports are dropped (existing callers; no context). */
export function allowlistForProject(
  allowlist: readonly AxeAllowlistEntry[],
  project: string | undefined,
): AxeAllowlistEntry[] {
  return allowlistFor(allowlist, project);
}

export interface AxePartition<T extends AxeViolationLike> {
  /** Serious/critical violations (only their non-allowlisted nodes) that need a fix or an allowlist entry. */
  readonly blocking: T[];
  /** Serious/critical nodes covered by an allowlist entry. */
  readonly allowed: T[];
  /** Allowlist entries that matched no node. */
  readonly staleAllowlist: AxeAllowlistEntry[];
  /** Finding id (text before the first ":") -> the node targets that entry covered. */
  readonly allowedByFinding: Readonly<Record<string, readonly string[]>>;
}

/** "PRODUCT BUG DOC-VIS-004-F1: …" -> "PRODUCT BUG DOC-VIS-004-F1". */
export function findingId(finding: string): string {
  const i = finding.indexOf(":");
  return i < 0 ? finding : finding.slice(0, i);
}

const TEST_ID_SELECTOR = /^\[data-testid="([^"]+)"\]$/;
const TEST_ID_ATTRIBUTE = /\[data-testid="([^"]*)"\]/g;

/** Extra axe selectors per allowlist target (see resolveAllowlistTargets), keyed by AxeAllowlistEntry.target. */
export type ResolvedTargets = ReadonlyMap<string, readonly string[]>;

/**
 * The last compound of a selector: split on combinators (whitespace, >, +, ~) that sit outside
 * [...] brackets, quotes and \ escapes, and keep the final part.
 */
function lastCompound(selector: string): string {
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector.charAt(i);
    if (ch === "\\") {
      i += 1;
    } else if (quote !== undefined) {
      if (ch === quote) {
        quote = undefined;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
    } else if (depth === 0 && /[\s>+~]/.test(ch)) {
      start = i + 1;
    }
  }
  return selector.slice(start);
}

/** True when the selector's last compound holds the exact attribute [data-testid="<testId>"] (whole value). */
function selectorHasTestId(selector: string, testId: string): boolean {
  return [...lastCompound(selector).matchAll(TEST_ID_ATTRIBUTE)].some((m) => m[1] === testId);
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
  const byFinding: Record<string, string[]> = {};
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
        (byFinding[findingId(entry.finding)] ??= []).push(
          node.target.map(targetToString).join(" "),
        );
      }
    }
    if (open.length > 0) {
      blocking.push({ ...violation, nodes: open });
    }
    if (covered.length > 0) {
      allowed.push({ ...violation, nodes: covered });
    }
  }
  return {
    blocking,
    allowed,
    staleAllowlist: allowlist.filter((e) => !used.has(e)),
    allowedByFinding: byFinding,
  };
}

export function describeViolation(violation: AxeViolationLike): string {
  const targets = violation.nodes.flatMap((n) => n.target.map(targetToString)).join(", ");
  return `${violation.id} (${String(violation.impact)}) at ${targets}`;
}

/**
 * axe reports #id selectors, not data-testid ones. Turn each test-id allowlist target into the ids
 * of the elements currently matching it, so partitionViolations can compare whole target selectors.
 */
export async function resolveAllowlistTargets(
  page: Page,
  allowlist: readonly AxeAllowlistEntry[],
  nodeTargets: readonly string[] = [],
): Promise<ResolvedTargets> {
  const resolved = new Map<string, readonly string[]>();
  const positional = nodeTargets.filter((t) => !t.includes(">>>"));
  for (const entry of allowlist) {
    // String expression: tsconfig has no DOM lib. CSS.escape matches how axe writes #id selectors.
    const selectors = await page.evaluate<string[]>(
      `(() => {
        const out = [...document.querySelectorAll(${JSON.stringify(entry.target)})]
          .filter((e) => e.id !== "")
          .map((e) => "#" + CSS.escape(e.id));
        for (const t of ${JSON.stringify(positional)}) {
          try {
            if (document.querySelector(t)?.matches(${JSON.stringify(entry.target)})) out.push(t);
          } catch {
            /* selector axe wrote may not be valid CSS for querySelector */
          }
        }
        return out;
      })()`,
    );
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
  /** Scan context (e.g. "light", "dark", "wcag"); selects context-scoped allowlist entries. */
  readonly context?: string;
}

export interface AxeScanResult {
  readonly report: AxeReport;
  readonly partition: AxePartition<AxeViolationLike>;
  readonly blockingCount: number;
  readonly totalViolations: number;
  readonly passes: number;
}

/**
 * Scans, and re-scans up to twice when blocking nodes or stale entries remain: React ids and CSS
 * transitions can change between axe's analysis and the allowlist resolution (seen 1 in 5 runs).
 * A real bug or a truly stale entry persists across all three attempts.
 */
export async function axeScan(page: Page, opts: AxeScanOptions = {}): Promise<AxeScanResult> {
  let scan = await axeScanOnce(page, opts);
  for (
    let attempt = 1;
    attempt < 3 && (scan.partition.blocking.length > 0 || scan.partition.staleAllowlist.length > 0);
    attempt += 1
  ) {
    scan = await axeScanOnce(page, opts);
  }
  return scan;
}

async function axeScanOnce(page: Page, opts: AxeScanOptions): Promise<AxeScanResult> {
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
  const allowlist = allowlistFor(opts.allowlist ?? AXE_ALLOWLIST, opts.project, opts.context);
  const nodeTargets = results.violations
    .filter((v) => isBlocking(v.impact))
    .flatMap((v) => v.nodes.map((n) => n.target.map(targetToString).join(" ")));
  const partition = partitionViolations(
    results.violations,
    allowlist,
    await resolveAllowlistTargets(page, allowlist, nodeTargets),
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

/**
 * Per allowlisted finding, attach a viewport screenshot and a JSON of the nodes it covered
 * (axe-evidence-<name>.png/.json). They stay in the Playwright report only.
 */
export async function attachAxeEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
  scan: AxeScanResult,
): Promise<void> {
  await testInfo.attach(`axe-evidence-${name}.png`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await testInfo.attach(`axe-evidence-${name}.json`, {
    body: `${JSON.stringify(
      { url: page.url(), findings: scan.partition.allowedByFinding },
      null,
      2,
    )}
`,
    contentType: "application/json",
  });
}
