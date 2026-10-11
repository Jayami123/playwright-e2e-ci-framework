import { expect, request, test as base, type CDPSession } from "@playwright/test";
import { setFactorySeed } from "qa-portfolio-harness";
import { generateTotpCode } from "../../core/totp.js";
import { parsePositiveInt } from "../../core/config.js";
import { enableTwoFactorViaApi, loginViaApi, setupTwoFactorViaApi } from "./auth.js";
import { loadDocumensoConfig } from "./env.js";
import { qaDocumensoUser, type DocumensoQaUser } from "./factories.js";
import { createDocumensoQaUser, teardownDocumensoQaUserById } from "./qa-user.js";

export type DocumensoQaUserFixture = DocumensoQaUser & { readonly id: number };

export type TwoFactorDocumensoUserFixture = DocumensoQaUserFixture & {
  readonly secret: string;
  readonly backupCodes: readonly string[];
};

export interface VirtualAuthenticatorFixture {
  readonly authenticatorId: string;
  readonly cdp: CDPSession;
}

interface DocumensoFixtures {
  documensoUser: DocumensoQaUserFixture;
  twoFactorDocumensoUser: TwoFactorDocumensoUserFixture;
  virtualAuthenticator: VirtualAuthenticatorFixture;
}

interface DocumensoWorkerFixtures {
  factorySeed: number;
}

export const test = base.extend<DocumensoFixtures, DocumensoWorkerFixtures>({
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

  // eslint-disable-next-line no-empty-pattern -- Playwright fixture declares no upstream dependencies
  documensoUser: async ({}, use, testInfo) => {
    const identity = qaDocumensoUser(testInfo.parallelIndex);
    let userId: number | undefined;
    const teardownErrors: unknown[] = [];
    let testError: unknown;
    try {
      const created = await createDocumensoQaUser(identity);
      userId = created.id;
      await use(created);
    } catch (error) {
      testError = error;
    } finally {
      if (userId !== undefined) {
        try {
          await teardownDocumensoQaUserById(userId);
        } catch (error) {
          teardownErrors.push(error);
        }
      }
    }
    if (testError !== undefined) {
      teardownErrors.unshift(testError);
    }
    if (teardownErrors.length > 0) {
      throw new AggregateError(teardownErrors, "documensoUser fixture failed");
    }
  },

  virtualAuthenticator: async ({ page }, use) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable", { enableUI: false });
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    try {
      await use({ authenticatorId, cdp });
    } finally {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch(() => {});
      await cdp.detach().catch(() => {});
    }
  },

  twoFactorDocumensoUser: async ({ documensoUser }, use) => {
    const { baseUrl } = loadDocumensoConfig();
    const http = await request.newContext({ baseURL: baseUrl });
    try {
      const login = await loginViaApi(http, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, "twoFactorDocumensoUser password login").toBe(201);
      const setup = await setupTwoFactorViaApi(http);
      const codeMintedAtMs = Date.now();
      const enrolCode = generateTotpCode(setup.secret, codeMintedAtMs);
      const enabled = await enableTwoFactorViaApi(http, enrolCode, codeMintedAtMs);
      await use({
        ...documensoUser,
        secret: setup.secret,
        backupCodes: enabled.backupCodes,
      });
    } finally {
      await http.dispose();
    }
  },
});

export { expect } from "@playwright/test";
