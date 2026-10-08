import { expect, test } from "../../../src/products/cal/fixtures.js";

test.describe("Console guard", () => {
  test(
    "booker and bookings pages emit no page errors",
    {
      tag: ["@cal", "@smoke"],
      annotation: { type: "testId", description: "P1-CAL-FW-004" },
    },
    async ({ booker, bookings, consoleGuard }) => {
      await test.step("open the public booker", async () => {
        await booker.gotoProThirtyMin();
        await booker.expectLoaded();
      });

      await test.step("open authenticated upcoming bookings", async () => {
        await bookings.gotoUpcoming();
        await bookings.expectAuthenticatedUpcoming();
      });

      expect(consoleGuard.errors).toEqual([]);
    },
  );
});
