import { expect, test } from "@playwright/test";
import { assertPinnedWorkspaceAccess } from "../../src/products/twenty/fixtures/auth.js";

const UI_WORKSPACE = "20202020-1c25-4d02-bf25-6aeccf7ea419";
const UI_MEMBER = "20202020-463f-435b-828c-107e007a2711";
const OTHER_WORKSPACE = "3b8e6458-5fc1-4e63-8563-008ccddaa6db";

function fakeAccessJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

test.describe("Twenty workspace pin guard", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("mismatch lists ids and never includes the token", () => {
    const token = fakeAccessJwt({
      type: "ACCESS",
      workspaceId: OTHER_WORKSPACE,
      workspaceMemberId: UI_MEMBER,
    });
    expect(() => {
      assertPinnedWorkspaceAccess({
        accessToken: token,
        uiWorkspaceId: UI_WORKSPACE,
        uiMemberId: UI_MEMBER,
        currentUser: {
          id: "user",
          email: "jane@example.com",
          currentWorkspace: { id: OTHER_WORKSPACE, displayName: "Other" },
          workspaceMember: { id: UI_MEMBER, timeZone: "system" },
        },
      });
    }).toThrow(/uiWorkspaceId=20202020-1c25-4d02-bf25-6aeccf7ea419/);
    try {
      assertPinnedWorkspaceAccess({
        accessToken: token,
        uiWorkspaceId: UI_WORKSPACE,
        uiMemberId: UI_MEMBER,
        currentUser: {
          id: "user",
          email: "jane@example.com",
          currentWorkspace: { id: OTHER_WORKSPACE, displayName: "Other" },
          workspaceMember: { id: UI_MEMBER, timeZone: "system" },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(token);
      expect(message).not.toMatch(/Bearer /);
    }
  });

  test("matching ids pass", () => {
    const token = fakeAccessJwt({
      type: "ACCESS",
      workspaceId: UI_WORKSPACE,
      workspaceMemberId: UI_MEMBER,
    });
    assertPinnedWorkspaceAccess({
      accessToken: token,
      uiWorkspaceId: UI_WORKSPACE,
      uiMemberId: UI_MEMBER,
      currentUser: {
        id: "user",
        email: "jane@example.com",
        currentWorkspace: { id: UI_WORKSPACE, displayName: "Apple" },
        workspaceMember: { id: UI_MEMBER, timeZone: "system" },
      },
    });
  });
});
