import type { APIRequestContext, Browser, Response } from "@playwright/test";
import { totpMsLeftInStep, totpStepNumber } from "../../../src/core/totp.js";
import { mintDocumensoTotpCode } from "../../../src/products/documenso/totp-mint.js";
import { required } from "../../../src/core/required.js";
import {
  KNOWN_BUG_JSON_ATTACHMENT,
  serializeKnownBugEvidence,
} from "../../../src/core/known-bug-evidence.js";
import {
  DOC_INCORRECT_TWO_FACTOR_CODE,
  DOC_INVALID_TWO_FACTOR_CODE,
  DOC_TWO_FACTOR_MISSING_CREDENTIALS,
  loginViaApi,
  newDocumensoApiContext,
  readSession,
  sessionHasEmail,
  wrongTotpCodeFromLive,
} from "../../../src/products/documenso/auth.js";
import { readDocumensoTwoFactorEnabled } from "../../../src/products/documenso/qa-user.js";
import { documensoTimeouts } from "../../../src/products/documenso/env.js";
import { expect, test } from "../../../src/products/documenso/fixtures.js";
import { SecuritySettingsPage } from "../../../src/products/documenso/pages/security.page.js";
import { SignInPage } from "../../../src/products/documenso/pages/signin.page.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };

test.use({ storageState: EMPTY_STORAGE });

const BACKUP_REUSE_ISSUE =
  "P7-OBS-DOC-2FA-001: Documenso accepts the same backup code more than once";
const REPLAY_ISSUE = "P7-OBS-DOC-2FA-002: Documenso accepts TOTP replay within the same window";
const WRONG_CODE_STATUS_ISSUE =
  "P7-OBS-DOC-2FA-003: Documenso auth failure returns HTTP 500 instead of 4xx";
const DISABLE_WRONG_CODE_ISSUE =
  "P7-OBS-DOC-2FA-004: Documenso disable 2FA wrong code is not cleanly refused";
const REPLAY_TOTP_MIN_MS_LEFT = 8_000;
const REPLAY_EVIDENCE_ATTACHMENT = "replay-totp-evidence.json";
const CI_EVIDENCE_RUN_URL =
  "https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38388797450";

async function assertSecurityPageWithApiSession(
  browser: Browser,
  http: APIRequestContext,
): Promise<void> {
  const storageState = await http.storageState();
  const context = await browser.newContext({ storageState });
  try {
    const page = await context.newPage();
    const security = new SecuritySettingsPage(page);
    await security.gotoWithTwoFactorEnabled();
  } finally {
    await context.close();
  }
}

async function authorizeBodyCode(response: Response): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { code?: string };
    return typeof payload.code === "string" ? payload.code : undefined;
  } catch {
    return undefined;
  }
}

test(
  "P1-DOC-2FA-001 UI enrol",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-001" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, documensoUser }) => {
    const login = await loginViaApi(page.request, {
      email: documensoUser.email,
      password: documensoUser.password,
    });
    expect(login.status, login.authorizeDiagnostic).toBe(201);

    const security = new SecuritySettingsPage(page);
    await security.goto();
    const secret = await security.openEnableTwoFactorFlow();
    const { code: enrolCode, mintedAtMs: codeMintedAtMs } = await mintDocumensoTotpCode(secret);
    const backupCodes = await security.submitEnrolmentToken(enrolCode, codeMintedAtMs);
    expect(backupCodes.length).toBe(10);
    await security.expectRecoveryCodesSection();

    const isolated = await newDocumensoApiContext();
    try {
      const blocked = await loginViaApi(isolated, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(blocked.code).toBe(DOC_TWO_FACTOR_MISSING_CREDENTIALS);
      expect(blocked.hasSessionCookie).toBe(false);
      const session = await readSession(isolated);
      expect(session.isAuthenticated).toBe(false);
    } finally {
      await isolated.dispose();
    }
  },
);

test(
  "P1-DOC-2FA-002 TOTP login",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-002" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, twoFactorDocumensoUser }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.submitPasswordForTwoFactorDialog(
      twoFactorDocumensoUser.email,
      twoFactorDocumensoUser.password,
    );
    const { code } = await mintDocumensoTotpCode(twoFactorDocumensoUser.secret);
    await signIn.fillTotpToken(code);
    const response = await signIn.submitTwoFactorSignIn();
    expect(response.status(), await signIn.authorizeFailureMessage(response)).toBe(201);
    await expect(page).toHaveURL(/\/t\/[^/]+\/documents$/, {
      timeout: documensoTimeouts().request,
    });
    const session = await readSession(page.request);
    expect(sessionHasEmail(session, twoFactorDocumensoUser.email)).toBe(true);
  },
);

test(
  "P1-DOC-2FA-003 wrong code rejected",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-003" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, twoFactorDocumensoUser }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.submitPasswordForTwoFactorDialog(
      twoFactorDocumensoUser.email,
      twoFactorDocumensoUser.password,
    );
    const { code: liveCode } = await mintDocumensoTotpCode(twoFactorDocumensoUser.secret);
    const wrongCode = wrongTotpCodeFromLive(liveCode);
    await signIn.fillTotpToken(wrongCode);
    const response = await signIn.submitTwoFactorSignIn();
    expect(await authorizeBodyCode(response)).toBe(DOC_INVALID_TWO_FACTOR_CODE);
    await expect(page.getByText("Unable to sign in", { exact: true })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    await expect(
      page.getByText("The two-factor authentication code provided is incorrect.", { exact: true }),
    ).toBeVisible();
    await expect(signIn.twoFactorDialog()).toBeVisible();
    await expect(page).toHaveURL(/\/signin$/);
    const session = await readSession(page.request);
    expect(session.isAuthenticated).toBe(false);
  },
);

test(
  "P1-DOC-2FA-004 wrong-code status is 4xx",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-004" },
      { type: "priority", description: "P2" },
      { type: "issue", description: WRONG_CODE_STATUS_ISSUE },
    ],
  },
  async ({ twoFactorDocumensoUser }, testInfo) => {
    expect(await readDocumensoTwoFactorEnabled(twoFactorDocumensoUser.id)).toBe(true);

    const http = await newDocumensoApiContext();
    try {
      const { code: liveCode } = await mintDocumensoTotpCode(twoFactorDocumensoUser.secret);
      const wrongCode = wrongTotpCodeFromLive(liveCode);
      expect(wrongCode).not.toBe(liveCode);

      const result = await loginViaApi(http, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        totpCode: wrongCode,
      });
      expect(result.code).toBe(DOC_INVALID_TWO_FACTOR_CODE);

      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: WRONG_CODE_STATUS_ISSUE,
          observed: {
            authorizeStatus: result.status,
            authorizeCode: result.code ?? null,
            ciRun: CI_EVIDENCE_RUN_URL,
            traceHint:
              "playwright-test-results/auth-2fa-P1-DOC-2FA-004-wrong-code-status-is-4xx-documenso-chromium/trace.zip",
          },
          expected: { authorizeStatus: "4xx" },
        }),
        contentType: "application/json",
      });

      // P7-OBS-DOC-2FA-003 — docs/observations/documenso-2fa-known-issues.md
      test.fail(true, WRONG_CODE_STATUS_ISSUE);

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
    } finally {
      await http.dispose();
    }
  },
);

test(
  "P1-DOC-2FA-005 backup code login works",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-005" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, twoFactorDocumensoUser }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.submitPasswordForTwoFactorDialog(
      twoFactorDocumensoUser.email,
      twoFactorDocumensoUser.password,
    );
    await signIn.clickUseBackupCode();
    await signIn.fillBackupCode(required(twoFactorDocumensoUser.backupCodes[0], "backupCodes[0]"));
    const response = await signIn.submitTwoFactorSignIn();
    expect(response.status()).toBe(201);
    await expect(page).toHaveURL(/\/t\/[^/]+\/documents$/, {
      timeout: documensoTimeouts().request,
    });
    const session = await readSession(page.request);
    expect(sessionHasEmail(session, twoFactorDocumensoUser.email)).toBe(true);
  },
);

test(
  "P1-DOC-2FA-006 spent backup code rejected",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-006" },
      { type: "priority", description: "P1" },
      { type: "issue", description: BACKUP_REUSE_ISSUE },
    ],
  },
  async ({ twoFactorDocumensoUser, browser }, testInfo) => {
    expect(await readDocumensoTwoFactorEnabled(twoFactorDocumensoUser.id)).toBe(true);
    const backupCode = required(twoFactorDocumensoUser.backupCodes[0], "backupCodes[0]");

    const httpA = await newDocumensoApiContext();
    const httpB = await newDocumensoApiContext();
    try {
      const first = await loginViaApi(httpA, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        backupCode,
      });
      expect(first.status).toBe(201);
      expect(first.hasSessionCookie).toBe(true);
      expect(sessionHasEmail(await readSession(httpA), twoFactorDocumensoUser.email)).toBe(true);

      const second = await loginViaApi(httpB, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        backupCode,
      });
      const secondSession = await readSession(httpB);
      const secondSessionHasEmail = sessionHasEmail(secondSession, twoFactorDocumensoUser.email);
      const secondAuthenticated =
        second.status === 201 && second.hasSessionCookie && secondSessionHasEmail;
      let securityPageLoaded = false;
      if (secondAuthenticated) {
        try {
          await assertSecurityPageWithApiSession(browser, httpB);
          securityPageLoaded = true;
        } catch {
          securityPageLoaded = false;
        }
      }

      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: BACKUP_REUSE_ISSUE,
          observed: {
            firstStatus: first.status,
            secondStatus: second.status,
            secondCode: second.code ?? null,
            secondHasSessionCookie: second.hasSessionCookie,
            secondSessionHasEmail,
            secondAuthenticated,
            securityPageLoaded,
            ciRun: CI_EVIDENCE_RUN_URL,
            traceHint:
              "playwright-test-results/auth-2fa-P1-DOC-2FA-006-spent-backup-code-rejected-documenso-chromium/trace.zip",
          },
          expected: {
            secondStatus: "4xx",
            secondCode: DOC_INVALID_TWO_FACTOR_CODE,
            secondHasSessionCookie: false,
          },
        }),
        contentType: "application/json",
      });

      // P7-OBS-DOC-2FA-001 — docs/observations/documenso-2fa-known-issues.md
      test.fail(true, BACKUP_REUSE_ISSUE);

      expect(second.code).toBe(DOC_INVALID_TWO_FACTOR_CODE);
      expect(second.hasSessionCookie).toBe(false);
    } finally {
      await httpA.dispose();
      await httpB.dispose();
    }
  },
);

test(
  "P1-DOC-2FA-007 same-window TOTP replay rejected",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-007" },
      { type: "priority", description: "P2" },
      { type: "issue", description: REPLAY_ISSUE },
    ],
  },
  async ({ twoFactorDocumensoUser, browser }, testInfo) => {
    expect(await readDocumensoTwoFactorEnabled(twoFactorDocumensoUser.id)).toBe(true);

    const { code: sharedCode, mintedAtMs: mintEpochMs } = await mintDocumensoTotpCode(
      twoFactorDocumensoUser.secret,
      REPLAY_TOTP_MIN_MS_LEFT,
    );
    const mintStep = totpStepNumber(mintEpochMs);
    const httpA = await newDocumensoApiContext();
    const httpB = await newDocumensoApiContext();
    try {
      const first = await loginViaApi(httpA, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        totpCode: sharedCode,
      });
      expect(first.status).toBe(201);
      expect(first.hasSessionCookie).toBe(true);
      expect(sessionHasEmail(await readSession(httpA), twoFactorDocumensoUser.email)).toBe(true);

      const second = await loginViaApi(httpB, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        totpCode: sharedCode,
      });
      const firstStep = totpStepNumber(first.authorizeRequestedAtMs);
      const secondStep = totpStepNumber(second.authorizeRequestedAtMs);
      const sameAuthorizeStep = firstStep === secondStep;
      expect(sameAuthorizeStep).toBe(true);

      const secondSession = await readSession(httpB);
      const secondSessionHasEmail = sessionHasEmail(secondSession, twoFactorDocumensoUser.email);
      const secondAuthenticated =
        second.status === 201 && second.hasSessionCookie && secondSessionHasEmail;
      let securityPageLoaded = false;
      if (secondAuthenticated) {
        try {
          await assertSecurityPageWithApiSession(browser, httpB);
          securityPageLoaded = true;
        } catch {
          securityPageLoaded = false;
        }
      }

      const replayEvidence = {
        issue: REPLAY_ISSUE,
        ciRun: CI_EVIDENCE_RUN_URL,
        traceHint:
          "playwright-test-results/auth-2fa-P1-DOC-2FA-007-same-window-TOTP-replay-rejected-documenso-chromium/trace.zip",
        mint: {
          epochMs: mintEpochMs,
          step: mintStep,
          msLeftInStep: totpMsLeftInStep(mintEpochMs),
        },
        firstLogin: {
          authorizeRequestedAtMs: first.authorizeRequestedAtMs,
          step: firstStep,
          status: first.status,
          code: first.code ?? null,
        },
        secondLogin: {
          authorizeRequestedAtMs: second.authorizeRequestedAtMs,
          step: secondStep,
          status: second.status,
          code: second.code ?? null,
          hasSessionCookie: second.hasSessionCookie,
          sessionHasEmail: secondSessionHasEmail,
          authenticated: secondAuthenticated,
          securityPageLoaded,
        },
        sameAuthorizeStep,
        sameStepAsMint: firstStep === mintStep && secondStep === mintStep,
      };

      await testInfo.attach(REPLAY_EVIDENCE_ATTACHMENT, {
        body: JSON.stringify(replayEvidence, null, 2),
        contentType: "application/json",
      });

      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: REPLAY_ISSUE,
          observed: {
            firstStatus: first.status,
            secondStatus: second.status,
            secondCode: second.code ?? null,
            secondHasSessionCookie: second.hasSessionCookie,
            mintStep,
            firstStep,
            secondStep,
            sameAuthorizeStep,
            ciRun: CI_EVIDENCE_RUN_URL,
          },
          expected: {
            secondStatus: "4xx",
            secondCode: DOC_INVALID_TWO_FACTOR_CODE,
            secondHasSessionCookie: false,
          },
        }),
        contentType: "application/json",
      });

      // P7-OBS-DOC-2FA-002 — docs/observations/documenso-2fa-known-issues.md
      test.fail(true, REPLAY_ISSUE);

      expect(second.code).toBe(DOC_INVALID_TWO_FACTOR_CODE);
      expect(second.hasSessionCookie).toBe(false);
    } finally {
      await httpA.dispose();
      await httpB.dispose();
    }
  },
);

test(
  "P1-DOC-2FA-008 password-only blocked",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-008" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ twoFactorDocumensoUser }) => {
    const http = await newDocumensoApiContext();
    try {
      const result = await loginViaApi(http, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
      });
      expect(result.code).toBe(DOC_TWO_FACTOR_MISSING_CREDENTIALS);
      expect(result.hasSessionCookie).toBe(false);
      const session = await readSession(http);
      expect(session.isAuthenticated).toBe(false);
    } finally {
      await http.dispose();
    }
  },
);

test(
  "P1-DOC-2FA-009 disabling 2FA requires a valid code",
  {
    tag: ["@documenso", "@auth", "@2fa"],
    annotation: [
      { type: "testId", description: "P1-DOC-2FA-009" },
      { type: "priority", description: "P1" },
      { type: "issue", description: DISABLE_WRONG_CODE_ISSUE },
    ],
  },
  async ({ page, twoFactorDocumensoUser }, testInfo) => {
    const { code: loginTotp } = await mintDocumensoTotpCode(twoFactorDocumensoUser.secret);
    const sessionLogin = await loginViaApi(page.request, {
      email: twoFactorDocumensoUser.email,
      password: twoFactorDocumensoUser.password,
      totpCode: loginTotp,
    });
    expect(sessionLogin.status).toBe(201);

    const security = new SecuritySettingsPage(page);
    await security.gotoWithTwoFactorEnabled();
    await security.openDisableTwoFactorDialog();
    await security.fillDisableTotpCode("000000");
    const wrongDisableResponse = await security.submitDisableTwoFactor();
    const wrongDisableCode = await authorizeBodyCode(wrongDisableResponse);
    const twoFactorEnabledAfterWrong = await readDocumensoTwoFactorEnabled(
      twoFactorDocumensoUser.id,
    );

    expect(wrongDisableCode).toBe(DOC_INCORRECT_TWO_FACTOR_CODE);
    expect(twoFactorEnabledAfterWrong).toBe(true);

    await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
      body: serializeKnownBugEvidence({
        issue: DISABLE_WRONG_CODE_ISSUE,
        observed: {
          wrongDisableStatus: wrongDisableResponse.status(),
          wrongDisableCode: wrongDisableCode ?? null,
          twoFactorEnabledAfterWrong,
          ciRun: CI_EVIDENCE_RUN_URL,
          traceHint:
            "playwright-test-results/auth-2fa-P1-DOC-2FA-009-disabling-2FA-requires-a-valid-code-documenso-chromium/trace.zip",
        },
        expected: {
          wrongDisableStatus: "4xx",
          wrongDisableCode: DOC_INCORRECT_TWO_FACTOR_CODE,
          twoFactorEnabledAfterWrong: true,
        },
      }),
      contentType: "application/json",
    });

    // P7-OBS-DOC-2FA-004 — docs/observations/documenso-2fa-known-issues.md
    test.fail(true, DISABLE_WRONG_CODE_ISSUE);

    await expect(
      page.getByText("Unable to disable two-factor authentication", { exact: true }),
    ).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    expect(twoFactorEnabledAfterWrong).toBe(true);
    expect(wrongDisableCode).toBe(DOC_INCORRECT_TWO_FACTOR_CODE);
    expect(wrongDisableResponse.status()).toBeGreaterThanOrEqual(400);
    expect(wrongDisableResponse.status()).toBeLessThan(500);

    const { code: disableTotp } = await mintDocumensoTotpCode(twoFactorDocumensoUser.secret);
    await security.fillDisableTotpCode(disableTotp);
    const disableResponse = await security.submitDisableTwoFactor();
    expect(disableResponse.status()).toBe(201);
    expect(await readDocumensoTwoFactorEnabled(twoFactorDocumensoUser.id)).toBe(false);
    await expect(security.enableTwoFactorButton()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  },
);
