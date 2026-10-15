# 0015. Twenty DST calendar, relative filter, and CSV export

- Status: Accepted
- Date: 2026-10-15

## Context

Phase 2f task 5 (`twentycrm/twenty:v2.44.0`). Step 0 probes (2026-10-15) on Jane.

**TEST BUG (Jane left on Honolulu).** Probe start `FindOneWorkspaceMember` returned `timeZone: Pacific/Honolulu`, `updatedAt: 2026-10-14T21:17:24.804Z`, before this task wrote TZ. Task 4 X01's last GraphQL write is `Pacific/Honolulu`. Fixture `setTimeZone` wrote first and registered restore after. `setMemberTimeZone` can throw after persist (unit: returned IANA mismatch). A throw or a killed worker after the Honolulu write skips restore. Later runs then capture Honolulu as baseline. Fix: `createTimeZoneRestoreGuard` registers restore before the first write.

**Calendar, not table Group.** Table Group by is SELECT / many-to-one only. Custom Calendar on Close date, month layout, is the real UI. `GroupByOpportunities` sends `granularity: DAY` and member IANA. That payload is evidence only. The pass condition is the calendar day cell (Berlin civil day, not UTC day). March 2027 heading showed GMT+2 while day cells showed GMT+1; do not assert the heading abbrev.

**IS_TODAY.** Operand `Is today (<abbrev>)`. Chip is a button named `Close date : Today (GMT+14)` (Kiritimati, 2026-10-15). GraphQL is a client-computed UTC `gte`/`lt` range. X03 uses one `Date.now()`, today 00:30 visible, yesterday and tomorrow 00:30 absent, and `assertKiritimatiDateUnchanged` (fails with `clock crossed midnight`). Do not click Update view / Save as new view. Dismiss with **Reset** (unsaved-view control; inner chip X raced with the open filter flyout) so INDEX has no filter.

**X05.** Fall-back 02:30 CEST (`2027-10-31T00:30:00.000Z`) vs CET (`2027-10-31T01:30:00.000Z`) keep distinct labels (`GMT+2` vs `GMT+1`). Both rows visible (no dedup). Sort Close date Ascending is UTC order.

**X04 OBSERVATION.** Command Menu Export View. DATE_TIME CSV is UTC ISO; DATE CSV is `YYYY-MM-DD`. Assert CSV against fixture stored values. No `test.fail()`. Live X04 (2026-10-15): fixture and CSV `2027-01-01T00:30:00.000Z`, Colombo UI `Jan 1, 2027 6:00 AM GMT+5:30`. CSV-UTC vs UI-zoned is expected.

**Berlin Settings label (live, 2026-10-15).** TZ-003 `readTimeZoneValueLabel()` returned `(GMT+02:00) Central European Summer Time - Berlin`. E2E oracle is `/Berlin/`, not a hard-coded GMT offset (the picker string changes with DST).

**Locators.** `Filter` vs `Add filter` are different names, but `Filter` still has a wrapper `div role="button"` plus inner `<button>` (same trap as `Options`). Click the wrapper: `getByRole("button", { name: "Filter", exact: true }).filter({ has: getByRole("button", { name: "Filter" }) })`. The inner `<button>` is covered. Month nav click count comes from the UI heading, then assert `/^March 2027\b/` / `/^October 2027\b/`. No visibility loop.

**Twenty actionTimeout.** `twenty-chromium` inherited the root `actionTimeout` from Cal `TIMEOUTS[webMode].action`. A Twenty-only run uses Cal prod (`10_000`). TZ-003 view-picker click and X04 Command Menu click timed out at 10s after "done scrolling" on a loaded table (`repeat-each=3` run, 2026-10-15). Project `use.actionTimeout` / `navigationTimeout` now come from `twentyTimeouts()` (`action: 30_000`).

## Decision

- Serial Jane `@twenty-tz`: TZ-003, X03, X05, X04 before X02.
- POMs: `object-calendar.page.ts`, `object-filter.page.ts`; table Sort + Export View.
- Fixture: restore-before-write; `captureViewId`; destroy views on `/metadata`.
- Sweep `P1-QA-%` records and views; both `after=0`.
- GroupBy attach only. UI calendar day cell is the pass.

## Consequences

- `PW_WORKERS=2 npm run test:twenty` must stay green with serial TZ file and view sweep.
- Berlin Settings picker string may change at the next DST transition; refresh this ADR from a live `readTimeZoneValueLabel()`.
