# Phase 3 task 1: visual and a11y framework setup

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1. Branch `feat/2026-10-15-p1-phase3-task1-visual-setup` from `main` `2d52e86` (PR #31 merged, harness `#v0.2.9`). Cal fork read at `products/cal` `c2b7ac44c6`. Status: plan only, nothing built.

This is task 1 of 8 and adds no product test cases. It gives later tasks the projects, helpers, Docker runner, ADR and unit tests they need. Those later tasks cover P1-CAL-VIS-001..004, CAL-I18N-001..003, DOC-VIS-001..005, TW-VIS-001..004 and TW-I18N-001..002.

"Verified" means seen live on 2026-10-15 or read in code. "Predicted" means the implementer must confirm it before relying on it.

## Context

P1 has no screenshot or accessibility tooling yet. Screenshot pixels depend on OS font rendering, so baselines must come from one pinned Linux image. Cal's booker depends on the current time: today's slots shrink through the day, and the seeded bookings sit 1–3 days after the seed date. So the browser clock must be frozen before screenshots are stable. Everything below is either verified by the Step 0 probe or marked "Predicted".

## Decisions (do not change without updating ADR 0017)

- **Browser and viewport settings:** Chromium only. All three viewports use `deviceScaleFactor: 1` and `isMobile: false`. Cal's booker layout follows CSS width, not the user agent, and DPR 3 would triple PNG size and add anti-aliasing noise.
- **Locale, timezone and theme:** `locale: "en-US"`, `timezoneId: "Europe/London"`, `colorScheme: "light"` on every visual project.
- **Frozen instant:** `2030-01-14T10:00:00.000Z`, a Monday. It is far past every seeded booking and inside Cal's default unlimited booking window. Verified: it gives 0 px diff between loads at all 3 viewports.
- **Masks:** only user-supplied imagery (`data-testid="avatar"`). Do **not** mask month label, days or slots, because the frozen clock makes them stable (verified) and they are what VIS tests exist to check.
- **Theme:** light only in task 1. `pro` is seeded with `theme: "light"` (`products/cal/scripts/seed.ts:682`), and that overrides `prefers-color-scheme` (verified). Later dark baselines use a dedicated QA user from `qa-user.ts`, never `pro` (see Resolved questions).
- **Docker networking:** the container keeps `baseURL=http://127.0.0.1:3000`. A small Node TCP proxy inside the container forwards `127.0.0.1:3000 → host.docker.internal:3000`. On a Linux host (CI, task 6) the wrapper uses `--network host` and no proxy.
- **Wrapper in Node, not shell:** npm runs scripts through `cmd.exe` here (`npm config get script-shell` → `null`). `scripts/visual-docker.mts` is run with `tsx` (like `scripts/actionlint.mts`) and calls `spawnSync("docker", args)` with no shell, so Git Bash path conversion never applies.
- **Harness boundary:** the wrapper never starts or stops Cal. It checks `GET /api/auth/csrf` = 200 on the host and exits 2 with the harness command if not. Inside the container `P1_PLAYWRIGHT_HARNESS=0`, so no globalSetup runs there.
- **Exact Playwright pin:** `@playwright/test` goes from `^1.63.0` to exactly `1.63.0`. The lock already resolves 1.63.0. The image is `mcr.microsoft.com/playwright:v1.63.0-jammy` (tag verified to exist; `-noble` exists too and is not used). The wrapper reads `package.json` and refuses a version range.
- **Snapshot names:** `tests/<product>/visual/__screenshots__/{projectName}/{arg}{ext}`, with no platform suffix, because baselines are Linux-only.
- **Baselines committed:** this task commits the 3 smoke PNGs produced by `visual:update` in the pinned image.
- **a11y smoke:** it asserts that the pipeline ran (attachment exists, rules passed > 0) and never the violation count. The ESLint rule `playwright/expect-expect` requires an `expect` in every test body, and `stableScreenshot` doesn't count, so each spec has one explicit `expect`.
- **Retries:** visual projects use `retries: 0`. A flaky screenshot shows as a red run, the same policy as Documenso and Twenty.

## Step 0: live probe findings (verified 2026-10-15)

Cal was started through the harness (`node node_modules/qa-portfolio-harness/scripts/up.mjs cal`, `PRODUCTS_ROOT=D:/Jayami/Portfolio/products`). The probe was a throwaway Playwright script with Chromium 1.63.0. Each viewport was loaded twice with the real clock and twice with `page.clock.setFixedTime("2030-01-14T10:00:00.000Z")`, then the screenshots were diffed pixel by pixel.

| Question                              | Finding                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health                                | `GET /api/auth/csrf` **200**, `GET /pro/30min` **200** in 0.16–0.30 s warm.                                                                                                                                                                                                                                                                                          |
| Real clock (2026-10-15 ~14:12 London) | Today is auto-selected with **1 slot left** (`4:30pm`). The slot list shrinks through the day, and the selected date, month label and seeded bookings (seed +1/+2/+3 days) all follow real time. Mobile load-to-load diff **39%** (cold first load, slots not rendered at capture). Desktop/tablet 0% within the same minute.                                        |
| `setFixedTime` freezes the calendar?  | **Yes.** Page `Date.now()` = `2030-01-14T10:00:00.000Z`. Header "January 2030", Mon 14 auto-selected, **16 slots** `9:00am`…`4:30pm`. Load-to-load diff **0 px** on mobile, tablet and desktop. Running `document.getAnimations()` = 0. The server still filters slots with real time, which is why the instant must be in the future.                               |
| Regions that change between loads     | With the real clock: slot list, selected day, month label (at month end), the "Mon 14" slot header. With the frozen clock: **none**. The avatar is the static default `/avatar.svg` (32 px, alt "Pro Example"); it is masked by policy because uploads and gravatars differ per environment.                                                                         |
| Fonts and images                      | Two woff2 fonts (`83afe278…-s.p.*.woff2`, `CalSans_SemiBold-s.p.*.woff2`) finish at 0.5–1.0 s. `document.fonts.status` is already `loaded` when `booker-container` is visible. `/avatar.svg` finishes 2.3–3.4 s, **after** the container is visible.                                                                                                                 |
| Late render                           | A screenshot taken as soon as `booker-container` is visible differs from the settled one by **20–65%** (calendar and slots still rendering). So the helper must wait for the slot count, network idle, fonts and images, not just the container.                                                                                                                     |
| Network idle                          | Reached 1–11 ms after the container became visible. No long polling, so `waitForLoadState("networkidle")` is safe on this page.                                                                                                                                                                                                                                      |
| Theme mechanism                       | `useTheme(profile.theme)` in `packages/features/bookings/Booker/utils/use-brand-colors.tsx:20` → `next-themes`. Embed theme > user `theme` > `localStorage["app-theme"]` > system. With `colorScheme: "dark"` emulated, `<html class="notranslate light">` and body `rgb(238, 239, 242)` stay the same as light. **`prefers-color-scheme` has no effect for `pro`.** |
| Console                               | 0 `console.error` and 0 `pageerror` on all 12 loads.                                                                                                                                                                                                                                                                                                                 |
| Cold start                            | The first mobile load took 9.0 s to a visible container, and later loads 2.3–3.0 s.                                                                                                                                                                                                                                                                                  |
| Docker → host                         | `docker run postgres:15 bash -c '…/dev/tcp/host.docker.internal/3000…'` → **`HTTP/1.1 200 OK`**. The same image with `--network host` → **Connection refused** at `127.0.0.1:3000`. Docker Desktop host networking doesn't reach the Windows loopback, so the proxy is required.                                                                                     |
| Cal bind                              | `next start -H 127.0.0.1 -p 3000` (Windows, listening on `127.0.0.1` only).                                                                                                                                                                                                                                                                                          |

Probe-time trap: right after `up.mjs cal`, the Cal log said `✓ Ready in 15.1s`, but every request hung (curl timeouts at 60 s and 170 s, CLOSE_WAIT sockets) for about 10 minutes. Another process was installing Medusa on the same machine at the time. Wait with one request at a time and a 120 s timeout. Never kill the Cal pid.

## Files

| Path                                                                                   | New/edited                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `package.json`, `package-lock.json`                                                    | edited                                                 |
| `playwright.config.ts`                                                                 | edited                                                 |
| `eslint.config.js`                                                                     | edited (non-type-checked block for `scripts/**/*.mjs`) |
| `.gitattributes`                                                                       | edited (`*.png binary`)                                |
| `src/products/cal/testIds.ts`                                                          | edited (`avatar`)                                      |
| `src/products/cal/visual.ts`                                                           | new (frozen slot count)                                |
| `src/support/visual/clock.ts`                                                          | new                                                    |
| `src/support/visual/masks.ts`                                                          | new                                                    |
| `src/support/visual/screenshot.ts`                                                     | new                                                    |
| `src/support/visual/axe-format.ts`                                                     | new (pure)                                             |
| `src/support/visual/axe.ts`                                                            | new                                                    |
| `src/support/visual/docker.ts`                                                         | new (pure argv builder)                                |
| `scripts/visual-docker.mts`                                                            | new (host wrapper)                                     |
| `scripts/visual-docker-proxy.mjs`                                                      | new (runs inside container, plain JS, no deps)         |
| `tests/cal/visual/smoke.visual.spec.ts`                                                | new                                                    |
| `tests/cal/visual/__screenshots__/visual-{mobile,tablet,desktop}/booker-pro-30min.png` | new (generated)                                        |
| `tests/cal/a11y/smoke.a11y.spec.ts`                                                    | new                                                    |
| `tests/unit/visual-helpers.spec.ts`                                                    | new                                                    |
| `docs/adr/0017-visual-baselines.md`                                                    | new                                                    |

## Order of work

Steps 1–3 come before Cal is started, because `npm install` rewrites `node_modules/qa-portfolio-harness`, which holds Cal's `.harness/` log directory. Steps 4–7 need no live product. Steps 8–9 need Cal up.

---

### Step 1. Branch and "before" counts

```bash
cd /d/Jayami/Portfolio/p1-web-e2e-ci
git checkout main && git pull && git checkout -b feat/2026-10-15-p1-phase3-task1-visual-setup
git log --oneline -1          # expect: 2d52e86 Merge pull request #31 …
for p in cal-setup cal-chromium cal-firefox documenso-rate-limit-chromium documenso-chromium documenso-firefox twenty-setup twenty-chromium unit; do
  printf "%-32s " "$p"; P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project="$p" 2>&1 | grep '^Total'
done
```

Expected "before" output, recorded 2026-10-15 at `2d52e86`:

| project                       | Total                |
| ----------------------------- | -------------------- |
| cal-setup                     | 2 tests in 1 file    |
| cal-chromium                  | 20 tests in 7 files  |
| cal-firefox                   | 12 tests in 3 files  |
| documenso-rate-limit-chromium | 1 test in 1 file     |
| documenso-chromium            | 27 tests in 8 files  |
| documenso-firefox             | 3 tests in 2 files   |
| twenty-setup                  | 1 test in 1 file     |
| twenty-chromium               | 14 tests in 4 files  |
| unit                          | 86 tests in 16 files |

**Done when** your numbers match this table. If they don't, stop and report; `main` has moved.

### Step 2. Dependencies

```bash
npm install -D --save-exact @playwright/test@1.63.0 @axe-core/playwright@4.13.0
```

- `package.json` devDependencies: `"@playwright/test": "1.63.0"` (was `^1.63.0`), and the new line `"@axe-core/playwright": "4.13.0"`.
- Expected warnings: `npm warn install-scripts … not yet covered by allowScripts` for esbuild and qa-portfolio-harness. These are harmless.
- **Trap:** npm skips the harness `prepare`, so `node_modules/qa-portfolio-harness/dist` may disappear. Rebuild it:

```bash
(cd node_modules/qa-portfolio-harness && npx tsc) && ls node_modules/qa-portfolio-harness/dist/index.js
```

**Done when** `node -p "require('./node_modules/@axe-core/playwright/package.json').version"` prints `4.13.0`, `git diff package.json` shows only those two lines, and `dist/index.js` exists.

### Step 3. `.gitattributes`, `eslint.config.js`, `testIds.ts`

`.gitattributes`: append one line.

```
*.png binary
```

`eslint.config.js`: add this block **before** the existing `files: ["eslint.config.js"]` block. Plain `.mjs` files are not in `tsconfig`, so type-aware rules would fail to parse them.

```js
  {
    files: ["scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
```

`src/products/cal/testIds.ts`: add one key after `bookerContainer`.

```ts
  avatar: "avatar",
```

**Done when** `npm run lint` exits 0.

### Step 4. Pure helpers (write the unit tests in Step 6 alongside)

#### 4a. `src/support/visual/clock.ts` (new)

```ts
import type { Page } from "@playwright/test";

/** ADR 0017: far-future Monday; server slot filtering uses real time, so this must stay in the future. */
export const VISUAL_FROZEN_INSTANT = "2030-01-14T10:00:00.000Z";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function parseFrozenInstant(isoDate: string, now: number = Date.now()): Date {
  if (!ISO_UTC.test(isoDate)) {
    throw new Error(
      `freezeClock expects a UTC ISO instant like ${VISUAL_FROZEN_INSTANT}, got "${isoDate}"`,
    );
  }
  const at = new Date(isoDate);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 19) !== isoDate.slice(0, 19)) {
    throw new Error(`freezeClock got an impossible calendar date "${isoDate}"`);
  }
  if (at.getTime() <= now) {
    throw new Error(
      `freezeClock instant ${isoDate} is not in the future; Cal hides past slots using server time (ADR 0017)`,
    );
  }
  return at;
}

/** Call before the first page.goto so the booker's initial month and selected day use the frozen date. */
export async function freezeClock(page: Page, isoDate: string): Promise<void> {
  await page.clock.setFixedTime(parseFrozenInstant(isoDate));
}
```

#### 4b. `src/support/visual/masks.ts` (new)

```ts
import type { Locator, Page } from "@playwright/test";
import { CAL_TEST_IDS } from "../../products/cal/testIds.js";

export type VisualProduct = "cal" | "documenso" | "twenty";

export interface MaskSpec {
  readonly testId: string;
  readonly reason: string;
}

/** Step 0 probe 2026-10-15: frozen clock gives 0 px diff; mask only user-supplied imagery. */
const MASKS: Readonly<Record<VisualProduct, readonly MaskSpec[]>> = {
  cal: [
    {
      testId: CAL_TEST_IDS.avatar,
      reason: "profile image; default /avatar.svg today, uploads/gravatar differ per environment",
    },
  ],
  // Filled by the Documenso and Twenty VIS tasks after their own probes.
  documenso: [],
  twenty: [],
};

export function maskSpecs(product: VisualProduct): readonly MaskSpec[] {
  return MASKS[product];
}

export function maskLocators(page: Page, product: VisualProduct): Locator[] {
  return maskSpecs(product).map((spec) => page.getByTestId(spec.testId));
}
```

#### 4c. `src/support/visual/axe-format.ts` (new, pure: no Playwright, no axe import)

```ts
export type AxeImpact = "minor" | "moderate" | "serious" | "critical";

export interface AxeNodeLike {
  readonly target: readonly unknown[];
  readonly html?: string;
  readonly failureSummary?: string;
}

export interface AxeViolationLike {
  readonly id: string;
  readonly impact?: AxeImpact | null;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: readonly AxeNodeLike[];
}

export interface AxeReportEntry {
  readonly id: string;
  readonly impact: "serious" | "critical";
  readonly help: string;
  readonly helpUrl: string;
  readonly targets: readonly string[];
}

export interface AxeReport {
  readonly url: string;
  readonly scannedAt: string;
  readonly counts: Readonly<Record<AxeImpact | "unknown", number>>;
  readonly blocking: readonly AxeReportEntry[];
}

export function isBlocking(impact: AxeImpact | null | undefined): impact is "serious" | "critical" {
  return impact === "serious" || impact === "critical";
}

/** Keeps serious and critical only, in axe's original order. */
export function filterBlockingViolations<T extends AxeViolationLike>(
  violations: readonly T[],
): T[] {
  return violations.filter((v) => isBlocking(v.impact));
}

/** Shadow-DOM targets arrive as string[]; join them with " >>> ". */
export function targetToString(target: unknown): string {
  return Array.isArray(target) ? target.map(String).join(" >>> ") : String(target);
}

export function buildAxeReport(
  url: string,
  violations: readonly AxeViolationLike[],
  scannedAt: string,
): AxeReport {
  const counts = { minor: 0, moderate: 0, serious: 0, critical: 0, unknown: 0 };
  for (const v of violations) {
    counts[v.impact ?? "unknown"] += 1;
  }
  const blocking = violations.flatMap((v): AxeReportEntry[] =>
    isBlocking(v.impact)
      ? [
          {
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            targets: v.nodes.flatMap((n) => n.target.map(targetToString)),
          },
        ]
      : [],
  );
  return { url, scannedAt, counts, blocking };
}

export function formatAxeReport(report: AxeReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
```

#### 4d. `src/support/visual/docker.ts` (new, pure argv builder used by the wrapper and the unit tests)

```ts
export type VisualMode = "update" | "test";

export const VISUAL_PROJECTS = ["visual-mobile", "visual-tablet", "visual-desktop"] as const;
export const CONTAINER_WORKDIR = "/work";

export function playwrightImage(packageJsonText: string): string {
  const pkg = JSON.parse(packageJsonText) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const version =
    pkg.devDependencies?.["@playwright/test"] ?? pkg.dependencies?.["@playwright/test"];
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `@playwright/test must be pinned to an exact version in package.json (got ${String(version)}); the Docker image tag must match it (ADR 0017)`,
    );
  }
  return `mcr.microsoft.com/playwright:v${version}-jammy`;
}

/** Only http://127.0.0.1:<port>. "localhost" can resolve to ::1 in the container, and the proxy binds IPv4. */
export function calPortFromBaseUrl(baseUrl: string): number {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "") {
    throw new Error(`Visual runs need CAL_E2E_BASE_URL=http://127.0.0.1:<port>, got ${baseUrl}`);
  }
  return Number(url.port);
}

export interface DockerRunInput {
  readonly mode: VisualMode;
  readonly image: string;
  readonly hostRoot: string;
  readonly hostPlatform: NodeJS.Platform;
  readonly calPort: number;
  readonly uidGid?: string; // "1001:1001" on Linux; omitted elsewhere
  readonly env: Readonly<Record<string, string>>;
  readonly extraArgs: readonly string[];
}

function shQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function buildDockerRunArgs(input: DockerRunInput): string[] {
  const linuxHost = input.hostPlatform === "linux";
  const projects = VISUAL_PROJECTS.map((p) => `--project=${p}`);
  const update = input.mode === "update" ? ["--update-snapshots=all"] : [];
  const playwright = [
    "node node_modules/@playwright/test/cli.js test",
    ...projects,
    ...update,
    ...input.extraArgs.map(shQuote),
  ].join(" ");
  const proxy =
    `node scripts/visual-docker-proxy.mjs ${String(input.calPort)} host.docker.internal ${String(input.calPort)} & ` +
    `until (exec 3<>/dev/tcp/127.0.0.1/${String(input.calPort)}) 2>/dev/null; do sleep 0.2; done; `;
  const inner = linuxHost ? playwright : `${proxy}${playwright}`;

  const args = ["run", "--rm", "--init", "--ipc=host"];
  args.push("--mount", `type=bind,source=${input.hostRoot},target=${CONTAINER_WORKDIR}`);
  args.push("-w", CONTAINER_WORKDIR);
  if (linuxHost) {
    args.push("--network", "host");
    if (input.uidGid !== undefined) {
      args.push("--user", input.uidGid);
    }
  } else {
    args.push("--add-host", "host.docker.internal:host-gateway");
  }
  for (const [key, value] of Object.entries(input.env)) {
    args.push("-e", `${key}=${value}`);
  }
  args.push(input.image, "bash", "-c", inner);
  return args;
}
```

**Done when** `npm run typecheck` exits 0.

### Step 5. Browser-side helpers

#### 5a. `src/support/visual/screenshot.ts` (new)

```ts
import { expect, test, type Locator, type Page } from "@playwright/test";

export interface StableScreenshotOptions {
  readonly mask?: readonly Locator[];
  readonly fullPage?: boolean;
  readonly settleTimeoutMs?: number;
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

export async function waitForVisualStability(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForFunction(
    () =>
      [...document.images]
        .filter((img) => img.loading !== "lazy")
        .every((img) => img.complete && img.naturalWidth > 0),
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
  await waitForVisualStability(page, opts.settleTimeoutMs ?? 15_000);
  const reason = visualSkipReason(process.platform, process.env);
  if (reason !== undefined) {
    test.skip(true, reason);
    return;
  }
  await expect(page).toHaveScreenshot(`${name}.png`, {
    mask: [...(opts.mask ?? [])],
    fullPage: opts.fullPage ?? false,
  });
}
```

The waits run before the skip, so a local Windows run still exercises them.

#### 5b. `src/support/visual/axe.ts` (new)

```ts
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import {
  buildAxeReport,
  filterBlockingViolations,
  formatAxeReport,
  type AxeReport,
} from "./axe-format.js";

export const AXE_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

export interface AxeScanOptions {
  readonly rules?: readonly string[];
  readonly include?: readonly string[];
}

export interface AxeScanResult {
  readonly report: AxeReport;
  readonly blockingCount: number;
  readonly totalViolations: number;
  readonly passes: number;
}

export async function axeScan(page: Page, opts: AxeScanOptions = {}): Promise<AxeScanResult> {
  let builder = new AxeBuilder({ page });
  // withRules and withTags both set axe runOnly; use one, never both.
  builder =
    opts.rules !== undefined && opts.rules.length > 0
      ? builder.withRules([...opts.rules])
      : builder.withTags([...AXE_WCAG_TAGS]);
  for (const selector of opts.include ?? []) {
    builder = builder.include(selector);
  }
  const results = await builder.analyze();
  return {
    report: buildAxeReport(page.url(), results.violations, new Date().toISOString()),
    blockingCount: filterBlockingViolations(results.violations).length,
    totalViolations: results.violations.length,
    passes: results.passes.length,
  };
}

export async function attachAxeReport(
  testInfo: TestInfo,
  name: string,
  report: AxeReport,
): Promise<void> {
  await testInfo.attach(`${name}.json`, {
    body: formatAxeReport(report),
    contentType: "application/json",
  });
}
```

`new Date()` here runs in Node, not the page, so the frozen browser clock doesn't affect it.

**Predicted:** the default import type-checks under `NodeNext`. If `tsc` reports "This expression is not constructable", use the fallback:
`import AxeBuilderModule from "@axe-core/playwright"; const AxeBuilder = AxeBuilderModule.default;` (CJS default interop). Record which one worked in the final report.

#### 5c. `src/products/cal/visual.ts` (new)

```ts
/** Step 0 probe 2026-10-15: /pro/30min frozen at Mon 14 Jan 2030 shows 9:00am–4:30pm Europe/London. */
export const CAL_FROZEN_SLOT_COUNT = 16;
```

**Done when** `npm run typecheck` and `npm run lint` exit 0.

### Step 6. Unit tests: `tests/unit/visual-helpers.spec.ts` (new)

Use the style of `tests/unit/playwright-projects.spec.ts`: `import { expect, test } from "@playwright/test"`, `{ tag: ["@unit"] }` on every test, one `test.describe` per module. Use a fixed `NOW = Date.parse("2026-10-15T12:00:00.000Z")`. Exactly **19** tests:

| #   | describe        | test                                                                           | key assertion                                                                                                                                    |
| --- | --------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | clock           | accepts a future UTC ISO instant                                               | `parseFrozenInstant(VISUAL_FROZEN_INSTANT, NOW).toISOString() === VISUAL_FROZEN_INSTANT`                                                         |
| 2   | clock           | rejects an offset or date-only string                                          | `"2030-01-14T10:00:00+05:30"` and `"2030-01-14"` throw `/UTC ISO instant/`                                                                       |
| 3   | clock           | rejects an impossible date                                                     | `"2030-02-30T00:00:00.000Z"` throws `/impossible/`                                                                                               |
| 4   | clock           | rejects a past instant                                                         | `"2020-01-01T00:00:00.000Z"` throws `/not in the future/`                                                                                        |
| 5   | masks           | cal masks only the avatar                                                      | `maskSpecs("cal").map(s => s.testId)` equals `["avatar"]`                                                                                        |
| 6   | masks           | documenso and twenty are empty until their probes                              | both `toEqual([])`                                                                                                                               |
| 7   | masks           | every spec has a non-empty testId and reason, unique per product               | loop over the 3 products                                                                                                                         |
| 8   | skip            | linux never skips                                                              | `visualSkipReason("linux", {})` is `undefined`                                                                                                   |
| 9   | skip            | win32 skips with guidance                                                      | message contains `Linux-only`, `npm run visual:test`, `VISUAL_LOCAL=1`                                                                           |
| 10  | skip            | only `VISUAL_LOCAL=1` opts in                                                  | `"1"` → undefined; `"true"` and `"0"` → string                                                                                                   |
| 11  | screenshot name | accepts kebab-case, rejects others                                             | `booker-pro-30min` OK; `Booker`, `a b`, `x.png`, `-a` throw                                                                                      |
| 12  | axe filter      | keeps serious and critical in order                                            | input impacts `[minor, critical, moderate, serious, null, undefined]` → ids of 2nd and 4th                                                       |
| 13  | axe report      | counts per impact including unknown                                            | `{minor:1, moderate:1, serious:1, critical:1, unknown:2}`                                                                                        |
| 14  | axe report      | flattens shadow-DOM targets                                                    | target `[["#host", "button"]]` → `"#host >>> button"`                                                                                            |
| 15  | axe report      | `formatAxeReport` is pretty JSON with a trailing newline and round-trips       | `JSON.parse(text)` deep-equals the report; `text.endsWith("}\n")`                                                                                |
| 16  | docker          | image tag from an exact pin; a range throws                                    | `"1.63.0"` → `…playwright:v1.63.0-jammy`; `"^1.63.0"` throws `/exact version/`                                                                   |
| 17  | docker          | `calPortFromBaseUrl` accepts only 127.0.0.1                                    | `http://127.0.0.1:3000` → 3000; `http://localhost:3000` and `https://127.0.0.1:3000` throw                                                       |
| 18  | docker          | win32 uses the proxy and never `--network host`                                | args contain `host.docker.internal:host-gateway`; the last arg contains `visual-docker-proxy.mjs 3000 host.docker.internal 3000`; no `--network` |
| 19  | docker          | linux uses `--network host` and `--user`; update adds `--update-snapshots=all` | test mode has no `--update-snapshots`                                                                                                            |

```bash
npm run test:unit
```

**Done when** it exits 0 with **`105 passed`** (86 + 19).

### Step 7. Playwright config (`playwright.config.ts`, edited)

1. Import `type Project`:

```ts
import { defineConfig, devices, type Project, type ReporterDescription } from "@playwright/test";
```

2. Under the existing `TWENTY_PROJECT_NAMES`:

```ts
const VISUAL_PROJECT_NAMES = ["visual-mobile", "visual-tablet", "visual-desktop"] as const;
type VisualProjectName = (typeof VISUAL_PROJECT_NAMES)[number];
const VISUAL_VIEWPORTS: Readonly<Record<VisualProjectName, { width: number; height: number }>> = {
  "visual-mobile": { width: 393, height: 852 },
  "visual-tablet": { width: 820, height: 1180 },
  "visual-desktop": { width: 1440, height: 900 },
};
/** ADR 0017: visual and a11y specs run only in visual-* projects. */
const VISUAL_A11Y_MATCH = ["**/visual/**/*.spec.ts", "**/a11y/**/*.spec.ts"];
const VISUAL_A11Y_IGNORE = ["**/visual/**", "**/a11y/**"];
```

3. Next to `runsTwentyProject()`:

```ts
function runsVisualProject(): boolean {
  return selectedProjects(projectSelectionArgv, VISUAL_PROJECT_NAMES);
}
```

Then add `const runsVisual = runsVisualProject();`, and change the Cal globalSetup push to:

```ts
if (runsCal || runsVisual) {
  harnessSetups.push("./global-setup/index.ts");
}
```

Task 1's visual specs are Cal only; later product tasks add their own global setups here. Inside Docker `P1_PLAYWRIGHT_HARNESS=0` skips this block.

4. Project factory, placed above `export default`:

```ts
function visualProject(name: VisualProjectName): Project {
  return {
    name,
    testDir: "./tests",
    testMatch: VISUAL_A11Y_MATCH,
    retries: 0,
    snapshotPathTemplate: "{testDir}/{testFileDir}/__screenshots__/{projectName}/{arg}{ext}",
    // Project expect replaces top-level expect, so repeat the timeout.
    expect: {
      timeout: TIMEOUTS[webMode].expect,
      toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
    },
    use: {
      ...devices["Desktop Chrome"],
      viewport: VISUAL_VIEWPORTS[name],
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      locale: "en-US",
      timezoneId: "Europe/London",
      colorScheme: "light",
    },
  };
}
```

5. Exclude visual and a11y specs from the existing projects. Exact edits:
   - `cal-chromium`: add `testIgnore: VISUAL_A11Y_IGNORE,`
   - `cal-firefox`: add `testIgnore: VISUAL_A11Y_IGNORE,`
   - `documenso-chromium`: `testIgnore: /rate-limit\//,` → `testIgnore: [/rate-limit\//, ...VISUAL_A11Y_IGNORE],`
   - `documenso-firefox`: add `testIgnore: VISUAL_A11Y_IGNORE,`
   - `twenty-chromium`: add `testIgnore: VISUAL_A11Y_IGNORE,`
   - Leave `cal-setup`, `twenty-setup`, `unit` and `documenso-rate-limit-chromium` alone (narrow `testDir`/`testMatch`).
6. Append `...VISUAL_PROJECT_NAMES.map(visualProject),` as the last entry of `projects`.

Snapshot path result: `{testDir}` = `<repo>/tests` and `{testFileDir}` = `cal/visual`, giving `tests/cal/visual/__screenshots__/visual-desktop/booker-pro-30min.png`.

**Done when** `npm run typecheck` exits 0. (The list-count check comes in Step 10.)

### Step 8. Specs

#### `tests/cal/visual/smoke.visual.spec.ts` (new)

```ts
import { expect, test } from "@playwright/test";
import { BookerPage } from "../../../src/products/cal/pages/booker.page.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test.describe("Cal visual pipeline smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "booker /pro/30min matches the frozen-clock baseline",
    {
      tag: ["@cal", "@visual"],
      annotation: { type: "testId", description: "P1-CAL-VIS-SMOKE" },
    },
    async ({ page }) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      const booker = new BookerPage(page);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      // Probe: early screenshots differ 20–65% until slots render.
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await stableScreenshot(page, "booker-pro-30min", { mask: maskLocators(page, "cal") });
    },
  );
});
```

#### `tests/cal/a11y/smoke.a11y.spec.ts` (new)

```ts
import { expect, test } from "@playwright/test";
import { BookerPage } from "../../../src/products/cal/pages/booker.page.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { attachAxeReport, axeScan } from "../../../src/support/visual/axe.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";

test.describe("Cal a11y pipeline smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "booker /pro/30min axe scan is attached to the report",
    {
      tag: ["@cal", "@a11y"],
      annotation: { type: "testId", description: "P1-CAL-A11Y-SMOKE" },
    },
    async ({ page }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      const booker = new BookerPage(page);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      const scan = await axeScan(page, {
        include: [`[data-testid="${CAL_TEST_IDS.bookerContainer}"]`],
      });
      await attachAxeReport(testInfo, "axe-booker-pro-30min", scan.report);
      testInfo.annotations.push({ type: "axe-blocking", description: String(scan.blockingCount) });
      // Task 1 records only; violation assertions arrive with the VIS/a11y case tasks (ADR 0017).
      expect(testInfo.attachments.map((a) => a.name)).toContain("axe-booker-pro-30min.json");
      expect(scan.passes).toBeGreaterThan(0);
    },
  );
});
```

`BookerPage.expectLoaded()` calls `timeouts()` → `loadConfig()`, which needs `CAL_E2E_EMAIL` and `CAL_E2E_PASSWORD`. Locally they come from `.env`, which is bind-mounted into the container and loaded by `src/core/config.ts`.

**Done when** `npm run check` exits 0 and `P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project=visual-desktop` prints `Total: 2 tests in 2 files`.

### Step 9. Docker runner

#### 9a. `scripts/visual-docker-proxy.mjs` (new, runs inside the container with the image's Node; no imports beyond `node:net`)

```js
import net from "node:net";

const [listenPort, targetHost, targetPort] = process.argv.slice(2);
if (!listenPort || !targetHost || !targetPort) {
  console.error(
    "usage: node scripts/visual-docker-proxy.mjs <listenPort> <targetHost> <targetPort>",
  );
  process.exit(2);
}

const server = net.createServer((client) => {
  const upstream = net.connect(Number(targetPort), targetHost);
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close);
  upstream.on("error", close);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.listen(Number(listenPort), "127.0.0.1", () => {
  console.log(`visual proxy 127.0.0.1:${listenPort} -> ${targetHost}:${targetPort}`);
});
```

Why not `tsx` in the container: the mounted `node_modules` came from Windows and only has the `@esbuild/win32-x64` binary, so `tsx` cannot run on Linux. For the same reason, the wrapper calls `node node_modules/@playwright/test/cli.js`, not `npx playwright`.

#### 9b. `scripts/visual-docker.mts` (new, host side)

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getStatus } from "../src/core/http-status.js";
import {
  buildDockerRunArgs,
  calPortFromBaseUrl,
  playwrightImage,
  type VisualMode,
} from "../src/support/visual/docker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function parseMode(arg: string | undefined): VisualMode {
  if (arg === "update" || arg === "test") {
    return arg;
  }
  console.error("usage: tsx scripts/visual-docker.mts <update|test> [extra playwright args]");
  process.exit(2);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2]);
  const baseUrl =
    process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL ?? "http://127.0.0.1:3000";
  const calPort = calPortFromBaseUrl(baseUrl);
  const csrf = await getStatus(`${baseUrl.replace(/\/$/, "")}/api/auth/csrf`, 120_000);
  if (csrf !== 200) {
    console.error(
      `Cal is not healthy at ${baseUrl} (GET /api/auth/csrf -> ${String(csrf)}). Start it through the harness:\n` +
        "  PRODUCTS_ROOT=D:/Jayami/Portfolio/products node node_modules/qa-portfolio-harness/scripts/up.mjs cal",
    );
    process.exit(2);
  }
  const image = playwrightImage(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const userInfo = process.platform === "linux" ? os.userInfo() : undefined;
  const args = buildDockerRunArgs({
    mode,
    image,
    hostRoot: ROOT,
    hostPlatform: process.platform,
    calPort,
    ...(userInfo === undefined
      ? {}
      : { uidGid: `${String(userInfo.uid)}:${String(userInfo.gid)}` }),
    env: {
      P1_PLAYWRIGHT_HARNESS: "0",
      CAL_E2E_BASE_URL: `http://127.0.0.1:${String(calPort)}`,
      CAL_WEB_MODE: process.env.CAL_WEB_MODE ?? "prod",
      HOME: "/tmp",
    },
    extraArgs: process.argv.slice(3),
  });
  console.log(`docker ${args.slice(0, -1).join(" ")} '<inner command>'`);
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error !== undefined) {
    console.error(`docker failed to start (is Docker Desktop running?): ${result.error.message}`);
    process.exit(2);
  }
  process.exit(result.status ?? 1);
}

await main();
```

Check `getStatus`'s signature in `src/core/http-status.ts` first; `global-setup/index.ts` calls it as `getStatus(url, timeoutMs)` and gets back a number or `undefined`. `CI` is deliberately **not** passed, so the container uses the html and list reporters and the CI-only `forbidOnly`/`failOnFlakyTests` don't apply.

#### 9c. `package.json` scripts (add after `"test:twenty"`)

```json
    "visual:update": "tsx scripts/visual-docker.mts update",
    "visual:test": "tsx scripts/visual-docker.mts test",
```

No `NPM_SCRIPT_PROJECTS` entry is needed. These scripts don't run Playwright on the host, and inside the container the `--project` flags are on argv.

#### 9d. Start Cal (harness only) and generate baselines

```bash
curl -s -o /dev/null -w "%{http_code}\n" -m 10 http://127.0.0.1:3000/api/auth/csrf   # 200 → skip the up step
PRODUCTS_ROOT=D:/Jayami/Portfolio/products node node_modules/qa-portfolio-harness/scripts/up.mjs cal
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -m 120 http://127.0.0.1:3000/api/auth/csrf && break; sleep 10; done
npm run visual:update
```

Expected: the first run pulls `mcr.microsoft.com/playwright:v1.63.0-jammy` (about 2 GB, one time). Then `visual proxy 127.0.0.1:3000 -> host.docker.internal:3000`, then 3 visual tests that write missing snapshots, then 3 a11y tests passing. The exit code is 0 and the summary reads `6 passed`.

```bash
ls tests/cal/visual/__screenshots__/*/
mkdir -p /tmp/p1-vis-1 && for v in mobile tablet desktop; do cp tests/cal/visual/__screenshots__/visual-$v/booker-pro-30min.png /tmp/p1-vis-1/$v.png; done
```

You should see exactly three files: `visual-desktop/booker-pro-30min.png`, `visual-mobile/booker-pro-30min.png` and `visual-tablet/booker-pro-30min.png`. Open each one and check it shows "January 2030", Mon 14 selected, slots from `9:00am`, and a black box over the avatar (mask).

**Fallback (Predicted risk):** if the container fails to load a module from the Windows-installed `node_modules`, the error will name a platform binary. In that case, change `buildDockerRunArgs` to add `--mount type=volume,source=p1-visual-node-modules,target=/work/node_modules` and prefix the inner command with `npm ci --no-audit --no-fund && (cd node_modules/qa-portfolio-harness && npx tsc) && `. Update unit tests 18–19 to match and record it in the final report.

**Done when** there are 3 PNGs, exit code 0, and `6 passed`.

### Step 10. Verification (real output only; paste it into the final report)

```bash
npm run check                                   # exit 0
npm run test:unit                               # exit 0, "105 passed"
npm run visual:test                             # exit 0, "6 passed"
npm run visual:test                             # exit 0, "6 passed" again
npm run visual:update
mkdir -p /tmp/p1-vis-2 && for v in mobile tablet desktop; do cp tests/cal/visual/__screenshots__/visual-$v/booker-pro-30min.png /tmp/p1-vis-2/$v.png; done
```

Then compare each of the three pairs (`/tmp/p1-vis-1/<v>.png` against `/tmp/p1-vis-2/<v>.png`) pixel by pixel. Two regenerations count as **stable** when at most 0.01% of the pixels differ and no colour channel differs by more than 2. Report the differing pixel count, percentage, bounding box and maximum channel delta for each pair. Byte-identical hashes are not required: Chromium anti-aliases the rounded card corners differently between runs (measured on desktop: 0–40 px, max delta 1/255, all on the four corners of the booker card). Keep the compare script outside the repo (a throwaway script in a temp directory; `PNG` is exported by `playwright-core/lib/utilsBundle`). `toHaveScreenshot` passing alone only proves "within 1%"; this check proves the baselines themselves don't wander.

a11y attachment:

```bash
npx playwright test --project=visual-desktop tests/cal/visual --reporter=json > /tmp/vis.json && grep -c "axe" /tmp/vis.json
```

Also open `npx playwright show-report` → any `visual-*` a11y test → Attachments → `axe-booker-pro-30min.json`. Record the `counts` object from the desktop report in the final report.

Local Windows skip message (Cal up):

```bash
P1_PLAYWRIGHT_HARNESS=0 npx playwright test --project=visual-desktop tests/cal/visual
```

Expected: `1 skipped`, with the reason `toHaveScreenshot skipped on win32: baselines are Linux-only (ADR 0017)…`.

List counts after the change: rerun the Step 1 loop and add the three visual projects. All nine existing rows must equal the "before" table exactly, except `unit`, which must read `105 tests in 17 files`. Each new project must read `visual-mobile`, `visual-tablet` and `visual-desktop`: `Total: 2 tests in 2 files`.

Leave Cal running, or stop it only through the harness (`node node_modules/qa-portfolio-harness/scripts/down.mjs cal`). Never kill a pid.

### Step 11. ADR `docs/adr/0017-visual-baselines.md` (new; copy the header format of ADR 0016)

```
# 0017. Visual baselines and a11y scans
- Status: Accepted
- Date: 2026-10-15
## Context      (font rendering differs per OS; Cal booker is time-driven; probe numbers from Step 0)
## Decision
- Linux-only baselines from mcr.microsoft.com/playwright:v<exact @playwright/test>-jammy; no platform suffix; Windows/macOS skip toHaveScreenshot unless VISUAL_LOCAL=1.
- Chromium only; 393x852, 820x1180, 1440x900; DPR 1; en-US; Europe/London; light.
- Tolerance maxDiffPixelRatio 0.01, animations disabled, caret hidden. Tuning: only after 5 consecutive Docker reruns
  show non-zero drift; record measured ratio; per-assertion override (never global) with a comment linking evidence.
  1% of 1440x900 is 12,960 px (about one slot button), so do not loosen globally.
- Clock: freezeClock before first goto with a future UTC instant (default 2030-01-14T10:00:00Z); server hides past slots.
- Masking policy: mask only content outside test control (user images, third-party embeds, real-time stamps the
  clock cannot freeze). Never mask the thing under test. Each mask has a reason in src/support/visual/masks.ts.
- Who updates baselines: a manual workflow_dispatch job (task 6) runs visual:update on Linux and opens a PR with
  the PNG diff; locally only via npm run visual:update (Docker). Never commit PNGs made outside the pinned image.
- Docker on Windows: in-container TCP proxy 127.0.0.1:<port> -> host.docker.internal; --network host refused on
  Docker Desktop (probe). Linux hosts use --network host; CI (task 6) runs on ubuntu-latest with --network host.
- a11y: @axe-core/playwright exact pin, WCAG 2.0/2.1 A+AA tags, report serious+critical as JSON attachment.
  Task 1 does not fail on violations.
## Consequences (baseline churn when Playwright is bumped: image tag moves with it, regenerate all PNGs in one PR;
  Cal theme is user-driven, so dark baselines use a dedicated QA user from qa-user.ts with theme set via API — never pro,
  which parallel Cal specs share)
## Alternatives rejected (per-OS baselines; --network host on Docker Desktop; host.docker.internal as baseURL — changes origin and absolute asset URLs; Percy/Argos SaaS)
```

**Done when** `npx prettier --check docs/adr/0017-visual-baselines.md` exits 0.

### Step 12. Commit (implementation PR, later)

Commit with explicit paths only: every file in the Files table plus the 3 PNGs. Never `git add -A` (`test-results/`, `playwright-report/` and the `test-cal-run*.log` files are untracked or ignored). Suggested message: `feat(visual): visual and a11y framework setup (phase 3 task 1)`.

## Known traps

- **`npm install` while Cal is up** rewrites `node_modules/qa-portfolio-harness`. That deletes `.harness/cal-web.log` and can delete `dist/`. Do Step 2 before starting Cal, and rebuild `dist` with `npx tsc` as shown.
- **127.0.0.1, never localhost.** Cal binds IPv4 loopback only. In the container, `localhost` may resolve to `::1`. `calPortFromBaseUrl` enforces this.
- **`--network host` on Docker Desktop** cannot reach Windows loopback (verified: connection refused). Use the proxy.
- **Git Bash path mangling:** running `docker … -w /work` by hand from Git Bash turns `/work` into `C:/Program Files/Git/work`. Prefix manual docker commands with `MSYS_NO_PATHCONV=1`, and use `pwd -W` for Windows paths. The npm scripts avoid this because Node spawns docker directly.
- **`set +H`:** in interactive Git Bash, `!` inside double quotes triggers history expansion. Run `set +H` before pasting commands that contain `!`, or use single quotes.
- **pid wrappers:** the harness tracks Cal through `yarn workspace … next start` and the pid behind it. Never `kill` or `Stop-Process` them; use `down.mjs cal`.
- **Slow first response:** Cal can log `Ready` and still not answer for minutes (seen during the probe). Poll one request at a time with `-m 120`.
- **Windows bind mount is slow:** config load in the container can take tens of seconds. That's normal.
- **Linux-host runs (task 6):** files written by the container would be root-owned without `--user`. The wrapper passes `uid:gid` on Linux.
- **Lazy images** never complete off-screen. `waitForVisualStability` ignores `loading="lazy"`.

## Final report (implementation) must include

- The Step 1 and Step 10 list-count tables side by side.
- Output tails of `npm run check`, `npm run test:unit`, `npm run visual:update`, two `visual:test` runs, and the pixel-comparison result per viewport (differing px, %, max channel delta).
- The axe `counts` per viewport and any blocking rule ids. These are **findings only**, labelled PRODUCT BUG or TEST BUG with evidence. Nothing gets `test.fail` in this task.
- Which AxeBuilder import form worked, and whether the `node_modules` fallback was needed.

## Deviations from this plan found during the build (2026-10-15)

- **`screenshot.ts` string evaluate:** `page.evaluate`/`waitForFunction` use string expressions instead of callbacks, because `tsconfig` has no DOM lib (`document` fails typecheck). Same precedent as `tests/documenso/auth/passkey-register.spec.ts`.
- **ESLint `.mjs` block:** also sets `@typescript-eslint/explicit-function-return-type` to `off`, because plain JS cannot carry return-type annotations.
- **Axe import:** use the named form `import { AxeBuilder } from "@axe-core/playwright";`. The default import fails `tsc` ("not constructable"), and the planned fallback `AxeBuilderModule.default` typechecks but throws "AxeBuilder is not a constructor" at runtime in the container (Playwright's TS loader). The named export works for both.
- **Docker `node_modules` fallback:** not needed. The container ran Playwright from the Windows-installed `node_modules`.
- **0-diff check:** replaced the sha256 equality with a pixel comparison (Step 10) after measuring corner anti-aliasing drift.

## Resolved questions (decided in review, 2026-10-15)

1. **Dark theme (later CAL-VIS tasks):** use a **dedicated QA user** created through `src/products/cal/qa-user.ts`, with its theme set to dark through the API in setup. Never change `pro`'s theme, because other Cal specs share `pro` and would break when run in parallel. Task 1 stays light-only on `pro`. Record this in ADR 0017 under Consequences.
2. **Baselines:** commit the 3 smoke PNGs in this task (Step 12).
3. **CI runner (task 6):** a GitHub-hosted Linux runner (`ubuntu-latest`) with `--network host`. That is the `hostPlatform === "linux"` branch of `buildDockerRunArgs`: no proxy, plus `--user uid:gid`. The Windows proxy path stays for local runs only. Record this in ADR 0017.
