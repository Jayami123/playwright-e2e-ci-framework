import type { Response } from "@playwright/test";
import { generateTotpCode } from "../../../src/core/totp.js";
import { required } from "../../../src/core/required.js";
import {
  KNOWN_BUG_JSON_ATTACHMENT,
  serializeKnownBugEvidence,
} from "../../../src/core/known-bug-evidence.js";
import {
  DOC_INVALID_TWO_FACTOR_CODE,
  DOC_TWO_FACTOR_MISSING_CREDENTIALS,
  loginViaApi,
  newDocumensoApiContext,
  readSession,
  sessionHasEmail,
  wrongTotpCodeFromLive,
} from "../../../src/products/documenso/auth.js";
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
    expect(login.status).toBe(201);

    const security = new SecuritySettingsPage(page);
    await security.goto();
    const secret = await security.openEnableTwoFactorFlow();
    const enrolCode = generateTotpCode(secret, Date.now());
    const backupCodes = await security.submitEnrolmentToken(enrolCode);
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
    const code = generateTotpCode(twoFactorDocumensoUser.secret, Date.now());
    await signIn.fillTotpToken(code);
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
    const liveCode = generateTotpCode(twoFactorDocumensoUser.secret, Date.now());
    const wrongCode = wrongTotpCodeFromLive(liveCode);
    await signIn.fillTotpToken(wrongCode);
    const response = await signIn.submitTwoFactorSignIn();
    expect(await authorizeBodyCode(response)).toBe(DOC_INVALID_TWO_FACTOR_CODE);
    await expect(page.getByText("Unable to sign in")).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    await expect(
      page.getByText("The two-factor authentication code provided is incorrect."),
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
  async ({ twoFactorDocumensoUser }) => {
    test.fail(true, WRONG_CODE_STATUS_ISSUE);
    const http = await newDocumensoApiContext();
    try {
      const liveCode = generateTotpCode(twoFactorDocumensoUser.secret, Date.now());
      const wrongCode = wrongTotpCodeFromLive(liveCode);
      const result = await loginViaApi(http, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        totpCode: wrongCode,
      });
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
  async ({ twoFactorDocumensoUser }, testInfo) => {
    test.fail(true, BACKUP_REUSE_ISSUE);
    const backupCode = required(twoFactorDocumensoUser.backupCodes[0], "backupCodes[0]");
    const httpA = await newDocumensoApiContext();
    const httpB = await newDocumensoApiContext();
    try {
      const first = await loginViaApi(httpA, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        backupCode,
      });
      const second = await loginViaApi(httpB, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        backupCode,
      });
      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: BACKUP_REUSE_ISSUE,
          observed: {
            firstStatus: first.status,
            secondStatus: second.status,
            secondCode: second.code ?? null,
          },
          expected: {
            secondStatus: "4xx",
            secondCode: DOC_INVALID_TWO_FACTOR_CODE,
          },
        }),
        contentType: "application/json",
      });
      expect(first.status).toBe(201);
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
  async ({ twoFactorDocumensoUser }, testInfo) => {
    test.fail(true, REPLAY_ISSUE);
    const sharedCode = generateTotpCode(twoFactorDocumensoUser.secret, Date.now());
    const httpA = await newDocumensoApiContext();
    const httpB = await newDocumensoApiContext();
    try {
      const first = await loginViaApi(httpA, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        totpCode: sharedCode,
      });
      const second = await loginViaApi(httpB, {
        email: twoFactorDocumensoUser.email,
        password: twoFactorDocumensoUser.password,
        totpCode: sharedCode,
      });
      await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
        body: serializeKnownBugEvidence({
          issue: REPLAY_ISSUE,
          observed: {
            firstStatus: first.status,
            secondStatus: second.status,
            secondCode: second.code ?? null,
          },
          expected: {
            secondStatus: "4xx",
            secondCode: DOC_INVALID_TWO_FACTOR_CODE,
          },
        }),
        contentType: "application/json",
      });
      expect(first.status).toBe(201);
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
