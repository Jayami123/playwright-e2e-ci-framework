/**
 * Pure decision logic for the Medusa order races (P1-MED-FW-X04 and X05).
 * A race does not trigger every time, so each test runs MEDUSA_RACE_ROUNDS rounds, each on a
 * fresh order, and the product contract is asserted over every round.
 */
export const MEDUSA_RACE_ROUNDS = 10;

/** A `type`, not an `interface`, so a round is assignable to the evidence JsonValue. */
export type DoubleCancelRound = {
  readonly round: number;
  /** Both cancel statuses, sorted ascending. */
  readonly statuses: readonly number[];
  /** `change_type:status` for every order change after the race. */
  readonly changes: readonly string[];
};

export type CancelFulfilRound = {
  readonly round: number;
  readonly cancelStatus: number;
  readonly fulfilStatus: number;
  readonly status: string;
  readonly fulfillmentStatus: string;
  readonly openFulfillments: number;
};

export interface RaceRoundsSummary {
  readonly rounds: number;
  readonly violatingRounds: readonly number[];
}

function sortedStatuses(statuses: readonly number[]): number[] {
  return [...statuses].sort((a, b) => a - b);
}

/** X04 contract: exactly one cancel wins (200) and the other is rejected (400), no pending change. */
export function doubleCancelRoundViolates(round: DoubleCancelRound): boolean {
  const statuses = sortedStatuses(round.statuses);
  const oneWinner = statuses.length === 2 && statuses[0] === 200 && statuses[1] === 400;
  const pending = round.changes.filter((change) => change.endsWith(":pending")).length;
  return !oneWinner || pending > 0;
}

/** X05 contract: a canceled order never keeps an uncanceled fulfillment. */
export function cancelFulfilRoundViolates(round: CancelFulfilRound): boolean {
  return round.status === "canceled" && round.openFulfillments > 0;
}

export function summariseRaceRounds<T extends { readonly round: number }>(
  rounds: readonly T[],
  violates: (round: T) => boolean,
): RaceRoundsSummary {
  return {
    rounds: rounds.length,
    violatingRounds: rounds.filter(violates).map((round) => round.round),
  };
}
