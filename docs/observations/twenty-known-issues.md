# Twenty known product issues (Phase 4 batch 3)

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
