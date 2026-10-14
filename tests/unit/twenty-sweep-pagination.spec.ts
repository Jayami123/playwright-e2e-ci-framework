import { expect, test } from "@playwright/test";
import type { TwentyPinnedApiSession } from "../../src/products/twenty/fixtures/auth.js";
import type { TwentyGraphqlPath } from "../../src/products/twenty/fixtures/graphql.js";
import {
  destroyListedCompanies,
  listCompanyIds,
} from "../../src/products/twenty/fixtures/sweep.js";

function mockApi(handlers: {
  listPages: Array<{
    after: string | null;
    ids: string[];
    hasNextPage: boolean;
    endCursor?: string | null;
  }>;
  onDestroy?: (id: string) => void;
}): { api: TwentyPinnedApiSession; callLog: string[] } {
  const callLog: string[] = [];
  let listCall = 0;

  const api: TwentyPinnedApiSession = {
    workspaceId: "ws",
    memberId: "mem",
    authorizationHeader: "Bearer test",
    query: async <T>(
      _path: TwentyGraphqlPath,
      document: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      await Promise.resolve();
      if (document.includes("CompaniesByPrefix")) {
        const rawAfter = variables?.after;
        const after =
          rawAfter === null || rawAfter === undefined
            ? null
            : typeof rawAfter === "string"
              ? rawAfter
              : null;
        const page = handlers.listPages[listCall];
        listCall += 1;
        if (page === undefined) {
          throw new Error(`Unexpected list page ${String(listCall)}`);
        }
        expect(after).toBe(page.after);
        callLog.push(`list:${after === null ? "null" : after}`);
        return {
          companies: {
            edges: page.ids.map((id) => ({ node: { id, name: id } })),
            pageInfo: {
              hasNextPage: page.hasNextPage,
              endCursor: page.endCursor ?? null,
            },
          },
        } as T;
      }
      if (document.includes("DestroyCompany")) {
        const rawId = variables?.companyId;
        if (typeof rawId !== "string") {
          throw new Error("DestroyCompany mock expected companyId string");
        }
        const companyId = rawId;
        callLog.push(`destroy:${companyId}`);
        handlers.onDestroy?.(companyId);
        return { destroyCompany: { id: companyId } } as T;
      }
      throw new Error(`Unexpected query: ${document.slice(0, 40)}`);
    },
  };

  return { api, callLog };
}

test.describe("Twenty sweep pagination", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("lists two pages and passes after cursor on the second request", async () => {
    const { api } = mockApi({
      listPages: [
        { after: null, ids: ["c1"], hasNextPage: true, endCursor: "cursor1" },
        { after: "cursor1", ids: ["c2"], hasNextPage: false, endCursor: null },
      ],
    });

    const ids = await listCompanyIds(api, "P1-QA-");
    expect(ids).toEqual(["c1", "c2"]);
  });

  test("throws when hasNextPage is true but endCursor is missing", async () => {
    const { api } = mockApi({
      listPages: [{ after: null, ids: ["c1"], hasNextPage: true, endCursor: null }],
    });

    await expect(listCompanyIds(api, "P1-QA-")).rejects.toThrow(/endCursor missing/);
  });

  test("destroys only after all list pages complete", async () => {
    const { api, callLog } = mockApi({
      listPages: [
        { after: null, ids: ["c1"], hasNextPage: true, endCursor: "cursor1" },
        { after: "cursor1", ids: ["c2"], hasNextPage: false },
      ],
    });

    const deleted = await destroyListedCompanies(api, "P1-QA-");
    expect(deleted).toBe(2);
    expect(callLog).toEqual(["list:null", "list:cursor1", "destroy:c1", "destroy:c2"]);
  });
});
