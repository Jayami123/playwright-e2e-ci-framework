export type AxeImpact = "minor" | "moderate" | "serious" | "critical";

export interface AxeNodeLike {
  readonly target: readonly unknown[];
  readonly html?: string;
  readonly failureSummary?: string;
}

export interface AxeViolationLike {
  readonly id: string;
  readonly impact?: AxeImpact | null;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: readonly AxeNodeLike[];
}

export interface AxeReportEntry {
  readonly id: string;
  readonly impact: "serious" | "critical";
  readonly help: string;
  readonly helpUrl: string;
  readonly targets: readonly string[];
}

export interface AxeReport {
  readonly url: string;
  readonly scannedAt: string;
  readonly counts: Readonly<Record<AxeImpact | "unknown", number>>;
  readonly blocking: readonly AxeReportEntry[];
}

export function isBlocking(impact: AxeImpact | null | undefined): impact is "serious" | "critical" {
  return impact === "serious" || impact === "critical";
}

/** Keeps serious and critical only, in axe's original order. */
export function filterBlockingViolations<T extends AxeViolationLike>(
  violations: readonly T[],
): T[] {
  return violations.filter((v) => isBlocking(v.impact));
}

/** Shadow-DOM targets arrive as string[]; join them with " >>> ". */
export function targetToString(target: unknown): string {
  return Array.isArray(target) ? target.map(String).join(" >>> ") : String(target);
}

export function buildAxeReport(
  url: string,
  violations: readonly AxeViolationLike[],
  scannedAt: string,
): AxeReport {
  const counts = { minor: 0, moderate: 0, serious: 0, critical: 0, unknown: 0 };
  for (const v of violations) {
    counts[v.impact ?? "unknown"] += 1;
  }
  const blocking = violations.flatMap((v): AxeReportEntry[] =>
    isBlocking(v.impact)
      ? [
          {
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            targets: v.nodes.flatMap((n) => n.target.map(targetToString)),
          },
        ]
      : [],
  );
  return { url, scannedAt, counts, blocking };
}

export function formatAxeReport(report: AxeReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
