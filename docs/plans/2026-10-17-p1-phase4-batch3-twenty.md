# Phase 4 batch 3: Twenty CSV import robustness and TOTP 2FA

## Context

Batches 1–2 finished Medusa. Batch 3 adds two primitives to the Twenty suite: **file ingest** (BOM, delimiter detection, quoting, partial vs all-or-nothing, uniqueness under bulk input) and **second-factor authentication** (enrolment, wrong-code rejection, single use, time window, session state). The cases are P1-TW-CSV-001..004 and P1-TW-2FA-001..002, plus 12 proposed extras. A two-run live probe on harness v0.2.11 backs every assertion below. Gate (a) passed: P1 can already create and delete an independent member per test with existing code, so **no harness change is needed**. The probe found three a11y/security product bugs (2FA replay accepted, unnamed 2FA code field, and a "Finish flow with errors" confirm hidden from assistive tech) and several observations.

## 1. Header

- Repo: `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1.
- Branch: **to be given by Jayami**. Placeholder only: `feat/2026-10-17-p1-phase4-batch3-twenty`. No branch was created.
- Base: **main @ `4b1f7f8`**. SHA read: `git checkout main && git pull` → "Already up to date", `git rev-parse HEAD` → `4b1f7f8f79945ad9d3125c14a5e3ab4121ce8786` (PR #40 merge). Working tree clean.
- Harness: `qa-portfolio-harness#v0.2.11` = `f96038f951c8d62521ac60098661a851df9f65bb` (`package.json:37`; `package-lock.json` resolves `#f96038f…`, `"version": "0.2.11"`; local checkout `git describe` = `v0.2.11`).
- Twenty: running image **`twentycrm/twenty:v2.44.0`** (harness `src/config.ts:65`, up output). Fork `Jayami123/twenty-CRM` @ **`7cbdfec6f346b43715bc2056932f4fad5886f733`** (`git describe` = `sdk/v2.43.0-127-g7cbdfec6f3`). The fork is read as source reference only; the image is the upstream tag. Every behaviour cited from fork source was also **seen live** (rows below). The fork has two untracked paths (`packages/twenty-docker/docker-compose.validation.yml`, `scripts/`). They are not ours; reported only, not touched.
- Ports: app `http://127.0.0.1:3002`, Postgres `127.0.0.1:5434` (harness `src/config.ts:54,59`; P1 `src/products/twenty/env.ts:377-378`). 127.0.0.1 only (`env.ts:443-446`).
- Env names (values never printed): `TWENTY_BASE_URL`, `TWENTY_IMAGE_TAG`, `TWENTY_DB_URL`, `TWENTY_EMAIL`, `TWENTY_PASSWORD` (P1 `.env.example:56,59,65,68,69`; commented out, so the harness defaults apply). Harness `.env` count: `grep -c '^TWENTY_[A-Z_]*=.\+' .env` → `3`. P1 `.env` → `0`. No value was required.
- otplib: `"otplib": "12.0.1"` (`package.json:51`). Used through `src/core/totp.ts:1,11-21` (`authenticator.clone({ epoch, step, window })`), by Cal (`tests/cal/auth/2fa.spec.ts:26`) and Documenso (`src/products/documenso/totp-mint.ts:1-24`). No new dependency.
- Structure/depth model: [2026-10-11-phase-2e-task3-2fa.md](2026-10-11-phase-2e-task3-2fa.md). Process: [2026-10-17-p1-phase4-batch2-medusa.md](2026-10-17-p1-phase4-batch2-medusa.md). Twenty: ADR 0012, 0013, 0016; ADR 0017 (visual).
- "Verified" means seen live in this session (rows G/A/C/K/F, run 1 and run 2) or read in source with path:line. Probe scripts, CSV files and logs stay in the session scratchpad (`…/scratchpad/probe/`). Nothing was written to P1, the harness or the fork. No QR code or filled login/2FA form was screenshotted or snapshotted.
- Status: **approved with review edits (2026-10-17); OQ1–OQ6 answered (§19). Not built.** Building starts in a new chat after Jayami creates the branch. The harness stack is still up (stop only on Jayami's go-ahead).

## 2. Step 1: probe findings (run 1 and run 2)

Start: `node scripts/up.mjs twenty` → "Twenty stack is up (image twentycrm/twenty:v2.44.0) … HTTP 200"; `npm run smoke -- twenty` → `currentUser.email=jane.austen@apple.dev (HTTP 200)`, `pg { ok: 1 }`, "smoke ok". Probes: Playwright 1.63.0 Chromium from P1 `node_modules`, run through `npx tsx` and importing P1's own fixtures (`provisionQaMember`, `twentyGraphql`, `TwentyLoginPage`). All records were named `P1-PROBE-<ts>-…`, emails `p1-probe-<ts>-…@example.test`. **Run 2 matched run 1 on every row** unless a row says otherwise.

### Gate (a): a fresh member per test (first)

| #    | Step                                   | Request                                                                                                                                                                      | Expected                        | Observed r1 / r2                                                                                                         | Verdict |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| G-01 | Read invite hash (Jane, read only)     | `POST /metadata` `QaInvite` (`qa-member.ts:42-44,100-106`)                                                                                                                   | public invite enabled           | enabled; `provisionQaMember` continued                                                                                   | Pass    |
| G-02 | Sign up a brand-new member             | `POST /metadata` `signUpInWorkspace` → `getAuthTokensFromLoginToken` (`qa-member.ts:116-133`), then UI `/welcome` → `/create/profile` → `/objects/` (`qa-member.ts:144-156`) | member created with own session | created with arbitrary email/password; durations 31.8 s, 46.1 s, 15.5 s, 14.0 s, 11.4 s (5 members across runs)          | Pass    |
| G-03 | Count it                               | `POST /graphql` `workspaceMembers(filter:{userEmail:{like}})` (`qa-member.ts:233-243`)                                                                                       | 1                               | 1                                                                                                                        | Pass    |
| G-04 | Sign in as itself                      | `currentUser` with its own bearer                                                                                                                                            | OK                              | OK                                                                                                                       | Pass    |
| G-05 | Delete it (also after 2FA was enabled) | `POST /metadata` `deleteUser` with its stored bearer (`qa-member.ts:214-224`)                                                                                                | deleted                         | OK on all 19 probe members, including 7 with 2FA VERIFIED (the bearer survives enabling 2FA, A-12); `countQaMembers` → 0 | Pass    |
| G-06 | Jane never gets 2FA                    | Jane is used only for the invite hash and counts                                                                                                                             | no write to Jane                | no 2FA call ever ran with Jane's session                                                                                 | Pass    |

**Gate result: pass.** `provisionQaMember(admin, browser, email, password)` already creates an independent member per call and `deleteQaMember` removes it. No harness or fork change is needed.

### 2FA (on fresh members only)

| #    | Step                                    | Request / UI                                                                                                                                                        | Expected                           | Observed r1 / r2                                                                                                                                                                                                                                     | Verdict                                       |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A-01 | 2FA exists in Settings                  | `/settings/profile`: section "Two Factor Authentication", card text "Authenticator App", status "Deactivated"                                                       | present                            | present; click → `/settings/profile/two-factor-authentication/TOTP` (route `SettingsPath.ts:3`)                                                                                                                                                      | Pass                                          |
| A-02 | Enrolment page                          | `POST /metadata initiateOTPProvisioningForAuthenticatedUser 200`                                                                                                    | QR + secret                        | QR plus button "setup key" (`SettingsTwoFactorAuthenticationMethod.tsx:166-171`); **no secret is shown as text** (0 matches for `^[A-Z2-7]{16,}$`); one textbox (`autocomplete=one-time-code`); buttons "Cancel", "Save"; no recovery codes anywhere | Pass (secret only via the "setup key" button) |
| A-03 | Capture the secret from the UI          | context `permissions: clipboard-read, clipboard-write`; click button "setup key" → `navigator.clipboard.readText()`                                                 | base32 secret                      | 16 chars, base32; toast "Setup key copied to clipboard"                                                                                                                                                                                              | Pass                                          |
| A-04 | Wrong code at enrolment                 | fill `000000` → Save → `verifyTwoFactorAuthenticationMethodForAuthenticatedUser`                                                                                    | refused                            | GraphQL `INTERNAL_SERVER_ERROR` "Invalid OTP" (HTTP 200); toast `role=status` "Invalid verification code. Please try again."                                                                                                                         | Pass                                          |
| A-05 | Correct code after a wrong one (`fill`) | `fill(code)` on the same field                                                                                                                                      | accepted                           | **refused**: the request carried a 6-digit value that was not the minted code. Clear (Ctrl+A, Backspace) + `pressSequentially(code)` → accepted. Seen in 3 runs.                                                                                     | **TEST-side input rule** (see D2)             |
| A-06 | Correct code first try                  | `click` + `pressSequentially(code)` → Save                                                                                                                          | accepted                           | toast `role=status` "Two-factor authentication setup completed successfully!" → `/settings/profile`, status "Active"; API summary `VERIFIED` (4 runs)                                                                                                | Pass                                          |
| A-07 | API enrolment (for fixtures)            | `initiateOTPProvisioningForAuthenticatedUser { uri }` → secret from `uri` → `verifyTwoFactorAuthenticationMethodForAuthenticatedUser(otp)` with member bearer       | VERIFIED                           | `{ success: true }`, summary `[{status:"VERIFIED"}]`                                                                                                                                                                                                 | Pass                                          |
| A-08 | Login challenge                         | `/welcome` → email → password → ops `GetLoginTokenFromCredentials 200`, `getAuthTokensFromLoginToken 200` (error `TWO_FACTOR_AUTHENTICATION_VERIFICATION_REQUIRED`) | challenge page                     | URL stays `/welcome`; text "Verify code from the app", "Paste the code below"; one textbox (`inputmode=numeric`, `maxlength=6`); buttons "Submit", "Back"                                                                                            | Pass                                          |
| A-09 | Wrong code at login                     | fill `000000` → Submit → `getAuthTokensFromOTP`                                                                                                                     | refused with a message             | toast `role=status` "Invalid verification code. Please try again."; URL `/welcome`; field cleared                                                                                                                                                    | Pass                                          |
| A-10 | Then the correct code                   | fill valid → Submit                                                                                                                                                 | signed in                          | `/objects/companies` (6 logins across runs)                                                                                                                                                                                                          | Pass                                          |
| A-11 | Logout then login (2FA-001 path)        | Settings nav button "Logout" → `/welcome` → sign in → challenge → valid code                                                                                        | code required and accepted         | as A-08/A-10; enrol 17–21 s, re-login 10.6–14.7 s                                                                                                                                                                                                    | Pass                                          |
| A-12 | Sessions after enabling                 | old bearer `currentUser`; a second UI context opened before enabling, reloaded                                                                                      | recorded                           | **both kept**: bearer OK, second context stays on `/objects/people`                                                                                                                                                                                  | Observation (asserted, X03)                   |
| A-13 | Replay                                  | the same code used for 2 API logins (fresh login tokens), twice on one login token, then once more in the UI                                                        | second use refused (RFC 6238 §5.2) | **all accepted** (3 runs). Source: stateless check `totp.strategy.ts:125`; no used-code store in `two-factor-authentication.service.ts:150-207`                                                                                                      | **PRODUCT BUG** candidate (X01)               |
| A-14 | Time window                             | `getAuthTokensFromOTP` with codes at epoch offsets −3…+2 steps (otplib `epoch`)                                                                                     | recorded                           | −3 ✗, −2 ✗, **−1 ✓, 0 ✓, +1 ✓**, +2 ✗ (3 runs) = `window: 1` (`totp.strategy.constants.ts:152-158`); ✗ = `BAD_USER_INPUT/INVALID_OTP`                                                                                                                | Pass (X02)                                    |
| A-15 | Disable                                 | `/…/TOTP` → button "Reset 2FA" → modal with one textbox named with the user's email → button "Reset 2FA"                                                            | recorded: code required?           | **no code**: typing the email is enough; toast `role=status` "2FA Method has been deleted successfully."; summary `[]`; next login has no challenge (lands on `/objects`)                                                                            | Observation (asserted, X04)                   |
| A-16 | Challenge field name                    | `getByRole("textbox").ariaSnapshot()`; `getByRole("textbox", { name: /code/i })`                                                                                    | named                              | `- textbox` (**empty name**), 0 named matches; `aria-label`, `name`, `id` all empty                                                                                                                                                                  | **PRODUCT BUG** candidate (X05, WCAG 4.1.2)   |
| A-17 | PENDING method + OTP login              | run 1 only: API OTP login while the method was still PENDING                                                                                                        | –                                  | accepted and the method became VERIFIED (`service.ts:202-206` sets VERIFIED on any valid OTP)                                                                                                                                                        | Observation (API only; not tested)            |

### CSV import (as a fresh P1-PROBE member's session)

Wizard: People → button "Command Menu" → text "Import People" (no role) → dialog "Import data": steps Upload File → Match Columns → Validate Data. Upload via button "Select file" fires a `filechooser` event (C-01). Header "Emails" is **not** auto-mapped. Button "Select column..." → `option` "Emails / Primary Email Emails" → button "Emails / Primary Email". Then "Next Step" → grid + switch "Show only rows with errors" + "Confirm". Writes go through `batchCreateManyRecords({ upsert: true })`, batch 200 (`useOpenObjectRecordsSpreadsheetImportDialog.ts:41-48,80-83`; `SpreadsheetImportCreateRecordsBatchSize.ts`). Parser: SheetJS `read(…, { codepage: 65001 })` (`DropZone.tsx:148-154`).

| #    | Case                                   | Data                                                                                | Observed r1 / r2                                                                                                                                                                                                                                                                                                    | Verdict                                     |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| C-01 | Upload by file chooser                 | 2 rows                                                                              | `waitForEvent("filechooser")` + "Select file" → Match Columns; "All People · 2" after a name filter                                                                                                                                                                                                                 | Pass                                        |
| C-02 | **BOM** + CRLF, 100 rows               | `\uFEFF` + `First Name,Last Name,Emails`                                            | first column label text is exactly `"First Name"` (`getByText("First Name", { exact: true })` count 1); auto-mapped to "Name / First Name"; 0 error rows; dialog closes; API count **100**; 0 first names start with U+FEFF; 100 emails set; People filtered by the prefix → button "All People · 100"; 26.6–30.4 s | Pass (CSV-001)                              |
| C-03 | No BOM                                 | 5 rows                                                                              | same header text; 5 imported                                                                                                                                                                                                                                                                                        | Pass                                        |
| C-04 | **`;` delimiter**, umlauts             | `;`, "Jürgen", "Müller-Lüdenscheid", "Größe", "Östergård n"                         | 3 columns detected automatically (**no delimiter choice is offered**); 5 imported; umlauts intact (API). `;` + BOM: 3 imported                                                                                                                                                                                      | Pass (CSV-002)                              |
| C-05 | Comma decimals                         | needs a numeric People field                                                        | People has **no NUMBER/CURRENCY field** (metadata: `performanceRating:RATING`, `jobTitle:TEXT`, `intro:TEXT`, phones, links, emails…)                                                                                                                                                                               | **Data point dropped** (D6)                 |
| C-06 | **Bad row 50**                         | 100 rows, row 50 email `not-an-email`                                               | Validate: 1 error row (switch on); hover on the cell → `role=tooltip` "Emails / Primary Email is not a valid email"; Confirm → "Finish flow with errors / … Rows with errors will be ignored when submitting." → Submit → **99 imported, row 50 absent**                                                            | Pass: **partial import** (CSV-003)          |
| C-07 | **Duplicate email in file**            | rows 5 and 6 share an email                                                         | **both** rows flagged; tooltip "This Primary Email (emails) value already exists in your import data"; Submit → **8 imported, 0 people with that email**                                                                                                                                                            | Pass: error per row, never two (CSV-004)    |
| C-08 | Email of an existing person            | person pre-created via API; CSV row with the same email, other name                 | no error; **upsert**: count with that email 1, **same id**, first name overwritten by the CSV's                                                                                                                                                                                                                     | Observation (X01)                           |
| C-09 | Same file imported concurrently        | 20 rows, two contexts, `Promise.all`                                                | both dialogs close; API count **20**; **0 duplicate emails**                                                                                                                                                                                                                                                        | Pass (X02)                                  |
| C-10 | Cancel mid-import                      | 1,000 rows                                                                          | progress "200 out of 1,000 records imported." when Cancel was clicked; dialog closes, no message; **800 persisted** (same 5 s later)                                                                                                                                                                                | Observation (X03; invariant only)           |
| C-11 | Row limit                              | 10,001 / 10,000 data rows                                                           | 10,001 → toast `role=status` "Too many records. Up to 10000 allowed", stays on Upload (**r2 and r3**; r1's script did not watch for the toast and saw only "stayed on Upload"); 10,000 → Match Columns (closed without importing). Limit constant `SpreadsheetMaxRecordImportCapacity.ts:1` = 10000                 | Pass (X04)                                  |
| C-12 | Header-only                            | header line only                                                                    | Match → Validate with 0 data rows → Confirm → closes; 0 created                                                                                                                                                                                                                                                     | Observation (X05)                           |
| C-13 | Empty file                             | 0 bytes                                                                             | stays on Upload, **no message** (no `status`/`alert`)                                                                                                                                                                                                                                                               | Observation (X05)                           |
| C-14 | LF vs CRLF                             | 5 rows LF                                                                           | 5 imported, same as CRLF                                                                                                                                                                                                                                                                                            | Pass (X06)                                  |
| C-15 | Quoting                                | `"Doe, Jr."`, `"Say ""hi"""`, job `"Head; of, Sales"`, intro `"Line one\nLine two"` | all values stored exactly (API)                                                                                                                                                                                                                                                                                     | Pass (X06)                                  |
| C-16 | "Finish flow with errors" confirm a11y | C-06 / C-07                                                                         | no `dialog` role; `getByRole("button", { name: "Submit" })` count **0**; the `<button>` sits inside a `div[aria-hidden=true]`; it is clickable only by text                                                                                                                                                         | **PRODUCT BUG** candidate (X07, WCAG 4.1.2) |

### Cleanup and leaks

| #    | Step                       | Request                                                                               | Observed r1 / r2                                                                                                                                                         |
| ---- | -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K-01 | Bulk delete                | `POST /graphql` `destroyPeople(filter: { id: { in: [...] } }) { id }` (member bearer) | 101 ids in one call accepted; then chunks of 100; 1,050 + 1,050 + 2 + 2 + 6 + 5 + 8 = 2,123 people destroyed; remaining 0                                                |
| K-02 | Hard vs soft               | read-only SQL (below)                                                                 | `total 1200, soft_deleted 0, p1 0`: destroy is a **hard delete**. Server default `MUTATION_MAXIMUM_AFFECTED_RECORDS = 100` (`config-variables.ts:1705`), so P1 uses 100  |
| K-03 | Members                    | `deleteUser` per member                                                               | `workspaceMember` P1 rows 0; `core.user` keeps soft-deleted rows (`deletedAt` set on all: 19 `p1-probe`, 127 older `p1-qa`; 0 active); 2FA method rows for probe users 0 |
| K-04 | Exploration leftover       | the first wizard walk imported `P1-PROBE-A` (id `1d290441-…`) without an email        | destroyed by id in the next probe's cleanup                                                                                                                              |
| K-05 | Leak script                | `npx tsx scripts/count-twenty-qa-leaks.mts` (twice, last after all probes)            | `before 0, deleted 0, after 0, viewsBefore 0, viewsDeleted 0, viewsAfter 0, qaMembers 0`, exit 0                                                                         |
| K-06 | Coverage of the leak sweep | `sweep.ts:188`                                                                        | people are matched **only** by `name.firstName ilike 'P1-QA-%'`; a lowercase `p1-qa-…` email is **not** counted → extend (D7)                                            |
| K-07 | Missing auth file          | CI run 38931396826 log, "Count Twenty QA leaks" step                                  | `Error: ENOENT … p1/.auth/twenty-jane.json` → `exit code 1`: **fails closed** (`sweep.ts:283-284` → `auth.ts:90` throws → `count-twenty-qa-leaks.mts:44-47` sets exit 1) |

Read-only SQL used (workspace schema `workspace_1wgvd1injqtife6y4rvfbu3h5` is Apple's; it held the imported rows):

```
select count(*) total,
       count(*) filter (where "deletedAt" is not null) soft_deleted,
       count(*) filter (where "nameFirstName" ilike 'P1-QA-%' or "emailsPrimaryEmail" ilike 'p1-qa-%') p1
from workspace_1wgvd1injqtife6y4rvfbu3h5.person;                                  -- after a run: p1 = 0
select count(*) from workspace_1wgvd1injqtife6y4rvfbu3h5."workspaceMember"
where "userEmail" ilike 'p1-qa-%';                                                -- after a run: 0
```

### Known flake

| #    | Step                     | Evidence                                                                                                                                                                                                                                                       | Verdict                                      |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| F-01 | Cold `/welcome` load, 5× | page body is **empty** until the JS bundle runs and `POST /metadata GetPublicWorkspaceDataByDomain 200` returns (3.7–7.4 s). The textbox appears 0.4–0.9 s later (4.1–8.0 s total), with "Welcome, Apple." on screen                                           | Signal identified                            |
| F-02 | CI run 38931396826       | `Twenty seed end … (48s)` at 16:26:50.28, then `Running 14 tests` at 16:26:50.63, and setup failed at `getByRole('textbox')` after 30 s (`login.page.ts:9`, project timeout `env.ts:411`). Server logs just before: workspace migration and cache invalidation | **Not root-caused** (artifact not read; OQ4) |
| F-03 | Existing retry           | `qa-member.ts:143-170` already retries the `/welcome` login once in a fresh context ("textbox occasionally did not render")                                                                                                                                    | Pre-existing; this batch relies on it (R1)   |

### Records the probe created and removed

19 members `p1-probe-…@example.test` (all `deleteUser` OK, `countQaMembers` 0 each). People: 2,123 `P1-PROBE-…` rows created by imports and API, all destroyed by id (K-01, K-04). Final SQL: `1200|0|0` people, 0 P1 members. Leak script: all 0 (K-05).

## 3. Resolved decisions

- **D1 Fresh-member source:** a new test-scoped fixture `freshTwentyMember` calls the existing `provisionQaMember(admin, browser, email, password)` (`qa-member.ts:93-184`) once per 2FA test. Email `p1-qa-<seed>-<worker>-f<n>@example.test` (counted by the leak gate's `p1-qa-%`, `qa-member.ts:227-231`). Teardown: `deleteQaMember` with the stored bearer (G-05; 30 min TTL, `config-variables.ts:348`), then `countQaMembers(admin, email) === 0`, errors aggregated. Fixture `timeout: 120_000`, same as the worker member (`visual-fixtures.ts:75`). Evidence: G-01…G-06.
- **D2 2FA secret capture and code entry:** the UI shows no secret text (A-02), so the page object clicks "setup key" and reads the clipboard. Context `permissions: ["clipboard-read", "clipboard-write"]` (A-03). The secret is checked against `^[A-Z2-7]{16}$`, never logged or attached. Enrolment code: `click` + `pressSequentially` once (A-06; `fill` after an earlier value sends a stale value, A-05). Login code: `fill` (A-09/A-10, 6 logins). Fixture enrolment (tests other than 001 and X03): API A-07.
- **D3 Codes and time:** codes come from `generateTotpCode(secret, epochMs)` (`src/core/totp.ts:19-21`). The server accepts ±1 step (A-14). So 001/002/X01 mint at `Date.now()` with no boundary wait. X02 (window edges) mints at `epochMsForStableTotpMint(10_000)` (`totp.ts:44-57`, used by Documenso `totp-mint.ts:14-17`) so that "−1/+1" cannot become "−2/0" across a boundary. That helper only aligns to a step; it is not a retry or a bigger timeout.
- **D4 CSV generation:** pure builder `buildPeopleCsv` writes to `testInfo.outputPath()` at test time. Header `First Name,Last Name,Emails`; first name `<prefix>-<case>-<nnn>`, last name `fakePerson().lastName` (harness factory), email lowercase `<prefix>-<case>-<n>@example.test`. Options: BOM, delimiter, EOL, row mutator. Never committed.
- **D5 Partial vs all-or-nothing:** **partial**. Invalid and duplicate rows are skipped after the "Finish flow with errors" confirm; the rest import (C-06, C-07). Source: `ValidationStep.tsx:260-285`. Tests assert exactly that.
- **D6 Comma decimals:** dropped. People has no numeric field (C-05). Adding one is a metadata write to the shared workspace; P1 does not do that. CSV-002 keeps `;` + umlauts.
- **D7 Dedup oracle and leak coverage:** oracle = API `people(filter: { emails: { primaryEmail: { eq } } }) { totalCount }` = 0 for the in-file duplicate (C-07) and 1 for the existing person (C-08). Extend `listPersonIds` (`sweep.ts:180-207`) to `or: [firstName ilike 'P1-QA-%', emails.primaryEmail ilike 'p1-qa-%']`; the `or` filter was used in every probe cleanup (K-01).
- **D8 Bulk cleanup:** `destroyPeople(filter: { id: { in } })` in chunks of 100 (K-01/K-02). Each chunk checks that the returned id count equals the chunk size; errors aggregated; final count by prefix = 0.
- **D9 CSV session:** the existing worker QA member (`visual-fixtures.ts:43-76`), never Jane. 2FA tests never use that shared member (D1).
- **D10 Import entry and upload:** "Command Menu" button → text "Import People" (no role; C-01). Upload through the file chooser of button "Select file" (C-01), not a CSS `input[type=file]`.

## 4. Goal and scope

In:

- P1-TW-CSV-001..004 and P1-TW-2FA-001..002 (IDs and titles unchanged).
- Accepted extras from §6.
- Fixtures, page objects, sweep extension, unit tests, ADR 0016 amendment, README coverage, known-issue entries.

Out, with reasons:

- Comma decimals (D6).
- Formula injection (P5) and 2FA brute force (P5-TW-2FA-001).
- The `/welcome` flake fix: not root-caused (F-02). It is a risk (R1) and OQ4, not a change in this batch.
- Recovery codes: Twenty has none (A-02).

Carried to batch 4, not built: P1-TW-LU-001..002, P1-TW-RT-001..004, P1-TW-VIS-X07 (Arabic RTL), making `e2e / visual` required.

ID check: `rg "P1-TW-[A-Z0-9]+-X[0-9]+"` hits only TZ, VIS and I18N files (tests, plans, README, `twenty-login-a11y.md`); `rg "P1-TW-(CSV|2FA)"` → no match. Numbering starts at X01 for both.

## 5. Test-case mapping

All in project `twenty-chromium` (`playwright.config.ts:288-307`). Tags `["@twenty", "@csv"]` or `["@twenty", "@2fa"]`; annotations `testId` + `priority` as `tz.spec.ts:111-114`.

| ID      | File                                     | Pri | Oracle (independent)                                        | Cleanup                                     |
| ------- | ---------------------------------------- | --- | ----------------------------------------------------------- | ------------------------------------------- |
| CSV-001 | `tests/twenty/import/csv-import.spec.ts` | P1  | API count by prefix = 100; 0 first names start with U+FEFF  | `twentyCsv` teardown: bulk destroy, count 0 |
| CSV-002 | same                                     | P2  | API names equal the generated umlaut strings                | same                                        |
| CSV-003 | same                                     | P1  | API count = 99; no `-050` row                               | same                                        |
| CSV-004 | same                                     | P2  | API count with the duplicate email = 0; count by prefix = 8 | same                                        |
| CSV-X01 | `tests/twenty/import/csv-edge.spec.ts`   | P2  | API: count with email = 1, same id, first name = CSV value  | same + captured pre-created id              |
| CSV-X02 | same                                     | P2  | API: count = 20, distinct emails = 20 (single-round smoke)  | same                                        |
| CSV-X03 | same                                     | P3  | API count = UI view count; 200 <= n < 1000 and n % 200 = 0  | same                                        |
| CSV-X04 | same                                     | P3  | API count = 0 after both uploads                            | same                                        |
| CSV-X05 | same                                     | P3  | API count = 0                                               | same                                        |
| CSV-X06 | same                                     | P2  | API last name, job title and intro equal the input          | same                                        |
| CSV-X07 | same                                     | P3  | known bug: role query + axe `aria-hidden-focus` (no API)    | same                                        |
| 2FA-001 | `tests/twenty/auth/2fa.spec.ts`          | P1  | API summary `VERIFIED` after Save                           | `freshTwentyMember` teardown                |
| 2FA-002 | same                                     | P2  | API summary `VERIFIED` before (fixture)                     | same                                        |
| 2FA-X01 | same                                     | P2  | known bug (ASVS V2.8.4)                                     | same                                        |
| 2FA-X02 | same                                     | P2  | the code's step offset is computed, not observed            | same                                        |
| 2FA-X03 | same                                     | P3  | API `currentUser` with the pre-enable bearer                | same                                        |
| 2FA-X04 | same                                     | P3  | API summary `[]` after reset                                | same                                        |
| 2FA-X05 | same                                     | P3  | known bug: role query + axe `label` (WCAG 4.1.2)            | same                                        |

## 6. Extra cases (all 12 accepted 2026-10-17, OQ1)

| ID      | Technique            | What it asserts                                                                                                                                                                          | Oracle                              | Probe         |
| ------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------- |
| CSV-X01 | EP (existing record) | Import a row whose email belongs to an existing person: no per-row error, the person is updated (upsert), never a second person                                                          | API count/id/name                   | C-08 ×2       |
| CSV-X02 | Race                 | The same 20-row file imported in two contexts at once never creates two people with one email. **Single-round UI invariant smoke**; the multi-round concurrency test belongs to P2 (API) | API count + distinct                | C-09 ×2       |
| CSV-X03 | State transition     | Cancel after "200 out of 1,000": the dialog closes; what remains is a whole number of 200-row batches (200 ≤ n < 1000), visible in the UI count                                          | API = UI count                      | C-10 ×2 (800) |
| CSV-X04 | BVA                  | 10,001 rows → "Too many records. Up to 10000 allowed", stays on Upload; 10,000 → Match Columns                                                                                           | API count 0                         | C-11 ×2       |
| CSV-X05 | BVA                  | Header-only → Validate with 0 rows → 0 created; empty file → stays on Upload with no message (asserted as observed)                                                                      | API count 0                         | C-12, C-13 ×2 |
| CSV-X06 | EP (format)          | LF and CRLF, quoted `,` `;` `""` and an embedded newline round-trip exactly                                                                                                              | API values                          | C-14, C-15 ×2 |
| CSV-X07 | a11y, known bug      | The "Finish flow with errors" Submit is exposed as a button to AT                                                                                                                        | role query + axe                    | C-16 ×2       |
| 2FA-X01 | Negative, known bug  | A code already used to sign in is refused in a second context                                                                                                                            | ASVS 4.0.3 V2.8.4 (+ RFC 6238 §5.2) | A-13 ×3       |
| 2FA-X02 | BVA (time steps)     | Codes from −1 and +1 step sign in; −2 and +2 are refused with the message                                                                                                                | computed offsets                    | A-14 ×3       |
| 2FA-X03 | State                | Enabling 2FA keeps an already open session signed in (recorded behaviour)                                                                                                                | API bearer                          | A-12 ×3       |
| 2FA-X04 | State                | Reset 2FA asks only for the typed email (no code); afterwards login has no challenge                                                                                                     | API summary                         | A-15 ×2       |
| 2FA-X05 | a11y, known bug      | The challenge code field has an accessible name                                                                                                                                          | role query + axe                    | A-16 ×2       |

Not proposed: formula injection (P5), brute force (P5-TW-2FA-001), recovery codes (none exist), the PENDING-method observation A-17 (API-only, no UI path).

## 7. Architecture (every file touched, one responsibility each)

New:

- `src/products/twenty/csv.ts`: pure CSV text builder for People imports (D4).
- `src/products/twenty/fixtures/people-bulk.ts`: People count/list by filter, prefix filter, bulk destroy in chunks of 100 (D7, D8).
- `src/products/twenty/fixtures/two-factor.ts`: API TOTP enrolment, 2FA summary read, secret-from-URI parser.
- `src/products/twenty/import-fixtures.ts`: `test` = `visual-fixtures` `test` + `twentyCsv` (prefix, CSV files, captured ids, teardown) + `secondMemberPage`.
- `src/products/twenty/two-factor-fixtures.ts`: `test` = Playwright base + `baseURL` + `freshTwentyMember` + `enrolledTwentyMember` + `storageState`.
- `src/products/twenty/issues.ts`: issue strings for CSV-X07, 2FA-X01, 2FA-X05 (same style as `visual.ts:34`).
- `src/products/twenty/pages/import-wizard.page.ts`: the import dialog.
- `src/products/twenty/pages/two-factor-settings.page.ts`: Profile 2FA card, TOTP enrol page, Reset modal, Logout.
- `src/products/twenty/pages/two-factor-challenge.page.ts`: the login challenge.
- `tests/twenty/import/csv-import.spec.ts`, `tests/twenty/import/csv-edge.spec.ts`, `tests/twenty/auth/2fa.spec.ts`.
- `tests/unit/twenty-csv.spec.ts`, `tests/unit/twenty-people-bulk.spec.ts`, `tests/unit/twenty-two-factor.spec.ts`.

Modified:

- `src/products/twenty/fixtures/qa-member.ts`: add pure `qaFreshMemberEmail(seed, worker, n)` only.
- `src/products/twenty/fixtures/sweep.ts`: export `paginateConnectionIds` (`:45`); `listPersonIds` filter gets the email `or` (D7).
- `src/products/twenty/pages/people.page.ts`: add `viewCount()` and `rowsNamed(prefix)` locators.
- `tests/unit/twenty-sweep-pagination.spec.ts`: assert the new person filter shape.
- `docs/adr/0016-twenty-ci.md`, `README.md`.
- New: `docs/observations/twenty-known-issues.md` (OQ2): the three new known bugs only, in the format of `medusa-known-issues.md`. `twenty-login-a11y.md` is left as is.

Unchanged: `playwright.config.ts` (new folders are inside `testDir ./tests/twenty`; `import/` and `auth/` are not in `VISUAL_A11Y_IGNORE` `:48`), `.github/workflows/e2e.yml` (`tw_re` `:118` already covers `tests/twenty/` and `src/products/twenty/`), `package.json`, harness, forks.

## 8. Locators per page object (from the probe)

`TwentyImportWizardPage` (`import-wizard.page.ts`):

| Member                  | Locator                                                                                                               | Probe      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| `commandMenuButton`     | `getByRole("button", { name: "Command Menu" })`                                                                       | C-01       |
| `importPeopleItem`      | `getByText("Import People", { exact: true })` (no role exposed)                                                       | C-01       |
| `dialog`                | `getByRole("dialog", { name: "Import data" })`                                                                        | C-01       |
| `selectFileButton`      | `dialog.getByRole("button", { name: "Select file" })` + `waitForEvent("filechooser")`                                 | C-01       |
| `importedColumn(label)` | `dialog.getByText(label, { exact: true })`                                                                            | C-02       |
| `mappedField(label)`    | `dialog.getByRole("button", { name: label })` e.g. "Name / First Name"                                                | C-02       |
| `unmatchedColumnButton` | `dialog.getByRole("button", { name: "Select column..." })`                                                            | C-02       |
| `primaryEmailOption`    | `page.getByRole("option", { name: /^Emails \/ Primary Email/ })`                                                      | C-01       |
| `nextStepButton`        | `dialog.getByRole("button", { name: "Next Step" })`                                                                   | C-02       |
| `grid`, `dataRows()`    | `dialog.getByRole("grid")`; rows = `grid.getByRole("row").filter({ has: getByRole("checkbox", { name: "Select" }) })` | C-06       |
| `errorsOnlySwitch`      | `dialog.getByRole("switch", { name: "Show only rows with errors" })`                                                  | C-06       |
| `cell(text)`            | `dialog.getByRole("gridcell", { name: text, exact: true })`                                                           | C-06, C-07 |
| `tooltip`               | `page.getByRole("tooltip")`                                                                                           | C-06, C-07 |
| `confirmButton`         | `dialog.getByRole("button", { name: "Confirm" })`                                                                     | C-02       |
| `finishWithErrorsTitle` | `page.getByText("Finish flow with errors", { exact: true })`                                                          | C-06       |
| `submitIgnoringErrors`  | `page.getByText("Submit", { exact: true })` (role hidden: X07)                                                        | C-16       |
| `progress`              | `dialog.getByText(/records imported\./)`                                                                              | C-10       |
| `cancelImportButton`    | `dialog.getByRole("button", { name: "Cancel" })`                                                                      | C-10       |
| `tooManyRecordsToast`   | `page.getByRole("status").filter({ hasText: "Too many records. Up to 10000 allowed" })`                               | C-11       |
| `uploadPrompt`          | `dialog.getByText("Upload .xlsx, .xls or .csv file")`                                                                 | C-11, C-13 |
| `closeButton`           | `dialog.getByRole("button", { name: "Close import" })`                                                                | C-11       |

`TwentyPeoplePage` additions: `viewCount()` = `getByRole("button", { name: /^All People/ })` (C-01/C-02: "All People · 100"); `rowsNamed(prefix)` = `rows().filter({ hasText: prefix })` (`people.page.ts:214-216`; C-01). Filtering uses the existing `filterNameContains` (`:236-252`).

`TwentyTwoFactorSettingsPage` (`two-factor-settings.page.ts`):

| Member                   | Locator                                                                                              | Probe      |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- |
| `gotoProfile()`          | `/settings/profile` then wait for `authenticatorCard`                                                | A-01       |
| `authenticatorCard`      | `getByText("Authenticator App", { exact: true })`                                                    | A-01       |
| `status(text)`           | `getByText(text, { exact: true })` for "Active" / "Deactivated"                                      | A-01, A-06 |
| `setupKeyButton`         | `getByRole("button", { name: "setup key" })`                                                         | A-02       |
| `codeInput`              | `getByRole("textbox")` (one on the page)                                                             | A-02       |
| `saveButton`             | `getByRole("button", { name: "Save" })`                                                              | A-02       |
| `enabledToast`           | `getByRole("status").filter({ hasText: "Two-factor authentication setup completed successfully!" })` | A-06       |
| `resetButton`            | `getByRole("button", { name: "Reset 2FA" })`                                                         | A-15       |
| `resetEmailInput(email)` | `getByRole("textbox", { name: email })`                                                              | A-15       |
| `resetDoneToast`         | `getByRole("status").filter({ hasText: "2FA Method has been deleted successfully." })`               | A-15       |
| `logoutButton`           | `getByRole("button", { name: "Logout" })`                                                            | A-11       |

`TwentyTwoFactorChallengePage` (`two-factor-challenge.page.ts`): `prompt` = `getByText("Paste the code below")`; `codeInput` = `getByRole("textbox")`; `submitButton` = `getByRole("button", { name: "Submit" })`; `invalidCodeToast` = `getByRole("status").filter({ hasText: "Invalid verification code. Please try again." })` (A-08, A-09). Password step: existing `TwentyLoginPage.signIn` (`login.page.ts:15-22`).

## 9. Oracle design

- **UI first.** Every Expected-column assertion is made in the UI: the header text, error tooltips, the confirm text, the view count, the challenge page and toasts, and the profile status.
- **API as the independent oracle,** named per test (§5). Read with the member's own bearer (`memberApi`, `qa-member.ts:246-262`), never Jane's.
- **CSV-001 count** comes from `people(filter) { totalCount }` with `qaPeopleFilter(prefix)`. It must equal 100 _and_ the UI `viewCount()` must read "All People · 100". The two come from different layers.
- **BOM:** the UI header must exactly equal "First Name" (`exact: true` fails if U+FEFF is present) and the API first names must not start with U+FEFF.
- **2FA-X02:** the oracle is the offset the test chose (−2/−1/+1/+2 steps). Pass/fail comes from the UI result per offset.
- **Known bugs:** the expected value comes from a named standard (OWASP ASVS 4.0.3 V2.8.4 with RFC 6238 §5.2 as support; WCAG 2.2 SC 4.1.2), never from the product. The two a11y bugs have a second independent oracle: axe-core (§11).

## 10. Test data, isolation, cleanup and leak check

- Prefix: `p1QaPrefix(seed, worker)` (`names.ts:3-5`) with the per-run seed `parsePositiveInt(P1_SEED, Date.now())` computed once per worker, plus a case leaf (`CSV001`, `CSVX02`, …). Emails are the lowercase form. All rows start `P1-QA-` / `p1-qa-`.
- **Workers (PW_WORKERS=2):** each worker has its own QA member (`visual-fixtures.ts:43-76`) and its own seed/worker prefix, so imports never share an email; upsert-by-email (C-08) cannot merge across workers. 2FA members have unique `f<n>` emails. Jane is read-only. **One isolation answer: prefix = seed + worker + case, and one member per worker for CSV, one member per test for 2FA.**
- Teardown `twentyCsv`: list ids by `qaPeopleFilter(prefix)` plus captured ids (X01 pre-created person) → `destroyPeopleByIds` chunks of 100 → recount 0 → `AggregateError` with the test error first (pattern `fixtures/index.ts:70-128`).
- Teardown `freshTwentyMember`: `deleteQaMember` → `countQaMembers(admin, email) === 0`, errors aggregated (pattern `visual-fixtures.ts:55-72`).
- Leak gate: `scripts/count-twenty-qa-leaks.mts` unchanged; with D7 it counts imported people by name **or** email; members by `p1-qa-%`. After each run, the SQL in §2 must show `p1 = 0` and members `0`.
- Seeded data (1,200 people, Jane) is read only. Retries stay 0 (`playwright.config.ts:293`, `e2e.yml:1395`).

## 11. Known-bug handling (proof process)

| Finding                                  | Observed                                               | Expected / standard                                                                                                                                                     | Label          | Evidence | Handling                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV-X07                                  | confirm Submit hidden from AT (`aria-hidden` ancestor) | WCAG 2.2 SC 4.1.2 Name, Role, Value                                                                                                                                     | PRODUCT BUG    | C-16 ×2  | working path (confirm text visible, Submit by text works) hard-asserted in CSV-003; X07: role query + axe (rule `aria-hidden-focus`) → `attachKnownBugEvidence` (incl. axe violation ids) → `test.fail(true, TW_CSV_X07_SUBMIT_HIDDEN_ISSUE)` → strict `getByRole("button", { name: "Submit" })` visible |
| 2FA-X01                                  | a used code signs in again                             | **OWASP ASVS 4.0.3 V2.8.4** (a time-based OTP can be used only once within its validity period); support: RFC 6238 §5.2 (verifier SHOULD NOT accept the second attempt) | PRODUCT BUG    | A-13 ×3  | first login hard-asserted (`/objects/`), then evidence, `test.fail`, strict: second context shows `invalidCodeToast` and stays on `/welcome`                                                                                                                                                             |
| 2FA-X05                                  | challenge textbox has an empty accessible name         | WCAG 2.2 SC 4.1.2                                                                                                                                                       | PRODUCT BUG    | A-16 ×2  | challenge visible hard-asserted; role query + axe (rule `label`); evidence `{ accessibleName, axeViolationIds }` only (field empty), `test.fail`, strict `getByRole("textbox", { name: /code/i })` visible                                                                                               |
| A-05                                     | `fill` after a prior value sends a stale value         | –                                                                                                                                                                       | TEST-side rule | A-05 ×3  | D2 (type once); not a test.fail                                                                                                                                                                                                                                                                          |
| C-08, C-10, C-12, C-13, A-12, A-15, A-17 | see §2                                                 | no standard strictly violated                                                                                                                                           | Observation    | ×2       | asserted as observed (X01, X03, X05, X03, X04); ADR note                                                                                                                                                                                                                                                 |

Rules (unchanged from batches 1–2):

- All three bugs are deterministic (stateless OTP check; static DOM), so each is single-shot. The N-round rule applies only to nondeterministic known bugs; CSV-X02 and CSV-X03 are invariants, not known bugs.
- **Second oracle for the two a11y bugs.** Reuse `axeScan(page, { rules })` (`src/support/visual/axe.ts:242-283`; `@axe-core/playwright` 4.13.0 is already a devDependency, `package.json:40`). The rule set scopes the scan: `["aria-hidden-focus"]` on the "Finish flow with errors" state (CSV-X07) and `["label"]` on the challenge (2FA-X05). No `include` selector, because that needs CSS outside the locator rules. Put the violation ids and node targets from `scan.report` into the evidence JSON. **Not verified in the probe** (axe was not run): the first build run must show the expected rule id with a node target on the Submit `<button>` / the code `<input>`. If axe reports nothing or something else: stop and report; do not change the rule.
- At build, each `test.fail` must fail the same way in **both** local runs (§15), and measured facts go to `docs/observations/twenty-known-issues.md` before it is kept. If either run passes or fails differently: stop and report. Never loosen an assertion.
- `attachKnownBugEvidence` (`src/core/known-bug-evidence.ts:65`) takes a full-page screenshot. Call it only **after** the page has left the filled form (X01: after the second Submit; X05: before typing anything; X07: on the Validate step, which holds only P1-QA test data). Its JSON redacts keys matching `otp|secret|token…` (`:6`); never put the code or secret in values.

## 12. CI job design (extend `twenty-self-hosted`; no new workflow)

- The new specs run inside the existing step "Run Twenty E2E suite" (`e2e.yml:1380-1395`): `npm run test:twenty -- --retries=0`, `PW_WORKERS: "2"` (`:1387`). Nothing to add: `testDir ./tests/twenty` picks them up, and `tw_re` (`:118`) triggers on the paths.
- Unchanged: retries 0, leak gate (`:1549-1559`), compose logs on failure (`:1579`), `!cancelled()` uploads (`:1415,1427,1597,1605`), `always()` harness down, cache rules, job summary row, `timeout-minutes: ${{ inputs.twenty_chromium_timeout_minutes }}` = 60 (`:1251`, default `:31-34`).
- Worker collisions: none (§10).
- CSV files under `test-results/` are uploaded on failure by the existing `!cancelled()` step. They hold only `P1-QA` Faker data. No new artifact type.
- **Timeout arithmetic.** Main run 38984970979 (`4b1f7f8`): job 13 m 49 s = up 1 m 44 s + Twenty E2E 4 m 02 s + visual pull 25 s + visual 5 m 41 s + the rest. New tests (probe timings): CSV ≈ 11 tests × 20–60 s; 2FA ≈ 7 tests × (provision 11–46 s + enrol/API 1–21 s + login 11–15 s). Worst case serial ≈ 11 × 60 + 7 × 82 = 1,234 s ≈ 20.6 min; with 2 workers ≈ 10.3 min. Projected job ≈ 13.8 + 10.3 ≈ **24 min < 60**. Step 9 measures it. If the new tests add more than 15 min locally: stop and report before pushing.

## 13. Risks and unknowns (each with a probe)

| #   | Risk                                                                                 | Probe / evidence                     | Mitigation                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `/welcome` textbox flake; 2FA provisions a member per test, so more `/welcome` loads | F-01 ×5, F-02, F-03                  | Not root-caused; the existing one-retry (`qa-member.ts:143-170`) stays as is. Any `/welcome` failure is labelled with trace + compose logs, not retried more. the CI artifact is read in a separate task after this batch (OQ4)   |
| R2  | Leak script with no auth file                                                        | K-07 (CI log) + source               | It fails closed (exit 1); no change                                                                                                                                                                                               |
| R3  | Code minted near a step boundary at X02 edges                                        | A-14                                 | `epochMsForStableTotpMint(10_000)` (D3), recomputed separately right before each context's codes are minted                                                                                                                       |
| R4  | Image (`v2.44.0`) vs fork source (`sdk/v2.43.0-127`)                                 | every cited behaviour also seen live | Assertions use live strings only; a Twenty bump re-probes                                                                                                                                                                         |
| R5  | Seed people count (1,200) changes                                                    | `All People · 1,200` seen            | tests count by prefix, never the total                                                                                                                                                                                            |
| R6  | X03 cancel count depends on timing                                                   | C-10 = 800 twice                     | Cancel only after the progress text reads "200 out of 1,000"; invariant `200 <= n < 1000`, `n % 200 = 0`, UI = API; never 800. If any run (CI included) gets `n = 1000` (cancel too late): stop and report, never widen the range |
| R7  | Tooltip hover timing                                                                 | C-06/C-07 ×2                         | web-first `expect(tooltip).toHaveText(…)` after `hover()`                                                                                                                                                                         |
| R8  | Clipboard permission in CI Chromium (headless)                                       | A-03 headless locally ×6             | the first local build run of 2FA-001 is the re-check (headless, as CI); the first CI run checks it there                                                                                                                          |
| R9  | 2FA test needs over 120 s                                                            | max seen ≈ 82 s incl. provisioning   | provisioning has its own 120 s fixture budget (D1); split a test, never raise the timeout                                                                                                                                         |
| R10 | CSV-X04 builds a 10,001-row file (~0.6 MB) in `outputPath`                           | C-11                                 | written once per test; artifacts only on failure                                                                                                                                                                                  |

## 14. Build steps (Git Bash, repo root; on any differing output: **stop and report**, paste it)

### Step 0. Branch, plan, baseline

- `git checkout main && git pull --ff-only && git rev-parse HEAD` → `4b1f7f8f79945ad9d3125c14a5e3ab4121ce8786`. Different: stop.
- `git checkout -b <branch from Jayami>`. The plan is already saved, untracked, at `docs/plans/2026-10-17-p1-phase4-batch3-twenty.md` (it moves with the checkout). Run `npx prettier --check` on it, `git add` that one path, commit `docs(plan): phase 4 batch 3 twenty csv import and 2fa`.
- Harness: `cd ../qa-portfolio-harness && node scripts/up.mjs twenty && npm run smoke -- twenty` → "smoke ok".
- **Local main baselines, one heavy suite at a time** (needed for §15). Record passed / failed / expected failures / "expected to fail, but passed" / flaky, with the failing test titles, for each:
  - **B-twenty:** `npm run test:twenty`, then `npx tsx scripts/count-twenty-qa-leaks.mts` → all 0.
  - **B-cal:** `npm run test:cal` (Cal harness up first, as its own suite needs).
  - **B-documenso:** `npm run test:documenso`. Its known local-only failures are part of the baseline.
  - **B-medusa:** `npm run test:medusa`. MED X04/X05 can flip to "expected to fail, but passed" locally; record what happened.
  - **B-visual-twenty:** `npm run visual:test -- --product=twenty`.
- No separate re-probe step. The probe scripts live only in the planning session's scratchpad. The first build run of each spec (Steps 4–6, each run twice) is the re-check of the probe rows it relies on. A spec failing on a probed string or count on its first run is labelled (PRODUCT vs TEST BUG, with trace) and reported before anything is changed.

### Step 1. Pure helpers + unit tests

`src/products/twenty/csv.ts`:

```
export interface PeopleCsvOptions {
  readonly prefix: string;          // P1-QA-<seed>-<worker>
  readonly caseId: string;          // e.g. "CSV001"
  readonly rows: number;
  readonly delimiter?: "," | ";";   // default ","
  readonly eol?: "\r\n" | "\n";     // default "\r\n"
  readonly bom?: boolean;           // default false
  readonly mutate?: (index: number, row: PeopleCsvRow) => PeopleCsvRow;
}
export interface PeopleCsvRow { readonly firstName: string; readonly lastName: string; readonly email: string; readonly extra?: readonly string[] }
export const PEOPLE_CSV_HEADER = ["First Name", "Last Name", "Emails"] as const;
export function peopleCsvFirstName(prefix: string, caseId: string, index: number): string   // `${prefix}-${caseId}-${pad3(index)}`
export function peopleCsvEmail(prefix: string, caseId: string, index: number): string       // lowercase, @example.test
export function csvField(value: string, delimiter: string): string                          // RFC 4180 quoting when value has delimiter, quote, CR or LF
export function buildPeopleCsv(options: PeopleCsvOptions, extraHeader?: readonly string[]): string
```

`src/products/twenty/fixtures/people-bulk.ts`:

```
export function qaPeopleFilter(prefix: string): PersonFilter   // { or: [ { name: { firstName: { ilike: `${prefix}%` } } }, { emails: { primaryEmail: { ilike: `${prefix.toLowerCase()}%` } } } ] }; throws on % or _
export async function countPeople(api: TwentyPinnedApiSession, filter: PersonFilter): Promise<number>
export async function listPeople(api, filter): Promise<readonly TwentyImportedPerson[]>     // id, firstName, lastName, primaryEmail, jobTitle, intro; via paginateConnectionIds
export async function destroyPeopleByIds(api, ids: readonly string[]): Promise<number>      // chunks of 100; throws if a chunk returns fewer ids
export const PEOPLE_DESTROY_CHUNK = 100;
```

`src/products/twenty/fixtures/two-factor.ts`:

```
export function totpSecretFromUri(uri: string): string                      // otpauth URI → secret; throws unless ^[A-Z2-7]{16}$
export async function enrolTotpViaApi(member: TwentyQaMember): Promise<{ readonly secret: string }>   // initiate… then verify… (A-07); throws unless success === true
export async function twoFactorStatuses(member: TwentyQaMember): Promise<readonly string[]>          // currentUserWorkspace.twoFactorAuthenticationMethodSummary[].status
```

`qa-member.ts`: `export function qaFreshMemberEmail(seed: number, worker: number, n: number): string` → `p1-qa-${seed}-${worker}-f${n}@example.test`.

`sweep.ts`: `export` `paginateConnectionIds`; `listPersonIds` filter = `qaPeopleFilter`-shaped `or` with the `P1-QA-` / `p1-qa-` prefixes.

Unit tests (`@unit`), 15 new:

- `twenty-csv.spec.ts` (7): BOM first char; `;` delimiter; CRLF vs LF; quoting of `,` `;` `"` and `\n`; first name / email shapes; mutate replaces row 50; extra columns.
- `twenty-people-bulk.spec.ts` (4): filter shape; wildcard guard; chunking 250 → 100/100/50 with a fake api; short chunk throws.
- `twenty-two-factor.spec.ts` (3): secret parse ok; bad shape throws; `qaFreshMemberEmail` shape.
- `twenty-sweep-pagination.spec.ts` (+1): person filter has the email `or`.

Run `npm run test:unit` → **203 passed** (188 today, from `npx playwright test --list --project=unit` → "Total: 188 tests in 26 files", + 15). Different: stop.

### Step 2. Fixtures

`src/products/twenty/import-fixtures.ts`:

```
export interface TwentyCsvFixture {
  readonly api: TwentyPinnedApiSession;          // memberApi(twentyQaMember)
  readonly prefix: string;                       // p1QaPrefix(seed, worker)
  readonly memberEmail: string;
  writeCsv(caseId: string, fileName: string, content: string): Promise<string>;   // testInfo.outputPath(fileName)
  caseFilter(caseId: string): PersonFilter;      // qaPeopleFilter(`${prefix}-${caseId}`)
  capturePerson(id: string): void;
}
export const test = visualTest.extend<{ twentyCsv: TwentyCsvFixture; secondMemberPage: Page }>({
  twentyCsv: async ({ twentyQaMember }, use, testInfo) => { /* use(); finally: ids = list(prefix filter) ∪ captured → destroyPeopleByIds → countPeople(prefix) must be 0 → AggregateError */ },
  secondMemberPage: async ({ browser, twentyQaMember }, use) => { /* newContext({ baseURL, storageState: twentyQaMember.storageStatePath }); finally close */ },
});
```

`src/products/twenty/two-factor-fixtures.ts`:

```
export interface FreshTwentyMember { readonly member: TwentyQaMember; readonly password: string }
export interface EnrolledTwentyMember extends FreshTwentyMember { readonly secret: string }
export const test = base.extend<{ freshTwentyMember: FreshTwentyMember; enrolledTwentyMember: EnrolledTwentyMember; twentyAdmin: TwentyPinnedApiSession }>({
  baseURL: async ({}, use) => use(loadTwentyConfig().baseUrl),
  twentyAdmin: /* readAdminWorkspaceIds → createPinnedTwentyApiSession (read only) */,
  freshTwentyMember: [async ({ browser, twentyAdmin }, use, testInfo) => { /* provisionQaMember(qaFreshMemberEmail(seed, parallelIndex, n++), password); use; finally deleteQaMember + countQaMembers === 0 */ }, { timeout: 120_000 }],
  enrolledTwentyMember: async ({ freshTwentyMember }, use) => { /* enrolTotpViaApi → twoFactorStatuses === ["VERIFIED"] → use */ },
  storageState: async ({ freshTwentyMember }, use) => use(freshTwentyMember.member.storageStatePath),
});
```

Command: `npm run typecheck` → exit 0.

### Step 3. Page objects

Implement §8 exactly. Methods (skeletons):

```
TwentyImportWizardPage: open(); upload(path); expectImportedColumn(label); mapEmailsToPrimaryEmail(); nextStep(); expectDataRows(n); showErrorsOnly(); expectCellError(cellText, message); confirm(); submitIgnoringErrors(); expectClosed(); cancelDuringImport(); close()
TwentyTwoFactorSettingsPage: gotoProfile(); openAuthenticatorApp(); readSetupKey(): Promise<string>; typeCode(code); save(); expectEnabled(); resetWithEmail(email); logout()
TwentyTwoFactorChallengePage: expectChallenge(); submitCode(code); expectInvalidCode()
TwentyPeoplePage (+): viewCount(); rowsNamed(prefix)
```

`readSetupKey` is the only `page.evaluate` (clipboard), inside the page object; it returns the secret and validates the shape with `totpSecretFromUri`'s regex. `.first()` only where a page object already has a precedent comment (`people.page.ts:209`); no `.nth()`, CSS or XPath. Command: `npm run lint` → exit 0.

### Step 4. CSV core — `tests/twenty/import/csv-import.spec.ts`

```
test.describe("Twenty CSV import", { tag: ["@twenty", "@csv"] }, () => {
  test("P1-TW-CSV-001 Import 100 people with a UTF-8 BOM", { annotation: [testId, priority P1] }, async ({ page, twentyCsv }) => {
    step "Generate 100-row CSV with BOM"            → buildPeopleCsv({ bom: true, rows: 100, caseId: "CSV001" }) → writeCsv
    step "Open import and upload"                    → wizard.open(); wizard.upload(path)
    step "First header is not mangled"               → expect(wizard.importedColumn("First Name")).toBeVisible(); expect(wizard.mappedField("Name / First Name")).toBeVisible()
    step "Map Emails and validate"                   → mapEmailsToPrimaryEmail(); nextStep(); showErrorsOnly(); expect 0 data rows; showErrorsOnly() off
    step "Confirm import"                            → confirm(); expectClosed()
    step "People list shows the 100 imported rows"   → people.goto(); filterNameContains(`${prefix}-CSV001`); expect(viewCount()).toContainText("· 100"); expect(rowsNamed(prefix).first()).toBeVisible()
    step "API oracle: 100 people, no BOM in names"   → expect(countPeople(caseFilter)).toBe(100); expect(list.filter(startsWith "\uFEFF")).toHaveLength(0)
  });
  test("P1-TW-CSV-002 Semicolon-delimited German Excel export", …)  // ";" + umlaut leaves; Match shows 3 columns (First Name, Last Name, Emails); import 5; UI rowsNamed shows "Jürgen"; API names exact
  test("P1-TW-CSV-003 Bad row mid-file", …)  // row 50 email "not-an-email"; errors-only shows 1 row; expectCellError("not-an-email", "Emails / Primary Email is not a valid email"); confirm → finishWithErrorsTitle visible + "Rows with errors will be ignored when submitting." → submitIgnoringErrors → closed; UI "· 99"; API 99 and no "-050"
  test("P1-TW-CSV-004 Duplicate on unique field", …)  // rows 5 and 6 share an email; errors-only shows 2 rows; tooltip "This Primary Email (emails) value already exists in your import data"; submit → UI "· 8"; API count(email eq) = 0, count(prefix) = 8
});
```

Command: `npx playwright test --project=twenty-chromium tests/twenty/import/csv-import.spec.ts` → 1 setup + 4 passed. Leak script → 0. Run it a second time → same.

### Step 5. CSV edge — `tests/twenty/import/csv-edge.spec.ts` (accepted X only)

```
CSV-X01: API pre-create person (firstName `${prefix}-CSVX01-original`, email = peopleCsvEmail(…,1)) → capturePerson(id); import 3 rows; no error rows; UI shows `${prefix}-CSVX01-001`; API: count(email) 1, same id, firstName `${prefix}-CSVX01-001`
CSV-X02 (title "P1-TW-CSV-X02 Same file imported twice at once never duplicates an email (single-round UI invariant smoke)"; annotation { type: "scope", description: "single-round UI smoke; multi-round concurrency belongs to P2 (API)" }): write 20 rows; Promise.all([importAll(page), importAll(secondMemberPage)]) (each: open, upload, map, next, confirm, closed); UI "· 20"; API count 20 and 20 distinct emails. One round only; no N-round loop in P1
CSV-X03: 1,000 rows; confirm; expect(wizard.progress).toHaveText("200 out of 1,000 records imported.") (web-first wait, then Cancel); cancelDuringImport(); expectClosed(); UI viewCount number n == API count; expect(n).toBeGreaterThanOrEqual(200); expect(n).toBeLessThan(1000); expect(n % 200).toBe(0). If n = 1000 in any run: stop and report (cancel too late); never widen the range
CSV-X04: 10,001 rows → expect(tooManyRecordsToast).toBeVisible(); expect(uploadPrompt).toBeVisible(); close; 10,000 rows → expect(nextStepButton).toBeVisible(); close; API count 0
CSV-X05: header-only → nextStep → 0 data rows → confirm → closed; empty file → expect(uploadPrompt).toBeVisible(); expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0); close; API 0
CSV-X06: LF file 3 rows + CRLF quoted file (extra columns "Job Title", "Intro"); record page of `-001` shows job title "Head; of, Sales"; API last name "Doe, Jr.", 'Say "hi"', intro "Line one\nLine two"
CSV-X07: bad-row file → confirm → finishWithErrorsTitle visible (hard) → submitRoleCount = getByRole("button", { name: "Submit" }).count(); scan = axeScan(page, { rules: ["aria-hidden-focus"] }) → attachKnownBugEvidence({ issue, observed: { submitRoleCount, submitTextCount: 1, axeViolationIds: scan.report ids, axeTargets }, expected: { submitRoleCount: 1, axeViolationIds: [] } }) → test.fail(true, TW_CSV_X07_SUBMIT_HIDDEN_ISSUE) → expect(page.getByRole("button", { name: "Submit" })).toBeVisible()
```

Same command pattern; expected all pass except X07 (expected failure). Leak script → 0. Twice.

### Step 6. 2FA — `tests/twenty/auth/2fa.spec.ts`

```
test.use({ permissions: ["clipboard-read", "clipboard-write"] });
2FA-001 (freshTwentyMember):
  step "Profile shows 2FA deactivated"           → settings.gotoProfile(); expect(status("Deactivated")).toBeVisible()
  step "Enrol the authenticator app"            → openAuthenticatorApp(); secret = readSetupKey(); typeCode(generateTotpCode(secret, Date.now())); save(); expect(enabledToast).toBeVisible(); expect(page).toHaveURL(/\/settings\/profile$/); expect(status("Active")).toBeVisible()
  step "API oracle: method verified"            → expect(twoFactorStatuses(member)).toEqual(["VERIFIED"])
  step "Log out"                                → logout(); expect(page).toHaveURL(/\/welcome/)
  step "Password alone is not enough"           → login.goto(); login.signIn(email, password); challenge.expectChallenge(); expect(page).toHaveURL(/\/welcome/)
  step "Code is accepted"                       → challenge.submitCode(generateTotpCode(secret, Date.now())); expect(page).toHaveURL(/\/objects\//)
2FA-002 (enrolledTwentyMember; fresh browser context = the test's page with storageState: { cookies: [], origins: [] } via test.use in a describe):
  step "Sign in to the challenge" → signIn; expectChallenge
  step "Wrong code is refused"    → submitCode("000000"); expect(invalidCodeToast).toBeVisible(); expect(page).toHaveURL(/\/welcome/); expect(codeInput).toHaveValue("")
  step "Valid code succeeds"      → submitCode(valid); toHaveURL(/\/objects\//)
2FA-X01 (enrolled; second context from the extraContextPage fixture): both contexts reach the challenge; code = generateTotpCode(secret, Date.now()); A.submitCode(code) → toHaveURL(/objects/) (hard); B.submitCode(code); attachKnownBugEvidence(B page, { observed: { secondUseUrl }, expected: { secondUse: "refused (ASVS 4.0.3 V2.8.4; RFC 6238 §5.2)" } }); test.fail(true, TW_2FA_X01_REPLAY_ISSUE); expect(B.invalidCodeToast).toBeVisible(); expect(B page).toHaveURL(//welcome/)
2FA-X02 (enrolled): context 1: sign in to the challenge; base1 = epochMsForStableTotpMint(10_000) right before minting; submitCode(code(base1 − 60_000)) → invalid toast; submitCode(code(base1 − 30_000)) → /objects/. Context 2 (extraContextPage): sign in to the challenge; base2 = epochMsForStableTotpMint(10_000) recomputed right before its codes are minted (one base for both contexts could cross a step boundary while context 1 runs); submitCode(code(base2 + 60_000)) → invalid; submitCode(code(base2 + 30_000)) → /objects/
2FA-X03 (fresh): open second page on /objects/people (storageState); enrol in first page (as 001); second page reload → toHaveURL(/objects\/people/); API currentUser with member.authorization OK
2FA-X04 (enrolled): gotoProfile → status Active → openAuthenticatorApp → resetButton → expect(resetEmailInput(email)).toBeVisible(); expect(page.getByRole("textbox")).toHaveCount(1) (no code field) → fill email → confirm → resetDoneToast → API statuses [] → new context sign in → toHaveURL(/objects/) without challenge
2FA-X05 (enrolled): signIn → expectChallenge (hard) → namedCount = getByRole("textbox", { name: /code/i }).count(); scan = axeScan(page, { rules: ["label"] }) → attachKnownBugEvidence({ observed: { accessibleName: "", namedCount, axeViolationIds, axeTargets }, expected: { accessibleName: "non-empty", axeViolationIds: [] } }) → test.fail(true, TW_2FA_X05_UNNAMED_CODE_ISSUE) → expect(page.getByRole("textbox", { name: /code/i })).toBeVisible()
```

Second contexts in a spec come from a fixture, not raw `browser.newContext` calls in the spec: add `extraContextPage` (anonymous, `baseURL` only) to `two-factor-fixtures.ts`. Command: `npx playwright test --project=twenty-chromium tests/twenty/auth/2fa.spec.ts` → 1 setup + 5 passed + 2 expected failures. Leak script → members 0. Twice.

### Step 7. Docs (§17), then `npm run check` → exit 0.

### Step 8. `--list` sanity

`npx playwright test --list --project=twenty-setup --project=twenty-chromium` → **Total: 32 tests in 7 files** (14 today in 4 files + 18 in 3 files, if all extras are accepted; subtract one per dropped extra). Visual projects: `npx playwright test --list --project=visual-desktop` count unchanged from main. Different: stop.

### Step 9. Stability and timing

Full `npm run test:twenty` twice (§15). Record per-file durations from the HTML report and the total vs **B**; apply the §12 rule.

## 15. Verification plan (hard gate before any push; paste real output)

1. `npm run check` → exit 0.
2. `npm run test:unit` → **203 passed**.
3. `npm run test:twenty`, run 1 and run 2: **B-twenty + 15 passed + 3 expected failures (CSV-X07, 2FA-X01, 2FA-X05), 0 failed, 0 flaky**. The evidence JSON for the 3 known bugs is identical in both runs.
4. After each run: `npx tsx scripts/count-twenty-qa-leaks.mts` → all 0 incl. `qaMembers 0`; the §2 SQL → `p1 = 0`, members `0`.
5. Unchanged suites, one heavy suite at a time: `npm run test:cal`, `npm run test:documenso`, `npm run test:medusa`, `npm run visual:test -- --product=twenty`. Each must equal its **local main baseline** from Step 0 (B-cal, B-documenso, B-medusa, B-visual-twenty), test by test. Documenso's known local-only failures and a Medusa X04/X05 "expected to fail, but passed" flip match their baseline and are not regressions; any other difference: stop and report. Their leak scripts → 0.
6. After the push (Jayami pushes or approves): paste the `twenty-self-hosted` footer, summary row (up seconds, seed, Playwright totals, leak block) and confirm `e2e / visual` and all other jobs are green, with no `flaky`/`retry` lines.

## 16. Commit plan (Conventional, lowercase, explicit paths, never `git add -A`, no trailer)

1. `docs(plan): phase 4 batch 3 twenty csv import and 2fa`
2. `feat(twenty): csv builder, people bulk helpers and sweep email filter` (+ unit tests)
3. `feat(twenty): fresh member and totp enrolment fixtures` (+ unit test)
4. `feat(twenty): import wizard and two-factor page objects`
5. `test(twenty): csv import core cases`
6. `test(twenty): csv import edge cases`
7. `test(twenty): totp two-factor cases`
8. `docs(twenty): adr 0016 amendment, known issues and readme coverage`

No merge, tag or force-push. No CodeRabbit (Jayami runs `cr review --agent`). Never the Bridge-bss account. No Co-Authored-By or attribution line.

## 17. Docs and ADR

- `docs/adr/0016-twenty-ci.md`, section "Amendment (Phase 4 batch 3)": per-test 2FA member (D1) and why Jane and the shared member never get 2FA; clipboard secret capture (D2); TOTP window ±1 (A-14) and the stable-mint use at edges (D3); CSV partial-import contract (D5) and upsert (C-08); bulk destroy chunk 100 (D8); leak sweep email coverage (D7); measured suite seconds and the timeout arithmetic (§12); observations A-12, A-15, A-17, C-10, C-12, C-13; the `/welcome` signal from F-01 (not yet a fix).
- New `docs/observations/twenty-known-issues.md` (OQ2), same layout as `medusa-known-issues.md` (title, image/fork line, one section per bug with **Observed**, **Expected (standard)**, **Evidence**, then a Tests section): TW-CSV-X07, TW-2FA-X01, TW-2FA-X05 only, with measured facts and the axe violation ids from both build runs. `twenty-login-a11y.md` stays unchanged.
- ADR note for CSV-X01: importing an existing email silently overwrites that person (upsert), a data-loss risk. ADR note for CSV-X02: single-round UI invariant smoke; multi-round concurrency belongs to P2 (API).
- `README.md` Twenty coverage table: CSV-001..004, 2FA-001..002 and the accepted X, real totals from §15, run command `npm run test:twenty`, known bugs, carried batch 4 list.

## 18. Will NOT do

- No edits to forks or the harness; no harness bump. Gate (a) needs none.
- No workflow, artifact type, report format, script or dependency changes. `otplib` is already pinned.
- No committed CSV files, evidence folders or exported PNG/JSON. No new `.md` except this plan and `docs/observations/twenty-known-issues.md` (OQ2).
- No 2FA on Jane or the shared worker member, not even in a probe. No Twenty metadata writes (no custom numeric field).
- No `waitForTimeout`, sleeps, retries, longer timeouts, or env/browser conditions. No conditional logic in specs.
- No fix for the `/welcome` flake in this batch (R1, OQ4). No change to the existing retry at `qa-member.ts:143-170`.
- No N-round concurrency loop in P1 (P2 owns it). No widening of the CSV-X03 range.
- No batch 4 or Medusa work. No branch creation now, no CodeRabbit, no merge/tag/force-push, never Bridge-bss, no Co-Authored-By.

## 19. Open questions for Jayami (answered 2026-10-17)

1. **Extras:** **accept all 12** (CSV-X01…X07, 2FA-X01…X05).
2. **Known-issues file:** **create `docs/observations/twenty-known-issues.md`** to match `medusa-known-issues.md`, with only the 3 new entries; `twenty-login-a11y.md` is left as is. This is the one allowed new `.md` besides the plan.
3. **Comma decimals:** **drop** (D6).
4. **`/welcome` root cause:** **yes**: a read-only download of CI run 38931396826's artifact `playwright-test-results-twenty-chromium` into a scratchpad, as a **separate task after this batch**. Not part of this build.
5. **2FA-X04:** **observation**, asserted as observed.
6. **CSV-X01:** **observation**, asserted as observed, with the ADR data-loss note (§17).

Review edits applied: Step 0b dropped (the first build runs are the re-check), local baselines for every unchanged suite, X02 recomputes the stable base per context, X01 cites ASVS V2.8.4 first, axe as the second oracle for X07/X05, the X03 cancel trigger and range, X02 labelled as a single-round smoke.

Plan saved as docs/plans/2026-10-17-p1-phase4-batch3-twenty.md (not committed). Not built: building starts after Jayami creates the branch and gives its name; committing this file is the first commit on it.
