import type { Page, Response } from "@playwright/test";

/**
 * Resolves when the page has added the query whose request contains every needle to its event stream
 * (`AddQueryToEventStream` 200). The first such call is for the agent chat thread (about 11 s after
 * load); a record or a filtered list subscribes later (15 to 25 s), so match on its own query id and
 * filter. Register it before the action that triggers the subscription: an event that arrives
 * earlier is not delivered to that page.
 */
export function waitForLiveSubscription(
  page: Page,
  ...needles: readonly string[]
): Promise<Response> {
  return page.waitForResponse(
    (r) => {
      const body = r.request().postData() ?? "";
      return (
        body.includes("AddQueryToEventStream") &&
        r.status() === 200 &&
        needles.every((needle) => body.includes(needle))
      );
    },
    { timeout: 60_000 },
  );
}
