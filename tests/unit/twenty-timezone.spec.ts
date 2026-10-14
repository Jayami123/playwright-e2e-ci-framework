import { expect, test } from "@playwright/test";
import type { TwentyPinnedApiSession } from "../../src/products/twenty/fixtures/auth.js";
import { setMemberTimeZone } from "../../src/products/twenty/fixtures/timezone.js";

test.describe("Twenty member timezone API", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("setMemberTimeZone throws when mutation returns a different IANA zone", async () => {
    const api: TwentyPinnedApiSession = {
      workspaceId: "ws",
      memberId: "mem-1",
      authorizationHeader: "Bearer test",
      query: async <T>() => {
        await Promise.resolve();
        return {
          updateWorkspaceMember: { id: "mem-1", timeZone: "Pacific/Honolulu" },
        } as T;
      },
    };

    await expect(setMemberTimeZone(api, "mem-1", "Pacific/Kiritimati")).rejects.toThrow(
      /returned timeZone="Pacific\/Honolulu", expected "Pacific\/Kiritimati"/,
    );
  });
});
