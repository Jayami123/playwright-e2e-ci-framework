import { expect, test } from "@playwright/test";
import type { TwentyPinnedApiSession } from "../../src/products/twenty/fixtures/auth.js";
import {
  destroyPeopleByIds,
  qaPeopleFilter,
} from "../../src/products/twenty/fixtures/people-bulk.js";

function fakeApi(returnShort: boolean): { api: TwentyPinnedApiSession; chunks: number[] } {
  const chunks: number[] = [];
  const api: TwentyPinnedApiSession = {
    workspaceId: "ws",
    memberId: "mem",
    authorizationHeader: "Bearer test",
    query: async <T>(
      _path: unknown,
      _document: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      await Promise.resolve();
      const filter = variables?.filter as { id: { in: string[] } };
      chunks.push(filter.id.in.length);
      const ids = returnShort ? filter.id.in.slice(1) : filter.id.in;
      return { destroyPeople: ids.map((id) => ({ id })) } as T;
    },
  };
  return { api, chunks };
}

test.describe("Twenty people bulk helpers", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("filter matches the first name or the lowercase email", () => {
    expect(qaPeopleFilter("P1-QA-1-0-CSV001")).toEqual({
      or: [
        { name: { firstName: { ilike: "P1-QA-1-0-CSV001%" } } },
        { emails: { primaryEmail: { ilike: "p1-qa-1-0-csv001%" } } },
      ],
    });
  });

  test("a LIKE wildcard in the prefix throws", () => {
    expect(() => qaPeopleFilter("P1-QA-%")).toThrow(/wildcard/);
    expect(() => qaPeopleFilter("P1_QA")).toThrow(/wildcard/);
  });

  test("250 ids are destroyed in chunks of 100, 100 and 50", async () => {
    const { api, chunks } = fakeApi(false);
    const ids = Array.from({ length: 250 }, (_, i) => `id-${String(i)}`);
    await expect(destroyPeopleByIds(api, ids)).resolves.toBe(250);
    expect(chunks).toEqual([100, 100, 50]);
  });

  test("a chunk that returns fewer ids throws", async () => {
    const { api } = fakeApi(true);
    await expect(destroyPeopleByIds(api, ["a", "b"])).rejects.toThrow(
      /returned 1 ids for a chunk of 2/,
    );
  });
});
