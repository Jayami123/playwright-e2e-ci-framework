import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test as base } from "../../../src/products/documenso/fixtures.js";
import {
  attachFwBrowserTrpcCounter,
  flushFwBrowserTrpcThisTest,
  logFwBrowserTrpcBudget,
  resetFwBrowserTrpcThisTest,
} from "./fw-trpc-budget.js";
import { loginViaApi, newDocumensoApiContext } from "../../../src/products/documenso/auth.js";
import type { DocumensoQaUserFixture } from "../../../src/products/documenso/fixtures.js";

interface FwWorkerFixtures {
  fwTrpcBudgetReport: undefined;
}

export const test = base.extend<
  { signedInDocumensoUser: DocumensoQaUserFixture },
  FwWorkerFixtures
>({
  fwTrpcBudgetReport: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixture declares no upstream dependencies
    async ({}, use) => {
      await use(undefined);
      logFwBrowserTrpcBudget();
    },
    { scope: "worker", auto: true },
  ],

  page: async ({ browser, documensoUser }, use) => {
    const http = await newDocumensoApiContext();
    try {
      const login = await loginViaApi(http, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, login.authorizeDiagnostic).toBe(201);
      const stateDir = await mkdtemp(path.join(os.tmpdir(), "p1-doc-fw-storage-state-"));
      const statePath = path.join(stateDir, "storage-state.json");
      try {
        await http.storageState({ path: statePath });
        const context = await browser.newContext({ storageState: statePath });
        const page = await context.newPage();
        try {
          await use(page);
        } finally {
          await context.close();
        }
      } finally {
        await rm(stateDir, { recursive: true, force: true });
      }
    } finally {
      await http.dispose();
    }
  },

  signedInDocumensoUser: async ({ documensoUser }, use) => {
    await use(documensoUser);
  },
});

test.beforeEach(({ page }) => {
  resetFwBrowserTrpcThisTest();
  attachFwBrowserTrpcCounter(page);
});

test.afterEach(() => {
  flushFwBrowserTrpcThisTest();
});

export { expect } from "../../../src/products/documenso/fixtures.js";
