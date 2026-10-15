# Phase 3 Cal batch: VIS-001..004, I18N-001..003, A11Y-001..006, plus the Twenty Reset fix

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1. Branch `feat/2026-10-15-p1-phase3-cal-batch` from `main` `1220b24` (PR #32). Harness `#v0.2.9`. Cal fork `c2b7ac44c6`, read-only. Status: plan only, nothing built.

This batch replaces former Phase 3 tasks 2–5. Still open after it: task 6 (CI visual job and GH Pages), task 7 (DOC/TW visual and i18n), task 8 (closeout), and all MED-VIS/I18N.

"Verified" means seen live on 2026-10-15 or read in source. "Predicted" means confirm it at build time; if it doesn't hold, stop and report.

## Resolved decisions

- **Dark theme:** use a dedicated QA user, with theme set through tRPC `me/updateProfile` (verified 200, `users.theme = 'dark'`). Never change `pro`.
- **Masks:** only the avatar (`maskLocators(page, "cal")`).
- **Clock:** `freezeClock(page, VISUAL_FROZEN_INSTANT)` (`2030-01-14T10:00:00Z`) before the first `goto`.
- **Axe:** named import `{ AxeBuilder }`. Fail on serious and critical violations, through the existing allowlist with its stale-entry check.
- **Stability:**
  - Two regenerations count as stable when at most 0.01% of pixels differ and the maximum channel delta is 2.
  - `toHaveScreenshot` uses `maxDiffPixelRatio: 0.01`.
- **Baselines:** commit only the PNGs that `npm run visual:update` produces. This batch adds 10. The three existing `booker-pro-30min.png` baselines are **never regenerated**: `visual:update` passes `--update-snapshots=all`, which would rewrite them with corner anti-aliasing noise, so every update run here uses `--grep-invert "P1-CAL-VIS-001"` (Step 10), and the commit must not touch those three files.
- **`$` prefix on view-toggle names (decided):** a proven PRODUCT BUG. A11Y-006 attaches evidence, calls `test.fail` on tablet and desktop (where the radios exist), then hard-asserts `expect(dollar).toBe(0)`.
- **Focus lost after choosing a slot (decided):** a proven PRODUCT BUG. A11Y-001 records the focused element and attaches evidence once the form is visible, completes the keyboard booking, then calls `test.fail` and hard-asserts `expect(focusAfterSelect).not.toBe("BODY")`. A11Y-002 stays focus-ring and no-trap only.
- **VIS-002 wording (decided):** asserting "wraps with no clip, overflow or overlap" is correct; the master plan allows ellipsis or wrap.
- **No new .md files.** Known product bugs live in code constants plus `attachKnownBugEvidence`. ADR 0017 gets amended, because three decisions change (Step 13).
- **New rule from the probe: never click or press Enter on a `pro` slot.** Doing so reserves it for 5 minutes and breaks the 16-slot gate for every other spec. Any case that selects a slot uses a QA user's own event.
- **Commits:** no model tags, so no Co-Authored-By trailer.

## Step 0: probe findings (verified 2026-10-15)

| #        | Item                  | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Health                | `GET /api/auth/csrf` 200, `GET /pro/30min` 200, Twenty `/healthz` 200.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2        | Theme storage         | The `users.theme` column (`String?`). The API route is tRPC `POST /api/trpc/me/updateProfile?batch=1` with body `{"0":{"json":{"theme":"dark"}}}` and the QA user's session. It returned **200**, and the DB read back `dark`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2        | Dark render           | The booker shows `<html class="notranslate dark">`, body `rgb(15,15,15)`, `booker-container` background `rgb(23,23,23)`. With `colorScheme: "light"` emulated it is **still dark**, so the saved theme wins. localStorage gets `booking-theme:<username>=dark`. 16 slots.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2        | Dark axe              | `color-contrast`: **0 violations** at all three viewports. Full WCAG A/AA: only `button-name` on `#radix-_r_r_` (the overlay switch) on tablet and desktop, which the allowlist already covers. Mobile: 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2        | Event for QA user     | tRPC `POST /api/trpc/eventTypesHeavy/create?batch=1` with `{title, slug, length:30, description:""}` returned **200**, with `result.data.json.eventType.{id,slug}`. EventType and Booking both have `onDelete: Cascade` on the user, and `teardownCalQaUserById` succeeded with an event type and a booking present (verified).                                                                                                                                                                                                                                                                                                                                                                                   |
| 3        | Long names at 393×852 | An 80-char `users.name` and a 120-char title **wrap; they don't ellipsize**. The name is a `<p>` at y=56 h=40 (2 lines). The title is an `<h1 class="break-words">` at y=104 h=112 (4 lines). There's no horizontal overflow (scrollWidth 393 = clientWidth 393). The avatar sits at y=24–48 and doesn't overlap the name. The month arrows are at y=318, below the meta. `username` and `name` are separate fields: a QA user named "Pro Example …" doesn't affect `/pro/30min` (title still "30min").                                                                                                                                                                                                           |
| 4        | Slots URL             | `GET /api/trpc/slots/getSchedule?input=…` (tRPC, one per month). Route matcher: `/\/api\/trpc\/slots\/getSchedule/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4        | Slots 500             | The JSON 500, empty-body 500 and HTML 500 all take **the same UI path**. Request hits arrive at 0.7, 1.8, 3.8, 7.8 s (React Query retries). At about 8 s the booker **auto-advances to February 2030** (URL `?month=2030-02`) and retries 4 more times. From 2 s to about 16 s it shows a pulsing skeleton. At 30 s: 28 days rendered, none enabled, no slots, no `role=alert` text, no toast, and no "error/try again" anywhere. **PRODUCT BUG.** One variant is enough (same path).                                                                                                                                                                                                                             |
| 5        | German                | Locale comes from `Accept-Language` for anonymous visitors (`getLocale` reads the session token, then `accept-language`). Playwright `locale: "de-DE"` gives `lang="de"`, `dir="ltr"`, "Januar 2030", 24h times. Labels: "Vormonat anzeigen", "Nächsten Monat anzeigen", "14 heute", "Bestätigen", "Zurück", "Meinen Kalender überlagern". scrollWidth equals clientWidth at all three viewports, and **no clipped buttons** on the booker or form.                                                                                                                                                                                                                                                               |
| 6        | Arabic                | `locale: "ar"` gives `lang="ar"`, `dir="rtl"` on html and body, and "يناير 2030". The **arrows swap position**: the "previous" button sits right of "next" (desktop x 536 vs 500; mobile 56 vs 20). The chevron glyphs point outward correctly (screenshot); the SVGs carry no transform. The event meta moves to the right (x 959 vs slots x 220). No overflow. The probe read the month buttons' `aria-label` attribute ("عرض الشهر السابق" / "عرض الشهر التالي") but did **not** compute their accessible names, so the specs don't assert those names; month navigation is checked through the `decrementMonth` / `incrementMonth` test ids and positions.                                                    |
| 7        | Keyboard              | Tab order on desktop: overlay switch, month-view toggle, avatar link, timezone combobox, next month (previous is disabled), each enabled day as its own stop, 12h toggle, first slot. That's **21 Tabs**. Enter or Space on a slot opens the form, but **focus drops to `<body>`**; the next Tab reaches the name input. The form order is name, email, notes, Add guests, Terms, Privacy, Back, Confirm, then back to page start (**no trap**). Escape on the timezone combobox keeps focus there, and Tab moves on to `incrementMonth`. Keyboard-only submit reached `/booking/<uid>` (`success-page` testid).                                                                                                  |
| 7        | Focus ring            | Pixel diff of each control focused by keyboard versus blurred: **every control changes**, including slots, days and the timezone wrapper. The first slot reading was a probe mistake (focus without keyboard modality). **No focus-ring bug.** **Correction (build, 2026-10-15): wrong for the timezone select.** With focus confirmed on the combobox `INPUT` inside `timezone-select`, focused and blurred screenshots of the control (wrapper plus 8 px) are byte-identical (box-shadow ring width 0px): PRODUCT BUG (WCAG 2.4.7), asserted in A11Y-002 as `test.fail` after the other five controls pass.                                                                                                     |
| 8        | Overlay switch        | Tablet and desktop: present, `role=switch`, unnamed (axe `button-name` critical on `#radix-_r_r_`). Mobile: absent. The allowlist stays scoped to those two viewports.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8        | `$` in names          | The three view-toggle radios are named `$Switch to monthly view` and so on (`$Zur monatlichen Ansicht wechseln` in German). axe doesn't flag it. On mobile the only radios are `12h` and `24h` (no `$`). Tablet and desktop have 5 radios (3 view toggles + 12h/24h). **PRODUCT BUG**, asserted in A11Y-006 with `test.fail` on tablet and desktop.                                                                                                                                                                                                                                                                                                                                                               |
| A11Y-003 | 200% zoom             | Emulated as a 197×426 viewport at DPR 2. There's no horizontal page scroll (scrollWidth 197). **Weekday labels overflow their 9 px cells and overlap their neighbours**: "Sun" text runs 20–49 while "Mon" starts at 45, and so on for all 7. PRODUCT BUG (WCAG 1.4.10 Reflow).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A11Y-004 | forced-colors         | `forcedColors: "active"`: the media query matches, and slots, days, next-month and the switch all have `solid` borders in `rgb(0,0,0)` on white. Controls are visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A11Y-005 | reduced motion        | `reducedMotion: "reduce"`: the media query matches. After settling there are **no infinite animations**. A finite 300 ms layout animation (framer, the `timeslots`/`main` grid area) still runs; it's minor and not a WCAG failure. Skeleton `pulse` runs only during loading. Information isn't conveyed by animation.                                                                                                                                                                                                                                                                                                                                                                                           |
| 9        | Twenty portal         | After applying "Close date : Today", one `[data-floating-ui-portal]` holds a `listbox`. **One Escape does not remove it** (still there after 0, 100, 300 and 1000 ms; focus just moves to a DIV). **A second Escape removes it**, and then Reset is clickable and clears the chip. This matches the TZ-X03 CI flake on `d2aa5c0`.                                                                                                                                                                                                                                                                                                                                                                                 |
| Docker   | DB from container     | `docker run postgres:15 pg_isready -h host.docker.internal -p 5450` reports "accepting connections". The harness default `CAL_DB_URL` is `postgresql://postgres:@localhost:5450/calendso`, and `getAdapter("cal")` throws unless `PRODUCTS_ROOT/cal` exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Trap     | Slot reservation      | Clicking a slot runs `reserveSlot`, which writes a `SelectedSlots` row (`releaseAt = now + MINUTES_TO_BOOK`, which is 5) and hides that slot from **everyone**. During the probe, the probe's own clicks dropped the frozen-day count to 15, then 14, then 12. It recovered to 16 from 09:00 at 15:54 UTC once the holds expired, so the task-1 numbers are unchanged. **`SelectedSlots.userId` is the event host, not the visitor**: `reserveSlot.handler.ts` upserts one row per `eventType.users` entry with `userId: user.id`, and stores the visitor only in `uid` (a cookie). The table has no foreign key to `users`, so a QA host's rows are orphaned after teardown unless they are deleted by `userId`. |

## Labelled findings (before any `test.fail`)

| Finding                                                                             | Label                                     | Evidence                                                                  | Handling                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A slots 500 gives a skeleton, then a silent jump to an empty February with no error | **PRODUCT BUG**                           | Probe timeline and 30 s screenshot                                        | VIS-004 uses `test.fail` after its precondition asserts                                                                           |
| Weekday labels overlap at 200% zoom                                                 | **PRODUCT BUG**                           | Text rects (Sun 20–49 against Mon 45+)                                    | A11Y-003 uses `test.fail` on the last assert only                                                                                 |
| Overlay switch has no accessible name                                               | **PRODUCT BUG** (known)                   | axe `button-name`                                                         | Existing allowlist entry, unchanged                                                                                               |
| `$` prefix on view-toggle names                                                     | **PRODUCT BUG** (cosmetic)                | Accessible names (3 radios on tablet/desktop)                             | A11Y-006: evidence, then `test.fail` (tablet/desktop), then `expect(dollar).toBe(0)`                                              |
| Focus moves to `<body>` after choosing a slot                                       | **PRODUCT BUG** (WCAG 2.4.3, moderate)    | `document.activeElement` is BODY                                          | A11Y-001: evidence while the form is on screen, full keyboard flow, then `test.fail`, `expect(focusAfterSelect).not.toBe("BODY")` |
| 300 ms layout animation runs under `reduce`                                         | Observation                               | `getAnimations()`                                                         | Not asserted                                                                                                                      |
| 15/14/12 slots during the probe                                                     | **TEST BUG** (probe-induced reservations) | `SelectedSlots` rows for 2030-01-14 09:00–10:30; recovered to 16 at 15:54 | The "never click a `pro` slot" rule, plus teardown cleanup                                                                        |
| Twenty TZ-X03 Reset intercepted                                                     | **TEST BUG**                              | Portal still present after one Escape                                     | Step 11 fix                                                                                                                       |
| VIS-002 "truncate cleanly"                                                          | Spec wording versus product behaviour     | Cal wraps by design (`break-words`)                                       | VIS-002 asserts wrapping with no clip, overflow or overlap (decided)                                                              |

## Files

| Path                                                                                                   | New/edit                                                    |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `playwright.config.ts`                                                                                 | edit (add `i18n` to the visual match/ignore lists)          |
| `src/support/visual/docker.ts`, `scripts/visual-docker.mts`                                            | edit (forward the DB port, stub `PRODUCTS_ROOT`)            |
| `src/support/visual/projects.ts`                                                                       | new (`projectSkipReason`, `onlyOnProjects`)                 |
| `src/support/visual/layout.ts`                                                                         | new (pure geometry helpers)                                 |
| `src/products/cal/booker-qa.ts`                                                                        | new (tRPC helpers, `provisionBookerQaUser`, constants)      |
| `src/products/cal/qa-user.ts`                                                                          | edit (delete `SelectedSlots` in teardown; `readUserTheme`)  |
| `src/products/cal/fixtures.ts`                                                                         | edit (`darkThemeQaUser`, `longNameQaUser`, `bookingQaUser`) |
| `src/products/cal/testIds.ts`, `routes.ts`, `visual.ts`                                                | edit (test ids, routes, bug constants)                      |
| `tests/cal/visual/smoke.visual.spec.ts` → `booker.visual.spec.ts`                                      | `git mv` and retag as VIS-001                               |
| `tests/cal/visual/long-name.visual.spec.ts`, `dark-theme.visual.spec.ts`, `slots-error.visual.spec.ts` | new                                                         |
| `tests/cal/i18n/german.i18n.spec.ts`, `rtl.i18n.spec.ts`                                               | new                                                         |
| `tests/cal/a11y/keyboard.a11y.spec.ts`, `display.a11y.spec.ts`, `names.a11y.spec.ts`                   | new                                                         |
| `tests/unit/cal-booker-qa.spec.ts`, `tests/unit/visual-layout.spec.ts`                                 | new                                                         |
| `tests/unit/visual-helpers.spec.ts`                                                                    | edit (docker argv tests)                                    |
| `src/products/twenty/pages/object-filter.page.ts`                                                      | edit (Reset fix)                                            |
| `docs/adr/0017-visual-baselines.md`                                                                    | amend                                                       |
| 10 new PNGs under `tests/cal/{visual,i18n}/__screenshots__/`                                           | generated                                                   |

## Case matrix

All cases run in the visual-* projects. "Only" means the other projects skip the test through `onlyOnProjects`.

| ID                    | File               | Projects     | Baseline                                      | `test.fail`                                               |
| --------------------- | ------------------ | ------------ | --------------------------------------------- | --------------------------------------------------------- |
| A11Y-SMOKE (existing) | a11y/smoke         | all          | –                                             | –                                                         |
| VIS-001               | visual/booker      | all          | existing `booker-pro-30min` (no regeneration) | –                                                         |
| VIS-002               | visual/long-name   | mobile only  | `booker-long-name` (1)                        | –                                                         |
| VIS-003 dark          | visual/dark-theme  | all          | `booker-dark` (3)                             | –                                                         |
| VIS-003 light         | visual/dark-theme  | all          | – (VIS-001 covers the pixels)                 | –                                                         |
| VIS-004               | visual/slots-error | desktop only | attached via evidence                         | yes (proven)                                              |
| I18N-001              | i18n/german        | all          | `booker-de` (3)                               | –                                                         |
| I18N-002              | i18n/german        | all          | –                                             | –                                                         |
| I18N-003              | i18n/rtl           | all          | `booker-ar` (3)                               | –                                                         |
| A11Y-001              | a11y/keyboard      | desktop only | –                                             | yes (proven, last assert: focus after slot select)        |
| A11Y-002              | a11y/keyboard      | desktop only | –                                             | –                                                         |
| A11Y-003              | a11y/display       | mobile only  | –                                             | yes (proven, last assert)                                 |
| A11Y-004              | a11y/display       | all          | –                                             | –                                                         |
| A11Y-005              | a11y/display       | desktop only | –                                             | –                                                         |
| A11Y-006              | a11y/names         | all          | –                                             | tablet and desktop only (proven, last assert: `$` prefix) |

Per project: **15 tests in 10 files**. Expected run results:

- mobile: 11 run, 4 skipped
- tablet: 9 run, 6 skipped
- desktop: 13 run, 2 skipped

That's 33 run and 12 skipped in total. Five runs are expected failures and count as passed: VIS-004 (desktop), A11Y-001 (desktop), A11Y-003 (mobile), A11Y-006 (tablet and desktop). A11Y-006 on mobile is a normal pass (no `$` radios there).

---

## Steps

### Step 1. Branch and "before" counts

```bash
cd /d/Jayami/Portfolio/p1-web-e2e-ci
git checkout main && git pull && git checkout -b feat/2026-10-15-p1-phase3-cal-batch
git log --oneline -1   # 1220b24 Merge pull request #32 …
for p in cal-setup cal-chromium cal-firefox documenso-rate-limit-chromium documenso-chromium documenso-firefox twenty-setup twenty-chromium unit visual-mobile visual-tablet visual-desktop; do printf "%-32s " "$p"; P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project="$p" 2>&1 | grep '^Total'; done
```

Expected (recorded 2026-10-15):

| project                       | Total                     |
| ----------------------------- | ------------------------- |
| cal-setup                     | 2 tests in 1 file         |
| cal-chromium                  | 20 tests in 7 files       |
| cal-firefox                   | 12 tests in 3 files       |
| documenso-rate-limit-chromium | 1 test in 1 file          |
| documenso-chromium            | 27 tests in 8 files       |
| documenso-firefox             | 3 tests in 2 files        |
| twenty-setup                  | 1 test in 1 file          |
| twenty-chromium               | 14 tests in 4 files       |
| unit                          | 118 tests in 17 files     |
| visual-mobile/tablet/desktop  | 2 tests in 2 files (each) |

**Done when** the numbers match. If they don't, stop.

### Step 2. Config: add i18n to the visual projects (`playwright.config.ts`)

```ts
/** ADR 0017: visual, a11y and i18n specs run only in visual-* projects. */
const VISUAL_A11Y_MATCH = [
  "**/visual/**/*.spec.ts",
  "**/a11y/**/*.spec.ts",
  "**/i18n/**/*.spec.ts",
];
const VISUAL_A11Y_IGNORE = ["**/visual/**", "**/a11y/**", "**/i18n/**"];
```

`tests/cal/tz-i18n/` is not matched, because the glob needs a directory named exactly `i18n`. Snapshot path for i18n specs: `tests/cal/i18n/__screenshots__/{project}/{name}.png`.

**Done when** `npm run typecheck` exits 0, and cal-chromium still lists 20 tests in 7 files.

### Step 3. Docker: forward the DB port and stub product roots

`src/support/visual/docker.ts`:

```ts
export function dbPortFromUrl(dbUrl: string): number {
  const port = new URL(dbUrl).port;
  if (port === "") {
    throw new Error(`Cal DB URL needs an explicit port, got ${dbUrl}`);
  }
  return Number(port);
}

/** Harness loadConfig() requires every product dir under PRODUCTS_ROOT (seen in Step 0). */
export const CONTAINER_PRODUCTS_ROOT = "/tmp/p1-products";
const STUB_PRODUCTS = ["cal", "documenso", "medusa-dtc-starter", "twenty-CRM"] as const;

// DockerRunInput gains: readonly dbPort: number;
// in buildDockerRunArgs:
const forward = [input.calPort, input.dbPort];
const stubs = `mkdir -p ${STUB_PRODUCTS.map((p) => `${CONTAINER_PRODUCTS_ROOT}/${p}`).join(" ")} && `;
const proxies = forward
  .map(
    (port) =>
      `node scripts/visual-docker-proxy.mjs ${String(port)} host.docker.internal ${String(port)} & ` +
      `until (exec 3<>/dev/tcp/127.0.0.1/${String(port)}) 2>/dev/null; do sleep 0.2; done; `,
  )
  .join("");
const inner = linuxHost ? `${stubs}${playwright}` : `${stubs}${proxies}${playwright}`;
```

`scripts/visual-docker.mts`: read the host DB URL with `getAdapter("cal").dbUrl` (run on the host with an absolute `PRODUCTS_ROOT`), compute `dbPort = dbPortFromUrl(...)`, then pass:

```ts
    dbPort,
    env: {
      ...existing,
      PRODUCTS_ROOT: CONTAINER_PRODUCTS_ROOT,
      CAL_DB_URL: `postgresql://postgres:@127.0.0.1:${String(dbPort)}/calendso`,
    },
```

The URL is IPv4 on purpose: `localhost` can resolve to `::1` inside the container, and the proxy binds `127.0.0.1` only.

**Trap:** if `.env` sets `PRODUCTS_ROOT=../products`, the harness resolves it from its own folder (`node_modules/qa-portfolio-harness/..`). On the host, run the wrapper with `PRODUCTS_ROOT=D:/Jayami/Portfolio/products` or an absolute `.env` value (seen in Step 0: "Cal product root does not exist: …node_modules\products\cal").

Why empty stub dirs are enough: the harness's `resolveExistingDir` (`node_modules/qa-portfolio-harness/src/config.ts`) only calls `fs.existsSync` on each product root; `getAdapter("cal")` reads no product files for the DB pool. Verified in source on 2026-10-15. The round-trip check below proves it with the same env the wrapper passes (stub `PRODUCTS_ROOT` plus IPv4 `CAL_DB_URL`), run on the host because `tsx` cannot run inside the container (Windows `esbuild` binary):

```bash
STUB=$(mktemp -d) && mkdir -p "$STUB"/cal "$STUB"/documenso "$STUB"/medusa-dtc-starter "$STUB"/twenty-CRM
PRODUCTS_ROOT="$(cygpath -w "$STUB")" CAL_DB_URL=postgresql://postgres:@127.0.0.1:5450/calendso npx tsx -e "import('./src/products/cal/qa-user.ts').then(async (m) => { const u = await m.createCalQaUser({ email: 'qa-stubcheck@qa.local', username: 'qastubcheck', name: 'QA Stub Check', password: 'Qa-stubcheck-9' }); await m.teardownCalQaUserById(u.id); console.log('roundtrip ok', u.id, 'left', await m.countCalQaUsers()); })"
rm -rf "$STUB"
```

Expected: `roundtrip ok <id> left 0`. The in-container round trip is proven by the first command of Step 10 (`visual:update -- --grep "P1-CAL-VIS-002"`, which provisions and tears down `longNameQaUser` inside Docker).

**Done when** `npm run typecheck` exits 0, the updated docker unit tests (Step 12) pass, and the round-trip prints `roundtrip ok <id> left 0`.

### Step 4. Pure helpers

`src/support/visual/projects.ts` (new):

```ts
import { test } from "@playwright/test";

export type VisualProjectName = "visual-mobile" | "visual-tablet" | "visual-desktop";

export function projectSkipReason(
  project: string,
  allowed: readonly VisualProjectName[],
): string | undefined {
  return (allowed as readonly string[]).includes(project)
    ? undefined
    : `runs only in ${allowed.join(", ")} (case is viewport-specific)`;
}

/** Lives in src/support, so the playwright/no-skipped-test lint rule does not apply. */
export function onlyOnProjects(project: string, allowed: readonly VisualProjectName[]): void {
  const reason = projectSkipReason(project, allowed);
  if (reason !== undefined) {
    test.skip(true, reason);
  }
}
```

`src/support/visual/layout.ts` (new, pure):

```ts
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface ScrollBox {
  readonly label: string;
  readonly sw: number;
  readonly cw: number;
  readonly sh: number;
  readonly ch: number;
}
export interface TextSpan {
  readonly label: string;
  readonly cellLeft: number;
  readonly cellRight: number;
  readonly textLeft: number;
  readonly textRight: number;
}

/** Touching edges do not count as overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function rectInsideWidth(r: Rect, viewportWidth: number, tolerancePx = 1): boolean {
  return r.x >= -tolerancePx && r.x + r.width <= viewportWidth + tolerancePx;
}

export function overflowingControls(boxes: readonly ScrollBox[], tolerancePx = 1): ScrollBox[] {
  return boxes.filter((b) => b.sw > b.cw + tolerancePx || b.sh > b.ch + tolerancePx);
}

/** Pairs where a label's text runs past the next cell's left edge (LTR order). */
export function overlappingNeighbours(spans: readonly TextSpan[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < spans.length; i += 1) {
    const a = spans[i];
    const b = spans[i + 1];
    if (a !== undefined && b !== undefined && a.textRight > b.cellLeft) {
      out.push(`${a.label}/${b.label}`);
    }
  }
  return out;
}
```

**Done when** `npm run typecheck` exits 0.

### Step 5. Cal API helpers: `src/products/cal/booker-qa.ts` (new)

```ts
import type { APIRequestContext, Browser } from "@playwright/test";
import { loginCalWithCredentials } from "./auth.js";
import { loadConfig, timeouts } from "./env.js";
import { qaCalUser } from "./factories.js";
import { createCalQaUser, readUserTheme, teardownCalQaUserById } from "./qa-user.js";
import { CAL_ROUTES } from "./routes.js";

export const QA_BOOKER_EVENT = {
  slug: "qa-booker-30",
  title: "QA booker 30min",
  length: 30,
} as const;
/** Step 0: shares pro's display-name prefix on purpose (username and name are separate fields). */
export const LONG_NAME =
  "Pro Example Longname-Truncation-Check Longname-Truncation-Check Longname-Truncat"; // 80 chars
/** Exactly 120 chars (118 + "xx", measured with node); unit test 6 asserts the length. */
export const LONG_TITLE =
  "Quarterly planning session with stakeholders across regions and time zones and a long agenda for the coming quarter okxx";
export const DARK_NAME = "QA Dark Theme";
export const BOOKING_NAME = "QA Booking";

export function trpcPath(procedure: string): string {
  return `/api/trpc/${procedure}?batch=1`;
}

export function trpcBatchBody(input: unknown): { readonly "0": { readonly json: unknown } } {
  return { "0": { json: input } };
}

/** Step 0 shape: [{ result: { data: { json: { eventType: { id, slug } } } } }]. */
export function parseTrpcEventType(payload: unknown): {
  readonly id: number;
  readonly slug: string;
} {
  const first = Array.isArray(payload)
    ? (payload[0] as Record<string, unknown> | undefined)
    : undefined;
  if (first?.error !== undefined) {
    throw new Error(
      `tRPC eventTypesHeavy/create error: ${JSON.stringify(first.error).slice(0, 300)}`,
    );
  }
  const result = first?.result as Record<string, unknown> | undefined;
  const data = result?.data as Record<string, unknown> | undefined;
  const json = data?.json as Record<string, unknown> | undefined;
  const eventType = json?.eventType as Record<string, unknown> | undefined;
  const id = eventType?.id;
  const slug = eventType?.slug;
  if (typeof id !== "number" || typeof slug !== "string") {
    throw new Error("tRPC eventTypesHeavy/create response has no eventType.id/slug");
  }
  return { id, slug };
}

async function postTrpc(
  http: APIRequestContext,
  procedure: string,
  input: unknown,
): Promise<unknown> {
  const response = await http.post(trpcPath(procedure), {
    data: trpcBatchBody(input),
    headers: { "Content-Type": "application/json" },
    timeout: timeouts().csrf,
  });
  const payload: unknown = await response.json();
  if (!response.ok()) {
    throw new Error(`tRPC ${procedure} HTTP ${String(response.status())}`, { cause: payload });
  }
  return payload;
}

export interface BookerQaUser {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly eventTitle: string;
  readonly bookerPath: string;
}

export interface BookerQaOptions {
  readonly name: string;
  readonly title: string;
  readonly theme?: "dark";
}

/** DB insert (existing helper), then API login, then tRPC theme and event. Never touches pro. */
export async function provisionBookerQaUser(
  browser: Browser,
  parallelIndex: number,
  opts: BookerQaOptions,
): Promise<BookerQaUser> {
  const identity = { ...qaCalUser(parallelIndex), name: opts.name };
  const created = await createCalQaUser(identity);
  try {
    const context = await browser.newContext({ baseURL: loadConfig().baseUrl });
    try {
      const page = await context.newPage();
      await loginCalWithCredentials(page, created.email, identity.password);
      if (opts.theme !== undefined) {
        await postTrpc(page.request, CAL_ROUTES.trpcUpdateProfile, { theme: opts.theme });
        const stored = await readUserTheme(created.id);
        if (stored !== opts.theme) {
          throw new Error(`theme not stored: expected ${opts.theme}, got ${String(stored)}`);
        }
      }
      const event = parseTrpcEventType(
        await postTrpc(page.request, CAL_ROUTES.eventTypesHeavyCreate, {
          title: opts.title,
          slug: QA_BOOKER_EVENT.slug,
          length: QA_BOOKER_EVENT.length,
          description: "",
        }),
      );
      return {
        id: created.id,
        username: created.username,
        name: opts.name,
        eventTitle: opts.title,
        bookerPath: CAL_ROUTES.publicBooker(created.username, event.slug),
      };
    } finally {
      await context.close();
    }
  } catch (error) {
    await teardownCalQaUserById(created.id);
    throw error;
  }
}
```

`routes.ts`: add `trpcUpdateProfile: "me/updateProfile"` and `slotsGetSchedule: "slots/getSchedule"` to `CAL_ROUTES` (`eventTypesHeavyCreate: "eventTypesHeavy/create"` already exists), plus:

```ts
/** Step 0: one GET per month; React Query retries a 500 four times. */
export const CAL_SLOTS_ROUTE = /\/api\/trpc\/slots\/getSchedule/;
```

`qa-user.ts`:

- In `deleteCalQaUserInTransaction`, before deleting the user row: `await client.query(\`DELETE FROM "SelectedSlots" WHERE "userId" = $1\`, [userId]);`. **Keep it keyed on `userId`; do not "fix" it to delete by visitor `uid`.** In `SelectedSlots`, `userId`is the event **host**:`reserveSlot.handler.ts`upserts one row per`eventType.users`entry with`userId: user.id`, and the visitor is only the `uid`cookie. A QA user is always the host of the slots our specs reserve, so deleting by`userId`removes exactly the holds the test created. There is no FK to`users`, so without this delete the rows survive as orphans (two from the Step 0 probe exist, both expired).
- Add `readUserTheme(userId: number): Promise<string | null>` with `SELECT theme FROM users WHERE id = $1`, using `withCalPool` (read-only), and throw if the row is missing.

`testIds.ts`: add `eventMeta: "event-meta"`, `eventTitle: "event-title"`, `currentTimezone: "event-meta-current-timezone"`, `selectedMonthLabel: "selected-month-label"`, `decrementMonth: "decrementMonth"`, `incrementMonth: "incrementMonth"`, `day: "day"`, `overlayCalendarSwitch: "overlay-calendar-switch"`.

`visual.ts`: add the known-bug strings:

```ts
export const VIS004_SLOTS_500_ISSUE =
  "PRODUCT BUG: slots getSchedule HTTP 500 shows a skeleton, then silently jumps to an empty next month; no user-facing error (Phase 3 probe 2026-10-15)";
export const A11Y003_WEEKDAY_OVERLAP_ISSUE =
  "PRODUCT BUG: at 200% zoom (197 CSS px) weekday labels overflow their 9px cells and overlap (WCAG 1.4.10)";
export const A11Y001_FOCUS_LOST_ISSUE =
  "PRODUCT BUG: choosing a slot by keyboard moves focus to <body> instead of the booking form (WCAG 2.4.3, Phase 3 probe 2026-10-15)";
export const A11Y006_DOLLAR_NAME_ISSUE =
  'PRODUCT BUG: booker view-toggle radios expose accessible names with a literal "$" prefix, e.g. "$Switch to monthly view" (Phase 3 probe 2026-10-15)';
```

**Done when** `npm run typecheck` and `npm run lint` exit 0.

### Step 6. Fixtures (`src/products/cal/fixtures.ts`)

Add to `CalFixtures`: `darkThemeQaUser: BookerQaUser; longNameQaUser: BookerQaUser; bookingQaUser: BookerQaUser;`. One shared body, following the `twoFactorUser` pattern:

```ts
function bookerQaFixture(opts: BookerQaOptions) {
  return async (
    { browser }: { browser: Browser },
    use: (u: BookerQaUser) => Promise<void>,
    testInfo: TestInfo,
  ): Promise<void> => {
    const user = await provisionBookerQaUser(browser, testInfo.parallelIndex, opts);
    let testError: unknown;
    try {
      await use(user);
    } catch (error) {
      testError = error;
    }
    const errors: unknown[] = testError === undefined ? [] : [testError];
    try {
      await teardownCalQaUserById(user.id); // cascades EventType, Booking, Attendee; deletes SelectedSlots
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `booker QA user fixture failed (${opts.name})`);
    }
  };
}

  darkThemeQaUser: bookerQaFixture({ name: DARK_NAME, title: QA_BOOKER_EVENT.title, theme: "dark" }),
  longNameQaUser: bookerQaFixture({ name: LONG_NAME, title: LONG_TITLE }),
  bookingQaUser: bookerQaFixture({ name: BOOKING_NAME, title: QA_BOOKER_EVENT.title }),
```

Names and titles are fixed constants, so screenshots are deterministic. The username is random, but it appears only in the URL.

**Done when** typecheck and lint pass.

### Step 7. Visual specs

Every Cal spec imports `test` and `expect` from `../../../src/products/cal/fixtures.js`. Common opening for every booker spec:

```ts
await freezeClock(page, VISUAL_FROZEN_INSTANT);
await page.goto(path, { waitUntil: "domcontentloaded" }); // or booker.gotoProThirtyMin()
await booker.expectLoaded();
await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT); // 16, the settle gate
```

**Imports per spec file.** Copy these exactly (all paths are from `tests/cal/<dir>/`). Drop any name a file ends up not using, or `npm run lint` fails on unused imports.

```ts
// visual/long-name.visual.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { LONG_NAME, LONG_TITLE } from "../../../src/products/cal/booker-qa.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import {
  overflowingControls,
  rectInsideWidth,
  rectsOverlap,
} from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

// visual/dark-theme.visual.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { attachAxeReport, axeScan, describeViolation } from "../../../src/support/visual/axe.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

// visual/slots-error.visual.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { CAL_SLOTS_ROUTE } from "../../../src/products/cal/routes.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { VIS004_SLOTS_500_ISSUE } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

// i18n/german.i18n.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { overflowingControls, type ScrollBox } from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

// i18n/rtl.i18n.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

// a11y/keyboard.a11y.spec.ts
import type { Page } from "@playwright/test";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { timeouts } from "../../../src/products/cal/env.js";
import { qaAttendee } from "../../../src/products/cal/factories.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import {
  A11Y001_FOCUS_LOST_ISSUE,
  CAL_FROZEN_SLOT_COUNT,
} from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

// a11y/display.a11y.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import {
  A11Y003_WEEKDAY_OVERLAP_ISSUE,
  CAL_FROZEN_SLOT_COUNT,
} from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import {
  overlappingNeighbours,
  rectInsideWidth,
  type TextSpan,
} from "../../../src/support/visual/layout.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

// a11y/names.a11y.spec.ts
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import {
  A11Y006_DOLLAR_NAME_ISSUE,
  CAL_FROZEN_SLOT_COUNT,
} from "../../../src/products/cal/visual.js";
import { attachAxeReport, axeScan, describeViolation } from "../../../src/support/visual/axe.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
```

Specs that use the `booker` fixture get it from `fixtures.js` (no `BookerPage` import needed).

**VIS-001:** `git mv tests/cal/visual/smoke.visual.spec.ts tests/cal/visual/booker.visual.spec.ts`. Change the title to `"P1-CAL-VIS-001 booker /pro/30min matches the frozen-clock baseline"` and the annotation to `P1-CAL-VIS-001`. Keep the screenshot name `booker-pro-30min`, which leaves the baselines untouched because the snapshot path ignores the file name.

**VIS-002** (`long-name.visual.spec.ts`, mobile only):

```ts
test(
  "P1-CAL-VIS-002 80-char name and 120-char title wrap cleanly at 393x852",
  { tag: ["@cal", "@visual"], annotation: { type: "testId", description: "P1-CAL-VIS-002" } },
  async ({ page, booker, longNameQaUser }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-mobile"]);
    // opening sequence with longNameQaUser.bookerPath
    const meta = page.getByTestId(CAL_TEST_IDS.eventMeta);
    const name = meta.getByText(LONG_NAME, { exact: true });
    const title = page.getByTestId(CAL_TEST_IDS.eventTitle);
    await expect(name).toBeVisible();
    await expect(title).toHaveText(LONG_TITLE);
    const width = await page.evaluate<number>("document.documentElement.clientWidth");
    expect(await page.evaluate<number>("document.documentElement.scrollWidth")).toBeLessThanOrEqual(
      width,
    );
    // boundingBox() of avatar, name, title, currentTimezone, decrementMonth, incrementMonth; throw if any is null
    for (const r of [boxes.name, boxes.title]) expect(rectInsideWidth(r, width)).toBe(true);
    expect(rectsOverlap(boxes.avatar, boxes.name)).toBe(false);
    expect(rectsOverlap(boxes.name, boxes.title)).toBe(false);
    expect(rectsOverlap(boxes.title, boxes.timezone)).toBe(false);
    for (const b of [boxes.prev, boxes.next]) expect(rectsOverlap(boxes.title, b)).toBe(false);
    // Wrap, not clip: scroll sizes fit (Step 0: clip text-overflow, normal white-space)
    const scroll = await title.evaluate((el: ScrollEl) => ({
      label: "title",
      sw: el.scrollWidth,
      cw: el.clientWidth,
      sh: el.scrollHeight,
      ch: el.clientHeight,
    }));
    expect(overflowingControls([scroll])).toEqual([]);
    await stableScreenshot(page, "booker-long-name", { mask: maskLocators(page, "cal") });
    // Collision: same display-name prefix must not hijack /pro (clock stays frozen)
    await booker.gotoProThirtyMin();
    await booker.expectLoaded();
    await expect(page.getByTestId(CAL_TEST_IDS.eventTitle)).toHaveText("30min");
    await expect(
      page.getByTestId(CAL_TEST_IDS.eventMeta).getByText("Pro Example", { exact: true }),
    ).toBeVisible();
  },
);
```

`ScrollEl` is a local interface `{ scrollWidth; clientWidth; scrollHeight; clientHeight: number }`, because tsconfig has no DOM lib. The repo precedent is `SlotDom` in `booker.page.ts`.

**VIS-003** (`dark-theme.visual.spec.ts`), two tests, both annotated `P1-CAL-VIS-003`:

```ts
test.describe("P1-CAL-VIS-003 theme", () => {
  test.use({ colorScheme: "light" }); // saved dark theme must win (Step 0)

  test(
    "P1-CAL-VIS-003 dark QA user stays dark under light preference and passes axe",
    {
      tag: ["@cal", "@visual", "@a11y"],
      annotation: { type: "testId", description: "P1-CAL-VIS-003" },
    },
    async ({ page, darkThemeQaUser }, testInfo) => {
      // opening sequence with darkThemeQaUser.bookerPath
      await expect(page.getByTestId(CAL_TEST_IDS.bookerContainer)).toHaveCSS(
        "background-color",
        "rgb(23, 23, 23)",
      );
      const include = [`[data-testid="${CAL_TEST_IDS.bookerContainer}"]`];
      const contrast = await axeScan(page, {
        project: testInfo.project.name,
        rules: ["color-contrast"],
        include,
        allowlist: [],
      });
      expect(contrast.partition.blocking.map(describeViolation)).toEqual([]);
      const full = await axeScan(page, { project: testInfo.project.name, include });
      await attachAxeReport(testInfo, "axe-booker-dark", full.report);
      expect(full.partition.blocking.map(describeViolation)).toEqual([]);
      expect(full.partition.staleAllowlist.map((e) => e.target)).toEqual([]);
      await stableScreenshot(page, "booker-dark", { mask: maskLocators(page, "cal") });
    },
  );

  test(
    "P1-CAL-VIS-003 light pro booker passes axe color-contrast",
    {
      tag: ["@cal", "@visual", "@a11y"],
      annotation: { type: "testId", description: "P1-CAL-VIS-003" },
    },
    async ({ page, booker }, testInfo) => {
      // opening sequence on /pro/30min
      // expect container toHaveCSS("background-color", "rgb(255, 255, 255)")
      // axeScan rules ["color-contrast"], allowlist [], expect blocking toEqual([])
    },
  );
});
```

Check the light container colour once at build time. If it isn't `rgb(255, 255, 255)`, stop and report; don't adjust the value.

**VIS-004** (`slots-error.visual.spec.ts`, desktop only):

```ts
let hits = 0;
await page.route(CAL_SLOTS_ROUTE, async (route) => {
  hits += 1;
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify([
      {
        error: {
          json: {
            message: "P1 mocked failure",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "slots.getSchedule" },
          },
        },
      },
    ]),
  });
});
await freezeClock(page, VISUAL_FROZEN_INSTANT);
await booker.gotoProThirtyMin();
await booker.expectLoaded();
await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
// Precondition (hard): retries finish and the calendar settles (Step 0: days render by ~16 s, none enabled)
await expect(page.getByTestId(CAL_TEST_IDS.day).first()).toBeVisible({ timeout: 40_000 });
await expect(booker.slotButtons()).toHaveCount(0);
const alerts = page.getByRole("alert").filter({ hasText: /error|wrong|try again|unable|failed/i });
await attachKnownBugEvidence(page, testInfo, {
  issue: VIS004_SLOTS_500_ISSUE,
  observed: {
    hits,
    alerts: await alerts.count(),
    month: await page.getByTestId(CAL_TEST_IDS.selectedMonthLabel).innerText(),
    search: new URL(page.url()).search,
  },
  expected: { alerts: 1, month: "January 2030" },
});
test.fail(true, VIS004_SLOTS_500_ISSUE);
// Count, not toBeVisible on a filtered locator that may match 0 nodes: the failure then states 0 vs 1.
await expect(alerts, "slots failure must show exactly one user-facing error").toHaveCount(1, {
  timeout: 10_000,
});
```

`test.fail` is called **after** the hard preconditions, so a regression in route matching or rendering still fails for real (repo pattern: `tests/cal/auth/2fa.spec.ts:120`).

**Done when** `npm run check` exits 0.

### Step 8. i18n specs

**`german.i18n.spec.ts`:** `test.use({ locale: "de-DE" })`. This is how Cal applies locale for anonymous visitors (`Accept-Language`).

- **I18N-001**, all viewports, on `pro`:
  - Run the opening sequence.
  - `expect(await page.evaluate<string>("document.documentElement.lang")).toBe("de")`.
  - Check `selectedMonthLabel` `toHaveText("Januar 2030")` and the buttons `getByRole("button", { name: "Vormonat anzeigen" })` and `"Nächsten Monat anzeigen"` are visible.
  - Assert scrollWidth ≤ clientWidth.
  - `stableScreenshot(page, "booker-de", …)`.
- **I18N-002**, all viewports:
  - **Booker:** measure every `getByTestId(bookerContainer).getByRole("button")` with `evaluateAll`, mapping each to `{label: aria-label || innerText, sw, cw, sh, ch}`, then `expect(overflowingControls(list)).toEqual([])`.
  - **Form:** open on **`bookingQaUser.bookerPath`** (never `pro`) and `booker.slotButtons().first().click()`. Expect `getByTestId(confirmBook)` `toHaveText("Bestätigen")` and `getByTestId(bookerBack)` `toHaveText("Zurück")`, then run the same overflow check on the form buttons.

**`rtl.i18n.spec.ts`:** `test.use({ locale: "ar" })`. **I18N-003**, all viewports, on `pro`:

- `lang` = `ar` and `document.documentElement.dir` = `rtl`. Also check the computed `direction` of the body (`page.evaluate`).
- Month label `toHaveText("يناير 2030")`.
- `prev = await page.getByTestId(decrementMonth).boundingBox()` and `next = …incrementMonth`, then `expect(prev.x).toBeGreaterThan(next.x)` (mirrored).
- Check `getByTestId(CAL_TEST_IDS.decrementMonth)` and `getByTestId(CAL_TEST_IDS.incrementMonth)` are both visible. Do **not** assert the Arabic accessible names: Step 0 recorded only the `aria-label` attribute, not the computed name. Mirroring is proven by the `prev.x > next.x` check above.
- On tablet and desktop: `eventMeta` x > first slot x (columns mirrored).
- `stableScreenshot(page, "booker-ar", …)`. The baseline captures the chevron direction.

**Done when** `npm run check` exits 0.

### Step 9. a11y specs

**`keyboard.a11y.spec.ts`** (desktop only):

- **A11Y-001** on `bookingQaUser` (a real booking, removed by the cascade in teardown):

  ```ts
  // opening sequence on bookingQaUser.bookerPath
  const focusedTestId = (): Promise<string | null> =>
    page.evaluate<string | null>(
      "document.activeElement && document.activeElement.getAttribute('data-testid')",
    );
  // Tue 15: a 14th 09:00 booking shows "The event is in the past" under the frozen clock (Step 0)
  for (let i = 0; i < 40 && !(await isFocusedDay(page, "15")); i += 1) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Enter");
  for (let i = 0; i < 10 && (await focusedTestId()) !== CAL_TEST_IDS.timeSlot; i += 1) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Space");
  await expect(page.getByTestId(CAL_TEST_IDS.confirmBook)).toBeVisible();
  // Recorded once the form is visible; asserted at the very end so the keyboard flow is still proven.
  const focusAfterSelect = await page.evaluate<string>(
    "document.activeElement === document.body ? 'BODY' : document.activeElement.tagName",
  );
  // Evidence now, while the form is still on screen: the screenshot must show the bug state, not the success page.
  await attachKnownBugEvidence(page, testInfo, {
    issue: A11Y001_FOCUS_LOST_ISSUE,
    observed: { focusAfterSelect },
    expected: { focusAfterSelect: "an element inside the booking form, not BODY" },
  });
  await page.keyboard.press("Tab");
  await page.keyboard.type("QA Keyboard");
  await page.keyboard.press("Tab");
  await page.keyboard.type(qaAttendee().email);
  for (let i = 0; i < 15 && (await focusedTestId()) !== CAL_TEST_IDS.confirmBook; i += 1) {
    await page.keyboard.press("Tab");
  }
  expect(await focusedTestId()).toBe(CAL_TEST_IDS.confirmBook);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/booking\//, { timeout: timeouts().page });
  await expect(page.getByTestId(CAL_TEST_IDS.successPage)).toBeVisible();
  // Known bug last: every hard assert above has already passed (repo pattern, 2fa.spec.ts:120).
  test.fail(true, A11Y001_FOCUS_LOST_ISSUE);
  expect(focusAfterSelect, "choosing a slot must move focus into the booking form").not.toBe(
    "BODY",
  );
  ```

  Evidence is attached while the booking form is on screen (right after `focusAfterSelect` is recorded), so the screenshot shows the bug state; the JSON carries the measured `focusAfterSelect`. `test.fail` and the hard assert stay at the end, after the success page. No `click()` or `fill()` anywhere. `isFocusedDay(page, day)` is a local helper: it checks with `page.evaluate` that the active element has `data-testid=day` and that its innerText starts with `day`.

- **A11Y-002** on `pro`. It only focuses; it never presses Enter or Space on a slot.
  - **No trap:** press Tab up to 60 times, record the focused test ids, and assert that the list contains `time` and then a later return to page start.
  - **Timezone:** focus the `timezone select` combobox, press Escape, assert focus stays there, press Tab, and assert focus lands on `incrementMonth`.
  - **Focus ring:** for each of `overlay-calendar-switch`, `toggle-group-item-month_view`, `timezone-select` (wrapper), `incrementMonth`, the day `14` and the first `time` slot:
    1. Reach the control by keyboard (Tab or Shift+Tab, so `:focus-visible` applies).
    2. Take a `clip` screenshot of its box plus 8 px.
    3. Blur it and take a second screenshot.
    4. `expect(focused.equals(idle), label).toBe(false)`.
  - All controls passed in Step 0, so there's **no `test.fail`**. A11Y-002 covers focus ring and no-trap only; the focus-after-select bug lives in A11Y-001.

**`display.a11y.spec.ts`:**

- **A11Y-003** (mobile only): `test.use({ viewport: { width: 197, height: 426 }, deviceScaleFactor: 2 })`, which is 200% zoom of 393×852.
  - Hard asserts: scrollWidth ≤ clientWidth; every enabled `day` box passes `rectInsideWidth`; after clicking day 15 (a day click doesn't reserve anything), the first slot passes `scrollIntoViewIfNeeded` and `rectInsideWidth`.
  - Then collect the weekday header spans with `page.evaluate`, using a Range text rect against the cell rect, as in Step 0.
  - Then `attachKnownBugEvidence`, `test.fail(true, A11Y003_WEEKDAY_OVERLAP_ISSUE)`, and finally `expect(overlappingNeighbours(spans)).toEqual([])`.
  - **Predicted:** 7 spans (Sun–Sat). If the evaluate finds 0 headers, stop; that's a TEST BUG in the selector.
- **A11Y-004** (all viewports): `test.use({ forcedColors: "active" })`.
  - `expect(await page.evaluate<boolean>("matchMedia('(forced-colors: active)').matches")).toBe(true)`.
  - For the first slot, the first enabled day, `incrementMonth` and, on tablet and desktop, the overlay switch: `toHaveCSS("border-top-style", "solid")`. Also the computed `borderTopColor` ≠ `backgroundColor` (`evaluate`).
- **A11Y-005** (desktop only): `test.use({ reducedMotion: "reduce" })`.
  - Assert the media query matches.
  - After the settle gate: `await page.evaluate("Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))")`.
  - Assert the infinite-animation count is 0 (`getAnimations().filter(a => a.effect.getTiming().iterations === Infinity).length`).
  - Then assert the essential info is static text: `selectedMonthLabel` "January 2030", 16 slots, and the slot header text `Mon 14`.

**`names.a11y.spec.ts`:** **A11Y-006** (all viewports) on `pro`.

```ts
const NAME_RULES = [
  "button-name",
  "link-name",
  "label",
  "aria-toggle-field-name",
  "aria-input-field-name",
  "select-name",
  "input-button-name",
  "aria-command-name",
] as const;
const scan = await axeScan(page, {
  project: testInfo.project.name,
  rules: [...NAME_RULES],
  include: [`[data-testid="${CAL_TEST_IDS.bookerContainer}"]`],
});
await attachAxeReport(testInfo, "axe-booker-names", scan.report);
expect(scan.partition.blocking.map(describeViolation)).toEqual([]);
expect(scan.partition.staleAllowlist.map((e) => e.target)).toEqual([]); // overlay entry must match on tablet/desktop

// "$" prefix: Step 0 found 3 view-toggle radios on tablet/desktop; mobile renders only 12h/24h.
const hasViewToggles = testInfo.project.name !== "visual-mobile";
// Hard precondition, so the bug check can't pass vacuously: 5 radios (3 toggles + 12h/24h) or 2 on mobile.
await expect(page.getByRole("radio")).toHaveCount(hasViewToggles ? 5 : 2);
const dollar = await page.getByRole("radio", { name: /^\$/ }).count();
await attachKnownBugEvidence(page, testInfo, {
  issue: A11Y006_DOLLAR_NAME_ISSUE,
  observed: {
    dollarPrefixedRadios: dollar,
    names: await page
      .getByRole("radio")
      .evaluateAll((els: readonly NamedEl[]) =>
        els.map((e) => e.getAttribute("aria-label") ?? e.textContent ?? ""),
      ),
  },
  expected: { dollarPrefixedRadios: 0 },
});
test.fail(hasViewToggles, A11Y006_DOLLAR_NAME_ISSUE); // condition form: no `if` in the test body
expect(dollar, 'accessible names must not start with a literal "$"').toBe(0);
```

`NamedEl` is a local interface `{ getAttribute(name: string): string | null; textContent: string | null }` (no DOM lib; `SlotDom` pattern). On mobile `hasViewToggles` is false, so `test.fail(false, …)` is a no-op and `dollar` is 0: a normal pass.

**Done when** `npm run check` exits 0, and every visual-\* project lists 15 tests in 10 files.

### Step 10. Run, generate baselines, verify stability

Cal must be up through the harness. Check `curl -s -o /dev/null -w "%{http_code}\n" -m 120 http://127.0.0.1:3000/api/auth/csrf`; if it isn't `200`, start it:

```bash
PRODUCTS_ROOT=D:/Jayami/Portfolio/products node node_modules/qa-portfolio-harness/scripts/up.mjs cal
```

Then make sure no slot holds remain on the frozen date (see "Slot-hold check" under Verification).

First, the in-container fixture round trip (Step 3's second half). It writes only `booker-long-name.png`:

```bash
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:update -- --grep "P1-CAL-VIS-002"
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npx tsx -e "import('./src/products/cal/qa-user.ts').then(async (m) => console.log('qa users', await m.countCalQaUsers()))"
```

Expected: `1 passed, 2 skipped`, then `qa users 0`. If the container can't reach the DB or the harness throws "product root does not exist", stop: Step 3 is wrong.

Then every other case. **`--grep-invert "P1-CAL-VIS-001"` is mandatory**: the wrapper's update mode is `--update-snapshots=all`, which would rewrite the three existing `booker-pro-30min.png` baselines with corner anti-aliasing noise. Excluding VIS-001 means only missing snapshots get written. The pattern has no `|`, so it passes through npm and `cmd.exe` unchanged.

```bash
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:update -- --grep-invert "P1-CAL-VIS-001"
```

Expected: exit 0, `30 passed, 12 skipped`. That's 33 minus the three VIS-001 runs; the five expected failures (VIS-004, A11Y-001, A11Y-003, A11Y-006 on tablet and desktop) count as passed.

New PNGs, 10 of them:

- `tests/cal/visual/__screenshots__/visual-mobile/booker-long-name.png`
- `tests/cal/visual/__screenshots__/visual-{mobile,tablet,desktop}/booker-dark.png`
- `tests/cal/i18n/__screenshots__/visual-{mobile,tablet,desktop}/booker-de.png`
- `tests/cal/i18n/__screenshots__/visual-{mobile,tablet,desktop}/booker-ar.png`

The existing 3 `booker-pro-30min.png` files must be unchanged:

```bash
git status --short tests/cal/visual/__screenshots__ tests/cal/i18n/__screenshots__
```

Expected: only `??` lines for the 10 new PNGs (or their folders), and **no** ` M` line. If a ` M …/booker-pro-30min.png` line appears anyway, restore it and prove the old baselines still pass:

```bash
git checkout -- tests/cal/visual/__screenshots__/visual-mobile/booker-pro-30min.png tests/cal/visual/__screenshots__/visual-tablet/booker-pro-30min.png tests/cal/visual/__screenshots__/visual-desktop/booker-pro-30min.png
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:test -- --grep "P1-CAL-VIS-001"   # 3 passed
```

If that `visual:test` fails, stop and report; don't commit regenerated VIS-001 baselines.

Stability: copy the **10 new** PNGs to `/tmp/p1-vis-1` with names flattened (for example `visual-desktop__booker-dark.png`). Run `npm run visual:update -- --grep-invert "P1-CAL-VIS-001"` again, then copy the same 10 to `/tmp/p1-vis-2` the same way. VIS-001 stability was already measured in task 1. Then run this throwaway script from **outside** the repo:

```bash
node -e '
const {PNG}=require("D:/Jayami/Portfolio/p1-web-e2e-ci/node_modules/playwright-core/lib/utilsBundle.js");
const fs=require("fs"),path=require("path");
for (const f of fs.readdirSync("/tmp/p1-vis-1")) {
  const a=PNG.sync.read(fs.readFileSync(path.join("/tmp/p1-vis-1",f))), b=PNG.sync.read(fs.readFileSync(path.join("/tmp/p1-vis-2",f)));
  let n=0,max=0; for (let i=0;i<a.data.length;i+=4){const d=Math.max(...[0,1,2].map(k=>Math.abs(a.data[i+k]-b.data[i+k]))); if(d>0){n++;max=Math.max(max,d);}}
  const pct=100*n/(a.width*a.height); console.log(f, n, pct.toFixed(4)+"%", "maxDelta="+max, pct<=0.01&&max<=2?"STABLE":"UNSTABLE");
}'
```

**Done when** every line says `STABLE`.

### Step 11. Twenty Reset fix (`src/products/twenty/pages/object-filter.page.ts`)

```ts
/** Step 0 2026-10-15: one Escape leaves the floating-ui portal (listbox) mounted; a second closes it. */
const FLOATING_PORTAL = "[data-floating-ui-portal]";
const MAX_PORTAL_ESCAPES = 3;

  async closeFloatingPortals(): Promise<void> {
    // ADR 0006 rule gap: no-raw-locators flags string literals only; the portal has no role or test id of its own.
    const portals = this.page.locator(FLOATING_PORTAL);
    for (let i = 0; i < MAX_PORTAL_ESCAPES && (await portals.count()) > 0; i += 1) {
      await this.page.keyboard.press("Escape");
    }
    await expect(portals).toHaveCount(0, { timeout: twentyTimeouts().action });
  }

  async resetAndExpectChipGone(): Promise<void> {
    await this.resetUnsavedViewEdits();
    await expect(this.todayChip).toHaveCount(0);
  }

  async resetUnsavedViewEdits(): Promise<void> {
    await this.closeFloatingPortals();
    await this.page.getByRole("button", { name: "Reset", exact: true }).click();
  }
```

`resetAndExpectChipGone` loses its own Escape, because `resetUnsavedViewEdits` now owns closing the portal. **Regression gate:** P1-TW-TZ-X03 (`tests/twenty/tz/tz.spec.ts:330`). The fix isn't pure, so there's no unit test.

```bash
npm run test:twenty -- --grep "P1-TW-TZ-X03" --repeat-each=5 --retries=0
```

Expected: `5 passed`. Twenty must be up through the harness first.

### Step 12. Unit tests

Add exactly **16** tests: 15 in the two new files and 1 in the existing file, all tagged `@unit`.

`tests/unit/cal-booker-qa.spec.ts`:

1. `trpcPath("me/updateProfile")` gives `/api/trpc/me/updateProfile?batch=1`.
2. `trpcBatchBody({theme:"dark"})` deep-equals `{"0":{"json":{"theme":"dark"}}}`.
3. `parseTrpcEventType` on the Step 0 payload gives `{id:1534, slug:"probe-30"}`.
4. It throws `/error/` on `[{error:{json:{message:"x"}}}]`.
5. It throws `/no eventType/` when `id` is missing.
6. `LONG_NAME.length === 80`, `LONG_TITLE.length === 120`, and `LONG_NAME.startsWith("Pro Example")`.
7. `CAL_SLOTS_ROUTE` matches the Step 0 URL `/api/trpc/slots/getSchedule?input=%7B…` and not `/api/trpc/slots/reserveSlot?batch=1`.

`tests/unit/visual-layout.spec.ts`:

8. `projectSkipReason("visual-mobile", ["visual-mobile"])` is undefined.
9. For `"visual-tablet"` the message contains `visual-mobile`.
10. `rectsOverlap`: true when intersecting, false when edges touch.
11. `rectInsideWidth`: 1 px tolerance on each side.
12. `overflowingControls`: drops a box within tolerance and keeps a height overflow `{sh:29,ch:24}`.
13. `overlappingNeighbours` on the Step 0 spans (Sun 20/29/20/49, Mon 45/53/45/78) gives `["Sun/Mon"]`.
14. `overlappingNeighbours` on non-overlapping desktop-like spans gives `[]`.

`tests/unit/visual-helpers.spec.ts`, "visual docker argv" describe:

15. `dbPortFromUrl("postgresql://postgres:@localhost:5450/calendso")` is 5450, and it throws without a port.
16. **Update** the existing win32 test to assert both proxies (`3000` and `5450`), and **add** this test: both platforms set `PRODUCTS_ROOT=/tmp/p1-products`, `CAL_DB_URL=postgresql://postgres:@127.0.0.1:5450/calendso`, and an inner command starting with `mkdir -p /tmp/p1-products/cal`.

```bash
npm run test:unit
```

**Done when** exit 0 with **`134 passed`** (118 + 16).

### Step 13. ADR 0017 amendment (decisions changed; no other .md files)

Under **Decision**:

- Visual, a11y **and i18n** specs run only in visual-\* projects.
- The Docker wrapper forwards the Cal DB port as well as the web port, sets `CAL_DB_URL` to `127.0.0.1`, and stubs `PRODUCTS_ROOT`, because fixtures write QA users from inside the container.

Under **Consequences**:

- A slot click reserves that slot for every visitor for `MINUTES_TO_BOOK` (5). Specs never select `pro` slots; selection happens only on per-test QA users, whose teardown deletes their `SelectedSlots`.
- Dark baselines use the `darkThemeQaUser` fixture (tRPC `me/updateProfile`).

**Done when** `npx prettier --check docs/adr/0017-visual-baselines.md` exits 0.

### Step 14. Commit and push (explicit paths, no `git add -A`, no model trailer, no PR)

Three commits:

1. `fix(twenty): close floating portals before Reset in object filter`: `src/products/twenty/pages/object-filter.page.ts`.
2. `test(visual): phase 3 Cal batch helpers, fixtures and docker DB forwarding`: the config, `src/support/visual/*`, `scripts/visual-docker.mts`, `src/products/cal/{booker-qa,qa-user,fixtures,routes,testIds,visual}.ts`, unit specs and ADR.
3. `test(cal): VIS-001..004, I18N-001..003, A11Y-001..006 with baselines`: the specs, the `git mv`, and the 10 new PNGs listed in Step 10. Name each PNG path explicitly; never add a `__screenshots__` folder as a whole.

Before pushing, prove the old baselines were not touched:

```bash
git diff --name-only main...HEAD -- '*booker-pro-30min.png'   # must print nothing
git status --short -- '*booker-pro-30min.png'                 # must print nothing
git push -u origin feat/2026-10-15-p1-phase3-cal-batch
```

## Verification (paste the real output into the final report)

```bash
npm run check                         # exit 0
npm run test:unit                     # 134 passed
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:test   # 33 passed, 12 skipped
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:test   # same again
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:test -- --grep "P1-CAL-I18N"   # 9 passed (3 per project)
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:test -- --grep "P1-CAL-A11Y-00"  # 001-006: 10 passed, 8 skipped
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npx tsx -e "import('./src/products/cal/qa-user.ts').then(async (m) => console.log('qa users', await m.countCalQaUsers()))"   # qa users 0
```

Then:

- Run the Step 1 loop again. All non-visual rows must be unchanged; unit should read 134 tests in 19 files and each visual-\* project 15 tests in 10 files.
- Run the pixel-stability script; every line should read `STABLE`.
- **Slot-hold check (`pro`):** run this before the first visual run and after the last one. It must print `holds 0`; if not, wait 5 minutes and recheck.

```bash
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npx tsx -e "import('./src/products/cal/db.ts').then(async (m) => console.log('holds', await m.withCalPool(async (p) => (await p.query(\`SELECT count(*)::int AS n FROM \"SelectedSlots\" s JOIN users u ON u.id = s.\"userId\" WHERE u.username = 'pro' AND s.\"releaseAt\" > now()\`)).rows[0].n)))"
```

- **Slot-hold check (QA hosts):** run it right after the last visual run, inside the 5-minute hold window, so a broken teardown delete can't hide behind expiry. It must print `qa holds 0`. It counts live holds whose host is still a QA user (teardown didn't run) **or** no longer exists (the user was deleted but the `SelectedSlots` delete was skipped). Rows already expired are ignored; that covers the two expired Step 0 orphans.

```bash
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npx tsx -e "import('./src/products/cal/db.ts').then(async (m) => console.log('qa holds', await m.withCalPool(async (p) => (await p.query(\`SELECT count(*)::int AS n FROM \"SelectedSlots\" s LEFT JOIN users u ON u.id = s.\"userId\" WHERE s.\"releaseAt\" > now() AND (u.id IS NULL OR u.email LIKE 'qa-%@qa.local')\`)).rows[0].n)))"
```

## Traps

- **The clock must be in the future.** `freezeClock` before the first `goto`; 2030-01-14 is used everywhere.
- **`pro` is light-only:** `colorScheme` emulation does nothing for it. Dark goes through the QA-user fixture only.
- **Never click a `pro` slot.** The 5-minute hold breaks the 16-slot gate everywhere. Forms and bookings use `bookingQaUser`.
- **Never regenerate `booker-pro-30min`.** Every `visual:update` in this batch uses `--grep-invert "P1-CAL-VIS-001"` (`--update-snapshots=all` rewrites existing baselines with AA noise). The commit must not touch those three PNGs.
- **`SelectedSlots` is keyed by host.** `userId` is the event host (`reserveSlot.handler.ts`, `eventType.users`); the visitor is only the `uid` cookie. Teardown deletes by `userId`; don't change it to `uid`.
- **Docker Desktop needs the proxy** for port 3000 **and** 5450. `localhost` inside the container can be `::1`, which is why `CAL_DB_URL` uses 127.0.0.1.
- **`PRODUCTS_ROOT`** must be absolute when the wrapper runs on the host, and it's stubbed inside the container.
- **Escape alone is not enough for Twenty portals.** Close them and wait for `[data-floating-ui-portal]` to have count 0.
- **`test.fail` comes after the hard preconditions**, never at the top of a test.
- **Booking at 09:00 on the frozen day** shows "The event is in the past". A11Y-001 books Tue 15.
- **No DOM lib in tsconfig:** use string `page.evaluate` or local element interfaces (`SlotDom` pattern).
- **No `git add -A`:** `test-results/`, `playwright-report/` and `test-cal-run*.log` are present locally.
- **Git Bash:** prefix manual docker commands with `MSYS_NO_PATHCONV=1`, and run `set +H` before pasting anything with `!`.
- **Harness owns start/stop.** Never kill a Cal or Twenty pid; use `node node_modules/qa-portfolio-harness/scripts/down.mjs <product>`.

## Final report must include

- Step 0 evidence (the table above) for theme API and DB, slots URL, de/ar labels, keyboard order.
- Per case: pass or expected-fail.
- PRODUCT BUG list with evidence: VIS-004, A11Y-001 (focus to `<body>`), A11Y-003, A11Y-006 (`$` prefix), overlay `button-name` (existing allowlist entry). Note any allowlist entries added.
- Unit and visual counts, the stability lines, the leak count, and both slot-hold counts (`pro` and QA hosts).
- Proof the three `booker-pro-30min.png` baselines are untouched (the empty `git diff --name-only` from Step 14).
- Still open: task 6 (CI visual job and GH Pages), task 7 (DOC/TW visual and i18n), task 8 closeout, all MED-VIS/I18N.

## Decided questions (review, 2026-10-15)

1. **`$` prefix:** a proven PRODUCT BUG. A11Y-006 attaches evidence, calls `test.fail` on tablet and desktop, then `expect(dollar).toBe(0)`. Annotation-only was rejected as too weak.
2. **Focus to `<body>`:** a proven PRODUCT BUG. A11Y-001 asserts it at the end with the same evidence → `test.fail` → hard-assert pattern. A11Y-002 stays focus-ring and no-trap only.
3. **VIS-002:** asserting "wraps with no clip, overflow or overlap" is correct; the master plan allows ellipsis or wrap.
