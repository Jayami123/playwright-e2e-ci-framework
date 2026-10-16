import { test as base } from "@playwright/test";
import { parsePositiveInt } from "../../core/config.js";
import { loadTwentyConfig } from "./env.js";
import { createPinnedTwentyApiSession, readAdminWorkspaceIds } from "./fixtures/auth.js";
import { p1QaPrefix } from "./fixtures/names.js";
import { createCompany, createPerson, destroyCompany, destroyPerson } from "./fixtures/records.js";
import {
  countQaMembers,
  deleteQaMember,
  longCompanyName,
  memberApi,
  provisionQaMember,
  qaMemberEmail,
  setQaMemberPrefs,
  type MemberPrefs,
  type TwentyQaMember,
} from "./fixtures/qa-member.js";

interface WorkerFixtures {
  twentyQaMember: TwentyQaMember;
}

export interface LongCompanyRecords {
  readonly companyName: string;
  readonly companyId: string;
  readonly personName: string;
  readonly personId: string;
}

interface Fixtures {
  memberPrefs: MemberPrefs;
  /** Applies memberPrefs before the test, resets to System/en after. */
  appliedPrefs: undefined;
  qaPrefix: string;
  /** TW-VIS-002: a 150-char company and a linked person, created and destroyed as the QA member. */
  longCompanyRecords: LongCompanyRecords;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  baseURL: async ({}, use) => use(loadTwentyConfig().baseUrl),

  twentyQaMember: [
    async ({ browser }, use, workerInfo) => {
      const seed = parsePositiveInt(process.env.P1_SEED, Date.now());
      const ids = await readAdminWorkspaceIds();
      const admin = await createPinnedTwentyApiSession(ids.workspaceId, ids.memberId);
      const password = `P1-qa-${String(seed)}-${String(workerInfo.parallelIndex)}-Pw9!`;
      const member = await provisionQaMember(
        admin,
        browser,
        qaMemberEmail(seed, workerInfo.parallelIndex),
        password,
      );
      const errors: unknown[] = [];
      try {
        await use(member);
      } finally {
        try {
          await deleteQaMember(member);
        } catch (e) {
          errors.push(e);
        }
        try {
          if ((await countQaMembers(admin)) !== 0) {
            errors.push(new Error("P1-QA Twenty member leaked"));
          }
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, "twentyQaMember teardown failed");
    },
    // Provisioning (sign-up, UI onboarding) gets its own budget instead of eating the first test's.
    { scope: "worker", timeout: 120_000 },
  ],

  storageState: async ({ twentyQaMember }, use) => use(twentyQaMember.storageStatePath),

  memberPrefs: [{}, { option: true }],

  appliedPrefs: [
    async ({ twentyQaMember, memberPrefs }, use) => {
      await setQaMemberPrefs(twentyQaMember, memberPrefs);
      try {
        await use(undefined);
      } finally {
        await setQaMemberPrefs(twentyQaMember, { colorScheme: "System", locale: "en" });
      }
    },
    { auto: true },
  ],

  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  qaPrefix: async ({}, use, testInfo) =>
    use(p1QaPrefix(process.env.P1_SEED ?? "0", testInfo.parallelIndex)),

  longCompanyRecords: async ({ twentyQaMember, qaPrefix }, use) => {
    const api = memberApi(twentyQaMember);
    const companyName = longCompanyName(qaPrefix);
    const company = await createCompany(api, companyName);
    const personName = `${qaPrefix}-Chip Probe`;
    let personId: string | undefined;
    const errors: unknown[] = [];
    try {
      const person = await createPerson(api, personName, "Probe", company.id);
      personId = person.id;
      await use({ companyName, companyId: company.id, personName, personId });
    } catch (e) {
      errors.push(e);
    }
    if (personId !== undefined) {
      try {
        await destroyPerson(api, personId);
      } catch (e) {
        errors.push(e);
      }
    }
    try {
      await destroyCompany(api, company.id);
    } catch (e) {
      errors.push(e);
    }
    if (errors.length > 0) throw new AggregateError(errors, "longCompanyRecords failed");
  },
});
export { expect } from "@playwright/test";
