import { timeouts } from "../../../src/products/cal/env.js";
import { qaEventTitle } from "../../../src/products/cal/factories.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";

test.describe("Event types", () => {
  test(
    "creates and deletes an isolated event type",
    {
      tag: ["@cal", "@smoke"],
      annotation: { type: "testId", description: "P1-CAL-FW-003" },
    },
    async ({ eventTypes, eventTypeCleanup }) => {
      test.setTimeout(timeouts().editor);
      const title = qaEventTitle();
      eventTypeCleanup.register(title);

      await test.step("create the event type", async () => {
        await eventTypes.goto();
        await eventTypes.create(title);
      });

      await test.step("show it in the list", async () => {
        await eventTypes.expectListed(title);
        await expect(eventTypes.eventTypeLink(title)).toBeVisible();
      });

      await test.step("delete it", async () => {
        await eventTypes.deleteByTitle(title);
        await expect(eventTypes.eventTypeLink(title)).toHaveCount(0);
      });
    },
  );
});
