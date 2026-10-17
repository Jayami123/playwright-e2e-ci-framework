import { test as base, type Page } from "@playwright/test";
import { parsePositiveInt } from "../../core/config.js";
import { loadTwentyConfig } from "./env.js";
import {
  createPinnedTwentyApiSession,
  readAdminWorkspaceIds,
  type TwentyPinnedApiSession,
} from "./fixtures/auth.js";
import {
  countQaMembers,
  deleteQaMember,
  provisionQaMember,
  qaFreshMemberEmail,
  type TwentyQaMember,
} from "./fixtures/qa-member.js";
import { enrolTotpViaApi, twoFactorStatuses } from "./fixtures/two-factor.js";

export interface FreshTwentyMember {
  readonly member: TwentyQaMember;
  readonly password: string;
}

export interface EnrolledTwentyMember extends FreshTwentyMember {
  readonly secret: string;
}

const RUN_SEED = parsePositiveInt(process.env.P1_SEED, Date.now());
let memberCounter = 0;

export const test = base.extend<{
  twentyAdmin: TwentyPinnedApiSession;
  freshTwentyMember: FreshTwentyMember;
  enrolledTwentyMember: EnrolledTwentyMember;
  /** An anonymous second browser context (explicitly empty storage) for the same test. */
  extraContextPage: Page;
}>({
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  baseURL: async ({}, use) => use(loadTwentyConfig().baseUrl),

  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  twentyAdmin: async ({}, use) => {
    const ids = await readAdminWorkspaceIds();
    await use(await createPinnedTwentyApiSession(ids.workspaceId, ids.memberId));
  },

  freshTwentyMember: [
    async ({ browser, twentyAdmin }, use, testInfo) => {
      memberCounter += 1;
      const email = qaFreshMemberEmail(RUN_SEED, testInfo.parallelIndex, memberCounter);
      const password = `P1-qa-${String(RUN_SEED)}-${String(testInfo.parallelIndex)}-f${String(memberCounter)}-Pw9!`;
      const member = await provisionQaMember(twentyAdmin, browser, email, password);
      const errors: unknown[] = [];
      try {
        await use({ member, password });
      } finally {
        try {
          await deleteQaMember(member);
        } catch (e) {
          errors.push(e);
        }
        try {
          if ((await countQaMembers(twentyAdmin, member.email)) !== 0) {
            errors.push(new Error("P1-QA Twenty 2FA member leaked"));
          }
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, "freshTwentyMember teardown failed");
    },
    { timeout: 120_000 },
  ],

  enrolledTwentyMember: async ({ freshTwentyMember }, use) => {
    const { secret } = await enrolTotpViaApi(freshTwentyMember.member);
    const statuses = await twoFactorStatuses(freshTwentyMember.member);
    if (statuses.length !== 1 || statuses[0] !== "VERIFIED") {
      throw new Error(`Expected one VERIFIED 2FA method, got ${statuses.join(",") || "none"}`);
    }
    await use({ ...freshTwentyMember, secret });
  },

  storageState: async ({ freshTwentyMember }, use) =>
    use(freshTwentyMember.member.storageStatePath),

  extraContextPage: async ({ browser }, use) => {
    // browser.newContext inherits the test's storageState; an explicit empty one keeps this context signed out.
    const context = await browser.newContext({
      baseURL: loadTwentyConfig().baseUrl,
      storageState: { cookies: [], origins: [] },
    });
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
});
export { expect } from "@playwright/test";
