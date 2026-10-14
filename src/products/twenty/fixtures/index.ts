import { setFactorySeed } from "qa-portfolio-harness";
import { test as base } from "@playwright/test";
import { parsePositiveInt } from "../../../core/config.js";
import { loadTwentyConfig } from "../env.js";
import {
  createPinnedTwentyApiSession,
  loadUiWorkspaceIds,
  type TwentyPinnedApiSession,
} from "./auth.js";
import { p1QaCompanyName, p1QaOpportunityName, p1QaPersonName, p1QaPrefix } from "./names.js";
import {
  createCompany,
  createOpportunity,
  createPerson,
  destroyCompany,
  destroyOpportunity,
  destroyPerson,
  type TwentyCompanyRecord,
  type TwentyOpportunityRecord,
  type TwentyPersonRecord,
} from "./records.js";
import { readMemberTimeZone, setMemberTimeZone } from "./timezone.js";

export interface TwentyQaCapturedIds {
  readonly companyIds: string[];
  readonly personIds: string[];
  readonly opportunityIds: string[];
}

export interface TwentyQaFixture {
  readonly prefix: string;
  readonly api: TwentyPinnedApiSession;
  readonly workspaceId: string;
  readonly memberId: string;
  createCompany: (leaf?: string) => Promise<TwentyCompanyRecord>;
  createPerson: (leaf?: string) => Promise<TwentyPersonRecord>;
  createOpportunity: (leaf?: string, closeDateIso?: string) => Promise<TwentyOpportunityRecord>;
  setTimeZone: (timeZone: string) => Promise<void>;
  readTimeZone: () => Promise<string>;
  /** Runs TZ restore early (fixture `finally` still runs destroy + restore again). */
  restoreTimeZoneIfNeeded: () => Promise<void>;
}

interface TwentyQaFixtures {
  twentyQa: TwentyQaFixture;
}

interface TwentyWorkerFixtures {
  factorySeed: number;
}

export async function runTwentyQaFixtureCleanup(params: {
  readonly api: TwentyPinnedApiSession;
  readonly captured: TwentyQaCapturedIds;
  readonly restoreTimeZone?: () => Promise<void>;
  readonly testError?: unknown;
}): Promise<void> {
  const failures: unknown[] = [];
  if (params.testError !== undefined) {
    failures.push(params.testError);
  }

  for (const companyId of params.captured.companyIds) {
    try {
      await destroyCompany(params.api, companyId);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const personId of params.captured.personIds) {
    try {
      await destroyPerson(params.api, personId);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const opportunityId of params.captured.opportunityIds) {
    try {
      await destroyOpportunity(params.api, opportunityId);
    } catch (error) {
      failures.push(error);
    }
  }

  if (params.restoreTimeZone !== undefined) {
    try {
      await params.restoreTimeZone();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "twentyQa fixture failed");
  }
}

export const test = base.extend<TwentyQaFixtures, TwentyWorkerFixtures>({
  factorySeed: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixture declares no upstream dependencies
    async ({}, use, workerInfo) => {
      const baseSeed = parsePositiveInt(process.env.P1_SEED, Date.now());
      const seed = baseSeed + workerInfo.parallelIndex;
      setFactorySeed(seed);
      console.log(
        `P1_SEED=${String(baseSeed)} worker=${String(workerInfo.parallelIndex)} seed=${String(seed)}`,
      );
      await use(seed);
    },
    { scope: "worker", auto: true },
  ],

  twentyQa: async ({ factorySeed }, use, testInfo) => {
    const { authStatePath } = loadTwentyConfig();
    const ui = loadUiWorkspaceIds(authStatePath);
    const api = await createPinnedTwentyApiSession(ui.workspaceId, ui.memberId);
    const prefix = p1QaPrefix(factorySeed, testInfo.parallelIndex);

    const captured: TwentyQaCapturedIds = {
      companyIds: [],
      personIds: [],
      opportunityIds: [],
    };

    let originalTimeZone: string | undefined;
    let restoreTimeZone: (() => Promise<void>) | undefined;
    let testError: unknown;

    const ensureTimeZoneBaseline = async (): Promise<string> => {
      if (originalTimeZone === undefined) {
        originalTimeZone = await readMemberTimeZone(api, api.memberId);
      }
      return originalTimeZone;
    };

    const fixture: TwentyQaFixture = {
      prefix,
      api,
      workspaceId: api.workspaceId,
      memberId: api.memberId,
      createCompany: async (leaf?: string) => {
        const created = await createCompany(api, p1QaCompanyName(prefix, leaf));
        captured.companyIds.push(created.id);
        return created;
      },
      createPerson: async (leaf?: string) => {
        const names = p1QaPersonName(prefix, leaf);
        const created = await createPerson(api, names.firstName, names.lastName);
        captured.personIds.push(created.id);
        return created;
      },
      createOpportunity: async (leaf?: string, closeDateIso = "2027-01-01T00:00:00.000Z") => {
        const created = await createOpportunity(
          api,
          p1QaOpportunityName(prefix, leaf),
          closeDateIso,
        );
        captured.opportunityIds.push(created.id);
        return created;
      },
      readTimeZone: async () => readMemberTimeZone(api, api.memberId),
      restoreTimeZoneIfNeeded: async () => {
        if (restoreTimeZone !== undefined) {
          await restoreTimeZone();
        }
      },
      setTimeZone: async (timeZone: string) => {
        await ensureTimeZoneBaseline();
        await setMemberTimeZone(api, api.memberId, timeZone);
        if (restoreTimeZone === undefined) {
          const baseline = originalTimeZone;
          restoreTimeZone = async () => {
            if (baseline !== undefined) {
              await setMemberTimeZone(api, api.memberId, baseline);
            }
          };
        }
      },
    };

    try {
      await use(fixture);
    } catch (error) {
      testError = error;
    } finally {
      await runTwentyQaFixtureCleanup({
        api,
        captured,
        ...(restoreTimeZone === undefined ? {} : { restoreTimeZone }),
        ...(testError === undefined ? {} : { testError }),
      });
    }
  },
});

export { expect } from "@playwright/test";
