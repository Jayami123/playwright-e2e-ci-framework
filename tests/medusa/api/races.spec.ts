import {
  KNOWN_BUG_JSON_ATTACHMENT,
  serializeKnownBugEvidence,
} from "../../../src/core/known-bug-evidence.js";
import {
  MED_FW_X04_DOUBLE_CANCEL_ISSUE,
  MED_FW_X05_CANCEL_FULFIL_ISSUE,
} from "../../../src/products/medusa/known-issues.js";
import { expect, test } from "../../../src/products/medusa/fixtures.js";

/**
 * Both races are PRODUCT BUGS (docs/observations/medusa-known-issues.md). The working path is
 * asserted hard first, the evidence is attached, then `test.fail` guards the strict contract.
 * If a race stops reproducing, the unexpected pass turns the run red. Never loosen the assertion.
 */
test.describe("Medusa order races", () => {
  test(
    "P1-MED-FW-X04 Concurrent double cancel is rejected once",
    {
      tag: ["@medusa", "@api", "@race"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X04" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ medusaQa }, testInfo) => {
      const order = await medusaQa.createOrder("race-cancel", 1);
      const api = medusaQa.api;

      const [first, second] = await Promise.all([
        api.cancelOrder(order.id),
        api.cancelOrder(order.id),
      ]);
      const statuses = [first.status(), second.status()].sort();

      const final = await api.getOrder(
        order.id,
        "status,*payment_collections,*payment_collections.payments,*payment_collections.payments.refunds",
      );
      const payments = (final.payment_collections ?? []).flatMap((c) => c.payments ?? []);
      const refunds = payments.flatMap((p) => p.refunds ?? []);
      const changes = await api.listOrderChanges(order.id);

      expect(final.status).toBe("canceled");
      expect(payments).toHaveLength(1);
      expect(payments[0]?.canceled_at).toBeTruthy();
      expect(refunds).toHaveLength(0);

      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: MED_FW_X04_DOUBLE_CANCEL_ISSUE,
          observed: { statuses, changes: changes.map((c) => `${c.change_type}:${c.status}`) },
          expected: { statuses: [200, 400], pendingChanges: 0 },
        }),
        contentType: "application/json",
      });

      test.fail(true, MED_FW_X04_DOUBLE_CANCEL_ISSUE);
      expect(statuses).toEqual([200, 400]);
      expect(changes.filter((c) => c.status === "pending")).toHaveLength(0);
    },
  );

  test(
    "P1-MED-FW-X05 Concurrent cancel and fulfil do not both succeed",
    {
      tag: ["@medusa", "@api", "@race"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X05" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ medusaQa }, testInfo) => {
      const order = await medusaQa.createOrder("race-fulfil", 1);
      const api = medusaQa.api;
      const [locationId, withItems] = await Promise.all([
        api.getEuropeanWarehouseId(),
        api.getOrder(order.id, "status,*items"),
      ]);
      const items = withItems.items.map((item) => ({ id: item.id, quantity: item.quantity }));

      const [cancel, fulfil] = await Promise.all([
        api.cancelOrder(order.id),
        api.createFulfillment(order.id, items, locationId),
      ]);

      const final = await api.getOrder(order.id, "status,fulfillment_status,*fulfillments");
      const open = (final.fulfillments ?? []).filter((f) => f.canceled_at === null);

      expect([200, 400]).toContain(cancel.status());
      expect([200, 400]).toContain(fulfil.status());

      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: MED_FW_X05_CANCEL_FULFIL_ISSUE,
          observed: {
            cancelStatus: cancel.status(),
            fulfilStatus: fulfil.status(),
            status: final.status,
            fulfillmentStatus: final.fulfillment_status,
            openFulfillments: open.length,
          },
          expected: { canceledWithOpenFulfillment: false },
        }),
        contentType: "application/json",
      });

      test.fail(true, MED_FW_X05_CANCEL_FULFIL_ISSUE);
      expect(final.status === "canceled" && open.length > 0).toBe(false);
    },
  );
});
