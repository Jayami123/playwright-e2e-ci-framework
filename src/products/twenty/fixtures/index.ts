import { setFactorySeed } from "qa-portfolio-harness";
import { test as base } from "@playwright/test";
import { parsePositiveInt } from "../../../core/config.js";
import { loadTwentyConfig } from "../env.js";
import {
  createPinnedTwentyApiSession,
  loadUiWorkspaceIds,
  type TwentyPinnedApiSession,
} from "./auth.js";
import {
  p1QaCompanyName,
  p1QaOpportunityName,
  p1QaPersonName,
  p1QaPetName,
  p1QaPrefix,
} from "./names.js";
import { destroyView } from "./views.js";
import {
  createCompany,
  createOpportunity,
  createPerson,
  createPet,
  destroyCompany,
  destroyOpportunity,
  destroyPerson,
  destroyPet,
  type TwentyCompanyRecord,
  type TwentyOpportunityRecord,
  type TwentyPersonRecord,
  type TwentyPetRecord,
} from "./records.js";
import { createTimeZoneRestoreGuard, readMemberTimeZone, setMemberTimeZone } from "./timezone.js";

export interface TwentyQaCapturedIds {
  readonly companyIds: string[];
  readonly personIds: string[];
  readonly opportunityIds: string[];
  readonly petIds: string[];
  readonly viewIds: string[];
}

export interface TwentyQaFixture {
  readonly prefix: string;
  readonly api: TwentyPinnedApiSession;
  readonly workspaceId: string;
  readonly memberId: string;
  createCompany: (leaf?: string) => Promise<TwentyCompanyRecord>;
  createPerson: (leaf?: string) => Promise<TwentyPersonRecord>;
  createOpportunity: (leaf?: string, closeDateIso?: string) => Promise<TwentyOpportunityRecord>;
  createPet: (leaf?: string, birthday?: string) => Promise<TwentyPetRecord>;
  setTimeZone: (timeZone: string) => Promise<void>;
  /** Registers fixture TZ restore without changing member TZ (Settings UI writes). */
  rememberTimeZone: () => Promise<void>;
  readTimeZone: () => Promise<string>;
  /** Runs TZ restore early (fixture `finally` still runs destroy + restore again). */
  restoreTimeZoneIfNeeded: () => Promise<void>;
  /** Stops fixture teardown from destroying a company already removed in the test. */
  forgetCapturedCompany: (companyId: string) => void;
  captureViewId: (viewId: string) => void;
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
  for (const petId of params.captured.petIds) {
    try {
      await destroyPet(params.api, petId);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const viewId of params.captured.viewIds) {
    try {
      await destroyView(params.api, viewId);
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
      petIds: [],
      viewIds: [],
    };

    let testError: unknown;
    const tzGuard = createTimeZoneRestoreGuard({
      read: () => readMemberTimeZone(api, api.memberId),
      write: (timeZone) => setMemberTimeZone(api, api.memberId, timeZone),
    });

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
      createPet: async (leaf?: string, birthday = "2027-01-01") => {
        const created = await createPet(api, p1QaPetName(prefix, leaf), birthday);
        captured.petIds.push(created.id);
        return created;
      },
      readTimeZone: async () => readMemberTimeZone(api, api.memberId),
      rememberTimeZone: async () => {
        await tzGuard.remember();
      },
      restoreTimeZoneIfNeeded: async () => {
        await tzGuard.restoreIfNeeded();
      },
      setTimeZone: async (timeZone: string) => {
        await tzGuard.setTimeZone(timeZone);
      },
      forgetCapturedCompany: (companyId: string) => {
        const index = captured.companyIds.indexOf(companyId);
        if (index >= 0) {
          captured.companyIds.splice(index, 1);
        }
      },
      captureViewId: (viewId: string) => {
        captured.viewIds.push(viewId);
      },
    };

    try {
      await use(fixture);
    } catch (error) {
      testError = error;
    } finally {
      const restoreTimeZone = tzGuard.peekRestore();
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
