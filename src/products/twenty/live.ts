/** "All People · 1,234" -> 1234; throws when no "· <n>" is present. */
export function parseViewCount(text: string): number {
  const match = /·\s*([\d,]+)/.exec(text);
  if (match?.[1] === undefined) throw new Error(`No "· <n>" count in view text: ${text}`);
  return Number(match[1].replaceAll(",", ""));
}

export interface LatencySummary {
  readonly samples: readonly number[];
  readonly minMs: number;
  readonly medianMs: number;
  readonly maxMs: number;
}

export function latencySummary(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) throw new Error("latencySummary needs at least one sample");
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return {
    samples,
    minMs: sorted[0] ?? 0,
    medianMs: median,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

export interface RaceRoundNames {
  readonly base: string;
  readonly a: string;
  readonly b: string;
}

/** Names for one race round; they all stay under the P1-QA prefix and carry no LIKE wildcard. */
export function raceRoundNames(prefix: string, caseId: string, round: number): RaceRoundNames {
  const base = `${prefix}-${caseId}-r${String(round)}`;
  if (/[%_]/.test(base)) throw new Error(`Race name has a LIKE wildcard: ${base}`);
  return { base, a: `${base}-A`, b: `${base}-B` };
}

export type LostUpdateVerdict = "A" | "B" | "lost";

export function lostUpdateVerdict(stored: string, names: RaceRoundNames): LostUpdateVerdict {
  if (stored === names.a) return "A";
  if (stored === names.b) return "B";
  return "lost";
}
