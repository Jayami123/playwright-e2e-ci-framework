# 0006. Cal timezone and DST testing

- Status: Accepted
- Date: 2026-10-08

## Context

Phase 2a adds P1-CAL-TZ-001..004 and P1-CAL-DST-001..003 as black-box Playwright tests against the self-hosted Cal harness (`qa-portfolio-harness` `#v0.2.1`). The portfolio test-case doc assumed `pro` availability of 09:00–17:00 Europe/London; that had to be read from seed/API, not copied from the doc. Slot generation runs on the Cal **server** with real time, so `page.clock` cannot drive DST cases.

## Discovery (read from the running harness DB, 2026-10-08)

Postgres on `127.0.0.1:5450` / `calendso` (harness compose). Prisma maps `User` to table `users`; `EventType`, `Schedule`, `Availability`, and `Booking` keep quoted PascalCase names.

| Fact                        | Value                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed user `pro@example.com` | `users.timeZone` = `Europe/London`                                                                                                                                  |
| Default schedule            | Name `Working Hours`, `Schedule.timeZone` = `null` (organiser TZ is the user TZ)                                                                                    |
| Availability                | Weekdays `days = [1,2,3,4,5]` (Mon–Fri), `startTime` / `endTime` = `09:00:00` / `17:00:00` local civil time                                                         |
| `pro/30min`                 | `periodType` = `unlimited`, `periodDays` = `null`, `length` = 30, `minimumBookingNotice` = 120 minutes                                                              |
| Re-seeds                    | Multiple `Working Hours` rows exist for `pro`; tests read availability via `COALESCE(users."defaultScheduleId", first Schedule.id for user)` (mirrors Cal `ScheduleRepository.getDefaultScheduleId`), joined to `Availability` ordered by `a.id ASC`; never mutate that schedule |

`usa@example.com` is `America/Phoenix` (no DST). `trial@example.com` is used only for isolated DST schedules (not FW-001..004).

API v2 (`CAL_API_BASE_URL` `:5555`) is **not** started by harness `up()`. `authenticate()` probes that port; it is the wrong oracle here.

## Booker URL and locators

Booker store (`packages/features/bookings/Booker/store.ts`) reads:

- `?month=YYYY-MM`
- `?date=YYYY-MM-DD`
- `?cal.tz=<IANA>` (store timezone; distinct from booker localStorage)

Jumping to a month/date is done with those query params, not calendar clicks. Stable locators (page objects only):

| Surface     | Locator                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Booker root | `getByTestId("booker-container")`                                                                                                         |
| Slot button | `getByTestId("time")` plus `data-time` (ISO UTC instant)                                                                                  |
| Slot label  | dayjs `h:mma` / `HH:mm` from `timeFormat` (browser locale; Playwright `en-US` → 12-hour, lowercased, no space: `9:00am`)                  |
| TZ select   | `aria-label="Timezone Select"` (`TimezoneSelectComponent`); options `getByTestId("select-option-<IANA>")`                                 |
| Confirm     | `getByTestId("confirm-book-button")`                                                                                                      |
| Success     | `/booking/{uid}` with `data-testid="success-page"`; start time text is read from the **When** grid row (no dedicated test id in Cal v6.2) |
| Cancel      | CSRF from `GET /api/csrf?sameSite=none`, `POST /api/cancel` (Next.js, served by the harness web process)                                  |

TZ switcher persistence: `timePreferencesStore` writes `localStorage["timeOption.preferredTimeZone"]`. TZ-004 asserts that after reload the timezone select still shows `America/New_York` and the first slot label still matches the New York Intl expectation.

TZ-003 (Kathmandu +05:45 / Adelaide): full-list `toEqual` against `expectedSlotLabelsForViewerDay`, uniqueness, 30-minute spacing, and per-slot grid alignment vs Intl entries. Kathmandu calls **`test.fail` only after** slots are loaded (not during DB/setup). See [cal-tz-dst-known-issues.md](../observations/cal-tz-dst-known-issues.md).

**Locator exceptions (brief-rule):** booker `selectSlotByIso` filters by `[data-time]` when labels duplicate on fall-back; Next.js dev overlay uses `nextjs-portal` (no roles). Availability day rows use Cal `data-testid="<Weekday>"` and `${dayName}-switch`; hour pickers are `getByRole("combobox", { name: <current 12h label> })`.

## Server-side oracle (TZ-002, DST-002)

Not used: API v2 `GET /v2/bookings/{uid}` (process is not running on the harness).

Used:

1. Success page `/booking/{uid}`: visible **When** row start time (normalized `h:mma` label in the viewer/attendee TZ).
2. Read-only Postgres via harness `createPgClient` (`SELECT "startTime" FROM "Booking" WHERE uid = $1`).

Both must equal the **Intl-computed** expected instant for the chosen viewer day and slot (from `expectedSlotEntriesForViewerDay` / booking helpers), which must match the clicked slot’s `data-time`. Success UI is asserted with `toContainText` on the normalized start label (no XPath). Teardown cancels through `POST /api/cancel` with a CSRF token from the organiser session (not the guest page).

## DST dates vs booking window

`periodType=unlimited` means March 2027 is in range. `minimumBookingNotice=120` only drops slots inside the notice window; TZ-001 picks the first weekday at least **`MIN_LEAD_DAYS` (2)** ahead in the viewer TZ with no accepted/pending bookings (read-only booking query).

DST transition dates use `nextTransitionStrictlyAfterLeadDays` (strictly after today + `MIN_LEAD_DAYS`), not “on or after today”.

DST transitions are **Sundays**. Seed availability is Mon–Fri 09:00–17:00, so 01:30 / 02:00 never appear on `pro/30min`. DST specs use an **isolated named schedule** on `trial@example.com` (Sunday 00:00–17:00 organiser TZ, assigned on the event type Availability select, **not** “Set as default”) plus an isolated 30-minute event type. DST-003 uses overnight 00:00–17:00 `Europe/London` so slots cross the 01:00 UTC spring-forward.

Example transitions from 2026-10-08 with lead days applied in specs:

- US spring-forward (2nd Sunday of March): 2027-03-14
- US fall-back (1st Sunday of November): 2026-11-01 (or next year when today is that Sunday + lead)
- EU spring-forward (last Sunday of March): 2027-03-28

`page.clock` is **not** used. The server would still generate slots from wall clock.

DST-002 is **`test.fail`** with `{ type: "issue", description: "P7-OBS-CAL-DST-002: …" }`. The spec still asserts booking the **first** 1:30am slot (EDT instant from `fromZonedCivil`) and matching DB/success UI; observed on harness Cal `v6.2.0-sh`: both 1:30am instants list and `POST /api/book/event` returns HTTP 409 `no_available_users_found_error`. No fallback slots.

## Data isolation

- FW specs keep using seed `pro` and `/pro/30min` for read-only TZ-001/003/004.
- Bookings (TZ-002, DST-002) use Faker-prefixed attendee emails `qa-<run>-…@qa.local`, isolated event types, and `POST /api/cancel` in fixture teardown.
- Organiser TZ/availability changes never touch `pro`. DST provisioning runs as `trial` via `.auth/cal-trial.json` from the setup project. `CAL_DST_EMAIL` / `CAL_DST_PASSWORD` are **required** in env (no code fallbacks). Self-hosted CI uses public Cal seed fixtures only (never echoed; `cal-setup` trace off). Per-run Faker organiser remains an open option, not implemented.
- `isolatedSundayEvent` fixture: create schedule → create event type → assign schedule on the event type → assert Sunday row; teardown cancel booking → delete event type → delete schedule (schedule delete failure is **not** tolerated).
- TZ-002 booking dates use `bookingWindowOffsetDays(testInfo)` (`BOOKING_WINDOW_OFFSET_BY_PROJECT` + worker index) so parallel workers do not double-book `pro`.
- Guest booker flows use an empty `storageState` so the public page is not the organiser session.
- Local harness cleanup: `npm run cal:restore-trial` (idempotent: promote **Working Hours** only when not already default; deletes `sch-qa-*`; UI only).

## Timezone in Playwright

Per-describe `test.use({ timezoneId })` (context option). Expected labels are computed with `Intl` in `src/core` (`toZonedLabel`, `expectedSlotEntriesForViewerDay`, DST date helpers). TZ-001 compares the full label list for one viewer date in the spec body. Pure helpers use the **`unit`** project (`npm run test:unit`; `npm_lifecycle_event=test:unit` skips harness `globalSetup`).

The existing auto `timezoneHandler` dismisses Cal’s “Don’t update” dialog so FW tests are not blocked.

## Tags and CI

Specs use `@tz` / `@dst` plus priority annotations (`P0`/`P1`/`P2`). Two cases are expected failures until the product issues are fixed (TZ-003 Kathmandu, DST-002). PR project remains `cal-chromium` only (webkit/firefox is Phase 2c).
