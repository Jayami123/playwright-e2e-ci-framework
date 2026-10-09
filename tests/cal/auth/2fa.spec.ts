import {
  CAL_INCORRECT_BACKUP_CODE,
  CAL_INCORRECT_TWO_FACTOR_CODE,
  loginCallbackErrorParam,
  parseCalCredentialsCallback,
  readCalSessionPayload,
  sessionHasEmail,
} from "../../../src/products/cal/auth.js";
import { assertTotpBudget, generateTotpCode } from "../../../src/core/totp.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { installTimezoneHandler } from "../../../src/products/cal/app-shell.js";
import { readTwoFactorState } from "../../../src/products/cal/qa-user.js";
import { CAL_ROUTES } from "../../../src/products/cal/routes.js";
import { LoginPage } from "../../../src/products/cal/pages/login.page.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };
const REPLAY_ISSUE = "P7-OBS-CAL-2FA-002: Cal accepts TOTP replay within the same window";

test.describe("P1-CAL-2FA-001 UI enrol", () => {
  test.use({ storageState: EMPTY_STORAGE, twoFactorEnrol: "ui" });

  test(
    "P1-CAL-2FA-001 TOTP login with an otplib-generated code",
    {
      tag: ["@cal", "@auth", "@2fa"],
      annotation: [
        { type: "testId", description: "P1-CAL-2FA-001" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, twoFactorUser, eventTypes }) => {
      await test.step("sign out the enrolled QA user", async () => {
        await eventTypes.goto();
        const login = new LoginPage(page);
        await login.signOut(twoFactorUser.name);
      });

      const login = new LoginPage(page);
      await test.step("log in with email, password, and a fresh TOTP code", async () => {
        await login.goto();
        await login.continueWithPassword(twoFactorUser.email, twoFactorUser.password);
        await login.waitForTwoFactorStep();
        const epochMs = Date.now();
        assertTotpBudget({ epochMs, neededMs: 25_000 });
        const code = generateTotpCode(twoFactorUser.secret, epochMs);
        await login.fillTotpCode(code);
        await login.submitTotp();
      });

      await test.step("session and event-types oracle", async () => {
        await expect
          .poll(async () => {
            const payload = await readCalSessionPayload(page.request);
            return sessionHasEmail(payload, twoFactorUser.email);
          })
          .toBe(true);
        await page.goto(CAL_ROUTES.eventTypes, { waitUntil: "domcontentloaded" });
        await expect(eventTypes.heading).toBeVisible();
      });
    },
  );
});

test.describe("P1-CAL-2FA-002 replay", () => {
  test.use({ storageState: EMPTY_STORAGE, twoFactorEnrol: "api" });

  test(
    "P1-CAL-2FA-002 Same TOTP code replayed in a second context",
    {
      tag: ["@cal", "@auth", "@2fa"],
      annotation: [
        { type: "testId", description: "P1-CAL-2FA-002" },
        { type: "priority", description: "P2" },
        { type: "issue", description: REPLAY_ISSUE },
      ],
    },
    async ({ browser, twoFactorUser }, testInfo) => {
      const contextA = await browser.newContext({ storageState: EMPTY_STORAGE });
      const contextB = await browser.newContext({ storageState: EMPTY_STORAGE });
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      await installTimezoneHandler(pageA);
      await installTimezoneHandler(pageB);

      try {
        const loginA = new LoginPage(pageA);
        const loginB = new LoginPage(pageB);

        await test.step("both contexts reach the TOTP step", async () => {
          await loginA.goto();
          await loginB.goto();
          await loginA.continueWithPassword(twoFactorUser.email, twoFactorUser.password);
          await loginB.continueWithPassword(twoFactorUser.email, twoFactorUser.password);
          await loginA.waitForTwoFactorStep();
          await loginB.waitForTwoFactorStep();
        });

        const epochMs = Date.now();
        assertTotpBudget({ epochMs, neededMs: 25_000 });
        const sharedCode = generateTotpCode(twoFactorUser.secret, epochMs);

        await test.step("context A succeeds with the shared code", async () => {
          await loginA.fillTotpCode(sharedCode);
          await loginA.submitTotp();
          await expect
            .poll(async () => {
              const payload = await readCalSessionPayload(pageA.request);
              return sessionHasEmail(payload, twoFactorUser.email);
            })
            .toBe(true);
        });

        await test.step("context B replays the same code", async () => {
          await loginB.fillTotpCode(sharedCode);
          const responsePromise = pageB.waitForResponse(/\/api\/auth\/callback\/credentials/);
          await loginB.submitTotp();
          const response = await responsePromise;
          const callbackBody = parseCalCredentialsCallback(await response.json());
          const sessionOnB = await readCalSessionPayload(pageB.request);
          const sessionUserOnB = sessionHasEmail(sessionOnB, twoFactorUser.email);
          const callbackError = loginCallbackErrorParam(callbackBody);

          if (sessionUserOnB) {
            await attachKnownBugEvidence(pageB, testInfo, {
              issue: REPLAY_ISSUE,
              observed: { sessionUserOnB, callbackError: callbackError ?? null },
              expected: {
                sessionUserOnB: false,
                callbackError: CAL_INCORRECT_TWO_FACTOR_CODE,
              },
            });
            test.fail(true, REPLAY_ISSUE);
          }

          expect(sessionUserOnB, "RFC 6238 replay must not create a session on context B").toBe(
            false,
          );
          expect(
            callbackError,
            "Replay failure must surface incorrect-two-factor-code, not CSRF",
          ).toBe(CAL_INCORRECT_TWO_FACTOR_CODE);
        });
      } finally {
        await contextA.close();
        await contextB.close();
      }
    },
  );
});

test.describe("P1-CAL-2FA-003 backup code", () => {
  test.use({ storageState: EMPTY_STORAGE, twoFactorEnrol: "api" });

  test(
    "P1-CAL-2FA-003 Backup code works once",
    {
      tag: ["@cal", "@auth", "@2fa"],
      annotation: [
        { type: "testId", description: "P1-CAL-2FA-003" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, twoFactorUser, eventTypes }) => {
      const rawBackup = twoFactorUser.backupCodes[0];
      if (rawBackup === undefined) {
        throw new Error("twoFactorUser fixture did not return backup codes");
      }
      const formattedBackup = twoFactorUser.formatBackupCode(rawBackup);
      const beforeCipher = (await readTwoFactorState(twoFactorUser.id)).backupCodesCiphertext;

      const login = new LoginPage(page);
      await test.step("start from a logged-out session", async () => {
        await page.goto(CAL_ROUTES.eventTypes, { waitUntil: "domcontentloaded" });
        await login.signOut(twoFactorUser.name);
      });

      await test.step("first backup-code login creates a session", async () => {
        await login.goto();
        await login.continueWithPassword(twoFactorUser.email, twoFactorUser.password);
        await login.waitForTwoFactorStep();
        await login.clickLostAccess();
        await login.fillBackupCode(formattedBackup);
        await login.submitBackupCode();
        await expect
          .poll(async () => {
            const payload = await readCalSessionPayload(page.request);
            return sessionHasEmail(payload, twoFactorUser.email);
          })
          .toBe(true);
      });

      await test.step("backup ciphertext changes after use", async () => {
        const afterCipher = (await readTwoFactorState(twoFactorUser.id)).backupCodesCiphertext;
        expect(afterCipher).not.toBe(beforeCipher);
      });

      await test.step("reuse rejects the spent backup code", async () => {
        await eventTypes.goto();
        await login.signOut(twoFactorUser.name);
        await login.goto();
        await login.continueWithPassword(twoFactorUser.email, twoFactorUser.password);
        await login.waitForTwoFactorStep();
        await login.clickLostAccess();
        await login.fillBackupCode(formattedBackup);
        const responsePromise = page.waitForResponse(/\/api\/auth\/callback\/credentials/);
        await login.submitBackupCode();
        const response = await responsePromise;
        const callbackBody = parseCalCredentialsCallback(await response.json());
        const callbackError = loginCallbackErrorParam(callbackBody);
        expect(callbackError).toBe(CAL_INCORRECT_BACKUP_CODE);
        await expect(login.incorrectBackupAlert()).toBeVisible();
        const payload = await readCalSessionPayload(page.request);
        expect(sessionHasEmail(payload, twoFactorUser.email)).toBe(false);
      });
    },
  );
});
