import { expect, test, type Locator, type Page } from "@playwright/test";

export interface StableScreenshotOptions {
  readonly mask?: readonly Locator[];
  readonly fullPage?: boolean;
  readonly settleTimeoutMs?: number;
  /**
   * Wait for "networkidle" before the shot (default true). Twenty never goes idle (background
   * polling, Step 0 2026-10-16), so its specs pass false and assert the loaded content first.
   */
  readonly networkIdle?: boolean;
  /** Capture only this region (px from the top-left of the viewport). */
  readonly clip?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertScreenshotName(name: string): void {
  if (!NAME.test(name)) {
    throw new Error(`Screenshot name must be kebab-case without extension, got "${name}"`);
  }
}

/** ADR 0017: baselines are Linux-only. VISUAL_LOCAL=1 (exactly) opts in elsewhere. */
export function visualSkipReason(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (platform === "linux" || env.VISUAL_LOCAL === "1") {
    return undefined;
  }
  return `toHaveScreenshot skipped on ${platform}: baselines are Linux-only (ADR 0017). Run npm run visual:test (Docker) or set VISUAL_LOCAL=1 to compare anyway.`;
}

export async function waitForVisualStability(
  page: Page,
  timeoutMs: number,
  networkIdle = true,
): Promise<void> {
  await page.waitForLoadState(networkIdle ? "networkidle" : "load", { timeout: timeoutMs });
  // String expressions: tsconfig has no DOM lib (repo precedent: passkey-register.spec.ts).
  await page.evaluate("document.fonts.ready.then(() => undefined)");
  await page.waitForFunction(
    `[...document.images]
      .filter((img) => img.loading !== "lazy")
      .every((img) => img.complete && img.naturalWidth > 0)`,
    undefined,
    { timeout: timeoutMs },
  );
}

export async function stableScreenshot(
  page: Page,
  name: string,
  opts: StableScreenshotOptions = {},
): Promise<void> {
  assertScreenshotName(name);
  await waitForVisualStability(page, opts.settleTimeoutMs ?? 15_000, opts.networkIdle ?? true);
  const reason = visualSkipReason(process.platform, process.env);
  if (reason !== undefined) {
    test.skip(true, reason);
    return;
  }
  await expect(page).toHaveScreenshot(`${name}.png`, {
    mask: [...(opts.mask ?? [])],
    fullPage: opts.fullPage ?? false,
    ...(opts.clip === undefined ? {} : { clip: { ...opts.clip } }),
  });
}
