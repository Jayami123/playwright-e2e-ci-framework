import { qaEventTitle } from "../../../src/factories/index.js";
import { EventTypesPage } from "../../../src/pages/cal/event-types.page.js";
import { expect, test } from "../../../src/fixtures/test.js";

test.describe("P1-CAL-FW-003 Faker-isolated event type create/delete via POM", () => {
  let title: string;

  test.afterEach(async ({ page }) => {
    if (!title) return;
    const eventTypes = new EventTypesPage(page);
    await eventTypes.deleteByTitle(title);
  });

  test("P1-CAL-FW-003 Faker-isolated event type create/delete via POM", async ({ page }) => {
    test.setTimeout(300_000);
    title = qaEventTitle();
    const eventTypes = new EventTypesPage(page);
    await eventTypes.goto();
    await eventTypes.create(title);
    await eventTypes.expectListed(title);
    await expect(eventTypes.eventTypeLink(title)).toBeVisible();
  });
});
