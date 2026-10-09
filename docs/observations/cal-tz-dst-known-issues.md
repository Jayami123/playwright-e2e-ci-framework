# Cal TZ/DST known product issues (Phase 2a)

Recorded for portfolio test cases P1-CAL-TZ-003 (Kathmandu) and P1-CAL-DST-002 (US fall-back 01:30). These are marked with Playwright `test.fail` and `{ type: "issue" }` annotations, not silent observations.

## P7-OBS-CAL-TZ-003

Asia/Kathmandu (+05:45) on `pro/30min`: the first booker slot is 15 minutes off the organiser 09:00 grid (`deltaMs % 30min === 900000`). Adelaide aligns with Intl(organiser 09:00).

## P7-OBS-CAL-DST-002

On US fall-back Sunday with an isolated Sunday schedule, the booker lists both 1:30am instants (EDT and EST). `POST /api/book/event` for the first 1:30am (EDT) returns HTTP 409 `no_available_users_found_error`.

## P7-OBS-CAL-DST-003

On EU spring-forward Sunday (`Europe/London`, last Sunday of March 2027-03-28) with an isolated Sunday 00:00–17:00 schedule and viewer `Australia/Sydney`, Cal lists two slots before the Intl oracle: `data-time` `2027-03-27T23:00:00.000Z` and `2027-03-27T23:30:00.000Z` (Saturday 23:00/23:30 GMT, outside Sunday 00:00–17:00). Control case 2027-03-21 (non-transition Sunday) matches the oracle with no early slots.
