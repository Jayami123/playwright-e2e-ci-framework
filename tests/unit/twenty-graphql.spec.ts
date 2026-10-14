import { expect, test } from "@playwright/test";
import { TwentyGraphqlError, twentyGraphql } from "../../src/products/twenty/fixtures/graphql.js";

test.describe("Twenty GraphQL client", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test.afterEach(() => {
    globalThis.fetch = fetch;
  });

  test("HTTP 200 with errors[] throws readable error", async () => {
    globalThis.fetch = async () => {
      await Promise.resolve();
      return new Response(
        JSON.stringify({
          data: { destroyCompany: null },
          errors: [
            {
              message: "Record not found",
              extensions: { code: "NOT_FOUND", subCode: "RECORD_NOT_FOUND" },
            },
          ],
        }),
        { status: 200 },
      );
    };

    await expect(
      twentyGraphql("/graphql", { query: "mutation {}", authorization: "Bearer test" }),
    ).rejects.toThrow(/Record not found/);
    await expect(
      twentyGraphql("/graphql", { query: "mutation {}", authorization: "Bearer test" }),
    ).rejects.toMatchObject({
      name: "TwentyGraphqlError",
      details: [{ code: "NOT_FOUND", subCode: "RECORD_NOT_FOUND" }],
    });
  });

  test("HTTP 200 UNAUTHENTICATED throws TwentyGraphqlError", async () => {
    globalThis.fetch = async () => {
      await Promise.resolve();
      return new Response(
        JSON.stringify({
          errors: [
            { message: "Missing authentication token", extensions: { code: "UNAUTHENTICATED" } },
          ],
        }),
        { status: 200 },
      );
    };

    try {
      await twentyGraphql("/metadata", { query: "query {}" });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TwentyGraphqlError);
      expect((error as TwentyGraphqlError).hasCode("UNAUTHENTICATED")).toBe(true);
    }
  });

  test("top-level message without data throws", async () => {
    globalThis.fetch = async () => {
      await Promise.resolve();
      return new Response(
        JSON.stringify({ message: "Invalid credentials", extensions: { code: "UNAUTHENTICATED" } }),
        { status: 200 },
      );
    };

    await expect(twentyGraphql("/metadata", { query: "mutation {}" })).rejects.toThrow(
      /Invalid credentials/,
    );
  });

  test("HTTP 200 with data and no errors returns data", async () => {
    globalThis.fetch = async () => {
      await Promise.resolve();
      return new Response(JSON.stringify({ data: { currentUser: { id: "user-1" } } }), {
        status: 200,
      });
    };

    const data = await twentyGraphql<{ currentUser: { id: string } }>("/metadata", {
      query: "query {}",
    });
    expect(data.currentUser.id).toBe("user-1");
  });
});
