# 0006. Cal timezone and DST testing

- Status: Accepted
- Date: 2026-10-08

## Context

Phase 2a adds P1-CAL-TZ-001..004 and P1-CAL-DST-001..003 as black-box Playwright tests against the self-hosted Cal harness (`qa-portfolio-harness` `#v0.2.1`). The portfolio test-case doc assumed `pro` availability of 09:00–17:00 Europe/London; that had to be read from seed/API, not copied from the doc. Slot generation runs on the Cal **server** with real time, so `page.clock` cannot drive DST cases.

## Discovery (read from the running harness DB, 2026-10-08)

Postgres on `127.0.0.1:5450` / `calendso` (harness compose). Prisma maps `User` to table `users`; `EventType`, `Schedule`, `Availability`, and `Booking` keep quoted PascalCase names.

| Fact                        | Value                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Seed user `pro@example.com` | `users.timeZone` = `Europe/London`                                                                           |
| Default schedule            | Name `Working Hours`, `Schedule.timeZone` = `null` (organiser TZ is the user TZ)                             |
| Availability                | Weekdays `days = [1,2,3,4,5]` (Mon–Fri), `startTime` / `endTime` = `09:00:00` / `17:00:00` local civil time  |
| `pro/30min`                 | `periodType` = `unlimited`, `periodDays` = `null`, `length` = 30, `minimumBookingNotice` = 120 minutes       |
| Re-seeds                    | Multiple `Working Hours` rows exist for `pro`; tests read `ORDER BY s.id ASC` and never mutate that schedule |

`usa@example.com` is `America/Phoenix` (no DST). `trial@example.com` is `Europe/London` and is **not** used by FW-001..004.

API v2 (`CAL_API_BASE_URL` `:5555`) is **not** started by harness `up()`. `authenticate()` probes that port; it is the wrong oracle here.

## Booker URL and locators

Booker store (`packages/features/bookings/Booker/store.ts`) reads:

- `?month=YYYY-MM`
- `?date=YYYY-MM-DD`
- `?cal.tz=<IANA>` (store timezone; distinct from booker localStorage)

Jumping to a month/date is done with those query params, not calendar clicks. Stable locators (page objects only):

| Surface     | Locator                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booker root | `getByTestId("booker-container")`                                                                                                                                    |
| Day cell    | `getByTestId("day")` (`data-disabled`); date number is the accessible text                                                                                           |
| Slot button | `getByTestId("time")` plus `data-time` (ISO UTC instant)                                                                                                             |
| Slot label  | dayjs `h:mma` / `HH:mm` from `timeFormat` (browser locale; Playwright `en-US` → 12-hour, lowercased, no space: `9:00am`)                                             |
| TZ select   | `aria-label="Timezone Select"` (`TimezoneSelectComponent`); options `getByTestId("select-option-<IANA>")`                                                            |
| Confirm     | `getByTestId("confirm-book-button")`                                                                                                                                 |
| Success     | `/booking/{uid}` with `data-testid="success-page"`                                                                                                                   |
| Cancel      | Success page `getByTestId("cancel")` then `confirm_cancel`; CSRF from `GET /api/csrf?sameSite=none`, `POST /api/cancel` (Next.js, served by the harness web process) |

TZ switcher persistence: `timePreferencesStore` writes `localStorage["timeOption.preferredTimeZone"]`. Reload keeps that key unless `cal.tz` is in the URL. TZ-004 records whichever behaviour is observed (`test.info().annotations`), and only asserts that labels re-render after the in-page switch.

TZ-003 (Kathmandu +05:45 / Adelaide): uniqueness and consecutive 30-minute UTC spacing are hard assertions. Observed on 2026-10-08: Adelaide first slot matches Intl(organiser 09:00); Kathmandu first slot is 15 minutes off that grid (`deltaMs % 30min === 900000`). That looks like a product 45-minute-offset quirk and is recorded as a P7 observation rather than a failing assertion.

## Server-side oracle (TZ-002, DST-002)

Not used: API v2 `GET /v2/bookings/{uid}` (process is not running on the harness).

Used:

1. Confirmation page `/booking/{uid}` (and redirect query `startTime` / `attendeeStartTime` when present).
2. Read-only Postgres via harness `createPgClient` (`SELECT "startTime" FROM "Booking" WHERE uid = $1`). That is the stored UTC instant and the same DB the web app writes.

UI and DB must agree. Teardown cancels through `POST /api/cancel` with a CSRF token from the Next.js app (not a product fork change).

## DST dates vs booking window

`periodType=unlimited` means March 2027 is in range. `minimumBookingNotice=120` only drops slots in the next two hours; tests pick a **future** weekday/DST date, never today.

DST transitions are **Sundays**. Seed availability is Mon–Fri 09:00–17:00, so 01:30 / 02:00 never appear on `pro/30min`. DST-001/002 therefore use an **isolated schedule** on `trial@example.com` (Sunday hours covering 00:00–08:00 organiser TZ, schedule TZ `America/New_York`) plus an isolated 30-minute event type. DST-003 uses an isolated Sunday schedule in `Europe/London` on the same dedicated user so `pro` is untouched.

Computed next occurrences from 2026-10-08 (not hard-coded in specs):

- US spring-forward (2nd Sunday of March): 2027-03-14
- US fall-back (1st Sunday of November): 2026-11-01
- EU spring-forward (last Sunday of March): 2027-03-28

`page.clock` is **not** used. The server would still generate slots from wall clock.

DST-002 (observed 2026-10-08 on harness Cal `v.6.2.0-sh`): the booker lists both 1:30am instants (`2026-11-01T05:30:00.000Z` EDT and `2026-11-01T06:30:00.000Z` EST). `POST /api/book/event` for **either** overlap instant returns **HTTP 409** `no_available_users_found_error`. The test records those as P7 observations, then tries 3:30am then 9:00am on the same computed Sunday and asserts the oracle UTC equals **the clicked** `data-time`. Booking uses `/booking/{uid}` plus Postgres; API v2 is not used.

## Data isolation

- FW specs keep using seed `pro` and `/pro/30min` for read-only TZ-001/003/004.
- Bookings (TZ-002, DST-002) use Faker-prefixed attendee emails `qa-<run>-…@qa.local` and `POST /api/cancel` in fixture teardown.
- Organiser TZ/availability changes never touch `pro`. DST setup logs in as `trial` / password `trial` (seed convention: password = username), creates a uniquely named schedule and event type, and deletes both in teardown even on failure (`tolerateMissing`).
- Parallel workers: default `PW_WORKERS=1`. Collision avoidance still applies if workers increase: unique event-type titles and schedule names (`qa-${runId()}-…` plus `workerInfo.parallelIndex`), unique attendee emails, and per-test event types so two workers cannot book the same `pro/30min` slot.
- Isolated DST/TZ-002 journeys use `timeouts().isolatedJourney` (300s prod) because they login as `trial`, create a schedule and event type, then book as a guest. DST-002 may retry a later slot when Cal 409s the overlap hour.
- The isolated DST schedule is toggled **Set as default** on `trial` before creating the event type so the new type inherits Sunday hours. After create, the editor Availability tab is asserted to show that named schedule and a Sunday row (the schedule `<Select>` is a react-select dummy input outside the viewport, so we do not click it). Harness Postgres is read-only (`createPgClient`); we do not UPDATE `EventType` from tests. Teardown deletes the event type first, then the schedule.
- Guest booker flows use an empty `storageState` so the public page is not the organiser session.

## Timezone in Playwright

Per-describe `test.use({ timezoneId })` (context option). Expected labels are computed with `Intl` in `src/core` (`toZonedLabel`, DST date helpers). Product locators stay under `src/products/cal`.

The existing auto `timezoneHandler` dismisses Cal’s “Don’t update” dialog so FW tests are not blocked. TZ-001 still asserts browser `timezoneId` because an empty localStorage falls through to `dayjs.tz.guess()` / `CURRENT_TIMEZONE`, which follows Playwright’s TZ. If a run shows labels stuck on London, that is recorded as a P7 observation rather than a guessed product bug.

## Tags and CI

Specs use `@tz` / `@dst` plus priority annotations (`P0`/`P1`/`P2`). PR project remains `cal-chromium` only (webkit/firefox is Phase 2c).
