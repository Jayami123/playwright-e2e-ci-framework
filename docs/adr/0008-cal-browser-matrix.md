# 0008. Cal cross-browser matrix (Firefox and WebKit)

- Status: Accepted
- Date: 2026-10-09

## Context

Phase 2c runs P1-CAL-TZ-001..004 and P1-CAL-2FA-001..003 on Firefox and WebKit in addition to Chromium. Upstream `@calcom/web` Playwright is Chromium-only. PR and push to `main` stay on `cal-chromium` (all 18 E2E cases plus setup). Nightly and manual dispatch run the `@tz|@2fa` subset on three engines.

## Decision

- **Playwright projects:** `cal-firefox` (`Desktop Firefox`) and `cal-webkit` (`Desktop Safari`), both `dependencies: ["cal-setup"]`, `testDir: ./tests/cal`, `grep: /@tz|@2fa/`, same Chrome-issued `storageState` as `cal-chromium` when the harness is live. One `cal-setup` avoids triple seed login; cookies are origin-scoped to `127.0.0.1`.
- **Scripts:** `npm run test:cal:firefox`, `test:cal:webkit`, `test:cal:matrix` (Firefox + WebKit; nightly/dispatch on Linux). **Windows local hard gate:** `test:cal` then `test:cal:firefox` only — skip WebKit on Windows.
- **TZ-002 isolation:** `BOOKING_WINDOW_OFFSET_BY_PROJECT` adds `cal-firefox: 7` and `cal-webkit: 14` days on the shared 90-day booking window so three TZ-002 bookings in one nightly job do not collide on `SelectedSlots`.
- **Flaky policy:** `failOnFlakyTests: Boolean(process.env.CI)` on PR and nightly. A retry-then-pass is a red step when `CI` is set.
- **CI artifacts:** When `run_browser_matrix` is true, each engine sets `P1_PW_REPORT_ID` (`chromium`, `firefox`, `webkit`) so JSON/JUnit/blob paths are suffixed; job summary headings include browser label and wall-clock seconds; uploads are `playwright-report-<id>` and `playwright-test-results-<id>`. Unset `P1_PW_REPORT_ID` keeps PR artifact names unchanged.
- **Workflow:** Extend existing [`.github/workflows/p1-e2e.yml`](../../.github/workflows/p1-e2e.yml) with `schedule: 0 18 * * *` and `workflow_dispatch` input `browser_matrix` (default false). Concurrency group `${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}`. Reusable [`e2e.yml`](../../.github/workflows/e2e.yml) input `run_browser_matrix`; matrix path passes `playwright_browsers_timeout_minutes: 20` and `install_firefox_webkit: true` on [playwright-browsers](../../.github/actions/playwright-browsers/action.yml). No separate nightly workflow file.
- **Out of matrix:** DST and FW cases stay Chromium-only; I18N/VIS are Phase 3.
- **Known bugs:** Unconditional `test.fail` plus `issue` annotations (TZ-003 Kathmandu, 2FA-002). No `browserName` conditions. If an engine stops reproducing, stop and triage before changing tests.
- **TOTP:** Current-step `generateTotpCode(secret, Date.now())` only ([ADR 0007](0007-cal-2fa-testing.md)).
- **Leftovers:** `npx tsx scripts/count-trial-qa.mts` prints trial QA counts plus `qaUsers` and `qaBookings`.

## Engine discovery (2026-10-09)

Playwright **1.63.0**. Firefox 155 (`firefox-1543`) and WebKit 26.6 (`webkit-2359`) installed on Windows for this task.

| Check                                                        | Chromium (prior probe)                                     | Firefox                            | WebKit                             |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| `--list --project=cal-*`                                     | 20 (full chromium)                                         | 12 (2 setup + 10 matrix)           | 12 (2 setup + 10 matrix)           |
| Booker `getByRole("combobox", { name: /timezone select/i })` | 1                                                          | not verified (matrix gate pending) | not verified (matrix gate pending) |
| Slot `getByTestId("time")`                                   | 14 on fixed Oct 2026 day (prior probe)                     | not verified                       | not verified                       |
| 2FA OTP focus after Submit                                   | `keyboard.type` path ([ADR 0007](0007-cal-2fa-testing.md)) | not verified                       | not verified                       |

**Windows WebKit (2026-10-09):** Playwright WebKit on **win32** cannot render Cal’s booker — `getByTestId('booker-container')` stayed hidden for 60s+ on `/pro/30min` while Chromium/Firefox on the same host were fine. Treat as **environment** (Windows WebKit build), not a Cal product defect. **WebKit is verified only on Linux CI** (`test:cal:webkit` / matrix dispatch); do not gate Windows PRs on WebKit.

**Caveat:** Dynamic `openFirstAvailabilitySlot` in specs is the authoritative booker path. Treat nightly/dispatch logs as source of truth for WebKit.

## Consequences

- Nightly self-hosted job runs up to three sequential matrix legs (Chromium full suite is still run first on matrix nights to keep one harness `up()`).
- PR duration unchanged (Chromium only).
- See [0006](0006-cal-timezone-testing.md) for TZ oracle detail; matrix does not change oracles.
