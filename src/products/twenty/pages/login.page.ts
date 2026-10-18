import { expect, test, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts, TWENTY_ROUTES } from "../env.js";
import { TW_LOGIN_F01_LOADER_STUCK_ISSUE } from "../issues.js";

/** One reload per goto(). The stall is a race (1.0 to 4.5% of loads), so a second one in a row is a different failure. */
export const WELCOME_MAX_RELOADS = 1;
/**
 * Healthy forms follow the heading by a median of 0.15 s and at most 6.2 s (888 healthy loads, probe 2026-10-18).
 * 20 s is more than three times that largest gap.
 */
const FORM_GRACE_MS = 20_000;

export interface WelcomeLoadState {
  readonly textboxEditable: boolean;
  readonly headingVisible: boolean;
  readonly reloadsUsed: number;
}

/**
 * Pure; unit-tested. Reload only for the stuck-loader signature: the heading is shown and the form
 * is still absent after the grace. A page with no heading yet is slow, never reloaded.
 */
export function welcomeLoadVerdict(state: WelcomeLoadState): "ready" | "reload" | "fail" {
  if (state.textboxEditable) return "ready";
  if (state.headingVisible && state.reloadsUsed < WELCOME_MAX_RELOADS) return "reload";
  return "fail";
}

/** Logs the known product issue and, inside a running test, adds it to the report's annotations. */
function recordKnownIssue(description: string): void {
  console.warn(description);
  try {
    test.info().annotations.push({ type: "known-issue", description });
  } catch {
    // Outside a running test (worker fixture setup) the warning above is the only record.
  }
}

export class TwentyLoginPage extends BasePage {
  // The workspace title is a plain div, not a heading, so it has no heading role to query.
  private readonly workspaceTitle: Locator;
  private readonly textbox: Locator;

  constructor(page: Page) {
    super(page);
    this.workspaceTitle = page.getByText("Welcome,");
    this.textbox = page.getByRole("textbox");
  }

  async goto(options: { readonly formGraceMs?: number } = {}): Promise<void> {
    const formGraceMs = options.formGraceMs ?? FORM_GRACE_MS;
    await this.gotoPath(TWENTY_ROUTES.welcome);
    for (let reloadsUsed = 0; ; reloadsUsed += 1) {
      await expect(this.page).toHaveURL(/\/welcome/);
      // Healthy loads take up to about 27 s under load, so the title keeps the full page budget.
      const headingVisible = await this.workspaceTitle
        .waitFor({ timeout: twentyTimeouts().page })
        .then(
          () => true,
          () => false,
        );
      const textboxEditable = await expect(this.textbox)
        .toBeEditable({ timeout: formGraceMs })
        .then(
          () => true,
          () => false,
        );
      const verdict = welcomeLoadVerdict({ textboxEditable, headingVisible, reloadsUsed });
      if (verdict === "ready") return;
      if (verdict === "fail") {
        throw new Error(
          `/welcome form not ready (title visible: ${String(headingVisible)}, reloads used: ${String(reloadsUsed)})`,
        );
      }
      recordKnownIssue(
        `${TW_LOGIN_F01_LOADER_STUCK_ISSUE}: reloading /welcome (reload ${String(reloadsUsed + 1)})`,
      );
      await this.page.reload({ waitUntil: "domcontentloaded" });
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByRole("textbox").fill(email);
    await this.page.getByRole("button", { name: "Continue" }).click();
    await this.page.getByPlaceholder("Password").fill(password);
    const signInButton = this.page.getByRole("button", { name: "Sign in" });
    await expect(signInButton).toBeEnabled({ timeout: twentyTimeouts().expect });
    await signInButton.click();
  }
}
