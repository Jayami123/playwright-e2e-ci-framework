import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePositiveInt } from "../../core/config.js";
import { loadTwentyConfig, TWENTY_ROUTES } from "./env.js";
import { p1QaPrefix } from "./fixtures/names.js";
import {
  countPeople,
  destroyPeopleByIds,
  qaPeopleFilter,
  type PersonFilter,
} from "./fixtures/people-bulk.js";
import { memberApi } from "./fixtures/qa-member.js";
import { paginateConnectionIds } from "./fixtures/sweep.js";
import type { TwentyPinnedApiSession } from "./fixtures/auth.js";
import { test as visualTest } from "./visual-fixtures.js";

/** One seed per worker process: imports of different workers never share an email. */
const RUN_SEED = parsePositiveInt(process.env.P1_SEED, Date.now());

const LIST_IDS = `query ListPeopleIds($filter: PersonFilterInput!, $first: Int!, $after: String) {
  people(filter: $filter, first: $first, after: $after) {
    edges { node { id } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export interface TwentyCsvFixture {
  /** The worker QA member's own session (never Jane). */
  readonly api: TwentyPinnedApiSession;
  /** P1-QA-<seed>-<worker> */
  readonly prefix: string;
  readonly memberEmail: string;
  /** Writes a CSV below the test output dir and returns its absolute path. */
  writeCsv(fileName: string, content: string): Promise<string>;
  /** Filter for the people one case imported: prefix + "-" + caseId. */
  caseFilter(caseId: string): PersonFilter;
  /** Registers an id (e.g. a pre-created person) for teardown. */
  capturePerson(id: string): void;
}

async function listIds(api: TwentyPinnedApiSession, filter: PersonFilter): Promise<string[]> {
  return paginateConnectionIds(async (after) => {
    const data = await api.query<{
      people?: {
        edges?: Array<{ node?: { id: string } | null } | null> | null;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      } | null;
    }>(TWENTY_ROUTES.graphql, LIST_IDS, { filter, first: 100, after });
    const ids: string[] = [];
    for (const edge of data.people?.edges ?? []) {
      const id = edge?.node?.id;
      if (typeof id === "string") ids.push(id);
    }
    const pageInfo = data.people?.pageInfo;
    return { ids, hasNextPage: pageInfo?.hasNextPage === true, endCursor: pageInfo?.endCursor };
  });
}

export const test = visualTest.extend<{ twentyCsv: TwentyCsvFixture; secondMemberPage: Page }>({
  twentyCsv: async ({ twentyQaMember }, use, testInfo) => {
    const api = memberApi(twentyQaMember);
    const prefix = p1QaPrefix(RUN_SEED, testInfo.parallelIndex);
    const captured = new Set<string>();
    const fixture: TwentyCsvFixture = {
      api,
      prefix,
      memberEmail: twentyQaMember.email,
      writeCsv: async (fileName, content) => {
        const file = testInfo.outputPath(fileName);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
        return file;
      },
      caseFilter: (caseId) => qaPeopleFilter(`${prefix}-${caseId}`),
      capturePerson: (id) => {
        captured.add(id);
      },
    };
    const errors: unknown[] = [];
    try {
      await use(fixture);
    } catch (error) {
      errors.push(error);
    }
    try {
      const ids = new Set([...(await listIds(api, qaPeopleFilter(prefix))), ...captured]);
      await destroyPeopleByIds(api, [...ids]);
      const left = await countPeople(api, qaPeopleFilter(prefix));
      if (left !== 0) errors.push(new Error(`${String(left)} P1-QA people leaked`));
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) throw new AggregateError(errors, "twentyCsv failed");
  },

  secondMemberPage: async ({ browser, twentyQaMember }, use) => {
    const context = await browser.newContext({
      baseURL: loadTwentyConfig().baseUrl,
      storageState: twentyQaMember.storageStatePath,
    });
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
});
export { expect } from "@playwright/test";
