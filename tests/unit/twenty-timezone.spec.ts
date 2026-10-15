import { expect, test } from "@playwright/test";
import type { TwentyPinnedApiSession } from "../../src/products/twenty/fixtures/auth.js";
import {
  createTimeZoneRestoreGuard,
  setMemberTimeZone,
} from "../../src/products/twenty/fixtures/timezone.js";

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

  test("registers restore before write so a thrown persist still restores baseline", async () => {
    const writes: string[] = [];
    const guard = createTimeZoneRestoreGuard({
      read: async () => {
        await Promise.resolve();
        return "system";
      },
      write: async (timeZone) => {
        await Promise.resolve();
        writes.push(timeZone);
        if (timeZone === "Pacific/Honolulu") {
          throw new Error("write failed after persist");
        }
        return timeZone;
      },
    });

    await expect(guard.setTimeZone("Pacific/Honolulu")).rejects.toThrow(
      /write failed after persist/,
    );
    expect(guard.peekRestore()).toBeDefined();
    await guard.restoreIfNeeded();
    expect(writes).toEqual(["Pacific/Honolulu", "system"]);
  });
});
