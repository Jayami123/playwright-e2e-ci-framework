# Phase 4 batch 4: Twenty live updates, concurrent edits and Arabic RTL

## Context

Batch 4 is the last Phase 4 batch and closes the Twenty map. It covers concurrent edits by two users (P1-TW-LU-001..002), real-time propagation and reconnect (P1-TW-RT-001..004), Arabic RTL (P1-TW-VIS-X07), and whether `e2e / visual` should be a required check. A two-run live probe on harness v0.2.11 backs every assertion below.

Both gates passed. **(a)** Two independent P1-QA members, each signed in through `login.page.ts` in its own context, both with the Member role, which can edit Companies and Opportunities. **(b)** Twenty pushes record events over **SSE** (`graphql-sse`, `POST /metadata`, `Accept: text/event-stream`), and B's list and record page update without a reload.

The probe changed four things in the original scope:

1. **The offline cases cannot be honest UI tests here (RT-003, RT-004).** `context.setOffline(true)` does **not** cut Twenty's open SSE stream: frames keep arriving. With a true cut, the client reconnects only after a random 0–120 s backoff (seen 7 s, 28 s, 48 s, 78 s, and once more than 150 s). After reconnecting, the record page never shows the edits it missed. Playwright's clock cannot skip the backoff either: with `clock.install()` the app works, but after `runFor` or `fastForward` the stream never re-opens and live updates stop (O-07, 3 of 3). Those two cases become documented findings and are not built (OQ1).
2. **RT-002 is a deterministic PRODUCT BUG.** A record created through the API that matches B's filtered list raises the list's count live ("· 2"), but its row never appears (17 of 17 creates). That breaks Twenty's own client contract.
3. **Kanban drag and drop needs mouse steps.** `dragTo` worked 0 times out of 5; 20-step mouse moves worked 25 out of 25.
4. **Arabic ships and mirrors.** `ar-SA` sets `<html dir="rtl">`, and axe finds nothing new compared with English.

Jayami reviewed the plan on 2026-10-18; her edits are applied and the answers are in §19.

## 1. Header

- Repo: `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1.
- Branch: `feat/2026-10-18-p1-phase4-batch4-twenty` (named by Jayami). This plan is its first commit.
- Base: **main @ `d859453`**. SHA read: `git checkout main && git pull` gave "Already up to date", and `git rev-parse HEAD` gave `d859453a42fb63fcb3a1baec3c068ea1c03676be`. PR #41 is merged: `gh pr view 41` shows `MERGED`, `mergedAt 2026-10-18T01:00:08Z`, and merge commit `d859453`, which is on main as the "Merge pull request #41" commit. The working tree is clean.
- Harness: `qa-portfolio-harness#v0.2.11` (`package.json:37`). The local checkout has `git describe` = `v0.2.11` and HEAD `f96038f951c8d62521ac60098661a851df9f65bb`.
- Twenty: image `twentycrm/twenty:v2.44.0` (harness `src/config.ts:65`). Fork `Jayami123/twenty-CRM` @ **`7cbdfec6f346b43715bc2056932f4fad5886f733`** (`git describe` = `sdk/v2.43.0-127-g7cbdfec6f3`), read as source reference only. Two untracked paths are present (`packages/twenty-docker/docker-compose.validation.yml`, `scripts/`). They are not ours and were not touched.
- Ports: app `http://127.0.0.1:3002` (harness `src/config.ts:54`), Postgres `127.0.0.1:5434` (harness `src/config.ts:59`). P1 accepts only 127.0.0.1 (`src/products/twenty/env.ts:10-11,76-80,95-97`).
- Env names (values never printed): `TWENTY_BASE_URL`, `TWENTY_IMAGE_TAG`, `TWENTY_DB_URL`, `TWENTY_EMAIL`, `TWENTY_PASSWORD` (P1 `.env.example:56,59,65,68,69`; all commented out, so the defaults apply). Harness `.env`: `grep -c '^TWENTY_[A-Z_]*=.\+' .env` gave `3`. No value was required.
- Start: `node scripts/up.mjs twenty` (stack already up, idempotent) and `npm run smoke -- twenty`, which returned `currentUser.email=jane.austen@apple.dev (HTTP 200)`, `pg { ok: 1 }`, "smoke ok". The stack is **still running**; stopping it waits for Jayami's go-ahead.
- Probes: Playwright 1.63.0 Chromium from P1's `node_modules`, run with `npx tsx`, importing P1's own fixtures (`provisionQaMember`, `memberApi`, `setQaMemberPrefs`, `TwentyPeoplePage`, `axeScan`). All records were named `P1-PROBE-<ts>-…` and all members `p1-probe-<ts>-<x>@example.test`. Scripts, JSON and screenshots stay in the session scratchpad (`…/scratchpad/probe/`). No filled login form was screenshotted or snapshotted.
- Structure and depth: [2026-10-11-phase-2e-task3-2fa.md](2026-10-11-phase-2e-task3-2fa.md). Process and helpers: [2026-10-17-p1-phase4-batch3-twenty.md](2026-10-17-p1-phase4-batch3-twenty.md). ADR 0016 (Twenty CI) and ADR 0017 (visual).

## 2. Step 1: probe findings (run 1 / run 2)

"r1" and "r2" are separate script runs. Where only one run exists, the row says so and the build step that re-checks it is named.

### Gate (a): two independent users

| #    | Step                         | Request / UI                                                                                                                                                                             | Expected                         | Observed r1 / r2                                                                                                                                                                                                         | Verdict                                             |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| G-01 | Provision two members        | `provisionQaMember` (`qa-member.ts:98-189`): `QaInvite` → `signUpInWorkspace` → `getAuthTokensFromLoginToken`, then the UI `/welcome` through `TwentyLoginPage` (`qa-member.ts:153-155`) | two members, each with a session | r1: A 22.8 s, B 17.7 s. r2: C 13.9 s, D 14.5 s                                                                                                                                                                           | Pass                                                |
| G-02 | Role                         | `POST /metadata getRoles` (Jane, read only)                                                                                                                                              | recorded                         | r1: both are in **Member** (`canUpdateAllObjectRecords: true`, `canSoftDeleteAllObjectRecords: true`, `canDestroyAllObjectRecords: true`, `canUpdateAllSettings: false`). The Admin role has 1 member, neither QA member | Pass                                                |
| G-03 | B edits A's records          | API `updateCompany`, `updateOpportunity` with B's bearer; UI `UpdateOneCompany` / `UpdateOneOpportunity`                                                                                 | allowed                          | r1 API: 200 with new values. UI (LU runs r1 and r2): B's `UpdateOneCompany` returned 200 in 40 of 40 rounds and `UpdateOneOpportunity` in 20 of 20                                                                       | Pass: a Member can edit Companies and Opportunities |
| G-04 | Each context is its own user | `/settings/profile`: the email is a **disabled textbox** whose value is the member's email                                                                                               | own email only                   | r1: my locator was wrong (`getByText(email)` found 0, because the email is a textbox value, not text). r2: A, B, C and D each showed only its own email, never the other's (4 of 4)                                      | Pass (r2); build Step 3 re-checks                   |
| G-05 | Delete                       | `deleteQaMember` with each member's own bearer                                                                                                                                           | 0 left                           | r1 and r2: all 4 deleted, `countQaMembers` = 0 each, `workspaceMembers(userEmail like 'p1-probe-%')` = 0                                                                                                                 | Pass                                                |
| G-06 | Jane never written           | Jane is used only for the invite hash, `getRoles` and counts                                                                                                                             | read only                        | no write ran with Jane's session                                                                                                                                                                                         | Pass                                                |

**Gate (a) passes.** No harness or fork change is needed.

### Gate (b): real-time mechanism (A edits a person's Job Title, B watches)

| #    | Step               | Request / frame                                                                                                                                                                                                                                                                                             | Expected | Observed r1 / r2                                                                                                                                             | Verdict                |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| B-01 | Transport          | `POST /metadata` with `Accept: text/event-stream`, one per page. Source: `graphql-sse` `createClient({ url: …/metadata, credentials: 'include', retryAttempts: Infinity })` (fork `twenty-front/src/modules/sse-db-event/components/SSEClientEffect.tsx:56-69`)                                             | recorded | r1 and r2: one stream each for B's list, B's record page and A                                                                                               | **SSE, not WebSocket** |
| B-02 | Frames             | `event: next`, data `onEventSubscription { eventStreamId, objectRecordEventsWithQueryIds[{ objectRecordEvent { action, objectNameSingular, recordId, userId, workspaceMemberId, properties { updatedFields before after diff } }, queryIds }], metadataEvents, queueJobEvents }` (`OnEventSubscription.ts`) | recorded | r1: B's list got 16 frames and B's record page 25; r2: 17 and 25. Frames include `UPDATED person <id>` and `UPDATED timelineActivity`, plus empty heartbeats | Recorded               |
| B-03 | A's save           | `POST /graphql UpdateOnePerson` (hover the value, click the hover-portal copy, then the textarea with placeholder "Job Title", then Enter)                                                                                                                                                                  | 200      | 20 of 20                                                                                                                                                     | Pass                   |
| B-04 | B's filtered list  | the row by name shows the new Job Title, no reload (URL unchanged)                                                                                                                                                                                                                                          | live     | **10 of 10 / 10 of 10**. Latency from A's response to B visible: r1 126–357 ms (median 149), r2 41–351 ms (median 142)                                       | Pass                   |
| B-05 | B's record page    | the fields widget shows the new value, no reload                                                                                                                                                                                                                                                            | live     | **10 of 10 / 10 of 10**. r1 463–1,287 ms (median 548), r2 214–1,082 ms (median 470)                                                                          | Pass                   |
| B-06 | Subscription ready | `POST /metadata AddQueryToEventStream 200` after the page loads                                                                                                                                                                                                                                             | recorded | 11.2 s and 18.0 s after `goto` (R-05, R-06). An event that arrives before this is not delivered to that list                                                 | Readiness signal (D3)  |

**Gate (b) passes.**

### Concurrent edits

| #    | Case                                                                        | Steps                                                                                                                                                                                              | Observed r1 / r2                                                                                                                                                                                                                                                                                            | Verdict                              |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| L-01 | **LU-001** same field (company name), 10 rounds per run, fresh company each | both on `/object/company/<id>`; hover the heading, click it, then textbox "Name"; fill A/B; `Promise.all` Enter                                                                                    | Final value: r1 A 8 / B 2, r2 A 4 / B 6. **Always one of A/B (20 of 20)**. API agrees with both UIs after reload in 20 of 20. Both `UpdateOneCompany` returned 200 every round. Response spread 0–349 ms. **No conflict warning in any round** (`status`/`alert`/`alertdialog` count 0)                     | Pass (silent last write wins)        |
| L-02 | LU-001 before refresh                                                       | heading text 2.5 s after both saves                                                                                                                                                                | 39 of 40 views showed the winner. **r2 round 1: B kept showing its own losing value** while A and the API had A's value; a reload fixed it                                                                                                                                                                  | Observation O-LU-02 (1 in 20 rounds) |
| L-03 | **LU-X01** different fields (A name, B tagline)                             | same pages; A uses the title editor, B the "Tagline" field editor; `Promise.all` Enter                                                                                                             | **Both persisted in 20 of 20** (API). Each UI showed the other's change live in 20 of 20                                                                                                                                                                                                                    | Pass                                 |
| K-01 | Kanban view by API                                                          | `POST /metadata createView(input: { name, objectMetadataId, type: KANBAN, icon, mainGroupByFieldMetadataId: <stage field>, visibility: WORKSPACE })` as the member                                 | r1: created; view groups were created automatically (NEW, SCREENING, MEETING, PROPOSAL, CUSTOMER) with 0 view fields. The seeded view "By Stage" exists but is not used                                                                                                                                     | Pass (r1); build Step 2 re-checks    |
| K-02 | Scope the board                                                             | `createViewFilter(input: { viewId, fieldMetadataId: <opportunity name>, operand: CONTAINS, value: <prefix> })`                                                                                     | r1: created; the board then shows only cards with the prefix                                                                                                                                                                                                                                                | Pass (r1); build Step 2 re-checks    |
| K-03 | Drag NEW → MEETING                                                          | card `getByRole("button", { name, exact: true })` (role=button, `aria-roledescription=draggable`, dnd-kit `@dnd-kit/react`); column header `getByRole("button", { name: "Meeting", exact: true })` | `locator.dragTo`: **0 of 5** (timeout; stage stayed NEW). Mouse: `down` on the card centre, 20 `move` steps to (header.x + 40, header bottom + 60), `up`: **5 of 5**, then 20 of 20 in the LU-002 runs                                                                                                      | Mouse steps (D7)                     |
| L-04 | **LU-002** drag vs amount edit, 10 rounds per run                           | A drags the card; B on `/object/opportunity/<id>` opens "Amount" (empty field shows its label) and fills the textbox with placeholder **"Currency"**; both at once                                 | **Stage MEETING and amount persisted in 20 of 20** (`amountMicros` = value × 10⁶, `USD`). Cards by name: 1 before and 1 after reload, 20 of 20. B after reload shows "Amount 50n … Stage Meeting" (r2, 10 of 10). B's record page showed A's new stage live within 2.5 s in only 6 of 10 and 7 of 10 rounds | Pass; O-LU-03 (live stage lag)       |

### Offline and reconnect (Company record page; A edits through the API)

| #    | Step                                                     | Method                                                                                                                                                                                                                         | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Verdict                                               |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| O-01 | Does `setOffline(true)` cut the stream?                  | `context.setOffline(true)`                                                                                                                                                                                                     | `navigator.onLine` false, yet **7 SSE frames arrived in 10 s, including 3 `UPDATED company`** (r1, and again in c1 at the network level). B's follow-up `FindOneCompany` failed with `net::ERR_INTERNET_DISCONNECTED`, so the DOM showed none of the 3 values. After `setOffline(false)`: **0 requests in 180 s** and still stale; a fourth edit then arrived in 221 ms                                                                                                                   | **setOffline alone is a false offline**               |
| O-02 | A true cut                                               | `setOffline(true)` plus an init script that errors every open `text/event-stream` body (what a dropped connection looks like to `fetch`)                                                                                       | app-side frames during the cut: **0** (c2, c3); 1 request failed                                                                                                                                                                                                                                                                                                                                                                                                                          | Works (probe only)                                    |
| O-03 | Reconnect after online                                   | watched up to 150–240 s                                                                                                                                                                                                        | record page reconnected at 77.6 s (c1), 7.2 s (c2), and **not within 150 s** (c3). List reconnected at 28.5 s (c2) and 48.3 s (c3). Source: `random() × 120000` ms per retry (`useHandleSseClientConnectionRetry.ts:306-316`, `SseConnectionRetryMaxWaitTimeInMs.ts:1`); 1 s only when `IS_DEV_ENV` (`getIsDevelopmentEnvironment.ts`), a build-time flag                                                                                                                                 | Random backoff of 0–120 s                             |
| O-04 | **RT-003**: 3 edits while cut                            | name, tagline, employees                                                                                                                                                                                                       | **The record page never showed them without a reload**: c1 240 s (reconnected at 77.6 s), c2 150 s (reconnected at 7.2 s, no `FindOneCompany` refetch), c3 150 s. On reconnect the client resyncs only the metadata store (`SSEClientEffect.tsx:25-34,46-48`)                                                                                                                                                                                                                             | **Finding** (gap documented)                          |
| O-05 | **RT-004**: 2 creates while cut                          | B on Companies filtered by prefix                                                                                                                                                                                              | after the list reconnected it refetched `FindManyCompanies`; both rows appeared at 30.2 s (c2) and 49.9 s (c3). Rows by id: 1 each before and after reload; API count 3 (base + 2). **No duplicates**                                                                                                                                                                                                                                                                                     | Finding: converges, but only after the random backoff |
| O-06 | Reconnect storm                                          | 5 cycles of offline (with cut) and online over 30 s, then 60 s                                                                                                                                                                 | 1 stream reopen, 1 failed request, 3 `AddQueryToEventStream`, 7 requests in total over 90 s (r1 only)                                                                                                                                                                                                                                                                                                                                                                                     | No runaway reconnects                                 |
| O-07 | Skip the backoff with Playwright's clock (review item 1) | `context.clock.install()` before `goto`, then the true cut (O-02), 3 edits and 2 creates, `setOffline(false)`, then `context.clock.runFor(130_000)` (k1, k2) or `fastForward(130_000)` (k3); fresh members and records per run | **(a)** with the clock installed the record page loads (7.0–20.5 s), the filtered list shows its row, and a live update arrives in 255–609 ms (3 of 3). **(b)** after the fast-forward **no new `text/event-stream` request** in 40 s; only `AddQueryToEventStream` calls on the old stream id, some `net::ERR_ABORTED` (3 of 3). **(c)** neither the record page nor the list shows any change (0 of 3 edits, 0 of 2 rows), and a later live edit **no longer arrives** in 20 s (3 of 3) | **The clock breaks the reconnect**: not usable        |

### RT-002: record created by the API

| #    | Step                            | Request                                                                                          | Observed                                                                                                                                                                                                                                                                                                                                           | Verdict                              |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| R-01 | REST create                     | `POST /rest/people` with the member's bearer, body `{ name: { firstName, lastName }, jobTitle }` | **201**, body `data.createPerson.id` (37 creates across 8 runs)                                                                                                                                                                                                                                                                                    | Pass                                 |
| R-02 | B's list filtered by own prefix | `filterNameContains(prefix)` (`people.page.ts:48-65`), one matching seed row                     | the new matching row **never appeared**: r1 0 of 5 (30 s), r2 0 of 6 (45 s); with the sequence below, g1 0 of 3 and g2 0 of 3                                                                                                                                                                                                                      | **PRODUCT BUG candidate** (17 of 17) |
| R-03 | Same, with a live anchor        | after the create, A updates the **seed** row's Job Title through the API                         | g1/g2: the anchor reached B's filtered list in **128–400 ms**, so the stream is live after the create. The view count read **"All People · 2"** while 1 row was shown. 15 s later the new row was still absent. 0 navigations                                                                                                                      | Deterministic, 6 of 6                |
| R-04 | Twenty's own contract           | source                                                                                           | on an SSE `CREATED` event the client inserts the record into every cached list whose filter matches: `useTriggerOptimisticEffectFromSseCreateEvents.ts:36-55` calls `triggerCreateRecordsOptimisticEffect({ shouldMatchRootQueryFilter: true, … })`, which filters at `triggerCreateRecordsOptimisticEffect.ts:102-136` (`isRecordMatchingFilter`) | Expected = insert                    |
| R-05 | Unfiltered People list          | same create, B on `/objects/people`                                                              | 24 of 29 rows appeared without a reload in 1.4–6.5 s, as the top row; the count went up by 1 in 8 of 8. Five misses, mostly the first create after load (4 of 5 runs). Not usable as an oracle, because another worker's people land in the same list                                                                                              | Observation O-RT-05                  |

### Extras

| #    | Candidate                                    | Observed                                                                                                                                                                                                                                                                                                                                              | Runs                                  |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| X-01 | Lost update on different fields              | = L-03 (20 of 20 both persist)                                                                                                                                                                                                                                                                                                                        | r1 + r2                               |
| X-02 | Delete vs edit                               | B's "Tagline" editor is open; A runs `deleteCompany` (soft delete). B shows live text **"This record has been deleted"** and **"Restore"**, and the editor stays open. B presses Enter: `UpdateOneCompany` **200**, no toast or error. The API row stays soft-deleted (`deletedAt` set) with tagline = B's value; the live count is **0** (no zombie) | r1, 3 rounds (build Step 5 re-checks) |
| X-03 | Stale view                                   | B's stream cut (O-02); A changes tagline; B, still showing the stale value, edits Employees. B's mutation input is only `{ employees: 55 }`. The API keeps A's tagline, and B's UI then shows A's tagline from the save response                                                                                                                      | r1, 3 rounds                          |
| X-04 | Permission change live                       | not probed: both QA members are Members, and the only Admin is Jane (G-02). Changing B's role needs a write as Jane                                                                                                                                                                                                                                   | –                                     |
| X-05 | Reconnect storm                              | = O-06                                                                                                                                                                                                                                                                                                                                                | r1                                    |
| X-06 | RTL bidi (Arabic name with Latin and digits) | person `P1-PROBE-<ts>-سارة` / `العتيبي 42`. In the **LTR** UI the digits render beside the Latin prefix ("P1-PROBE-…-42 العتيبي سارة"); in RTL the order reads correctly. User data has no `dir="auto"` or `<bdi>` isolation                                                                                                                          | r1 + r2                               |

### Arabic RTL (B's locale set through the API; English measured first)

| #    | Step             | Observed r1 / r2                                                                                                                                                                                                                                                                                                                                                                                      | Verdict               |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| E-01 | Shipped?         | Settings → Experience → language picker, search "Arab" → text **"Arabic"** (r1, r2). Source `APP_LOCALES['ar-SA']` (`twenty-shared/src/translations/constants/AppLocales.ts:7`). There are 33 locales in total, `he-IL` among them                                                                                                                                                                    | Shipped               |
| E-02 | Set the locale   | `updateWorkspaceMemberSettings({ locale: "ar-SA" })` through `setQaMemberPrefs` (`qa-member.ts:191-217`), then load the page                                                                                                                                                                                                                                                                          | Pass                  |
| E-03 | dir / lang       | People: `lang=ar-SA`, `dir=rtl`, body `direction: rtl` (r1, r2). Settings: the same (r1, r2). Record page: same in r1; **r2 measured `lang=en dir=ltr` 1.5 s after load while the heading was already `rtl`**. Source sets both in `dynamicActivate` (`twenty-front/src/utils/i18n/dynamicActivate.ts:18-19`) after the catalog loads                                                                 | Pass; must poll (D6)  |
| E-04 | Mirroring        | Settings breadcrumb `navigation` x **233 → 1109** (desktop 1440, r1, r2). Screenshots: sidebar on the right, table columns right to left, record fields on the right                                                                                                                                                                                                                                  | Pass                  |
| E-05 | Clipping/overlap | No horizontal page scroll, and 0 visible buttons overflow (`overflowingControls`) on all 3 pages, English and Arabic (r1, r2). Field labels end with an ellipsis in both languages (by design)                                                                                                                                                                                                        | Pass                  |
| E-06 | axe              | serious/critical, WCAG tags (`axeScan`, `src/support/visual/axe.ts:242-283`), context `light`: **identical** violation id and node counts in English and Arabic on People (`aria-command-name:71, aria-toggle-field-name:180, color-contrast:14, nested-interactive:2`), the record page (`aria-allowed-attr:5, color-contrast:3, nested-interactive:3`) and Settings (`color-contrast:9`), r1 and r2 | **No new violations** |
| E-07 | Translation      | many strings stay English under ar-SA: object names (People, Companies), "Create", "Fields", "Timeline", field labels. The sidebar's Settings items are Arabic                                                                                                                                                                                                                                        | Observation O-RTL-01  |

### Cleanup and leak check

| #    | Step                   | Observed                                                                                                                                                                                                                                                                                                      |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Destroy by captured id | person 49, company 35 (plus 3 already destroyed in X-02), opportunity 34, view 2 (`destroyView` on `/metadata`). 0 errors                                                                                                                                                                                     |
| C-02 | Prefix sweep           | `P1-PROBE-%` companies, opportunities and people, live and soft-deleted: 0 left; views 0                                                                                                                                                                                                                      |
| C-03 | Members                | A, B, C and D deleted; `p1-probe-%` members 0                                                                                                                                                                                                                                                                 |
| C-04 | Leak script            | `npx tsx scripts/count-twenty-qa-leaks.mts` → `before 0, deleted 0, after 0, viewsBefore 0, viewsDeleted 0, viewsAfter 0, qaMembers 0`, exit 0                                                                                                                                                                |
| C-05 | Read-only SQL          | company 0, opportunity 0, person 0, member 0, `core.view` 0; orphan `viewFilter` / `viewGroup` / `viewSort` rows 0 (§10)                                                                                                                                                                                      |
| C-06 | Not ours               | **7 views named `probe-cal-<ts>`** (timestamps from 2026-10-15) are left over from an earlier session. The P1 sweep does not count them (it matches `P1-QA-`). Not touched (OQ6)                                                                                                                              |
| C-07 | Sweep coverage         | companies (`sweep.ts:107-124`), opportunities (`:126-153`), people by name or email (`:11-18,192-219`), views by name prefix (`:300-304`), members `p1-qa-%` (`qa-member.ts:231-236`). It covers every type this batch creates. View groups and filters go with `destroyView` (C-05). **No extension needed** |

## 3. Resolved decisions

- **D1 Two users.** **A** is the existing worker QA member `twentyQaMember` (`visual-fixtures.ts:43-76`). It is the test's `page` through `storageState` (`visual-fixtures.ts:78`). **B** is a new **worker-scoped peer** `twentyQaPeer`, provisioned once per worker with `provisionQaMember` (email `p1-qa-<seed>-<worker>-peer@example.test`, under the `p1-qa-%` leak prefix) and deleted with its own bearer. Both are Members who can edit Companies and Opportunities (G-02, G-03). Jane is never written to. Reason: one peer per worker costs one provisioning (13.9–22.8 s) instead of one per test, and no test changes either member's settings.
- **D2 Second-context helper.** New `openMemberPage(browser, storageStatePath)` in `src/products/twenty/fixtures/member-page.ts`. `storageStatePath` is **required** (no default), the helper always sets `baseURL`, and it returns `{ page, close }`. It extends the pattern of `extraContextPage` (`two-factor-fixtures.ts:86-97`, explicit empty state) and `secondMemberPage` (`import-fixtures.ts:99-109`, the same member). The fixture `peerPage` uses it with B's state. Identity check: once per worker, the `twentyQaPeer` fixture opens `/settings/profile` in both contexts and asserts each disabled email textbox equals its own email (G-04). Every login goes through `TwentyLoginPage` inside `provisionQaMember` (`qa-member.ts:153-155`); no other login path is added.
- **D3 Real-time transport and readiness.** SSE (B-01). Before A acts, B's page waits for its own `AddQueryToEventStream` 200 response (B-06). The page object registers that wait **before** `goto` and returns the promise. This is a network signal, not a sleep. Latency is measured from A's `UpdateOne*` response to B's visible value with `expect.poll(…, { intervals: [50] })`. It is attached, never asserted against a number (Twenty documents none).
- **D4 Offline method and RT-003/RT-004.** `setOffline` alone does not cut the stream (O-01). A true cut needs `setOffline` plus a stream fault (O-02). The product then reconnects after a random 0–120 s (O-03), and a 120 s test cannot wait for that without a raised timeout, which is forbidden. The standard way to skip a timer backoff, Playwright's clock, was probed and breaks the reconnect itself (O-07), so a test built on it would test a state the product never reaches. **RT-003 and RT-004 are not built.** Their outcomes go into `twenty-known-issues.md` as findings: O-04 is the gap (no convergence without reload), O-05 converges with no duplicates but only after the backoff. The batch adds **no** stream-fault helper, because nothing built uses it. Reason and alternative: OQ1.
- **D5 N rounds.** The race rule is about 10 rounds. **LU-001: 10 rounds as 2 tests × 5** and **LU-002: 10 rounds as 2 tests × 5**. Each pair has the same testId annotation, and the titles end "(rounds 1-5)" and "(rounds 6-10)". **LU-X01 (an extra): 1 test × 5 rounds.** Each round uses a fresh record. Probe rates: invariants held 20 of 20 for LU-001, LU-X01 and LU-002. Budget: a round is 2 parallel loads plus the race plus 2 parallel reloads, about 16 s (LU-002 about 20 s), so an LU-001/LU-X01 test is about 80 s and an LU-002 test about 105 s (board setup plus 5 × 20 s) of the 120 s test timeout (`env.ts:42-51`). Splitting keeps every test under the timeout; it is never raised. Stop rule: any of these tests over 110 s in a local run means stop and report.
- **D6 Locale.** Set through the API with the existing `memberPrefs` option (`visual-fixtures.ts:80-92`), which `appliedPrefs` resets to `en` in teardown. The axe test switches mid-test with `setQaMemberPrefs` and a reload, as `pseudo.i18n.spec.ts:132-133` does. `dir` and `lang` are **polled** (`expect.poll`) before measuring (E-03 r2), as `german.i18n.spec.ts:77-81` polls `lang`.
- **D7 Kanban.** The fixture creates a per-test KANBAN view named `<prefix>-LU002-Board` plus a `CONTAINS <prefix>-LU002` name filter (K-01, K-02); stage and name field ids are read from metadata at runtime, never hard-coded. Drag uses mouse steps (K-03). The seeded "By Stage" view is never used.
- **D8 RT-002 oracle.** B's list is filtered by the test's own prefix, so no other worker can touch it. Working path, asserted hard: REST 201, API shows the person matching the filter, the live anchor arrives, the count reads "· 2". Then the known-bug step: the new row is visible (fails, R-02/R-03). An unfiltered list is not used: another worker's people land in it, and its row inserts are unreliable (R-05).
- **D9 LU-X02 action through the API.** A's delete is `deleteCompany` through the API (as probed). Exception to "UI action": B's UI is the subject, and A's UI delete flow was not probed.
- **D10 `e2e / visual` required check.** **Not required today.** The `protect-main` ruleset (24732991) requires `e2e / lint`, `e2e / typecheck (always)`, `e2e / cal-self-hosted`, `e2e / twenty-self-hosted` and `e2e / documenso-self-hosted`, with strict policy; `branches/main/protection` returns 404 "Branch not protected", because rulesets are used. Evidence for turning it on: the last **6 runs on main** passed `e2e / visual`: 39084847852 (push `d859453`), 39064612275 (schedule `4b1f7f8`), 38984970979 (push `4b1f7f8`), 38961832799 (schedule `8c7d4ca`), 38939968488 (push `8c7d4ca`), 38918182100 (push `9df231e`). The last red one, 38884854945 (`962ed49`, 2026-10-16), came before the main-visual-pages fix. **Jayami turns it on herself** in the ruleset; this plan changes no setting. **Dependabot PR #38 does not block turning it on.** Its visual failure is the aggregator reporting "medusa: visual was requested but did not run (job result: failure)" (run 38985175959). #38 would only stay unmergeable until its Medusa job passes. This plan does not fix #38.

## 4. Goal and scope

In:

- P1-TW-LU-001, P1-TW-LU-002, P1-TW-RT-001, P1-TW-RT-002, P1-TW-VIS-X07 (IDs and titles unchanged).
- Extras (§6): P1-TW-LU-X01, P1-TW-LU-X02.
- Fixtures, page objects, pure helpers with unit tests, an RT-002 known-issue entry, observations, the ADR 0016 amendment, README coverage.
- The `e2e / visual` evidence (D10). The switch itself is Jayami's.

Out, with reasons:

- **P1-TW-RT-003, P1-TW-RT-004: not built** (D4, OQ1; the clock probe O-07 is the deciding evidence). Their outcomes are documented as findings, which RT-003's Expected column explicitly allows ("or the gap is documented as a finding").
- Load and k6 races (P6), API-only races (P2), Medusa, batch 3 rework.
- Extras dropped: LU-X03 stale view (needs the stream-fault helper this batch does not add; the evidence that B sends only the changed field is in X-03), permission change live (needs a write as Jane, X-04), reconnect storm (needs the helper plus a 90 s window, O-06), RTL bidi (no normative requirement; recorded as O-RTL-02).

With RT-003 and RT-004 documented as findings, this batch closes the Twenty map: every row is built, known bug, or documented finding.

ID check: `rg "P1-TW-(LU|RT)"` hits only `docs/plans/2026-10-17-p1-phase4-batch3-twenty.md:146` and `README.md:279` (the "carried" lines); no test or ID exists. `rg -o "P1-TW-[A-Z0-9]+-X[0-9]+"` finds TZ-X01..X05, VIS-X01..X07 (X07 only in plans as "carried/dropped"), CSV-X01..X07 and 2FA-X01..X05; there are no LU-X or RT-X IDs. Numbering starts at LU-X01.

## 5. Test-case mapping

| ID                                        | File                                    | Project                        | Tags                 | Pri | Oracle (independent)                                                                                                                                                                                       | Cleanup                                                          |
| ----------------------------------------- | --------------------------------------- | ------------------------------ | -------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| LU-001 (rounds 1-5), LU-001 (rounds 6-10) | `tests/twenty/live/concurrency.spec.ts` | `twenty-chromium`              | `@twenty`, `@live`   | P1  | API `company.name` per round ∈ {A, B}, and both UIs equal it after reload                                                                                                                                  | `liveRecords`: destroy captured companies by id, recount 0       |
| LU-002 (rounds 1-5), LU-002 (rounds 6-10) | same                                    | same                           | same                 | P1  | API `opportunity { stage, amount.amountMicros }` = MEETING and (500 + n) × 10⁶; board card count by name = 1                                                                                               | destroy opportunities by id, then `destroyView`, recount 0       |
| LU-X01                                    | same                                    | same                           | same                 | P2  | API `company { name, tagline }` both changed                                                                                                                                                               | as LU-001                                                        |
| LU-X02                                    | same                                    | same                           | same                 | P2  | API `companies(filter: { id })` totalCount 0 (no zombie) and exactly one soft-deleted row with `deletedAt` set. The deleted row's tagline and B's 200 are attached as observation evidence, never asserted | destroy by id (works on soft-deleted rows, X-02)                 |
| RT-001                                    | `tests/twenty/live/realtime.spec.ts`    | same                           | same                 | P1  | API `person.jobTitle` = the value per sample; latency attached                                                                                                                                             | destroy person by id                                             |
| RT-002                                    | same                                    | same                           | same                 | P2  | API: the REST-created person exists and matches B's filter. **Known bug** (§11)                                                                                                                            | destroy both people by id                                        |
| VIS-X07                                   | `tests/twenty/i18n/rtl.i18n.spec.ts`    | `visual-mobile/tablet/desktop` | `@twenty`, `@visual` | P2  | `dir`/`lang` attributes, element geometry, baselines; axe English vs Arabic set equality (desktop)                                                                                                         | `rtlPerson` fixture destroys by id; `appliedPrefs` resets locale |
| RT-003                                    | not built: finding O-04                 | –                              | –                    | P1  | –                                                                                                                                                                                                          | –                                                                |
| RT-004                                    | not built: finding O-05                 | –                              | –                    | P2  | –                                                                                                                                                                                                          | –                                                                |

Annotations: `{ type: "testId", description: "P1-TW-…" }` plus `{ type: "priority", description: "P1" | "P2" }`, as in `tz.spec.ts`. `tests/twenty/live/` is inside `testDir ./tests/twenty` and not in `VISUAL_A11Y_IGNORE` (`playwright.config.ts:48,291-292`). `tests/twenty/i18n/` is a visual-only folder (`:43-48`).

## 6. Extra cases (accepted in review 2026-10-18)

| ID     | Technique                     | Asserts                                                                                                                                                                                                                                                                                                                               | Oracle                                                 | Probe                    | Decision                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ | --------------------------------- |
| LU-X01 | Concurrency, different fields | A edits the company name and B the tagline within one `Promise.all`, 5 fresh-record rounds: both changes persist and both UIs show both after reload                                                                                                                                                                                  | API name and tagline                                   | L-03, 20 of 20 (r1 + r2) | **Accept**                        |
| LU-X02 | State, delete vs edit         | B, with an editor open, sees "This record has been deleted" and "Restore" live after A deletes. B's save does not bring the record back, and exactly one soft-deleted row remains. The silent 200 write into the deleted row is attached as evidence and recorded as an observation (possible data-integrity issue), **not** asserted | API live count 0, exactly one row with `deletedAt` set | X-02, 3 rounds (r1)      | **Accept** (Step 5 runs it twice) |
| LU-X03 | Stale view                    | B's save after a missed change does not overwrite it                                                                                                                                                                                                                                                                                  | API                                                    | X-03                     | Drop (needs the stream fault, D4) |
| –      | Permission change live        | –                                                                                                                                                                                                                                                                                                                                     | –                                                      | X-04                     | Drop (needs a write as Jane)      |
| –      | Reconnect storm               | –                                                                                                                                                                                                                                                                                                                                     | –                                                      | O-06                     | Drop (needs the helper and 90 s)  |
| –      | RTL bidi                      | –                                                                                                                                                                                                                                                                                                                                     | –                                                      | X-06                     | Drop; observation O-RTL-02        |

## 7. Architecture (every file touched, one responsibility each)

New:

- `src/products/twenty/fixtures/member-page.ts`: `openMemberPage(browser, storageStatePath)`, a second user's page with that user's own state (D2).
- `src/products/twenty/fixtures/live-records.ts`: API setup and oracles for this batch: company with fields, read company (also soft-deleted), soft-delete company, opportunity in a stage, read opportunity, person with job title, REST person create, update person job title, read person, Kanban view and name filter, object and field ids.
- `src/products/twenty/live.ts`: pure helpers: `parseViewCount`, `latencySummary`, `raceRoundNames`, `lostUpdateVerdict` (unit-tested).
- `src/products/twenty/live-fixtures.ts`: `test` = `visual-fixtures` `test` plus worker `twentyQaPeer`, and test fixtures `peerPage`, `liveRecords` (prefix, capture, teardown) and `kanbanBoard`.
- `src/products/twenty/pages/kanban.page.ts`: `TwentyKanbanPage` (board, card, column header, mouse drag).
- `src/products/twenty/pages/profile.page.ts`: `TwentyProfilePage` (identity email textbox).
- `src/products/twenty/rtl-fixtures.ts`: `test` = `visual-fixtures` `test` plus `rtlPerson` (a fixed-name Arabic P1-QA person, destroyed by id).
- `tests/twenty/live/concurrency.spec.ts`, `tests/twenty/live/realtime.spec.ts`, `tests/twenty/i18n/rtl.i18n.spec.ts`.
- `tests/twenty/i18n/__screenshots__/visual-{mobile,tablet,desktop}/tw-people-ar.png`, `tw-person-ar.png`, `tw-settings-ar.png` (9 baselines, Docker only, ADR 0017).
- `tests/unit/twenty-live.spec.ts`.

Modified:

- `src/products/twenty/pages/record.page.ts`: add `title(name)`, `openTitleEditor(name)`, `fieldValue(text)`, `openFieldEditor(shown, placeholder)`, `deletedBanner`, `restoreText`.
- `src/products/twenty/pages/people.page.ts`: add `rowById(id)` and `liveSubscription()`.
- `src/products/twenty/fixtures/qa-member.ts`: add the pure `qaPeerMemberEmail(seed, worker)` only.
- `src/products/twenty/issues.ts`: add `TW_RT_002_CREATED_ROW_MISSING_ISSUE`.
- `docs/observations/twenty-known-issues.md`, `docs/adr/0016-twenty-ci.md`, `README.md`.

Unchanged: `playwright.config.ts`, `.github/workflows/*` (`tw_re` `e2e.yml:118` already matches `tests/twenty/` and `src/products/twenty/`), `package.json`, `scripts/count-twenty-qa-leaks.mts`, `sweep.ts` (C-07), harness, forks.

## 8. Locators per page object (from the probe)

`TwentyRecordPage` (additions; `fieldsWidget` = `getByTestId("record-fields-widget")`, `record.page.ts:19`):

| Member                                | Locator / action                                                                                                                                                                                                                                                                                                                                                                                                     | Probe                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `title(name)`                         | `page.getByRole("heading", { level: 3, name, exact: true })`                                                                                                                                                                                                                                                                                                                                                         | L-01 (both UIs, 80 reads)         |
| `openTitleEditor(name)`               | `title.hover()` then `title.click()` then `expect(page.getByPlaceholder("Name")).toBeVisible()`; returns that textbox                                                                                                                                                                                                                                                                                                | L-01, explore (41 opens)          |
| `fieldValue(text)`                    | `fieldsWidget.getByText(text, { exact: true })`                                                                                                                                                                                                                                                                                                                                                                      | B-05, L-03                        |
| `openFieldEditor(shown, placeholder)` | `v = fieldValue(shown)`; `v.hover()`; `expect(v).toHaveCount(2)` (the hover-portal copy appears about 74 ms later); `v.last().click()` (eslint-disable with the reason "the hover portal duplicates the value; the copy on top is the clickable one"); `expect(page.getByPlaceholder(placeholder)).toBeVisible()`; returns it. Placeholders seen: "Job Title", "Tagline", "Employees", and **"Currency"** for Amount | B-03, L-03, L-04, X-02 (66 opens) |
| `deletedBanner`                       | `page.getByText("This record has been deleted", { exact: true })`                                                                                                                                                                                                                                                                                                                                                    | X-02                              |
| `restoreText`                         | `page.getByText("Restore", { exact: true })` (role not captured; Step 5 re-checks whether it is a button and switches to `getByRole` if so)                                                                                                                                                                                                                                                                          | X-02                              |

`TwentyPeoplePage` (additions): `rowById(id)` = `getByTestId(\`row-id-${id}\`)`(same pattern as`object-table.page.ts:27-29`; B-04, R-02). `liveSubscription()`=`page.waitForResponse(r => operationName === "AddQueryToEventStream" && r.status() === 200, { timeout: 60_000 })`, which must be called **before** `goto()`(B-06: 11.2–18.0 s after load). Existing members used:`goto` (`:38-41`), `filterNameContains` (`:48-65`), `viewCount` (`:22-24`).

`TwentyKanbanPage` (`kanban.page.ts`):

| Member                          | Locator / action                                                                                                                                                                                        | Probe      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `goto(viewId)`                  | `/objects/opportunities?viewId=<id>`, then wait for `columnHeader("New")`                                                                                                                               | K-01       |
| `columnHeader(stage)`           | `getByRole("button", { name: stage, exact: true })` for "New", "Screening", "Meeting", "Proposal", "Customer"                                                                                           | K-01, K-03 |
| `card(name)`                    | `getByRole("button", { name, exact: true })` (role=button, `aria-roledescription=draggable`)                                                                                                            | K-03, L-04 |
| `dragCardToColumn(name, stage)` | boxes of `card` and `columnHeader`; `mouse.move(card centre)`, `mouse.down()`, 20 linear `mouse.move` steps to (header.x + 40, header.y + header.height + 60), `mouse.up()`. No `dragTo` (K-03: 0 of 5) | K-03, L-04 |

`TwentyProfilePage` (`profile.page.ts`): `goto()` = `/settings/profile`; `emailField()` = `getByRole("textbox", { disabled: true })`; `expectSignedInAs(email)` = `expect(emailField()).toHaveValue(email)`. G-04 r2 read the disabled textbox values through the DOM; the `getByRole` `disabled` option is re-checked in Step 3.

`TwentySettingsExperiencePage` (existing, `settings-experience.page.ts:18,23-25`): `goto()`, `languagePicker()`.

## 9. Oracle design

- **UI first.** Each Expected column is asserted in the UI: the heading or field value after reload (LU-001, LU-X01, LU-002 on B's record page), the board card count (LU-002), the deleted banner (LU-X02), B's live value (RT-001), B's list row and count (RT-002), and `dir`, geometry and baselines (VIS-X07).
- **API as the independent oracle, named per test** (§5), always read with the **member's own bearer** (`memberApi`, `qa-member.ts:250-267`), never Jane's.
- **LU-001:** per round, the stored name must be exactly `<base>-A` or `<base>-B`, and both reloaded headings must equal it. That catches a lost update in which neither or a third value is shown, or the UIs disagree. The winner, response spread, warning counts and pre-refresh texts are attached as `lu-001-rounds.json`. The conflict warning is an **observation, not asserted** (as the test map says).
- **RT-001:** the latency is attached as `rt-001-latency.json` (samples and min/median/max from `latencySummary`); the only hard limit is the test timeout.
- **RT-002 known bug:** the expected value comes from Twenty's own client contract (R-04) plus the view's internal consistency (the count says 2, the table shows 1). TW-VIS-004 is the precedent: an empty state shown while the header counts records (`visual.ts:28`).
- **VIS-X07 axe:** within one test, English and Arabic scans of the same page. The oracle is that the Arabic serious/critical violation set (id plus node count) equals the English set (E-06), so no new violation appears. It never compares against a guess.

## 10. Test data, isolation, cleanup and leak check

- Prefix: `p1QaPrefix(RUN_SEED, parallelIndex)` (`names.ts:3-5`) plus a case leaf (`LU001`, `LU002`, `LUX01`, `LUX02`, `RT001`, `RT002`) plus a round number. Records: `<prefix>-LU001-r<n>`, opportunities `<prefix>-LU002-r<n>`, the view `<prefix>-LU002-Board`, people `<prefix>-RT001-Ann`, `<prefix>-RT002-Seed`, `<prefix>-RT002-Rest`. Every name starts `P1-QA-`.
- The VIS-X07 person has the fixed name `P1-QA-RTL-سارة` / `العتيبي 42`, so baselines show no seed. Visual runs use 1 worker (`playwright.config.ts:183,188`; the CI visual step sets no `PW_WORKERS`), so one exists at a time; it is destroyed by id.
- **Workers (PW_WORKERS=2):** each worker has its own A (`twentyQaMember`) and B (`twentyQaPeer`). A two-context test runs inside one worker. The Kanban view is per test, has the prefix in its name and a prefix filter, so the other worker's board never shows its cards. RT-002 filters on its own prefix. No batch 4 E2E test changes a locale. **The one isolation answer: one member pair per worker plus a per-test prefix, and every view or filter scoped to that prefix.**
- Teardown `liveRecords`: ids captured at creation. In `finally`: destroy opportunities, then companies, then people, then views by id (`destroyOpportunity`, `destroyCompany`, `destroyPerson` in `records.ts:117-140,194-206`; `destroyView` in `views.ts:46-57`), each with a status check, then a recount by prefix = 0 for each type, with an `AggregateError` that lists the test error first (pattern `import-fixtures.ts:80-96`).
- Teardown `twentyQaPeer`: `deleteQaMember`, then `countQaMembers(admin, email) === 0`, errors aggregated (pattern `visual-fixtures.ts:55-72`).
- Leak gate unchanged (C-07): `npx tsx scripts/count-twenty-qa-leaks.mts` must print all 0 after each run. Read-only SQL after each run (schema `workspace_1wgvd1injqtife6y4rvfbu3h5`, Apple):

```
select 'company', count(*) from workspace_1wgvd1injqtife6y4rvfbu3h5.company where name ilike 'P1-QA-%'
union all select 'opportunity', count(*) from workspace_1wgvd1injqtife6y4rvfbu3h5.opportunity where name ilike 'P1-QA-%'
union all select 'person', count(*) from workspace_1wgvd1injqtife6y4rvfbu3h5.person where "nameFirstName" ilike 'P1-QA-%' or "emailsPrimaryEmail" ilike 'p1-qa-%'
union all select 'member', count(*) from workspace_1wgvd1injqtife6y4rvfbu3h5."workspaceMember" where "userEmail" ilike 'p1-qa-%';   -- all 0
select count(*) from core.view where name ilike 'P1-QA-%';                                                                            -- 0
select count(*) from core."viewFilter" f left join core.view v on v.id = f."viewId" where v.id is null;                            -- 0
```

Run through `docker exec qa-harness-twenty-db-1 psql -U postgres -d default -At -c "<sql>"` (read only).

- Seeded data (Jane, 1,200+ people, the "By Stage" view) is read only. Retries stay 0 (`playwright.config.ts:293`, `e2e.yml:1395`).

## 11. Known-bug handling (proof process)

| Finding                     | Observed                                                                                        | Expected / standard                                                                                                                                                                                                     | Label                                       | Evidence                             | Handling                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TW-RT-002-F1** (RT-002)   | a created record that matches B's filtered list raises the count live but its row never appears | Twenty's client contract: matching creates are inserted (`useTriggerOptimisticEffectFromSseCreateEvents.ts:36-55`, `triggerCreateRecordsOptimisticEffect.ts:102-136`); count and rows must agree (precedent TW-VIS-004) | **PRODUCT BUG**                             | R-02 (11), R-03 (6): 17 of 17        | Working path asserted hard (seed row, REST 201, API match, anchor live, count "· 2"); `attachKnownBugEvidence` with `{ rowsById: 0, viewCount, anchorMs, apiMatches: 2 }`; then `test.fail(true, TW_RT_002_CREATED_ROW_MISSING_ISSUE)`; then strict `expect(people.rowById(newId)).toBeVisible()`. Deterministic, so a single round (17 of 17); if either build run passes the strict step: stop and report |
| O-04 (RT-003)               | missed edits never shown on the record page after reconnect                                     | no documented Twenty contract for record pages (reconnect resyncs only metadata, `SSEClientEffect.tsx:25-34`)                                                                                                           | Finding                                     | c1, c2, c3; clock probe O-07 (k1–k3) | known-issues entry with the measured times; not built (D4). A `test.fail` was considered (the list refetches on reconnect but the record page does not), but no deterministic, budget-fitting way to reach "after reconnect" exists: the backoff is random up to 120 s and the clock breaks the reconnect (O-07)                                                                                            |
| O-05 (RT-004)               | the list converges with no duplicates after a random 0–120 s reconnect                          | –                                                                                                                                                                                                                       | Finding                                     | c2, c3; O-07                         | known-issues entry; not built (a passing test needs a reconnect inside the budget, which neither real time nor the clock gives)                                                                                                                                                                                                                                                                             |
| O-01                        | `setOffline` keeps the SSE stream alive                                                         | –                                                                                                                                                                                                                       | TEST-design fact                            | r1, c1                               | ADR note: never use `setOffline` alone to model offline in Twenty                                                                                                                                                                                                                                                                                                                                           |
| O-LU-02, O-LU-03            | B shows its own losing value (1 of 20); B's live stage lag (13 of 20 live within 2.5 s)         | none strictly                                                                                                                                                                                                           | Observation                                 | L-02, L-04                           | not asserted (LU tests assert after reload, as Expected says); recorded with rates                                                                                                                                                                                                                                                                                                                          |
| X-02 silent write           | a save into a soft-deleted record returns 200 and writes it                                     | none documented                                                                                                                                                                                                         | Observation (possible data-integrity issue) | X-02                                 | **not asserted**: LU-X02 attaches B's response status and the deleted row's tagline as evidence (`x02-observation.json`); recorded in known-issues as an observation; ADR note                                                                                                                                                                                                                              |
| O-RT-05, O-RTL-01, O-RTL-02 | unfiltered row misses; partial Arabic catalog; no bidi isolation                                | none normative                                                                                                                                                                                                          | Observation                                 | R-05, E-07, X-06                     | known-issues "Observations" list only                                                                                                                                                                                                                                                                                                                                                                       |

Rules (unchanged from batches 1–3): a `test.fail` is unconditional and scoped after the hard working-path asserts; `attachKnownBugEvidence` (`src/core/known-bug-evidence.ts:65`) runs before the strict assert; measured facts go to `docs/observations/twenty-known-issues.md` before the test is kept; both build runs must fail the same way. A nondeterministic known bug would use the N-round rule. RT-002 is deterministic (17 of 17), so a single round is enough.

## 12. CI job design (extend `twenty-self-hosted`; no new workflow)

- The E2E specs run inside "Run Twenty E2E suite" (`e2e.yml:1381-1395`, `npm run test:twenty -- --retries=0`, `PW_WORKERS: "2"` at `:1387`). VIS-X07 runs inside "Run Twenty visual suite (Docker)" (`:1473-1487`, `visual:test -- --product=twenty`). `tw_re` (`:118`) triggers on these paths. Nothing to add.
- Unchanged: retries 0, leak gate "Count Twenty QA leaks" (`:1548-1559`, `always() && !cancelled()`), compose logs on failure (`:1561`), harness down `always()` (`:1584-1585`), `!cancelled()` report uploads (`:1597`), cache rules, the job summary row (`:1414-1423`), and the `visual` aggregator (`:1989-2030`).
- `timeout-minutes: ${{ inputs.twenty_chromium_timeout_minutes }}` (`:1251`) defaults to 60 (`:31-34`).
- **Timeout arithmetic.** PR #41's last run, **39083515627** (`fc68b48`), had a `twenty-self-hosted` job of **20 m 18 s** = harness up 108 s + E2E suite 601 s + visual pull 25 s + visual suite 354 s + about 130 s of other steps. Main run 39084847852 took 19 m 35 s. New E2E tests (probe timings, D5): LU-001 2 × about 80 s, LU-002 2 × about 105 s, LU-X01 about 80 s, LU-X02 about 30 s, RT-001 about 45 s, RT-002 about 50 s, and peer provisioning 14–23 s once per worker (about 40 s for 2). That is about 615 s serial, so **about 10.3 min locally on one worker** (under the 15 min stop limit) and about 5.1 min in CI with 2 workers. VIS-X07: 3 baseline tests × 3 viewports at about 35 s plus 1 axe test at about 150 s, so about 7.8 min in the 1-worker Docker visual step. **Projected job: 20.3 + 5.1 + 7.8 ≈ 33.2 min < 60.** Step 9 measures the real numbers; more than 15 min added locally means stop and report.
- `e2e / visual` required check: see D10. Jayami changes the ruleset herself.

## 13. Risks and unknowns (each with a probe)

| #   | Risk                                                | Probe / evidence                                                                  | Mitigation                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Offline false green**                             | O-01: `setOffline` keeps SSE frames flowing; O-07: the clock breaks the reconnect | RT-003 and RT-004 are not built (D4). No test in this batch models offline or installs the clock for live updates. The ADR records that a Twenty offline test needs a stream fault and a real-time reconnect                                        |
| R2  | **Wrong user in a context**                         | G-04, plus the batch 3 lesson                                                     | `openMemberPage` requires the state path (D2); a per-worker identity check of both contexts in `twentyQaPeer`. A test's `page` is A only through `visual-fixtures.ts:78`                                                                            |
| R3  | **Drag-and-drop reliability**                       | K-03: `dragTo` 0 of 5; mouse 25 of 25                                             | Mouse steps only, inside the page object. The API stage plus the board count after reload are the oracle. Any drag that leaves the stage NEW: stop and label with a trace (TEST vs PRODUCT)                                                         |
| R4  | **TW-LOGIN-F01**                                    | batch 3 data (1.0–4.5% of loads); `login.page.ts:51-81`                           | Peer provisioning adds one `/welcome` load per worker, which goes through `TwentyLoginPage` with its single reload. A reload inside the worker fixture is logged to the console (`login.page.ts:31-38`), not the report; Step 9 reports both counts |
| R5  | Event before subscription                           | B-06, R-05                                                                        | `liveSubscription()` awaited before A acts (D3)                                                                                                                                                                                                     |
| R6  | LU tests near the 120 s timeout                     | round timings (D5)                                                                | 5 rounds per test (LU-001 and LU-002 split into rounds 1-5 and 6-10), and the 110 s stop rule. Never a raised timeout. LU-002 at about 105 s is the tightest                                                                                        |
| R7  | Hover-portal editor                                 | about 74 ms to appear; clicking the original is intercepted                       | `openFieldEditor` waits for the 2 copies, then clicks the top copy                                                                                                                                                                                  |
| R8  | RTL `dir` applied late                              | E-03 r2                                                                           | `expect.poll` on `dir` and `lang` before any measurement                                                                                                                                                                                            |
| R9  | axe scan time on People                             | E-06 (a full page scan took 40–100 s with rescans)                                | axe test on `visual-desktop` only, with `test.setTimeout(180_000)` (named exception, precedent `contrast.a11y.spec.ts:71`)                                                                                                                          |
| R10 | Kanban view visible to every member while it exists | K-01 (`visibility: WORKSPACE`)                                                    | P1-QA name plus prefix filter, destroyed by id; leak sweep covers views                                                                                                                                                                             |
| R11 | Image v2.44.0 vs fork `sdk/v2.43.0-127`             | every cited behaviour was also seen live                                          | strings and timings asserted only from live probes; a Twenty bump means re-probing                                                                                                                                                                  |
| R12 | RT-002 bug fixed in a future image                  | –                                                                                 | the strict step passes, so the test reports "expected to fail, but passed": stop and re-probe                                                                                                                                                       |
| R13 | Single-run rows (K-01, K-02, X-02, O-06)            | marked in §2                                                                      | Steps 2, 3 and 5 re-check them on the first build run; any difference: stop and report                                                                                                                                                              |

## 14. Build steps (Git Bash, repo root; on any differing output: **stop and report**, paste it)

### Step 0. Branch, plan, baseline

- `git checkout main && git pull --ff-only && git rev-parse HEAD` → `d859453a42fb63fcb3a1baec3c068ea1c03676be` (or a later main that Jayami names). Different: stop.
- `git checkout -b feat/2026-10-18-p1-phase4-batch4-twenty`. Save this plan as `docs/plans/2026-10-18-p1-phase4-batch4-twenty.md`, run `npx prettier --check` on that path, `git add` that one path, and commit `docs(plan): phase 4 batch 4 twenty live updates and rtl`.
- Harness: `cd ../qa-portfolio-harness && node scripts/up.mjs twenty && npm run smoke -- twenty` → "smoke ok".
- Baselines, one heavy suite at a time: **B-twenty** `npm run test:twenty` (then the leak script → 0), **B-visual-twenty** `npm run visual:test -- --product=twenty`. Record passed / failed / expected failures / flaky.

### Step 1. Pure helpers + unit tests

`src/products/twenty/live.ts`:

```
/** "All People · 1,234" -> 1234; throws when no "· <n>" is present. */
export function parseViewCount(text: string): number
export interface LatencySummary { readonly samples: readonly number[]; readonly minMs: number; readonly medianMs: number; readonly maxMs: number }
export function latencySummary(samples: readonly number[]): LatencySummary          // throws on []
export interface RaceRoundNames { readonly base: string; readonly a: string; readonly b: string }
export function raceRoundNames(prefix: string, caseId: string, round: number): RaceRoundNames   // base `${prefix}-${caseId}-r${round}`, a `${base}-A`, b `${base}-B`; throws on % or _
export type LostUpdateVerdict = "A" | "B" | "lost";
export function lostUpdateVerdict(stored: string, names: RaceRoundNames): LostUpdateVerdict      // "lost" for any other value
```

`qa-member.ts`: `export function qaPeerMemberEmail(seed: number, worker: number): string` returns `p1-qa-${seed}-${worker}-peer@example.test`.

`tests/unit/twenty-live.spec.ts` (`@unit`), 9 tests: `parseViewCount` for "All People · 2", "All People\n· 1,226" and a missing count (throws); `latencySummary` odd/even median and empty (throws); `raceRoundNames` shape and wildcard guard; `lostUpdateVerdict` A/B/lost; `qaPeerMemberEmail` shape plus `qaMemberCountFilter()` still matching it (`p1-qa-%`).

Run `npm run test:unit` → **216 passed** (today 207: `npx playwright test --list --project=unit` → "Total: 207 tests in 30 files"; plus 9). Different: stop.

### Step 2. API helpers and fixtures

`src/products/twenty/fixtures/live-records.ts` (all with the member's `TwentyPinnedApiSession` from `memberApi`):

```
export async function createCompanyWith(api, input: { name: string; tagline?: string; employees?: number }): Promise<{ id: string }>
export async function readCompany(api, id): Promise<{ name: string; tagline: string; employees: number | null }>   // throws if missing
export async function softDeleteCompany(api, id): Promise<void>                       // deleteCompany(id) { id deletedAt }; throws unless deletedAt set
export async function readCompanyAnyState(api, id): Promise<{ live: number; deleted: Array<{ tagline: string; deletedAt: string }> }>
export async function createOpportunityInStage(api, name, stage: "NEW"): Promise<{ id: string }>
export async function readOpportunity(api, id): Promise<{ stage: string; amountMicros: number | null; currencyCode: string | null }>
export async function createPersonWithJob(api, firstName, lastName, jobTitle): Promise<{ id: string }>
export async function createPersonViaRest(member: TwentyQaMember, firstName, lastName, jobTitle): Promise<{ id: string; status: number }>   // fetch POST `${baseUrl}/rest/people`; throws unless 201 and data.createPerson.id
export async function updatePersonJobTitle(api, id, jobTitle): Promise<void>
export async function readPerson(api, id): Promise<{ firstName: string; jobTitle: string }>
export async function countPeopleMatching(api, contains: string): Promise<number>     // name.firstName ilike `%${contains}%`
export async function objectFieldIds(api, objectName: "opportunity" | "person", fields: readonly string[]): Promise<{ objectId: string; fieldIds: Record<string, string> }>
export async function createKanbanView(api, input: { name: string; objectId: string; stageFieldId: string }): Promise<{ id: string }>   // createView KANBAN, WORKSPACE, icon "IconLayoutKanban"
export async function createNameContainsFilter(api, viewId, nameFieldId, value): Promise<void>                                         // createViewFilter operand CONTAINS
```

`src/products/twenty/fixtures/member-page.ts`:

```
export async function openMemberPage(browser: Browser, storageStatePath: string): Promise<{ readonly page: Page; close(): Promise<void> }>
// newContext({ baseURL: loadTwentyConfig().baseUrl, storageState: storageStatePath }); never called without a path
```

`src/products/twenty/live-fixtures.ts`:

```
export interface LiveRecords {
  readonly api: TwentyPinnedApiSession;          // memberApi(twentyQaMember) (A)
  readonly peerApi: TwentyPinnedApiSession;      // memberApi(twentyQaPeer) (B), for B-side oracles only
  readonly prefix: string;                       // p1QaPrefix(RUN_SEED, parallelIndex)
  capture(kind: "company" | "opportunity" | "person" | "view", id: string): void;
}
export const test = visualTest.extend<{ peerPage: Page; liveRecords: LiveRecords }, { twentyQaPeer: TwentyQaMember }>({
  twentyQaPeer: [async ({ browser, twentyQaMember }, use, workerInfo) => {
    /* admin = createPinnedTwentyApiSession(readAdminWorkspaceIds()) (read only);
       peer = provisionQaMember(admin, browser, qaPeerMemberEmail(seed, parallelIndex), password);
       identity: for [twentyQaMember, peer] -> openMemberPage -> TwentyProfilePage.goto -> expectSignedInAs(own email); close;
       use(peer); finally deleteQaMember(peer); countQaMembers(admin, peer.email) === 0; AggregateError */
  }, { scope: "worker", timeout: 120_000 }],
  peerPage: async ({ browser, twentyQaPeer }, use) => { /* openMemberPage(browser, twentyQaPeer.storageStatePath); use(page); finally close() */ },
  liveRecords: async ({ twentyQaMember, twentyQaPeer }, use, testInfo) => {
    /* use(fixture); finally: destroy captured opportunity -> company -> person ids (destroy* from records.ts, each checked),
       then views (destroyView); recount by `${prefix}-` for companies/opportunities/people and views by name = 0; AggregateError (test error first) */
  },
});
```

`src/products/twenty/rtl-fixtures.ts`: `test = visualTest.extend<{ rtlPerson: { id: string; firstName: string } }>` creates `P1-QA-RTL-سارة` / `العتيبي 42`, job "مدير QA 2026", as `twentyQaMember`, and destroys it by id in `finally`.

Commands: `npm run typecheck` → exit 0. **Re-check K-01/K-02 once**: a scratch run of `createKanbanView` + `createNameContainsFilter` + `getView` shows 5 groups, then `destroyView` → true. Different: stop.

### Step 3. Page objects

Implement §8 exactly:

```
TwentyRecordPage (+): title(name); openTitleEditor(name): Promise<Locator>; fieldValue(text); openFieldEditor(shown, placeholder): Promise<Locator>; deletedBanner; restoreText
TwentyPeoplePage (+): rowById(id); liveSubscription(): Promise<Response>
TwentyKanbanPage: goto(viewId); columnHeader(stage); card(name); dragCardToColumn(name, stage)
TwentyProfilePage: goto(); emailField(); expectSignedInAs(email)
```

No CSS or XPath; `.last()` only in `openFieldEditor`, with its eslint-disable reason. `npm run lint` → exit 0. The first run of Step 4 re-checks G-04 (`getByRole("textbox", { disabled: true })` has the member's email as its value).

### Step 4. Concurrency: `tests/twenty/live/concurrency.spec.ts`

```
import { expect, test } from "../../../src/products/twenty/live-fixtures.js";
test.describe("Twenty concurrent edits", { tag: ["@twenty", "@live"] }, () => {
  // LU-001 and LU-002 each run as two tests over a shared body: runLu001(firstRound, ...) / runLu002(firstRound, ...), rounds firstRound..firstRound+4
  for (const [first, label] of [[1, "rounds 1-5"], [6, "rounds 6-10"]]):
  test(`P1-TW-LU-001 Two users edit the same field at once (${label})`, { annotation: [testId P1-TW-LU-001, priority P1] }, async ({ page, peerPage, liveRecords }, testInfo) => {
    for n in first..first+4:
      step `Round ${n}: fresh company`         → names = raceRoundNames(prefix, "LU001", n); id = createCompanyWith(api, { name: names.base }); capture
      step `Round ${n}: both open the record`   → Promise.all(recordA.goto("company", id), recordB.goto(...)); expect(title(base)).toBeVisible() in both
      step `Round ${n}: both save within one Promise.all` → [boxA, boxB] = Promise.all(openTitleEditor(base) ×2); fill a / b;
                                                   [ra, rb] = Promise.all(waitForResponse UpdateOneCompany on each page); Promise.all(boxA.press("Enter"), boxB.press("Enter"));
                                                   expect(ra.status()).toBe(200); expect(rb.status()).toBe(200)
      step `Round ${n}: observe before refresh` → record { aTitle, bTitle, warnings: status/alert/alertdialog counts } (attached, not asserted)
      step `Round ${n}: API oracle`             → stored = readCompany(api, id).name; verdict = lostUpdateVerdict(stored, names); expect(verdict).not.toBe("lost")
      step `Round ${n}: both UIs agree after refresh` → Promise.all(reload ×2); expect(recordA.title(stored)).toBeVisible(); expect(recordB.title(stored)).toBeVisible()
    attach lu-001-rounds.json { rounds: [{ n, winner, spreadMs, warnings, beforeRefresh }] }
  });
  (same two-label loop)
  test(`P1-TW-LU-002 Kanban move vs field edit (${label})`, { annotation: [testId P1-TW-LU-002, priority P1] }, async ({ page, peerPage, liveRecords }, testInfo) => {
    step "Board for this test"     → ids = objectFieldIds(api, "opportunity", ["stage", "name"]); view = createKanbanView(...`${prefix}-LU002-r${first}-Board`); createNameContainsFilter(view, nameId, `${prefix}-LU002-r`); capture view
    for n in first..first+4:
      step `Round ${n}: fresh opportunity in New` → opp = createOpportunityInStage(api, `${prefix}-LU002-r${n}`, "NEW"); capture
      step `Round ${n}: A on the board, B on the record` → Promise.all(kanban.goto(view.id), recordB.goto("opportunity", opp.id)); expect(kanban.card(name)).toBeVisible(); amount = recordB.openFieldEditor("Amount", "Currency"); amount.fill(String(500 + n))
      step `Round ${n}: drag and edit at once` → saved = peerPage.waitForResponse(UpdateOneOpportunity); Promise.all(kanban.dragCardToColumn(name, "Meeting"), amount.press("Enter")); expect((await saved).status()).toBe(200)
      step `Round ${n}: API oracle`   → expect.poll(() => readOpportunity(api, opp.id)).toMatchObject({ stage: "MEETING", amountMicros: (500 + n) * 1_000_000 })
      step `Round ${n}: no duplicate card, both values shown` → page.reload(); expect(kanban.card(name)).toHaveCount(1); peerPage.reload(); expect(recordB.fieldValue(String(500 + n))).toBeVisible(); expect(recordB.fieldValue("Meeting")).toBeVisible()
  });
  test("P1-TW-LU-X01 Edits to different fields of one record both persist", …)   // 5 rounds; A openTitleEditor -> `${base}-X`; B openFieldEditor("tg-0", "Tagline") -> "tg-X"; Promise.all Enter (both 200); API name and tagline; after reload: A shows tagline tg-X, B shows title `${base}-X`
  test("P1-TW-LU-X02 A delete while B edits never brings the record back", …)      // create { name, tagline "tg-0" }; B record; box = openFieldEditor("tg-0", "Tagline"); fill "tg-B";
                                                                                    // softDeleteCompany(api, id) (D9); HARD: expect(recordB.deletedBanner).toBeVisible(); expect(recordB.restoreText).toBeVisible();
                                                                                    // saved = waitForResponse UpdateOneCompany; box.press("Enter"); status = (await saved).status()   (recorded, not asserted)
                                                                                    // state = readCompanyAnyState(api, id); HARD: expect(state.live).toBe(0); expect(state.deleted).toHaveLength(1)
                                                                                    // attach x02-observation.json { saveStatus: status, deletedRowTagline: state.deleted[0].tagline }   (observation evidence only, never asserted)
});
```

Command: `npx playwright test --project=twenty-chromium tests/twenty/live/concurrency.spec.ts` → 1 setup + **6 passed** (LU-001 ×2, LU-002 ×2, LU-X01, LU-X02). Each test under 110 s (D5). Leak script → 0. Run it a second time → same.

**Stop rule (Steps 4 and 5):** if any LU or RT test is flaky, fails, or differs between the two runs, stop. Label it with its trace (and screenshot, HTTP status and body) as TEST BUG or PRODUCT BUG before changing anything. Rule out our side first: the wrong user in a context, or a subscription not yet ready. Never add waits, sleeps, retries or longer timeouts to get green.

### Step 5. Real time: `tests/twenty/live/realtime.spec.ts`

```
test.describe("Twenty real-time propagation", { tag: ["@twenty", "@live"] }, () => {
  test("P1-TW-RT-001 Update in context A appears in context B", { annotation: [testId RT-001, priority P1] }, async ({ page, peerPage, liveRecords }, testInfo) => {
    step "Person for this test"    → p = createPersonWithJob(api, `${prefix}-RT001-Ann`, "Probe", "rt-0"); capture
    step "B watches the People list" → sub = peopleB.liveSubscription(); peopleB.goto(); peopleB.filterNameContains(`${prefix}-RT001`); expect(peopleB.rowById(p.id)).toContainText("rt-0"); await sub; urlB = peerPage.url()
    step "A opens the person"      → recordA.goto("person", p.id); expect(recordA.fieldValue("rt-0")).toBeVisible()
    for i in 1..3:
      step `Edit ${i}: A saves the job title` → box = recordA.openFieldEditor(`rt-${i-1}`, "Job Title"); box.fill(`rt-${i}`); saved = page.waitForResponse(UpdateOnePerson); box.press("Enter"); expect((await saved).status()).toBe(200); t0 = Date.now()
      step `Edit ${i}: B shows it without a reload` → await expect.poll(() => peopleB.rowById(p.id).innerText(), { intervals: [50] }).toContain(`rt-${i}`); samples.push(Date.now() - t0); expect(peerPage.url()).toBe(urlB)
      step `Edit ${i}: API oracle`  → expect((await readPerson(api, p.id)).jobTitle).toBe(`rt-${i}`)
    attach rt-001-latency.json latencySummary(samples)
  });
  test("P1-TW-RT-002 Record created by API appears live", { annotation: [testId RT-002, priority P2, issue TW_RT_002_CREATED_ROW_MISSING_ISSUE] }, async ({ peerPage, liveRecords, twentyQaMember }, testInfo) => {
    step "Seed row in B's filtered list" → seed = createPersonWithJob(api, `${prefix}-RT002-Seed`, "Probe", "anchor-0"); capture; sub = peopleB.liveSubscription(); peopleB.goto(); peopleB.filterNameContains(`${prefix}-RT002`); expect(peopleB.rowById(seed.id)).toBeVisible(); await sub; navs = count main-frame navigations from here
    step "Create through REST"     → created = createPersonViaRest(twentyQaMember, `${prefix}-RT002-Rest`, "Probe", "created"); capture; expect(created.status).toBe(201); expect(await countPeopleMatching(api, `${prefix}-RT002`)).toBe(2)
    step "B's stream is live after the create" → updatePersonJobTitle(api, seed.id, "anchor-1"); t0; expect(peopleB.rowById(seed.id)).toContainText("anchor-1"); anchorMs = Date.now() - t0; expect(peopleB.viewCount()).toContainText("· 2"); expect(navs).toBe(0)
    step "Known bug evidence"      → attachKnownBugEvidence(peerPage, testInfo, { issue, observed: { rowsById: await peopleB.rowById(created.id).count(), viewCount: await peopleB.viewCount().innerText(), anchorMs, apiMatches: 2 }, expected: { rowsById: 1 } })
    test.fail(true, TW_RT_002_CREATED_ROW_MISSING_ISSUE)
    step "The new row appears without a reload" → expect(peopleB.rowById(created.id)).toBeVisible()
  });
});
```

Command: the same pattern → 1 setup + **1 passed + 1 expected failure**. Leak script → 0. Twice. **Re-check X-02's strings** (deleted banner, Restore) in the same runs (LU-X02 from Step 4). The Step 4 stop rule applies.

### Step 6. Arabic RTL: `tests/twenty/i18n/rtl.i18n.spec.ts`

```
import { expect, test } from "../../../src/products/twenty/rtl-fixtures.js";
test.describe("Twenty Arabic RTL", () => {
  test.use({ memberPrefs: { locale: "ar-SA" } });
  async function expectRtl(page) { await expect.poll(() => page.evaluate("document.documentElement.dir"), { timeout: twentyTimeouts().page }).toBe("rtl"); expect(await page.evaluate("document.documentElement.lang")).toBe("ar-SA"); expect(await page.evaluate("getComputedStyle(document.body).direction")).toBe("rtl") }
  async function expectNoClipping(page) { scroll = documentScroll(page); expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1); expect(overflowingControls((await measureScroll(page.getByRole("button").filter({ visible: true }))).map(b => ({ ...b, sh: b.ch })))).toEqual([]) }
  test("P1-TW-VIS-X07 Arabic People list mirrors and matches the baseline", { tag: ["@twenty", "@visual"], annotation: testId P1-TW-VIS-X07 }, async ({ page, rtlPerson }, testInfo) => {
    freezeClock(page, VISUAL_FROZEN_INSTANT); people.goto(); people.filterNameContains("P1-QA-RTL"); expect(people.rowById(rtlPerson.id)).toBeVisible(); expectRtl(page);
    if not visual-mobile: companiesLink = page.getByRole("link", { name: "Companies", exact: true }) (stays English, E-07); box.x > viewport.width / 2 ("sidebar mirrored to the right")
    expectNoClipping(page); stableScreenshot(page, "tw-people-ar", { mask: maskLocators(page, "twenty"), networkIdle: false })
  });
  test("P1-TW-VIS-X07 Arabic person record mirrors and matches the baseline", …)   // record.goto("person", rtlPerson.id); expect(record.fieldsWidget).toBeVisible(); expectRtl; fieldsWidget box.x > viewport.width / 2 (not mobile); expectNoClipping; "tw-person-ar"
  test("P1-TW-VIS-X07 Arabic Settings Experience mirrors and matches the baseline", …) // settings.goto(); expectRtl; getByRole("navigation") box.x > viewport.width / 2 (E-04: 1109 of 1440; not mobile); expectNoClipping; "tw-settings-ar"
  test("P1-TW-VIS-X07 Arabic adds no axe violations over English", …)  // onlyOnProjects(["visual-desktop"]); test.setTimeout(180_000) // two locales x three pages of axe (precedent contrast.a11y.spec.ts:71)
    // for each of people / record / settings: setQaMemberPrefs(twentyQaMember, { locale: "en" }); goto; poll dir "ltr"; en = axeScan(page, { allowlist: TWENTY_AXE_ALLOWLIST, project, context: "light" });
    // setQaMemberPrefs(twentyQaMember, { locale: "ar-SA" }); reload; expectRtl; ar = axeScan(...same); expect(idCounts(ar.report.blocking)).toEqual(idCounts(en.report.blocking)); attachAxeReport both
});
```

Baselines: `npm run visual:update -- --product=twenty` (Docker, ADR 0017) creates exactly the 9 `tw-*-ar.png` files (`git status` shows only those 9 new PNGs). Open each one and check that it shows mirrored RTL, then run `npm run visual:test -- --product=twenty` twice → all pass, with X07: 3 tests × 3 projects + 1 axe test (desktop); the other projects skip it. Leak script → 0.

### Step 7. Docs (§17), then `npm run check` → exit 0.

### Step 8. `--list` sanity

- `npx playwright test --list --project=twenty-setup --project=twenty-chromium` → **Total: 43 tests in 10 files** (35 in 8 today, plus 8 in 2).
- `npx playwright test --list --project=visual-mobile --project=visual-tablet --project=visual-desktop tests/twenty` → **Total: 51 tests in 8 files** (39 in 7 today, plus 4 × 3).
- `--project=unit` → **216**. Different: stop.

### Step 9. Stability and timing

Full `npm run test:twenty` twice and the Twenty visual run twice (§15). Record per-file durations against B-twenty and B-visual-twenty, apply the §12 rule, and count `known-issue` annotations (TW-LOGIN-F01 reloads) in each report plus the `TW-LOGIN-F-01` console lines.

Also report **how many `/welcome` UI logins one full `npm run test:twenty` makes now**, for the saved-login audit. Break the number down by source, each cited path:line: `twenty-setup` (Jane), one `twentyQaMember` per worker, one `twentyQaPeer` per worker (new), `freshTwentyMember` per 2FA test, the in-test 2FA logins, `login-recovery.spec.ts`, and the one-retry path in `provisionQaMember` (`qa-member.ts:149-175`). Cross-check it against the run: count `GetLoginTokenFromCredentials` requests from the Playwright traces of one run. If the traces do not hold them, report the static count only and say so.

## 15. Verification plan (hard gate before any push; paste real output)

1. `npm run check` → exit 0.
2. `npm run test:unit` → **216 passed**.
3. `npm run test:twenty -- --output=../p1-out/tw-run1` and then `--output=../p1-out/tw-run2` (outside `test-results`): **B-twenty + 7 passed + 1 expected failure (RT-002), 0 failed, 0 flaky** in each run, with identical RT-002 evidence JSON (except times) and the TW-LOGIN-F01 reload count reported.
4. `npm run visual:test -- --product=twenty --output=../p1-out/vis-run1` and then `vis-run2`: **B-visual-twenty + 10 passed for X07** (the other X07 projects skipped), 0 failed.
5. After each run: `npx tsx scripts/count-twenty-qa-leaks.mts` → all 0 including `qaMembers 0`; the §10 SQL → all 0.
6. Other products are not run locally. They are covered by the PR's CI run compared with main's last green run **39084847852**; any job that differs: stop.
7. After the push (Jayami pushes or approves): paste the `twenty-self-hosted` footer and summary row (up seconds, seed, Playwright totals, leak block), and confirm that `e2e / visual` and every other job is green with no `flaky` or `retry` lines.

## 16. Commit plan (Conventional, lowercase, explicit paths, never `git add -A`, no trailer)

1. `docs(plan): phase 4 batch 4 twenty live updates and rtl`
2. `feat(twenty): live helpers, peer member and record fixtures` (+ `tests/unit/twenty-live.spec.ts`)
3. `feat(twenty): record editor, kanban and profile page objects`
4. `test(twenty): concurrent edit cases`
5. `test(twenty): real-time propagation cases`
6. `test(twenty): arabic rtl layout and baselines`
7. `docs(twenty): adr 0016 amendment, known issues and readme coverage`

No merge, tag or force-push. No CodeRabbit (Jayami runs `cr review --agent`). Never the Bridge-bss account. No Co-Authored-By, "Generated with" or model line in commits or PR bodies.

## 17. Docs and ADR

- `docs/adr/0016-twenty-ci.md`, new section "Amendment (Phase 4 batch 4: live updates, concurrency and RTL)": the SSE transport and the subscription readiness signal; that `setOffline` does not cut SSE in Chromium and what a true cut needs; the random 0–120 s reconnect, the clock probe (O-07), and why RT-003/RT-004 are documented findings; the worker peer member and identity check; Kanban mouse steps; silent last-write-wins (no conflict warning); the X-02 silent write into a deleted record; measured latencies; the timing arithmetic with real numbers.
- `docs/observations/twenty-known-issues.md`: new entry **TW-RT-002-F1** (Observed / Expected / Evidence, layout as the existing entries) with the measured facts from both build runs. Under "Observations": O-04 (RT-003 gap), O-05 (RT-004 converges after the backoff, no duplicates), O-01, O-07 (the clock breaks the reconnect), O-LU-02, O-LU-03, O-RT-05, O-RTL-01, O-RTL-02, and X-02 (a save into a soft-deleted record returns 200 and writes the deleted row: possible data-integrity issue, no documented contract; evidence from both LU-X02 runs). Add the new tests to the "Tests" list.
- `README.md`: a "Phase 4 batch 4: Twenty (live updates, concurrency, RTL)" table with LU-001, LU-002, LU-X01, LU-X02, RT-001, RT-002 (expected fail), RT-003 and RT-004 (finding, not automated) and VIS-X07, real totals from §15, the TW-RT-002-F1 known-bug row, and a note that Twenty RTL is done (line 37 says it was carried). Replace the "Carried to batch 4" line (`README.md:279`) with the outcome.

## 18. Will NOT do

- No edits to forks or the harness, and no harness bump (gate (a) needs none; the reconnect backoff is product behaviour, not a harness gap).
- No stream-fault init script, `setOffline` test, or `routeWebSocket` (Twenty uses SSE, not WebSocket). No RT-003/RT-004 tests.
- No new workflow, artifact type, report format, script, tooling or dependency. No new `.md` except this plan.
- No committed evidence or exported PNG/JSON beyond the 9 baselines.
- No write as Jane, no role changes, no locale change on the peer, no use of the seeded "By Stage" view.
- No `waitForTimeout`, sleeps, retries or raised timeouts, except the one named axe exception (R9, with precedent). No env or browser conditions. No conditional logic in specs (the `visual-mobile` geometry skip goes through `onlyOnProjects` / a project-name branch identical to `tests/cal/i18n/rtl.i18n.spec.ts:38`).
- No `page.clock` / `context.clock` in live-update tests (O-07). No branch-protection or ruleset change, no CodeRabbit, no merge/tag/force-push, never Bridge-bss, no Co-Authored-By. No Medusa, P2, P5 or P6 work, and no batch 3 rework. No fix for PR #38.
- The 7 leftover `probe-cal-*` views are not touched (OQ6).

## 19. Open questions (answered in review, 2026-10-18)

1. **RT-003 / RT-004.** **Not built; documented as findings O-04 and O-05** with measured times. The review asked for Playwright's clock to be probed first. It was (O-07, 3 runs): the app works under the clock, but after `runFor` or `fastForward` the stream never re-opens and live updates stop. So the clock cannot reach "after reconnect", and real time needs up to 120 s or more (O-03), with no raised timeouts allowed. RT-003 as `test.fail` was considered (the list refetches on reconnect, the record page does not), but there is no deterministic way to reach that state inside the budget.
2. **Extras.** **Accepted: LU-X01, LU-X02. Dropped: LU-X03, permission change, reconnect storm, RTL bidi** (§6).
3. **Rounds.** **LU-001 and LU-002: 2 tests × 5 rounds each** ("(rounds 1-5)", "(rounds 6-10)", same testId). **LU-X01: 5 rounds** (D5).
4. **RT-002.** **PRODUCT BUG TW-RT-002-F1 with `test.fail`**, working-path asserts first (approved).
5. **`e2e / visual` required.** Approved as chosen: Jayami adds it to the `protect-main` ruleset after this PR's CI is green (D10); PR #38 does not block the switch.
6. **Leftover `probe-cal-*` views.** Not touched; Jayami handles them separately.
7. **Tag and folder.** `@live` and `tests/twenty/live/` (approved).
8. **LU-X02 delete through the API.** Approved (D9). Only the banner, Restore, live count 0 and exactly one soft-deleted row are hard asserts; the silent write is observation evidence.
