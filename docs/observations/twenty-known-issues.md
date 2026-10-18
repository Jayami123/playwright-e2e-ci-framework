# Twenty known product issues (Phase 4 batches 3 and 4)

Recorded during Phase 4 batch 3 against `twentycrm/twenty:v2.44.0` (fork `Jayami123/twenty-CRM` @ `7cbdfec6f346b43715bc2056932f4fad5886f733`, read as source reference only). Probe output lives outside the repository in `D:\Jayami\Portfolio\welcome-probe-out\` and is not committed.

## TW-LOGIN-F-01 (`/welcome` form never replaces its loader)

**Label:** PRODUCT BUG: front-end race in the Twenty v2.44.0 sign-in page. The exact internal cause is not isolated (see Not proven).

**Observed:** `/welcome` renders "Welcome, <workspace>." but the sign-in form stays a loader dot, and the email textbox never appears. It never recovers within 30 s. The page is not slow: every request has finished, nothing is pending, and there are no console errors, page errors or server errors. Seen as the `getByRole("textbox")` timeout at `login.page.ts:9` in the Jane setup login (CI run 38931396826; local full run 2, which skipped the other 31 tests; and an X04 re-run) and in 2FA-002.

**Evidence (all on 2026-10-17/18, harness v0.2.11, image v2.44.0):**

| Mode                                                  | Loads | Stuck loader | Rate | Loads with the duplicate query | Stuck among those |
| ----------------------------------------------------- | ----: | -----------: | ---: | -----------------------------: | ----------------: |
| Serial, clean probe                                   |   200 |            2 | 1.0% |                              5 |               2/5 |
| 2 workers in parallel, clean probe                    |   200 |            7 | 3.5% |                              8 |               7/8 |
| 2 workers, probe v2 (fetch wrapper and hook stub on)  |   200 |            9 | 4.5% |                              9 |               9/9 |
| 2 workers, probe v2 with client-config state          |   200 |            7 | 3.5% |                              7 |               7/7 |
| Delay sweep (first response, page chunk, second), mix |   110 |            2 | 1.8% |                              2 |               2/2 |

- Every one of the 27 stuck loads issued `GetPublicWorkspaceDataByDomain` **twice** (549 requests against a baseline of 548). Four loads with the duplicate passed, so the duplicate is necessary but not sufficient.
- Load raises the rate (1.0% serial against 3.5 to 4.5% with two workers). The instrumentation did not change it (control batch of 20 loads: 0 stuck). Delaying the first response (50 to 3000 ms), the `SignInUp` page chunk (500, 2000 ms) or the second response (600 ms) did not make the duplicate or the stall appear on demand.
- Both fetches originate from `ObservableQuery._subscribe`, so two separate `useQuery` observers fetch (the global `WorkspaceProviderEffect` and the `SignInUp` page, both through `useGetPublicWorkspaceDataByDomain`). The second request starts 0 to 140 ms after the first one finishes and takes 1 to 130 ms.
- On the stuck page every input to the form's loader condition is settled. Fork source, `pages/auth/SignInUp.tsx`: the form is a loader while `getPublicWorkspaceDataLoading || !clientConfigApiStatus.isLoadedOnce`. Read from the live React fibers after the 30 s stall: both Apollo observers `loading: false`, `networkStatus: 7`, with data (18 stuck loads); React's own `useQuery` snapshots `loading: false` (16 stuck loads); `clientConfigApiStatus` is `isLoadedOnce: true, isLoading: false, isErrored: false, isSaved: true, hasData: true` in every hook that reads it (7 stuck loads), identical to a passing load. Everything the loader depends on is "ready" and the DOM still shows the loader, so the page did not re-render after the state settled.
- Commit and unmount counts on stuck loads (React commits 14 to 16, unmounts 28 to 34) fall inside the range of passing loads (commits 12 to 16, unmounts 28 to 57). They do not show a remount.
- Server and worker logs around the stalls contain only the usual "2 workspaces found in database" warning.

**Slow but healthy loads:** passing loads reach an enabled textbox up to 12.9 s serial, 17.4 s with two workers and the probe, and **26.6 s** with two clean workers (p95 16.7 s). Across 888 healthy loads the form follows the workspace title by a median of 0.15 s, p95 0.54 s, p99 1.2 s and at most 6.2 s (one load). The 30 s page budget leaves little headroom, so any fix must not shorten it.

**Not proven:** why `SignInUp` does not re-render. The probe read the loader's inputs but not the component's own hook state, so a stale `useMemo` or a missed subscription update are both consistent with the evidence.

**Expected:** once the workspace data and client config are loaded, the sign-in form replaces the loader.

**Handling:** the failure is still a product bug and is not fixed here. `TwentyLoginPage.goto()` (`src/products/twenty/pages/login.page.ts`) now waits for the title with the full 30 s budget, gives the form a 20 s grace (more than three times the largest healthy gap), and reloads once when the title is shown and the form is still absent. Each reload is logged and added to the report as a `known-issue` annotation carrying `TW-LOGIN-F-01`, so the stall stays visible and countable. A page with no title yet is never reloaded.

**Probe output (not committed):**

- `D:\Jayami\Portfolio\welcome-probe-out\20261017-231312` serial, 200 loads
- `D:\Jayami\Portfolio\welcome-probe-out\20261017-233905-parallel2` two workers, 200 loads
- `D:\Jayami\Portfolio\welcome-probe-out\20261018-000127-sweep` delay sweep
- `D:\Jayami\Portfolio\welcome-probe-out\20261018-002818-probe2-par` probe v2, 200 loads
- `D:\Jayami\Portfolio\welcome-probe-out\20261018-005331-probe2-par-cc` probe v2 with client-config state, 200 loads

## Observation: the sign-in title is not a heading (`/welcome`)

**Observed:** the workspace title "Welcome, Apple." is a plain `<div class="f5jqen4" data-duration="normal">` with no `role="heading"` and no `h1` to `h6` element. Playwright resolves `getByText("Welcome,")` to that div, the accessibility snapshot of the stalled page lists it as `text: Welcome, Apple.`, and a heading role query cannot match it (trace and error-context of the TW-LOGIN-F-01 probe, 2026-10-17/18).

**Expected (standard):** the page title is exposed as a heading (WCAG 2.2 SC 1.3.1 Info and Relationships).

**Handling:** observation only, no test. It is the reason `TwentyLoginPage` locates the title by text.

## TW-CSV-F-01 (the import modal layer hides its own messages and confirm from assistive technology)

**Label:** PRODUCT BUG candidate (same layer as TW-CSV-X07 below; the shared cause is probable, not proven).

**Observed:** while the "Import data" dialog is open, the toast region is `<div role="region" aria-label="Notifications" aria-hidden="true" data-base-ui-inert="">`. The "Too many records. Up to 10000 allowed" toast (`<div role="status" aria-live="polite" title="Too many records. Up to 10000 allowed">`) lives inside it. It is on screen but a role query finds nothing: `getByRole("status").filter({ hasText })` timed out after 30 s while the toast was in the DOM (trace snapshot of CSV-X04, run 2026-10-17). The "Exit import flow" confirm that Close opens past the first step behaves the same way: its "Exit" button is visible, but `getByRole("button", { name: "Exit" })` timed out after 30 s in two runs, while `getByText("Exit")` finds it. The ancestors of the Exit button were not inspected.

**Expected (standard):** status messages are announced without moving focus (WCAG 2.2 SC 4.1.3 Status Messages), and a visible confirm button is exposed as a button (SC 4.1.2 Name, Role, Value).

**Evidence:** CSV-X04 failure and trace (`toast-1` inside the `aria-hidden` Notifications region), CSV-X05 failure (Exit button not found by role, found by text). `TwentyImportWizardPage` locates both by text for that reason.

**Handling:** no dedicated test yet; the two locators are commented as the workaround.

## TW-CSV-X07 (`P1-TW-CSV-X07`): the "Finish flow with errors" Submit is hidden from assistive technology

**Observed:** the confirm's Submit is `<button tabindex="0">` inside `div[aria-hidden="true"][data-base-ui-inert]`, so it is focusable but absent from the role tree: `getByRole("button", { name: "Submit" })` count 0, while `getByText("Submit")` finds one, and the DOM ancestry check reports an `aria-hidden` ancestor (`submitRoleCount: 0, submitUnderAriaHidden: true, submitTextCount: 1`, identical in three full runs).

**Expected (standard):** the Submit is exposed as a button (WCAG 2.2 SC 4.1.2).

**axe is not part of the oracle:** axe `aria-hidden-focus` on the open confirm reports 0 violations, 22 passes and 3 incomplete nodes (`#root` and two focus guards, none of them the Submit), and the only violation in that state is `color-contrast` on the page behind it. The likely reason is that axe tolerates focusable content under `aria-hidden` while a modal dialog is open; that was not confirmed. No other rule was substituted.

**Handling:** the working path (confirm text visible, Submit by text works) is hard-asserted in CSV-003. X07 attaches the evidence, calls `test.fail(true, …)` and then asserts the strict role query.

## TW-2FA-X01 (`P1-TW-2FA-X01`): a TOTP code that already signed in is accepted again

**Observed:** the same code used in two separate login contexts signs both in. The second use is not refused (`secondUseRefused: false`) and the second context lands on `/objects/` (`secondUseLandedOnObjects: true`), in every run.

**Expected (standard):** OWASP ASVS 4.0.3 V2.8.4 (a time-based OTP can be used only once within its validity period); support: RFC 6238 section 5.2.

**Evidence:** probe A-13 (3 runs) and the test evidence above. Source: the check is stateless (`totp.strategy.ts:125`) and no used-code store exists in `two-factor-authentication.service.ts:150-207`.

## TW-2FA-X05 (`P1-TW-2FA-X05`): the 2FA login code field has no accessible name

**Observed:** the challenge textbox has an empty accessible name; 0 textboxes match `/code/i`; axe rule `label` reports the `input` node (`accessibleName: ""`, `namedCount: 0`, `axeViolationIds: ["label"]`, `axeTargets: ["input"]`).

**Expected (standard):** a non-empty accessible name (WCAG 2.2 SC 4.1.2).

## TW-RT-002-F1 (`P1-TW-RT-002`): a record created through the API raises another user’s filtered list count but its row never appears

**Label:** PRODUCT BUG: Twenty’s own client contract is that a matching create is inserted into every cached list whose filter matches.

**Observed:** user B has People filtered by a name prefix and one seed row. User A creates a matching person through `POST /rest/people` (201). B’s stream is live: an update of the seed row reaches B’s list in 128 to 400 ms, and the view count then reads "All People · 2" while one row is shown. The new row is still absent 15 s later, with no navigation. Probe 17 of 17 creates (11 + 6), and the build runs repeat it.

**Expected (source):** on an SSE `CREATED` event the client inserts the record into every cached list whose filter matches (`useTriggerOptimisticEffectFromSseCreateEvents.ts` calls `triggerCreateRecordsOptimisticEffect({ shouldMatchRootQueryFilter: true })`, which filters with `isRecordMatchingFilter`). Count and rows must agree (precedent: TW-VIS-004).

**Handling:** RT-002 asserts the working path hard (REST 201, the API shows two matches, the anchor update arrives, the count reads "· 2"), attaches `known-bug-evidence`, calls `test.fail(true, …)` and then asserts the new row is visible. An unfiltered list is not used as the oracle: another worker’s people land in it and its row inserts miss (24 of 29).

## Observations (asserted as observed, no standard violated)

- **X05 empty file (probe against build):** the probe saw an empty CSV stay on Upload. In the build the upload prompt does stay on screen (two runs plus two re-runs, file confirmed 0 bytes), but the stepper moves to "Match Columns" over a blank dropzone, and Close then asks "Exit import flow". Both are the same dialog; the probe looked only at the prompt.
- **CSV-X01 (upsert):** importing a row whose email belongs to an existing person updates that person (same id, first name overwritten) with no per-row error. This silently overwrites data.
- **CSV-X03 (cancel):** Cancel after "200 out of 1,000" keeps whole 200-row batches (200 or more, fewer than 1,000, a multiple of 200) and shows no message.
- **CSV-X02 (concurrent import):** the same 10-row file imported from two contexts at once creates no duplicate email (single-round UI smoke; multi-round concurrency belongs to P2).
- **2FA-X03:** enabling 2FA keeps a session that was open before. **2FA-X04:** Reset 2FA asks only for the typed email, no code, and the next login has no challenge.
- **2FA-X02:** codes one step either side of now sign in; two steps are refused (`window: 1`).

## Observations from batch 4 (live updates, concurrent edits, RTL)

- **O-01 `setOffline` does not cut the event stream.** `context.setOffline(true)` leaves Twenty’s open SSE stream delivering frames (7 frames in 10 s, 3 of them `UPDATED company`), while follow-up `fetch` calls fail. A real cut needs `setOffline` plus a fault on the `text/event-stream` body.
- **O-03 reconnect backoff is random up to 120 s.** After a true cut and `setOffline(false)`, the client reconnects after `random() × 120000` ms (seen 7, 28, 48, 78 s, and once more than 150 s). 1 s only in a development build (`useHandleSseClientConnectionRetry.ts`, `SseConnectionRetryMaxWaitTimeInMs.ts`).
- **O-04 (RT-003, not built) missed edits never reach the record page after reconnect.** Three edits made while the stream was cut never showed on the record page without a reload (240 s, 150 s, 150 s; one run had reconnected at 7.2 s and issued no `FindOneCompany`). On reconnect the client resyncs only the metadata store (`SSEClientEffect.tsx`).
- **O-05 (RT-004, not built) a list converges after reconnect, with no duplicates.** Both rows created while cut appeared at 30.2 s and 49.9 s, after the list refetched on reconnect. Only after the random backoff.
- **O-07 Playwright’s clock breaks the reconnect.** With `context.clock.install()` the app works and live updates arrive (255 to 609 ms), but after `runFor(130_000)` or `fastForward(130_000)` no new `text/event-stream` request opens in 40 s and later live edits stop arriving (3 of 3). A test built on it would test a state the product never reaches, so RT-003 and RT-004 are findings, not tests.
- **O-LU-01 silent last write wins.** Two users saving the same company name at once: both saves return 200, the stored name is always one of the two (20 of 20 in the probe, 10 of 10 rounds in the build), and no warning, alert or dialog appears.
- **O-LU-02 a loser can keep its own value.** In 1 of 20 probe rounds, B kept showing its own losing name 2.5 s after both saves while A and the API had A’s value; a reload fixed it. LU tests therefore assert after reload.
- **O-LU-03 live stage lag.** B’s record page showed A’s Kanban move within 2.5 s in only 6 of 10 and 7 of 10 probe rounds.
- **X-02 a save into a soft-deleted record succeeds (possible data-integrity issue, no documented contract).** B’s Tagline editor is open, A soft-deletes the company, B presses Enter: `UpdateOneCompany` returns 200 with no toast, the row stays soft-deleted (`deletedAt` set) with B’s tagline, and the live count is 0. The probe saw the "This record has been deleted" banner and "Restore" **live**; in the build runs the banner never appeared live (4 of 4, with the record subscription ready and with the editor open), and appears after a reload. LU-X02 therefore records `bannerLive`, the save status and the stored tagline in `x02-observation.json` and asserts only the API state and the banner after a reload.
- **O-RT-05 unfiltered list inserts miss.** 24 of 29 API-created people appeared in an unfiltered People list without a reload (mostly the first create after load missed), so it is not used as an oracle.
- **O-RTL-01 the Arabic catalog covers built-in strings, not custom objects.** Under `ar-SA` the sidebar standard objects (Companies, People, Opportunities, Tasks, Notes), Create, Filter, Sort, Options and the column headers are Arabic; custom objects (Rockets, Pets, Survey results, Employment Histories, Pet Care Agreements, Star History) stay English. The probe (E-07) read People, Companies, Create, Fields and Timeline as English in some pages; the Docker run did not reproduce that for the People page. The translated Filter button is why the RTL People list is scoped by a saved view, not the English-only filter UI.
- **O-RTL-02 no bidi isolation of user data.** An Arabic name with Latin and digits ("P1-PROBE-…-سارة / العتيبي 42") renders its digits beside the Latin prefix in the LTR UI; user data has no `dir="auto"` or `<bdi>`. Not tested: no normative requirement.
- **Arabic RTL passes.** `ar-SA` sets `<html dir="rtl">`, the sidebar and Settings navigation mirror to the right, no page scrolls horizontally, no button overflows, and axe finds the same serious and critical violations as English on People, a person record and Settings.
- **Test-design facts.** `browser.newContext()` inherits the project’s `storageState` (Jane): the three cookies of Jane’s state appear in a bare context, so member provisioning now passes an explicit empty state. The first `AddQueryToEventStream` on a page is for the agent chat thread (about 11 s after load); a record page adds `record-show-<kind>-<id>` and a filtered list `record-table-virtualized-person` 4 to 10 s later, so readiness is matched on those query ids and the filter. Kanban `locator.dragTo` moved a card 0 of 5 times; 20 mouse steps 25 of 25. The "New" add-record button of every column shares the stage header’s name; only the header has `aria-expanded`.

## Tests

`tests/twenty/import/csv-import.spec.ts` (CSV-001..004), `tests/twenty/import/csv-edge.spec.ts` (CSV-X01..X07), `tests/twenty/auth/2fa.spec.ts` (2FA-001..002, X01..X05). `tests/twenty/live/concurrency.spec.ts` (LU-001 and LU-002 as one test per round, LU-X01, LU-X02), `tests/twenty/live/realtime.spec.ts` (RT-001, RT-002), `tests/twenty/i18n/rtl.i18n.spec.ts` (VIS-X07). RT-003 and RT-004 are findings, not tests. Each known-bug test asserts its working path, attaches `known-bug-evidence`, calls `test.fail(true, <issue>)` and then asserts the strict expectation.
