import { expect, test } from "@playwright/test";
import { createPinnedTwentyApiSession } from "../../src/products/twenty/fixtures/auth.js";
import { TWENTY_ROUTES } from "../../src/products/twenty/env.js";

const UI_WORKSPACE = "20202020-1c25-4d02-bf25-6aeccf7ea419";
const UI_MEMBER = "20202020-463f-435b-828c-107e007a2711";

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

test.describe("Twenty UNAUTHENTICATED retry", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test.afterEach(() => {
    globalThis.fetch = fetch;
  });

  test("re-exchanges exactly once then throws", async () => {
    let exchangeCalls = 0;
    let crmCalls = 0;

    globalThis.fetch = async (input, init) => {
      await Promise.resolve();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body =
        init?.body !== undefined && typeof init.body === "string"
          ? (JSON.parse(init.body) as { query?: string })
          : {};
      const query = body.query ?? "";

      if (url.endsWith(TWENTY_ROUTES.metadata) && query.includes("signIn")) {
        return new Response(
          JSON.stringify({
            data: {
              signIn: {
                availableWorkspaces: {
                  availableWorkspacesForSignIn: [
                    { id: UI_WORKSPACE, loginToken: "login-token", workspaceUrls: null },
                  ],
                },
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith(TWENTY_ROUTES.metadata) && query.includes("getAuthTokensFromLoginToken")) {
        exchangeCalls += 1;
        return new Response(
          JSON.stringify({
            data: {
              getAuthTokensFromLoginToken: {
                tokens: {
                  accessOrWorkspaceAgnosticToken: {
                    token: jwt({
                      type: "ACCESS",
                      workspaceId: UI_WORKSPACE,
                      workspaceMemberId: UI_MEMBER,
                    }),
                  },
                },
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith(TWENTY_ROUTES.metadata) && query.includes("currentUser")) {
        return new Response(
          JSON.stringify({
            data: {
              currentUser: {
                id: "user",
                email: "jane.austen@apple.dev",
                currentWorkspace: { id: UI_WORKSPACE, displayName: "Apple" },
                workspaceMember: { id: UI_MEMBER, timeZone: "system" },
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith(TWENTY_ROUTES.graphql)) {
        crmCalls += 1;
        return new Response(
          JSON.stringify({
            errors: [{ message: "Token invalid.", extensions: { code: "UNAUTHENTICATED" } }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    };

    const session = await createPinnedTwentyApiSession(UI_WORKSPACE, UI_MEMBER);
    await expect(
      session.query(TWENTY_ROUTES.graphql, "query { companies { edges { node { id } } } }"),
    ).rejects.toThrow(/Token invalid/);
    expect(exchangeCalls).toBe(2);
    expect(crmCalls).toBe(2);
  });
});
