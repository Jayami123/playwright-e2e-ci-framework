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

/** Status first, then JSON: a non-JSON error body must not hide the HTTP status. */
export function parseRestCreatePersonResponse(status: number, text: string): { id: string } {
  const snippet = text.slice(0, 200);
  const prefix = `REST create person failed: HTTP ${String(status)}`;
  if (status !== 201) throw new Error(`${prefix}: ${snippet}`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${prefix}: body is not JSON: ${snippet}`);
  }
  const id = (body as { data?: { createPerson?: { id?: unknown } } } | null)?.data?.createPerson
    ?.id;
  if (typeof id !== "string" || id === "") {
    throw new Error(`${prefix}: no data.createPerson.id: ${snippet}`);
  }
  return { id };
}
