import type { Browser } from "@playwright/test";
import { createAdminSession, loginAdminToken } from "./admin-api.js";
import { loadMedusaConfig, medusaBaseUrlFromEnv } from "./env.js";
import { test as base } from "./fixtures.js";

type StorageState = Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;

export type AdminLanguage = "en" | "de";

export interface ConsoleRecorder {
  entries(): readonly string[];
}

interface VisualFixtures {
  /** Admin UI language for the test context (plan D1). Default English. */
  adminLanguage: AdminLanguage;
  /** Writes the `lng` cookie before the first goto. Never touches the shared admin user. */
  appliedLanguage: undefined;
  /** Records console errors and page errors without asserting. VIS-002 asserts its contents. */
  consoleRecorder: ConsoleRecorder;
}

interface VisualWorkerFixtures {
  medusaAdminState: StorageState;
}

export const test = base.extend<VisualFixtures, VisualWorkerFixtures>({
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  baseURL: async ({}, use) => use(medusaBaseUrlFromEnv()),

  /** API login in a throwaway context; the state stays in memory (plan D7). */
  medusaAdminState: [
    async ({ browser }, use) => {
      const config = loadMedusaConfig();
      const context = await browser.newContext({ baseURL: config.baseUrl });
      try {
        const token = await loginAdminToken(
          context.request,
          config.adminEmail,
          config.adminPassword,
        );
        await createAdminSession(context.request, token);
        await use(await context.storageState());
      } finally {
        await context.close();
      }
    },
    { scope: "worker" },
  ],

  storageState: async ({ medusaAdminState }, use) => use(medusaAdminState),

  adminLanguage: ["en", { option: true }],

  appliedLanguage: [
    async ({ context, adminLanguage, baseURL }, use) => {
      const host = new URL(baseURL ?? medusaBaseUrlFromEnv()).hostname;
      await context.addCookies([
        { name: "lng", value: adminLanguage, domain: host, path: "/", sameSite: "Strict" },
      ]);
      await use(undefined);
    },
    { auto: true },
  ],

  consoleRecorder: async ({ page }, use) => {
    const entries: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        entries.push(`console.error: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      entries.push(`pageerror: ${error.message}`);
    });
    await use({ entries: () => entries });
  },
});

export { expect } from "@playwright/test";
