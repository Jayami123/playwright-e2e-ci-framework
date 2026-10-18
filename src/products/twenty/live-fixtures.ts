import type { Page } from "@playwright/test";
import { parsePositiveInt } from "../../core/config.js";
import { createPinnedTwentyApiSession, readAdminWorkspaceIds } from "./fixtures/auth.js";
import { openMemberPage } from "./fixtures/member-page.js";
import { p1QaPrefix } from "./fixtures/names.js";
import { destroyCompany, destroyOpportunity, destroyPerson } from "./fixtures/records.js";
import {
  countQaMembers,
  deleteQaMember,
  memberApi,
  provisionQaMember,
  qaPeerMemberEmail,
  type TwentyQaMember,
} from "./fixtures/qa-member.js";
import { listViewIdsByNamePrefix, destroyView } from "./fixtures/views.js";
import type { TwentyPinnedApiSession } from "./fixtures/auth.js";
import { TwentyProfilePage } from "./pages/profile.page.js";
import { test as visualTest } from "./visual-fixtures.js";

/** One seed per worker process: members of different workers never share an email. */
const RUN_SEED = parsePositiveInt(process.env.P1_SEED, Date.now());

const LIST_IDS = `query LiveListIds($filter: %FILTER%!, $first: Int!) {
  %PLURAL%(filter: $filter, first: $first) { edges { node { id } } totalCount }
}`;

type CapturedKind = "company" | "opportunity" | "person" | "view";

export interface LiveRecords {
  /** The worker QA member A's own session (never Jane). */
  readonly api: TwentyPinnedApiSession;
  /** The peer B's own session, for B-side oracles only. */
  readonly peerApi: TwentyPinnedApiSession;
  /** P1-QA-<seed>-<worker> */
  readonly prefix: string;
  capture(kind: CapturedKind, id: string): void;
}

async function countByPrefix(
  api: TwentyPinnedApiSession,
  plural: "companies" | "opportunities" | "people",
  filterType: "CompanyFilterInput" | "OpportunityFilterInput" | "PersonFilterInput",
  prefix: string,
): Promise<number> {
  const filter =
    plural === "people"
      ? { name: { firstName: { ilike: `${prefix}%` } } }
      : { name: { ilike: `${prefix}%` } };
  const data = await api.query<Record<string, { totalCount?: number } | null>>(
    "/graphql",
    LIST_IDS.replace("%FILTER%", filterType).replace("%PLURAL%", plural),
    { filter, first: 1 },
  );
  return data[plural]?.totalCount ?? 0;
}

export const test = visualTest.extend<
  { peerPage: Page; liveRecords: LiveRecords },
  { twentyQaPeer: TwentyQaMember }
>({
  twentyQaPeer: [
    async ({ browser, twentyQaMember }, use, workerInfo) => {
      const ids = await readAdminWorkspaceIds();
      const admin = await createPinnedTwentyApiSession(ids.workspaceId, ids.memberId);
      const password = `P1-qa-${String(RUN_SEED)}-${String(workerInfo.parallelIndex)}-Peer9!`;
      const peer = await provisionQaMember(
        admin,
        browser,
        qaPeerMemberEmail(RUN_SEED, workerInfo.parallelIndex),
        password,
      );
      const errors: unknown[] = [];
      try {
        // Each context must be its own user, never the other's.
        for (const member of [twentyQaMember, peer]) {
          const opened = await openMemberPage(browser, member.storageStatePath);
          try {
            const profile = new TwentyProfilePage(opened.page);
            await profile.goto();
            await profile.expectSignedInAs(member.email);
          } finally {
            await opened.close();
          }
        }
        await use(peer);
      } catch (e) {
        errors.push(e);
      } finally {
        try {
          await deleteQaMember(peer);
        } catch (e) {
          errors.push(e);
        }
        try {
          if ((await countQaMembers(admin, peer.email)) !== 0) {
            errors.push(new Error("P1-QA Twenty peer member leaked"));
          }
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, "twentyQaPeer failed");
    },
    { scope: "worker", timeout: 180_000 },
  ],

  peerPage: async ({ browser, twentyQaPeer }, use) => {
    const opened = await openMemberPage(browser, twentyQaPeer.storageStatePath);
    try {
      await use(opened.page);
    } finally {
      await opened.close();
    }
  },

  liveRecords: async ({ twentyQaMember, twentyQaPeer }, use, testInfo) => {
    const api = memberApi(twentyQaMember);
    const prefix = p1QaPrefix(RUN_SEED, testInfo.parallelIndex);
    const captured: Record<CapturedKind, string[]> = {
      company: [],
      opportunity: [],
      person: [],
      view: [],
    };
    const fixture: LiveRecords = {
      api,
      peerApi: memberApi(twentyQaPeer),
      prefix,
      capture: (kind, id) => {
        captured[kind].push(id);
      },
    };
    const errors: unknown[] = [];
    try {
      await use(fixture);
    } catch (e) {
      errors.push(e);
    }
    const run = async (work: () => Promise<void>): Promise<void> => {
      try {
        await work();
      } catch (e) {
        errors.push(e);
      }
    };
    for (const id of captured.opportunity) await run(() => destroyOpportunity(api, id));
    for (const id of captured.company) await run(() => destroyCompany(api, id));
    for (const id of captured.person) await run(() => destroyPerson(api, id));
    for (const id of captured.view) await run(() => destroyView(api, id));
    await run(async () => {
      // Trailing separator: worker 1's prefix must not match worker 10's rows.
      const own = `${prefix}-`;
      const left = {
        companies: await countByPrefix(api, "companies", "CompanyFilterInput", own),
        opportunities: await countByPrefix(api, "opportunities", "OpportunityFilterInput", own),
        people: await countByPrefix(api, "people", "PersonFilterInput", own),
        views: (await listViewIdsByNamePrefix(api, own)).length,
      };
      if (Object.values(left).some((n) => n !== 0)) {
        errors.push(new Error(`P1-QA live records leaked: ${JSON.stringify(left)}`));
      }
    });
    if (errors.length > 0) throw new AggregateError(errors, "liveRecords failed");
  },
});
export { expect } from "@playwright/test";
