import { expect, test } from "@playwright/test";
import { runTwentyQaFixtureCleanup } from "../../src/products/twenty/fixtures/index.js";
import type { TwentyPinnedApiSession } from "../../src/products/twenty/fixtures/auth.js";

test.describe("Twenty fixture teardown order", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("destroy failure still restores TZ and surfaces AggregateError", async () => {
    let tzRestoreCalls = 0;
    const api = {
      workspaceId: "ws",
      memberId: "mem",
      authorizationHeader: "Bearer x",
      query: async () => {
        await Promise.resolve();
        throw new Error("unexpected query");
      },
    } satisfies TwentyPinnedApiSession;

    await expect(
      runTwentyQaFixtureCleanup({
        api,
        captured: {
          companyIds: ["company-1"],
          personIds: [],
          opportunityIds: [],
          petIds: [],
          viewIds: [],
        },
        restoreTimeZone: async () => {
          await Promise.resolve();
          tzRestoreCalls += 1;
        },
        testError: new Error("test body failed"),
      }),
    ).rejects.toBeInstanceOf(AggregateError);

    expect(tzRestoreCalls).toBe(1);
  });
});
