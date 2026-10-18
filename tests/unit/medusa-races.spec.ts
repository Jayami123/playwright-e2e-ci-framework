import { expect, test } from "@playwright/test";
import {
  cancelFulfilRoundViolates,
  doubleCancelRoundViolates,
  MEDUSA_RACE_ROUNDS,
  summariseRaceRounds,
  type CancelFulfilRound,
  type DoubleCancelRound,
} from "../../src/products/medusa/races.js";

function cancelRound(
  round: number,
  statuses: readonly number[],
  changes: readonly string[] = [],
): DoubleCancelRound {
  return { round, statuses, changes };
}

function fulfilRound(
  round: number,
  status: string,
  openFulfillments: number,
  cancelStatus = 200,
  fulfilStatus = 400,
): CancelFulfilRound {
  return {
    round,
    cancelStatus,
    fulfilStatus,
    status,
    fulfillmentStatus: openFulfillments > 0 ? "fulfilled" : "not_fulfilled",
    openFulfillments,
  };
}

test.describe("Medusa race rounds", { tag: ["@unit"] }, () => {
  test("the round count is 10", () => {
    expect(MEDUSA_RACE_ROUNDS).toBe(10);
  });

  test("double cancel: one 200 and one 400 with no pending change is correct", () => {
    expect(doubleCancelRoundViolates(cancelRound(1, [400, 200], ["cancel:confirmed"]))).toBe(false);
  });

  test("double cancel: two 200s is the bug", () => {
    expect(doubleCancelRoundViolates(cancelRound(1, [200, 200]))).toBe(true);
  });

  test("double cancel: a dangling pending change is the bug even with one winner", () => {
    expect(doubleCancelRoundViolates(cancelRound(1, [200, 400], ["credit_line:pending"]))).toBe(
      true,
    );
  });

  test("double cancel: two 400s or a 5xx is not the contract", () => {
    expect(doubleCancelRoundViolates(cancelRound(1, [400, 400]))).toBe(true);
    expect(doubleCancelRoundViolates(cancelRound(1, [200, 500]))).toBe(true);
    expect(doubleCancelRoundViolates(cancelRound(1, [200]))).toBe(true);
  });

  test("cancel and fulfil: canceled with an open fulfillment is the bug", () => {
    expect(cancelFulfilRoundViolates(fulfilRound(1, "canceled", 1, 200, 200))).toBe(true);
  });

  test("cancel and fulfil: either side winning alone is correct", () => {
    expect(cancelFulfilRoundViolates(fulfilRound(1, "canceled", 0, 200, 400))).toBe(false);
    expect(cancelFulfilRoundViolates(fulfilRound(1, "pending", 1, 400, 200))).toBe(false);
  });

  test("summary lists only the rounds that broke the contract", () => {
    const rounds = [
      cancelRound(1, [200, 400]),
      cancelRound(2, [200, 200], ["credit_line:pending"]),
      cancelRound(3, [200, 400]),
      cancelRound(4, [200, 200]),
    ];
    expect(summariseRaceRounds(rounds, doubleCancelRoundViolates)).toEqual({
      rounds: 4,
      violatingRounds: [2, 4],
    });
  });

  test("summary is clean when no round reproduces the race", () => {
    const rounds = Array.from({ length: MEDUSA_RACE_ROUNDS }, (_, i) =>
      fulfilRound(i + 1, "canceled", 0),
    );
    expect(summariseRaceRounds(rounds, cancelFulfilRoundViolates)).toEqual({
      rounds: MEDUSA_RACE_ROUNDS,
      violatingRounds: [],
    });
  });
});
