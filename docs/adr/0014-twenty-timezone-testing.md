# 0014. Twenty timezone UI E2E (DATE vs DATE_TIME, serial Jane TZ)

- Status: Accepted
- Date: 2026-10-15

## Context

Phase 2f task 4 (`twentycrm/twenty:v2.44.0`, Jane `jane.austen@apple.dev`). Step 0 probes (2026-10-15) and OBS-001 re-probe with Playwright trace (`test-results/obs001-reprobe-trace/`).

**Member TZ via API:** `twentyQa.setTimeZone(IANA)` + full `page.goto` updates Close date UI (e.g. `system`/Colombo `Jan 1, 2027 6:00 AM` → UTC `Jan 1, 2027 12:30 AM UTC`). API `readTimeZone()` matches. Not stuck on `localStorage` `"system"`.

**DATE vs DATE_TIME:** `pet.birthday` is DATE (`createPet({ name, birthday: "YYYY-MM-DD" })`). `opportunity.closeDate` is DATE_TIME ISO. TZ-001 uses pets; TZ-002/X01/X02 use opportunities with `2027-01-01T00:30:00.000Z`.

**Oracles:** Civil strings from `src/products/twenty/display.ts` (Node `Intl`, `en-US` MONTH_FIRST + 12-hour). E2E TZ abbrev from browser `page.evaluate` when the inline Close date cell renders `TimeZoneAbbreviation` (v2.44 live: **UTC** and **Honolulu** show `UTC` / `HST`; **Asia/Colombo** member TZ shows civil time only on record/table — no `GMT+5:30` suffix in the widget).

**Settings Experience:** Time zone opener is the Formats **value** button whose name starts with `(GMT` or `System settings · (GMT` (excludes Date/Time/Number format buttons). UTC option: `(GMT+00:00) Coordinated Universal Time`. Colombo: `(GMT+05:30) India Standard Time - Colombo`.

**OBS-001 (date-only on DATE_TIME):** Source (`products/twenty-CRM`, `DateTimePickerInput.tsx`): mask from `getDateTimeMask` is always **date + time**; `onComplete` runs only when `parseDateTimeInputStringToJSDate` succeeds on the full string (`useParseDateTimeInputStringToJSDate.ts`). Re-probe: typing `01/05/2027` leaves mask `01/05/2027 __:__ __`; **Enter** fires `UpdateOneOpportunity` with the **previous** `closeDate` (`2027-01-01T00:30:00Z`) — TEST BUG / incomplete mask, not bare-date product semantics. Filling `01/05/2027 12:00 PM` commits `2027-01-05T22:00:00Z`, UI `Jan 5, 2027 12:00 PM HST`. **No OBS-001 spec** until a cited bare-date intent exists; classified **OBSERVATION** in P7, not `test.fail()`.

**Serial Jane TZ:** Only `tests/twenty/tz/tz.spec.ts` and skipped `restores member TZ` in `fixture/self.spec.ts` write member TZ under `PW_WORKERS=2`.

**Sweep:** `P1-QA-` includes pets; log `pets=` is pet count at `before`.

## Decision

- Implement `tests/twenty/tz/tz.spec.ts` serial: TZ-001, TZ-002 (Colombo + UTC), X01, **X02 last**; tags `@twenty` `@twenty-tz`; `locale: "en-US"`.
- POMs: `object-table.page.ts`, `record.page.ts`, `settings-experience.page.ts` (time zone row button + dialog searchbox).
- Fixture: `createPet`/`destroyPet`, `rememberTimeZone()` for X02 Settings writes; destroy pets before TZ restore.
- Defer TZ-003 (task 5). No OBS-001 automated test in this task.

## Consequences

- `npm run test:twenty` must stay green at `PW_WORKERS=2` with serial TZ file.
- Twenty CI (next task) must use same seed (Pets object) and sweep pets.
- Close-date UI edit for future OBS work: opportunities **table** inline cell; full datetime mask required.
