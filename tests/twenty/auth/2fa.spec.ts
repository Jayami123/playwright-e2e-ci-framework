import type { Page } from "@playwright/test";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import {
  epochMsForStableTotpMint,
  generateTotpCode,
  TOTP_STEP_MS,
} from "../../../src/core/totp.js";
import {
  TW_2FA_X01_REPLAY_ISSUE,
  TW_2FA_X05_UNNAMED_CODE_ISSUE,
} from "../../../src/products/twenty/issues.js";
import { twoFactorStatuses } from "../../../src/products/twenty/fixtures/two-factor.js";
import { TwentyLoginPage } from "../../../src/products/twenty/pages/login.page.js";
import { TwentyTwoFactorChallengePage } from "../../../src/products/twenty/pages/two-factor-challenge.page.js";
import { TwentyTwoFactorSettingsPage } from "../../../src/products/twenty/pages/two-factor-settings.page.js";
import {
  expect,
  test,
  type EnrolledTwentyMember,
} from "../../../src/products/twenty/two-factor-fixtures.js";
import { axeScan } from "../../../src/support/visual/axe.js";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

function annotations(id: string, priority: string): { type: string; description: string }[] {
  return [
    { type: "testId", description: id },
    { type: "priority", description: priority },
  ];
}

/**
 * A code from the next TOTP step. The server accepts one step either side (X02), and an enrolment
 * code always belongs to an earlier step, so a sign-in never reuses it (replay protection would refuse it).
 */
function nextStepCode(secret: string): string {
  return generateTotpCode(secret, Date.now() + TOTP_STEP_MS);
}

/** Password step, ending on the code challenge. */
async function signInToChallenge(
  page: Page,
  { member, password }: EnrolledTwentyMember,
): Promise<TwentyTwoFactorChallengePage> {
  const login = new TwentyLoginPage(page);
  await login.goto();
  await login.signIn(member.email, password);
  const challenge = new TwentyTwoFactorChallengePage(page);
  await challenge.expectChallenge();
  return challenge;
}

async function enrolInUi(page: Page): Promise<string> {
  const settings = new TwentyTwoFactorSettingsPage(page);
  await settings.gotoProfile();
  await settings.openAuthenticatorApp();
  const secret = await settings.readSetupKey();
  await settings.typeCode(generateTotpCode(secret, Date.now()));
  await settings.save();
  await settings.expectEnabled();
  return secret;
}

test.describe("Twenty 2FA enrolment", { tag: ["@twenty", "@2fa"] }, () => {
  test(
    "P1-TW-2FA-001 Enable the authenticator app, then log in with a code",
    { annotation: annotations("P1-TW-2FA-001", "P1") },
    async ({ page, freshTwentyMember }) => {
      const settings = new TwentyTwoFactorSettingsPage(page);
      const { member, password } = freshTwentyMember;
      let secret = "";

      await test.step("Profile shows 2FA deactivated", async () => {
        await settings.gotoProfile();
        await expect(settings.status("Deactivated")).toBeVisible();
      });
      await test.step("Enrol the authenticator app", async () => {
        await settings.openAuthenticatorApp();
        secret = await settings.readSetupKey();
        await settings.typeCode(generateTotpCode(secret, Date.now()));
        await settings.save();
        await settings.expectEnabled();
      });
      await test.step("API oracle: the method is verified", async () => {
        expect(await twoFactorStatuses(member)).toEqual(["VERIFIED"]);
      });
      await test.step("Log out", async () => {
        await settings.logout();
      });
      const challenge = new TwentyTwoFactorChallengePage(page);
      await test.step("Password alone is not enough", async () => {
        const login = new TwentyLoginPage(page);
        await login.goto();
        await login.signIn(member.email, password);
        await challenge.expectChallenge();
        await expect(page).toHaveURL(/\/welcome/);
      });
      await test.step("A valid code signs in", async () => {
        await challenge.submitCode(nextStepCode(secret));
        await expect(page).toHaveURL(/\/objects\//);
      });
    },
  );

  test(
    "P1-TW-2FA-X03 Enabling 2FA keeps an already open session signed in",
    { annotation: annotations("P1-TW-2FA-X03", "P3") },
    async ({ page, freshTwentyMember }) => {
      const openSession = await page.context().newPage();
      await test.step("A second page is open on People before 2FA", async () => {
        await openSession.goto("/objects/people");
        await expect(openSession).toHaveURL(/\/objects\/people/);
      });
      await test.step("Enable 2FA in the first page", async () => {
        await enrolInUi(page);
      });
      await test.step("The open page stays signed in after a reload", async () => {
        await openSession.reload();
        await expect(openSession).toHaveURL(/\/objects\/people/);
      });
      await test.step("API oracle: the pre-enable bearer still works", async () => {
        expect(await twoFactorStatuses(freshTwentyMember.member)).toEqual(["VERIFIED"]);
      });
    },
  );

  test(
    "P1-TW-2FA-X04 Reset 2FA asks only for the typed email",
    { annotation: annotations("P1-TW-2FA-X04", "P3") },
    async ({ page, extraContextPage, enrolledTwentyMember }) => {
      const settings = new TwentyTwoFactorSettingsPage(page);
      const { member } = enrolledTwentyMember;
      await test.step("Profile shows 2FA active", async () => {
        await settings.gotoProfile();
        await expect(settings.status("Active")).toBeVisible();
        await settings.openAuthenticatorApp();
      });
      await test.step("The reset modal has no code field", async () => {
        await settings.openReset();
        await expect(settings.resetEmailInput(member.email)).toBeVisible();
        await expect(page.getByRole("textbox")).toHaveCount(1);
      });
      await test.step("Typing the email is enough", async () => {
        await settings.confirmReset(member.email);
        await expect(settings.resetDoneToast).toBeVisible();
      });
      await test.step("API oracle: no 2FA method remains", async () => {
        expect(await twoFactorStatuses(member)).toEqual([]);
      });
      await test.step("The next login has no challenge", async () => {
        const login = new TwentyLoginPage(extraContextPage);
        await login.goto();
        await login.signIn(member.email, enrolledTwentyMember.password);
        await expect(extraContextPage).toHaveURL(/\/objects\//);
      });
    },
  );
});

test.describe("Twenty 2FA login challenge", { tag: ["@twenty", "@2fa"] }, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "P1-TW-2FA-002 Wrong code is refused, the right one signs in",
    { annotation: annotations("P1-TW-2FA-002", "P2") },
    async ({ page, enrolledTwentyMember }) => {
      const challengePage = await test.step("Sign in to the challenge", async () =>
        signInToChallenge(page, enrolledTwentyMember));
      await test.step("A wrong code is refused", async () => {
        await challengePage.submitCode("000000");
        await challengePage.expectInvalidCode();
        await expect(page).toHaveURL(/\/welcome/);
        await expect(challengePage.codeInput).toHaveValue("");
      });
      await test.step("A valid code succeeds", async () => {
        await challengePage.submitCode(nextStepCode(enrolledTwentyMember.secret));
        await expect(page).toHaveURL(/\/objects\//);
      });
    },
  );

  test(
    "P1-TW-2FA-X01 A code that already signed in is refused the second time",
    { annotation: annotations("P1-TW-2FA-X01", "P2") },
    async ({ page, extraContextPage, enrolledTwentyMember }, testInfo) => {
      const first = await signInToChallenge(page, enrolledTwentyMember);
      const second = await signInToChallenge(extraContextPage, enrolledTwentyMember);
      const code = nextStepCode(enrolledTwentyMember.secret);

      await test.step("The first use signs in", async () => {
        await first.submitCode(code);
        await expect(page).toHaveURL(/\/objects\//);
      });
      const refused = await test.step("The second use of the same code", async () => {
        const response = extraContextPage.waitForResponse(
          (res) => res.request().postData()?.includes("getAuthTokensFromOTP") ?? false,
        );
        await second.submitCode(code);
        const body = (await (await response).json()) as { errors?: unknown[] };
        const refusedByApi = body.errors !== undefined && body.errors.length > 0;
        // Evidence only: did the second context actually land in the app (replay accepted)?
        let landedOnObjects = true;
        await extraContextPage.waitForURL(/\/objects\//, { timeout: 15_000 }).catch(() => {
          landedOnObjects = false;
        });
        return { refusedByApi, landedOnObjects };
      });
      await attachKnownBugEvidence(extraContextPage, testInfo, {
        issue: TW_2FA_X01_REPLAY_ISSUE,
        observed: {
          secondUseRefused: refused.refusedByApi,
          secondUseLandedOnObjects: refused.landedOnObjects,
        },
        expected: { secondUseRefused: true },
      });
      test.fail(true, TW_2FA_X01_REPLAY_ISSUE);
      await expect(second.invalidCodeToast).toBeVisible();
      await expect(extraContextPage).toHaveURL(/\/welcome/);
    },
  );

  test(
    "P1-TW-2FA-X02 Codes one step either side sign in, two steps do not",
    { annotation: annotations("P1-TW-2FA-X02", "P2") },
    async ({ page, extraContextPage, enrolledTwentyMember }) => {
      const { secret } = enrolledTwentyMember;
      const twoSteps = 2 * TOTP_STEP_MS;

      await test.step("Minus two steps is refused, minus one signs in", async () => {
        const challenge = await signInToChallenge(page, enrolledTwentyMember);
        const base = await epochMsForStableTotpMint(10_000);
        await challenge.submitCode(generateTotpCode(secret, base - twoSteps));
        await challenge.expectInvalidCode();
        await challenge.submitCode(generateTotpCode(secret, base - TOTP_STEP_MS));
        await expect(page).toHaveURL(/\/objects\//);
      });
      await test.step("Plus two steps is refused, plus one signs in", async () => {
        const challenge = await signInToChallenge(extraContextPage, enrolledTwentyMember);
        const base = await epochMsForStableTotpMint(10_000);
        await challenge.submitCode(generateTotpCode(secret, base + twoSteps));
        await challenge.expectInvalidCode();
        await challenge.submitCode(generateTotpCode(secret, base + TOTP_STEP_MS));
        await expect(extraContextPage).toHaveURL(/\/objects\//);
      });
    },
  );

  test(
    "P1-TW-2FA-X05 The login code field has an accessible name",
    { annotation: annotations("P1-TW-2FA-X05", "P2") },
    async ({ page, enrolledTwentyMember }, testInfo) => {
      const challenge = await signInToChallenge(page, enrolledTwentyMember);
      const namedCount = await page.getByRole("textbox", { name: /code/i }).count();
      const scan = await axeScan(page, { rules: ["label"] });
      await attachKnownBugEvidence(page, testInfo, {
        issue: TW_2FA_X05_UNNAMED_CODE_ISSUE,
        observed: {
          accessibleNameSnapshot: await challenge.codeInput.ariaSnapshot(),
          namedCount,
          axeViolationIds: scan.report.blocking.map((entry) => entry.id),
          axeTargets: scan.report.blocking.flatMap((entry) => [...entry.targets]),
        },
        expected: { accessibleName: "non-empty", axeViolationIds: [] },
      });
      test.fail(true, TW_2FA_X05_UNNAMED_CODE_ISSUE);
      await expect(challenge.codeInput).toBeVisible();
      await expect(page.getByRole("textbox", { name: /code/i })).toBeVisible();
    },
  );
});
