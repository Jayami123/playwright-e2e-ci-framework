import {
  KNOWN_BUG_JSON_ATTACHMENT,
  serializeKnownBugEvidence,
} from "../../../src/core/known-bug-evidence.js";
import {
  MED_FW_X04_DOUBLE_CANCEL_ISSUE,
  MED_FW_X05_CANCEL_FULFIL_ISSUE,
} from "../../../src/products/medusa/known-issues.js";
import { expect, test } from "../../../src/products/medusa/fixtures.js";
import {
  cancelFulfilRoundViolates,
  doubleCancelRoundViolates,
  MEDUSA_RACE_ROUNDS,
  summariseRaceRounds,
  type CancelFulfilRound,
  type DoubleCancelRound,
} from "../../../src/products/medusa/races.js";

/**
 * Both races are PRODUCT BUGS (docs/observations/medusa-known-issues.md). A race does not trigger
 * every time, so each test runs MEDUSA_RACE_ROUNDS rounds, each on a fresh order. The working path
 * is asserted hard in every round, the evidence for all rounds is attached, then `test.fail`
 * guards the strict contract over all rounds: any round that shows the bug is enough. If no round
 * reproduces it, the unexpected pass turns the run red. Never loosen the assertion.
 * Every order is captured by the medusaQa fixture, which cancels and archives it afterwards.
 */
test.describe("Medusa order races", () => {
  test(
    "P1-MED-FW-X04 Concurrent double cancel is rejected once",
    {
      tag: ["@medusa", "@api", "@race"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X04" },
        { type: "priority", description: "P1" },
        { type: "issue", description: MED_FW_X04_DOUBLE_CANCEL_ISSUE },
      ],
    },
    async ({ medusaQa }, testInfo) => {
      const api = medusaQa.api;
      const rounds: DoubleCancelRound[] = [];

      for (let round = 1; round <= MEDUSA_RACE_ROUNDS; round += 1) {
        await test.step(`Round ${String(round)} of ${String(MEDUSA_RACE_ROUNDS)}`, async () => {
          const order = await medusaQa.createOrder(`race-cancel-r${String(round)}`, 1);

          const [first, second] = await Promise.all([
            api.cancelOrder(order.id),
            api.cancelOrder(order.id),
          ]);

          const final = await api.getOrder(
            order.id,
            "status,*payment_collections,*payment_collections.payments,*payment_collections.payments.refunds",
          );
          const payments = (final.payment_collections ?? []).flatMap((c) => c.payments ?? []);
          const refunds = payments.flatMap((p) => p.refunds ?? []);
          const changes = await api.listOrderChanges(order.id);

          expect(final.status, `round ${String(round)} order status`).toBe("canceled");
          expect(payments, `round ${String(round)} payments`).toHaveLength(1);
          expect(payments[0]?.canceled_at, `round ${String(round)} payment canceled`).toBeTruthy();
          expect(refunds, `round ${String(round)} refunds`).toHaveLength(0);

          rounds.push({
            round,
            statuses: [first.status(), second.status()].sort((a, b) => a - b),
            changes: changes.map((c) => `${c.change_type}:${c.status}`),
          });
        });
      }

      const summary = summariseRaceRounds(rounds, doubleCancelRoundViolates);
      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: MED_FW_X04_DOUBLE_CANCEL_ISSUE,
          observed: { ...summary, outcomes: rounds },
          expected: { statuses: [200, 400], pendingChanges: 0, violatingRounds: [] },
        }),
        contentType: "application/json",
      });

      test.fail(true, MED_FW_X04_DOUBLE_CANCEL_ISSUE);
      expect(summary.violatingRounds, "rounds where both cancels won or a change dangled").toEqual(
        [],
      );
    },
  );

  test(
    "P1-MED-FW-X05 Concurrent cancel and fulfil do not both succeed",
    {
      tag: ["@medusa", "@api", "@race"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X05" },
        { type: "priority", description: "P1" },
        { type: "issue", description: MED_FW_X05_CANCEL_FULFIL_ISSUE },
      ],
    },
    async ({ medusaQa }, testInfo) => {
      const api = medusaQa.api;
      const locationId = await api.getEuropeanWarehouseId();
      const rounds: CancelFulfilRound[] = [];

      for (let round = 1; round <= MEDUSA_RACE_ROUNDS; round += 1) {
        await test.step(`Round ${String(round)} of ${String(MEDUSA_RACE_ROUNDS)}`, async () => {
          const order = await medusaQa.createOrder(`race-fulfil-r${String(round)}`, 1);
          const withItems = await api.getOrder(order.id, "status,*items");
          const items = withItems.items.map((item) => ({ id: item.id, quantity: item.quantity }));

          const [cancel, fulfil] = await Promise.all([
            api.cancelOrder(order.id),
            api.createFulfillment(order.id, items, locationId),
          ]);

          const final = await api.getOrder(order.id, "status,fulfillment_status,*fulfillments");
          const open = (final.fulfillments ?? []).filter((f) => f.canceled_at === null);

          expect([200, 400], `round ${String(round)} cancel status`).toContain(cancel.status());
          expect([200, 400], `round ${String(round)} fulfil status`).toContain(fulfil.status());

          rounds.push({
            round,
            cancelStatus: cancel.status(),
            fulfilStatus: fulfil.status(),
            status: final.status,
            fulfillmentStatus: final.fulfillment_status,
            openFulfillments: open.length,
          });
        });
      }

      const summary = summariseRaceRounds(rounds, cancelFulfilRoundViolates);
      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: MED_FW_X05_CANCEL_FULFIL_ISSUE,
          observed: { ...summary, outcomes: rounds },
          expected: { canceledWithOpenFulfillment: false, violatingRounds: [] },
        }),
        contentType: "application/json",
      });

      test.fail(true, MED_FW_X05_CANCEL_FULFIL_ISSUE);
      expect(summary.violatingRounds, "rounds left canceled with an open fulfillment").toEqual([]);
    },
  );
});
