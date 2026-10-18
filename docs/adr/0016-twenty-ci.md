# 0016. Self-hosted Twenty on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-15

## Context

Phase 2f adds Twenty CRM timezone and fixture coverage (`P1-TW-TZ-*`) against `twentycrm/twenty:v2.44.0` on `http://127.0.0.1:3002` via `qa-portfolio-harness` `#v0.2.8`. Session model is UI login storageState ([ADR 0012](./0012-twenty-ui-storage-state.md)); QA data uses pinned GraphQL ([ADR 0013](./0013-twenty-qa-api-fixture.md)). Unlike Documenso, Twenty is a pinned Docker image with no Node 24 Remix build on the runner.

Cold CI runners have empty Docker volumes; first-boot `compose --wait` (300s `start_period`) and `workspace:seed:dev` duration was unknown at plan time. ADRs 0005, 0009, and 0011 do not cover Twenty image cache, compose-only fork checkout, `PW_WORKERS=2`, YAML sweep gate, Chromium-only, retries 0, 60-minute timeout, Redis digest logging, or cache save `continue-on-error`.

## Decision

- **Job:** `twenty-chromium` in reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml). Independent of `CAL_E2E_BASE_URL`. Path filter output `twenty`; non-PR events always run Twenty (same as Cal/Documenso).
- **Fork:** Checkout [Jayami123/twenty-CRM](https://github.com/Jayami123/twenty-CRM) at pinned `TWENTY_REF` only for harness compose cwd (`packages/twenty-docker`); no fork edits. Stub sibling product dirs under `PRODUCTS_ROOT`.
- **Start/stop:** YAML runs harness `up.mjs twenty` (timed → `$GITHUB_STEP_SUMMARY`) then Playwright; `globalSetup` skips `up()` when `/healthz` is 200 and runs `seed()` (timed in setup). `always()` harness `down.mjs twenty`. Do not set `P1_PLAYWRIGHT_HARNESS=0`.
- **Retries:** `retries: 0` on `twenty-setup` and `twenty-chromium` plus `npm run test:twenty -- --retries=0` (same flake-is-red policy as Documenso; Cal keeps CI `retries: 2`).
- **Workers:** `PW_WORKERS=2` in CI; serial Jane TZ file remains the only TZ writer; existing fixture TZ-restore skip when `workers > 1` unchanged.
- **Browsers:** Chromium only; no Twenty Firefox; no `--repeat-each`.
- **Timeout:** `twenty_chromium_timeout_minutes` default **60**; raise only with measured `up`/`seed` seconds from a failed run.
- **Docker image cache:** Key `${{ runner.os }}-twenty-images-v2.44.0` (exact key, no restore-keys). Restore/load or pull `twentycrm/twenty:v2.44.0`, `postgres:16`, `redis`, `axllent/mailpit:v1.22.3`. **Save** only on `push` to `main` after cache miss; `continue-on-error: true` on save only.
- **Redis:** Fork compose uses `image: redis` (`:latest`); log `docker inspect` digest each run; do not pin in the fork.
- **Sweep:** `scripts/count-twenty-qa-leaks.mts` after tests (`always()` when `up` succeeded). Fail if `after>0` or `viewsAfter>0` on every event; fail if `before>0` on `schedule` only (`P1_TWENTY_SWEEP_FAIL_ON_BEFORE=1`). Global teardown stays skipped on `CI`.
- **Artifacts:** `!cancelled()` Playwright report and test-results; compose logs (`server`, `worker`, `db`) on failure with secret-line redaction.
- **Nightly alert:** `results-twenty-chromium.json` via `P1_PW_REPORT_ID=twenty-chromium` on schedule/browser matrix.
- **Required check:** After **two** green `e2e / twenty-chromium` runs on `main`, add the required check in GitHub settings manually—not in the wiring PR.

## Alternatives

- **Probe-only first dispatch** (Documenso Node 24 / secure-context): rejected; Twenty image already proven locally.
- **Harness PR for CI mode:** rejected; `#v0.2.8` already supports env, ports, and seed.
- **90-minute job timeout:** rejected; hides hangs; 60 with measured evidence if seed overruns.

## Consequences

- First PR run supplies authoritative `up` and seed seconds, Redis digest, and Playwright totals in the job summary.
- Image cache save failure does not fail the job; next run pulls from Hub.
- Documenso PR-path test-results upload uses `!cancelled()` (aligned with matrix uploads).
- [ADR 0012](./0012-twenty-ui-storage-state.md) and [ADR 0013](./0013-twenty-qa-api-fixture.md) consequences updated: Twenty runs in CI under this job.

## Amendment (Phase 4 batch 3: CSV import and TOTP 2FA)

- **2FA member per test.** 2FA tests never touch Jane or the shared worker member. `freshTwentyMember` provisions a member with `provisionQaMember` (email `p1-qa-<seed>-<worker>-f<n>@example.test`, under the `p1-qa-%` leak prefix) and deletes it with its own bearer, which survives enabling 2FA. `enrolledTwentyMember` enrols it through the API. An extra anonymous context is created with an explicitly empty `storageState`, because `browser.newContext()` inherits the test's.
- **Secret capture.** The UI shows no secret as text. The page object clicks "setup key" and reads the clipboard (`clipboard-read` and `clipboard-write` permissions), validating the 16-character base32 shape without logging it. The enrolment code is typed once (`click` plus `pressSequentially`): `fill` after a wrong code sends a stale value.
- **TOTP window.** The server accepts the current step and one either side (`window: 1`). X02 mints at an epoch from `epochMsForStableTotpMint(10_000)` so the offsets cannot cross a step boundary.
- **CSV contract.** Imports are partial: rows with errors are skipped after the "Finish flow with errors" confirm and the rest import (CSV-003, CSV-004). A row whose email matches an existing person updates that person (upsert, data-loss risk, CSV-X01). The row limit is 10,000. Writes go through `batchCreateManyRecords` in batches of 200.
- **Cleanup and leak coverage.** CSV tests use the worker QA member, never Jane, and clean up by bulk `destroyPeople` in chunks of 100 (the server limit `MUTATION_MAXIMUM_AFFECTED_RECORDS`), checking each chunk's returned count and recounting zero. The leak sweep now finds imported people by first name **or** lowercase email prefix, because imports carry the prefix in the email.
- **Known bugs and oracles.** TW-CSV-X07, TW-2FA-X01 and TW-2FA-X05 are `test.fail` tests with evidence; TW-CSV-F-01 and the `/welcome` stall are recorded in [twenty-known-issues.md](../observations/twenty-known-issues.md). axe was dropped from CSV-X07's oracle because `aria-hidden-focus` reports nothing on the open confirm; the role tree and DOM ancestry carry it.
- **Probe against build.** The probe saw an empty CSV stay on Upload; the build shows the prompt staying while the stepper advances to Match Columns. Asserted as observed (two runs plus two re-runs, file confirmed 0 bytes).
- **`/welcome` stall.** About 1.0% of cold loads serially and 3.5 to 4.5% with two workers leave the sign-in form as a loader after the title renders (every request finished, no errors). All 27 observed stalls issued a duplicate `GetPublicWorkspaceDataByDomain`. `TwentyLoginPage.goto()` now waits for the title with the full 30 s, gives the form a 20 s grace (healthy gap: median 0.15 s, maximum 6.2 s over 888 loads), and reloads once, recording a `known-issue` annotation. The final two full runs (24 to 26 minutes, 32 tests, 0 flaky) saw **no** stall, so they show only that healthy loads still work; the reload path is covered by unit tests, not by an end-to-end run.
- **Timing.** One worker locally: `tz` 7.2 to 7.8 min, `csv-edge` 6.4 to 7.7, `csv-import` 3.4 to 3.7, `2fa` 3.6 to 3.7, whole suite 23.9 to 26.0 min. The three new files add 13.5 to 15 minutes locally, at the planned limit. CI is measured on the pull request run; workers, sharding, the saved-login check and a smaller 10,000-row test are the backlog items that win it back. The job timeout stays 60 minutes.

## Amendment (Phase 4 batch 4: live updates, concurrency and RTL)

- **Two users.** `twentyQaMember` (A) is the test's `page`. A worker-scoped peer `twentyQaPeer` (B, `p1-qa-<seed>-<worker>-peer@example.test`, under the leak prefix) is provisioned once per worker and deleted with its own bearer; `peerPage` opens B's own storage state through `openMemberPage(browser, statePath)`, whose path is required. Once per worker both contexts open `/settings/profile` and assert their own email. Both are Members who can edit Companies and Opportunities; Jane is never written to.
- **`browser.newContext()` inherits Jane.** In `twenty-chromium` a bare context starts with the project `storageState` (three cookies). `provisionQaMember` now creates its context with an explicit empty state; without it the second provisioning in a worker landed on a signed-in page and the `/welcome` form never appeared.
- **Real-time transport.** Twenty pushes record events over SSE (`graphql-sse`, `POST /metadata`, `Accept: text/event-stream`), not WebSocket. A page is ready for events only after its own query is added to the stream: the first `AddQueryToEventStream` is for the agent chat thread (about 11 s after load), a record page adds `record-show-<kind>-<id>` and a filtered list `record-table-virtualized-person` 4 to 10 s later. Tests wait for the response that carries that query id (and the list's filter) before the other user acts. Latency (A's response to B's visible value) is attached, never asserted: list median about 150 ms, record page about 500 ms in the probe.
- **No offline test, on purpose.** `context.setOffline(true)` leaves an open SSE stream delivering frames; a true cut needs a fault on the stream body; the client then reconnects after `random() x 120 s`; and Playwright's clock breaks the reconnect (after `runFor`/`fastForward` no new stream opens and live updates stop, 3 of 3). RT-003 and RT-004 are therefore findings in [twenty-known-issues.md](../observations/twenty-known-issues.md), not tests. No stream-fault helper was added.
- **Concurrent edits.** Same-field saves are a silent last write wins (both 200, no warning, the stored value is always one of the two). Different fields both persist. A Kanban drag and an amount edit both persist. A save into a soft-deleted record returns 200 and writes the deleted row (observation; the live deleted banner seen in the probe did not appear live in the build runs, so LU-X02 records it and asserts the API state and the banner after a reload).
- **One round per test.** A round is two full page loads per user (15 to 25 s each under load), so two rounds in one test took 90 to 120 s of the 120 s timeout. LU-001, LU-002 and LU-X01 run one round each, and the timeout is not raised. They first ran as 10, 10 and 3 single-round tests, which added about 7 minutes to the CI job on one worker; P1 is functional UI E2E, so the repeated soak moved to P6 as P6-TW-RACE-001 and the file now runs in parallel mode.
- **Kanban.** `locator.dragTo` moved a card 0 of 5 times; 20 `mouse.move` steps worked 25 of 25. The column header is the button with `aria-expanded`; every column also has a "New" add-record button of the same name. The board is a per-test view with a prefix filter, so another worker’s board never shows its cards.
- **RT-002 is a product bug** (TW-RT-002-F1): a matching create raises the filtered list’s count but its row never appears (17 of 17 in the probe), against Twenty’s own `triggerCreateRecordsOptimisticEffect` contract.
- **Arabic.** `ar-SA` ships, sets `<html dir="rtl" lang="ar-SA">` (late: polled), mirrors the sidebar, columns and Settings navigation, and adds no axe violations over English on People, a person record and Settings. The Filter button is translated, so the People list is scoped by a saved view (`createView` TABLE plus a `CONTAINS` filter and two view fields; a view with no fields renders no columns). Geometry and clipping asserts run at 1440 px, where they were probed; 393 and 820 px keep baselines only (at 393 px two Settings sidebar buttons clip in Arabic, not compared with English). The axe test runs per page with a 240 s timeout (named exception, precedent `contrast.a11y.spec.ts`).
- **`e2e / visual` as a required check.** The `protect-main` ruleset requires lint, typecheck, and the three self-hosted jobs, not `e2e / visual`. The last six runs on `main` passed it, so it can be turned on; that is a ruleset change for the repository owner, not made here. Dependabot PR #38 fails only because the aggregator reports that its Medusa job did not run, so it does not block the switch.
