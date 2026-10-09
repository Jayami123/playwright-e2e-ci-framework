# 0006. Cal timezone and DST testing

- Status: Accepted
- Date: 2026-10-08

## Context

Phase 2a adds P1-CAL-TZ-001..004 and P1-CAL-DST-001..003 as black-box Playwright tests against the self-hosted Cal harness (`qa-portfolio-harness` `#v0.2.1`). The portfolio test-case doc assumed `pro` availability of 09:00–17:00 Europe/London; that had to be read from seed/API, not copied from the doc. Slot generation runs on the Cal **server** with real time, so `page.clock` cannot drive DST cases.

## Discovery (read from the running harness DB, 2026-10-08)

Postgres on `127.0.0.1:5450` / `calendso` (harness compose). Prisma maps `User` to table `users`; `EventType`, `Schedule`, `Availability`, and `Booking` keep quoted PascalCase names.

| Fact                        | Value                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed user `pro@example.com` | `users.timeZone` = `Europe/London`                                                                                                                                                                                                                                               |
| Default schedule            | Name `Working Hours`, `Schedule.timeZone` = `null` (organiser TZ is the user TZ)                                                                                                                                                                                                 |
| Availability                | Weekdays `days = [1,2,3,4,5]` (Mon–Fri), `startTime` / `endTime` = `09:00:00` / `17:00:00` local civil time                                                                                                                                                                      |
| `pro/30min`                 | `periodType` = `unlimited`, `periodDays` = `null`, `length` = 30, `minimumBookingNotice` = 120 minutes                                                                                                                                                                           |
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

TZ-003 (Kathmandu +05:45 / Adelaide): full-list `toEqual` against `expectedSlotLabelsForViewerDay`, uniqueness, 30-minute spacing **within each organiser-day group** (Adelaide spillover leaves a legitimate cross-day gap), and per-slot grid alignment vs Intl entries. Kathmandu calls **`test.fail` only after** slots are loaded (not during DB/setup). See [cal-tz-dst-known-issues.md](../observations/cal-tz-dst-known-issues.md).

**Locator exceptions (brief-rule):** booker `selectSlotByIso` uses a dynamic `` `[data-time="…"]` `` filter when labels duplicate on fall-back; `playwright/no-raw-locators` has a **rule gap** (only string literals are flagged), so the POM uses an inline comment rather than an unused `eslint-disable`. Next.js dev overlay uses `nextjs-portal` with one disable in `app-shell.ts`. ESLint enforces `playwright/no-nth-methods`, `playwright/no-raw-locators`, `playwright/no-wait-for-timeout`, and `playwright/require-tags` (tags on test `tag` options, not titles). Availability day rows use Cal `data-testid="<Weekday>"` and `${dayName}-switch`; hour pickers use documented `nth(0)` / `nth(1)` on the range row because Cal LazySelect comboboxes have no accessible name (possible Cal a11y finding for P7). Event types **New** uses `getByRole("main").getByTestId("new-event-type").filter({ visible: true })` (Cal renders duplicate anchors in CI; the hidden copy is outside the visible main tree). **Set as default** on the schedule editor uses `getByRole("switch", { name: /set to default/i }).filter({ visible: true })` (Cal labels the control via `<Label htmlFor="hiddenSwitch">`; possible duplicate `id="hiddenSwitch"` on desktop vs mobile layouts — **unverified**, P7). Schedule delete uses `getByTestId("schedules")` → `listitem` filtered by schedule link name → `schedule-more`.

## Server-side oracle (TZ-002, DST-002)

Not used: API v2 `GET /v2/bookings/{uid}` (process is not running on the harness).

Used:

1. Success page `/booking/{uid}`: visible **When** row (`toBookingSuccessWhenLine`: `2:30 PM - 3:00 PM (India Standard Time)` via Intl; oracle normalizes the start segment to booker `h:mma`).
2. Read-only Postgres via harness `createPgClient` (`SELECT "startTime" FROM "Booking" WHERE uid = $1`).

Both must equal the **Intl-computed** expected instant for the chosen viewer day and slot (from `expectedSlotEntriesForViewerDay` / booking helpers), which must match the clicked slot’s `data-time`. Success UI is asserted with `toContainText` on the normalized start label (no XPath). Teardown cancels through `POST /api/cancel` with a CSRF token from the organiser session (not the guest page).

## DST dates vs booking window

`periodType=unlimited` means March 2027 is in range. `minimumBookingNotice=120` only drops slots inside the notice window; TZ-001 and TZ-002 pick the first weekday at least **`MIN_LEAD_DAYS` (2)** ahead (or the booking-window offset for TZ-002) in the viewer TZ with no organiser **busy time** in that viewer day: accepted/pending `Booking` rows plus unreleased `SelectedSlots` (`releaseAt > now()`, Cal slot hold ~5 minutes).

DST transition dates use `nextTransitionStrictlyAfterLeadDays` (strictly after today + `MIN_LEAD_DAYS`), not “on or after today”.

DST transitions are **Sundays**. Seed availability is Mon–Fri 09:00–17:00, so 01:30 / 02:00 never appear on `pro/30min`. DST specs use an **isolated named schedule** on `trial@example.com` (Sunday 00:00–17:00 organiser TZ, assigned on the event type Availability select, **not** “Set as default”) plus an isolated 30-minute event type. DST-003 uses overnight 00:00–17:00 `Europe/London` so slots cross the 01:00 UTC spring-forward.

Example transitions from 2026-10-08 with lead days applied in specs:

- US spring-forward (2nd Sunday of March): 2027-03-14
- US fall-back (1st Sunday of November): 2026-11-01 (or next year when today is that Sunday + lead)
- EU spring-forward (last Sunday of March): 2027-03-28

`page.clock` is **not** used. The server would still generate slots from wall clock.

DST-002 is **`test.fail`** with `{ type: "issue", description: "P7-OBS-CAL-DST-002: …" }`. The spec still asserts booking the **first** 1:30am slot (EDT instant from `fromZonedCivil`) and matching DB/success UI; observed on harness Cal `v6.2.0-sh`: both 1:30am instants list and `POST /api/book/event` returns HTTP 409 `no_available_users_found_error`. No fallback slots.

DST-003 is **`test.fail`** with `{ type: "issue", description: "P7-OBS-CAL-DST-003: …" }` after slots load. Early-slot evidence ISOs are derived from organiser local midnight on the computed EU spring-forward Sunday minus 60/30 minutes (`organiserMidnightEarlySlotIsos`); for 2027-03-28 that is `2027-03-27T23:00:00.000Z` / `2027-03-27T23:30:00.000Z` (outside Sunday 00:00–17:00 London). Control **P1-CAL-DST-003-control** uses the Sunday one week earlier (`euSpringForwardControlSunday`). See [cal-tz-dst-known-issues.md](../observations/cal-tz-dst-known-issues.md).

## Data isolation

- FW specs keep using seed `pro` and `/pro/30min` for read-only TZ-001/003/004.
- Bookings (TZ-002, DST-002) use Faker-prefixed attendee emails `qa-<run>-…@qa.local`, isolated event types, and `POST /api/cancel` in fixture teardown.
- Organiser TZ/availability changes never touch `pro`. DST provisioning runs as `trial` via `.auth/cal-trial.json` from the setup project. `CAL_DST_EMAIL` / `CAL_DST_PASSWORD` are **required** in env (no code fallbacks). Self-hosted CI uses public Cal seed fixtures only (never echoed; `cal-setup` trace off). Per-run Faker organiser remains an open option, not implemented.
- `isolatedSundayEvent` fixture: create schedule → create event type → assign schedule on the event type → assert Sunday row; teardown cancel booking → delete event type → delete schedule (schedule delete failure is **not** tolerated).
- TZ-002 booking dates use `bookingWindowOffsetDays(testInfo)` (`BOOKING_WINDOW_OFFSET_BY_PROJECT` + worker index) so parallel workers do not double-book `pro`.
- Guest booker flows use an empty `storageState` so the public page is not the organiser session.
- Local harness cleanup: `npm run cal:restore-trial` (idempotent: promote **Working Hours** when DB default name is not Working Hours, then delete `sch-qa-*` via UI; uses `readDefaultScheduleName` gate).

## Timezone in Playwright

Per-describe `test.use({ timezoneId })` (context option). Expected labels are computed with `Intl` in `src/core` (`toZonedLabel`, `expectedSlotEntriesForViewerDay`, DST date helpers). TZ-001 compares the full label list for one viewer date in the spec body. Pure helpers use the **`unit`** project (`npm run test:unit`; `npm_lifecycle_event=test:unit` skips harness `globalSetup`).

The existing auto `timezoneHandler` dismisses Cal’s “Don’t update” dialog so FW tests are not blocked.

## Tags and CI

Specs use `@tz` / `@dst` plus priority annotations (`P0`/`P1`/`P2`). Three cases are expected failures until the product issues are fixed (TZ-003 Kathmandu, DST-002, DST-003). PR project remains `cal-chromium` only (webkit/firefox is Phase 2c).
