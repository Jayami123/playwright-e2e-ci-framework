import { expect, test } from "@playwright/test";
import type { TwentyPinnedApiSession } from "../../src/products/twenty/fixtures/auth.js";
import type { TwentyGraphqlPath } from "../../src/products/twenty/fixtures/graphql.js";
import {
  destroyListedCompanies,
  destroyListedPets,
  listCompanyIds,
  personPrefixFilter,
} from "../../src/products/twenty/fixtures/sweep.js";
import { destroyListedViews } from "../../src/products/twenty/fixtures/views.js";

function mockApi(
  handlers: {
    listPages: Array<{
      after: string | null;
      ids: string[];
      hasNextPage: boolean;
      endCursor?: string | null;
    }>;
    onDestroy?: (id: string) => void;
  },
  listDocument = "CompaniesByPrefix",
  destroyDocument = "DestroyCompany",
  destroyVariable = "companyId",
): { api: TwentyPinnedApiSession; callLog: string[] } {
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
      if (document.includes(listDocument)) {
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
        const connectionKey = listDocument.includes("Pets") ? "pets" : "companies";
        return {
          [connectionKey]: {
            edges: page.ids.map((id) => ({ node: { id, name: id } })),
            pageInfo: {
              hasNextPage: page.hasNextPage,
              endCursor: page.endCursor ?? null,
            },
          },
        } as T;
      }
      if (document.includes(destroyDocument)) {
        const rawId = variables?.[destroyVariable];
        if (typeof rawId !== "string") {
          throw new Error(`${destroyDocument} mock expected ${destroyVariable} string`);
        }
        const recordId = rawId;
        callLog.push(`destroy:${recordId}`);
        handlers.onDestroy?.(recordId);
        const destroyField = destroyDocument.includes("Pet") ? "destroyPet" : "destroyCompany";
        return { [destroyField]: { id: recordId } } as T;
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

  test("throws when endCursor does not advance", async () => {
    const { api, callLog } = mockApi({
      listPages: [
        { after: null, ids: ["c1"], hasNextPage: true, endCursor: "c1" },
        { after: "c1", ids: ["c2"], hasNextPage: true, endCursor: "c1" },
      ],
    });

    await expect(listCompanyIds(api, "P1-QA-")).rejects.toThrow(/endCursor did not advance/);
    expect(callLog).toEqual(["list:null", "list:c1"]);
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

  test("pets list paginates and destroys each listed id", async () => {
    const { api, callLog } = mockApi(
      {
        listPages: [
          { after: null, ids: ["p1"], hasNextPage: true, endCursor: "cursor1" },
          { after: "cursor1", ids: ["p2"], hasNextPage: false },
        ],
      },
      "PetsByPrefix",
      "DestroyPet",
      "petId",
    );

    const deleted = await destroyListedPets(api, "P1-QA-");
    expect(deleted).toBe(2);
    expect(callLog).toEqual(["list:null", "list:cursor1", "destroy:p1", "destroy:p2"]);
  });

  test("destroys only views whose name starts with the QA prefix", async () => {
    const callLog: string[] = [];
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
        if (document.includes("GetViews")) {
          callLog.push("list");
          return {
            getViews: [
              { id: "keep", name: "All Opportunities" },
              { id: "qa-1", name: "P1-QA-1-0-cal" },
            ],
          } as T;
        }
        if (document.includes("DestroyView")) {
          const id = variables?.id;
          if (typeof id !== "string") {
            throw new Error("DestroyView mock expected id string");
          }
          callLog.push(`destroy:${id}`);
          return { destroyView: true } as T;
        }
        throw new Error(`Unexpected query: ${document.slice(0, 40)}`);
      },
    };

    const deleted = await destroyListedViews(api, "P1-QA-");
    expect(deleted).toBe(1);
    expect(callLog).toEqual(["list", "destroy:qa-1"]);
  });
});

test.describe("Twenty person sweep filter", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("matches the first name prefix or the lowercase email prefix", () => {
    expect(personPrefixFilter("P1-QA-")).toEqual({
      or: [
        { name: { firstName: { ilike: "P1-QA-%" } } },
        { emails: { primaryEmail: { ilike: "p1-qa-%" } } },
      ],
    });
  });
});
