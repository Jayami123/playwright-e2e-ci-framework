# Phase 2e task 3: Documenso TOTP 2FA tests

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci`, branch `feat/2026-10-11-p1-phase2e-documenso-2fa`. Documenso source read at `products/documenso` commit `f4105e47`. Status: plan only, nothing built.

"Verified in source" means read from code. "Predicted" means it must be confirmed live before it goes into an assertion.

## Decisions (from review)

- Live probe first, about 3 logins, to confirm the HTTP 500 and the field labels before any assertion is written. The logins count against the rate limit; if they would take the run over 50 in the current 15-minute bucket, wait for the next bucket.
- Working tree at planning time (2026-10-11): `git status --short` is clean. Tasks 1 and 2 are in `945f081`, `c1573c1`, `94b4233`. The earlier session showed six modified files; if any appear again, run `git status`, show the diff, and do not fold them into this task's commit.
- The step-boundary flake (code expires between mint and verify) is accepted. No retries, no time-budget logic, as in Cal. It shows as a red run.
- Test 004 is dropped (not kept as a no-op `test.fail`) if the probe shows Documenso already returns a 4xx. The final report says the bug was not confirmed. Later IDs are renumbered down by one in that case.
- No markdown files in this task except this plan. ADR 0010 and the Documenso 2FA known-issues file belong to task 6. Every P7-OBS id and its evidence goes in the final report.
- Extra scope: the leak script also counts leftover login rate-limit rows for QA users (`RateLimit.key LIKE 'id:qa-%'`) and reports the number without failing on it.

## 1. How Documenso 2FA works (verified in source)

Routes are Hono at `/api/auth/two-factor` (`packages/auth/server/routes/two-factor.ts`), not tRPC.

- `POST /setup` (session required): `setup-2fa.ts` creates a 10-byte random secret, base32-encoded (16 chars, SHA-1, 6 digits), plus 10 backup codes shaped `XXXXX-XXXXX` (uppercase hex). Both are encrypted and stored in `User.twoFactorSecret` and `User.twoFactorBackupCodes` with `twoFactorEnabled=false`. Response `{ success, secret, uri }`.
- `POST /enable` with `{ code }` (6 chars): `enable-2fa.ts` verifies the TOTP, sets `twoFactorEnabled=true`, returns `{ recoveryCodes }`. Backup codes are only returned here and by `/view-recovery-codes`.
- Encryption (`packages/lib/universal/crypto.ts`): XChaCha20-Poly1305 via `@noble/ciphers`, key `sha256(NEXT_PRIVATE_ENCRYPTION_KEY)`. The harness sets that key to the stock placeholder `CAFEBABE` (`qa-portfolio-harness/src/adapters/documenso-env.ts`).
- Login (`email-password.ts` `/authorize`): body `{email,password,totpCode?,backupCode?,csrfToken}`. Order: loginRateLimit, CSRF, password, then 2FA. 2FA on and no code sent throws `TWO_FACTOR_MISSING_CREDENTIALS`. A wrong code throws `INVALID_TWO_FACTOR_CODE`. If `totpCode` is truthy only TOTP is checked.
- TOTP window (`verify-2fa-token.ts`): `window = 1`, `period = 30_000` ms, loop runs once, so only the current 30 s step is accepted. Tighter than Cal, which accepts the current and one previous step.
- Replay and backup reuse (predicted bugs, source-supported): verify is stateless (no used-code tracking), and `verifyBackupCode` is `codes.includes(code)`. The only writers of `twoFactorBackupCodes` are setup, disable and admin reset.
- Failure status (predicted bug): `INVALID_TWO_FACTOR_CODE`, `TWO_FACTOR_MISSING_CREDENTIALS` and `INVALID_CREDENTIALS` are `AppError`s without `statusCode`. `onError` in `packages/auth/server/index.ts` returns `err.statusCode || 500`, so HTTP 500 with body `{code,message}`.
- Fail-open config trap: `isTwoFactorAuthenticationEnabled` is `twoFactorEnabled && typeof KEY === 'string'`. A server without the key silently skips 2FA at login.
- Rate limit: `loginRateLimit` max 10 per identifier (email), globalMax 50 per IP, window 15 m, fixed wall-clock buckets in the `RateLimit` table, counting every authorize call including failures. `DANGEROUS_BYPASS_RATE_LIMITS` is empty in the fork `.env`, so the limiter is live.

### Enrolment: UI once, API for the rest, never DB

- UI in P1-DOC-2FA-001 only: the only coverage of the real dialog, secret display and backup-codes screen.
- API (`/setup` then `/enable`) in the fixture for every other test. It needs one password login, then mints the code from the returned secret.
- Not DB: it would need `NEXT_PRIVATE_ENCRYPTION_KEY` plus an XChaCha20 implementation. Node `crypto` has none, so it would add `@noble/ciphers` and have P1 read the product key. The API path adds nothing. Cost: one extra login per fixture user.

## 2. Step 0: live probe (before any file is written)

One-off, not committed. Budget about 3 logins on a single throwaway QA user (created with the existing `createDocumensoQaUser`, deleted afterwards, then the leak script).

0. HTTP health only: `GET /signin` and `GET /api/auth/csrf` on `http://127.0.0.1:3001` both 200. Never touch Cal.
1. Read the current bucket count first (read-only SQL on `"RateLimit"`: `action = 'auth.login'`, `key = 'ip:<ip>'`, current `bucket`). If current + 3 would exceed 50, wait for the next 15-minute boundary.
2. Login 1: password-only API login (2FA not yet on), then `/setup` and `/enable` with a code minted from the secret.
3. Login 2: API login with a deliberately wrong code. Record HTTP status and body `code`. This confirms or drops the 500 prediction (test 004).
4. Login 3: UI password-only submit in the browser so the "Two-Factor Authentication" dialog opens. Take an accessibility snapshot (no extra hit for the backup toggle). Record accessible names of the Token input, the Backup Code input, the toggle and the submit button.
5. The enable-dialog labels on `/settings/security` are verified when 001 first runs (error-context snapshot on failure), not in the probe.

Probe results decide: 004 kept or dropped, and `getByLabel("Token")` vs a role fallback plus an a11y finding.

## 3. Files

New:

- `src/products/documenso/auth.ts`: `loginViaApi(http, {email,password,totpCode?,backupCode?})` (GET csrf, POST authorize; returns `{status, code, message, hasSessionCookie}` and never asserts), `readSession(http)` via `GET /api/auth/session`, `sessionHasEmail`, `setupTwoFactorViaApi(http)`, `enableTwoFactorViaApi(http, code)`. Shapes are validated (secret `^[A-Z2-7]{16}$`, 10 codes `^[0-9A-F]{5}-[0-9A-F]{5}$`). Errors carry the status, never a body, secret or code.
- `src/products/documenso/pages/security.page.ts`: the enable dialog for 001.
- `tests/documenso/auth/2fa.spec.ts`: all cases, tags `["@documenso","@auth","@2fa"]`, annotations `testId` and `priority`.

Modified:

- `src/products/documenso/env.ts`: routes `session`, `twoFactorSetup`, `twoFactorEnable`, `security` (`/settings/security`).
- `src/products/documenso/fixtures.ts`: add `twoFactorDocumensoUser`.
- `src/products/documenso/pages/signin.page.ts`: keep `signIn()` (asserts 201, used by 000); add 2FA dialog locators and methods.
- `src/products/documenso/qa-user.ts`: add `countDocumensoQaRateLimitRows()` (`SELECT count(*)::int FROM "RateLimit" WHERE key LIKE 'id:qa-%'`, read-only).
- `scripts/count-documenso-qa-leaks.mts`: print the rate-limit row count in the JSON output. It is informational: exit code stays driven only by users and orphans.
- `src/core/totp.ts`: reused unchanged (`generateTotpCode(secret, Date.now())`).

Not added: no dependency, no env var, no unit spec, no README or other markdown.

## 4. Fixture `twoFactorDocumensoUser`

Depends on `documensoUser`. Returns `{ ...user, secret, backupCodes }`.

1. New `APIRequestContext` (own cookie jar, separate from the test's `page`).
2. `loginViaApi` password-only, expect 201.
3. `setupTwoFactorViaApi`, mint `generateTotpCode(secret, Date.now())` immediately before `enableTwoFactorViaApi`.
4. Dispose the context in `finally`, then `use(...)`.

Teardown is the existing `documensoUser` teardown (`teardownDocumensoQaUserById`). `Session` and `UserSecurityAuditLog` cascade on user delete. If enrolment throws, `documensoUser` still tears down. Secrets and codes are never logged. Traces are `retain-on-failure`; the user is deleted afterwards so captured secrets are dead. `serializeKnownBugEvidence` already redacts `secret|token|backup|otp`.

## 5. Test cases

Minting rule: `generateTotpCode(secret, Date.now())` right before the code is typed or sent. Current step only. No budget logic. No retries.

| ID                                              | Priority | Fixture         | Level | Oracle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | -------- | --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-DOC-2FA-001 UI enrol                         | P1       | `documensoUser` | UI    | `loginViaApi(page.request)` so the session lands in the page; `/settings/security`, Enable 2FA. Secret captured from the `/setup` response (`waitForResponse`) and shown on screen (`getByText(secret,{exact:true})`). Fresh code into Token, submit. 10 codes from the `/enable` response all visible in "Backup codes". Close, reload, "Recovery codes" section present. Then a password-only login on a fresh context is rejected with `TWO_FACTOR_MISSING_CREDENTIALS` and no session cookie. |
| P1-DOC-2FA-002 TOTP login                       | P1       | 2FA             | UI    | Password submit, dialog, mint, fill Token, submit. Authorize outcome, URL `/t/<team>/documents`, and independent `GET /api/auth/session` with matching email.                                                                                                                                                                                                                                                                                                                                     |
| P1-DOC-2FA-003 wrong code rejected              | P1       | 2FA             | UI    | Wrong code derived from the live code (`(Number(live)+1) % 1e6`, zero-padded) so it cannot collide. Body `code === INVALID_TWO_FACTOR_CODE`; toast "Unable to sign in" / "The two-factor authentication code provided is incorrect."; dialog still open; URL still `/signin`; `isAuthenticated === false`. No HTTP status assertion here.                                                                                                                                                         |
| P1-DOC-2FA-004 wrong-code status is 4xx         | P2       | 2FA             | API   | Strict 4xx. `test.fail()` right after setup, `issue` `P7-OBS-DOC-2FA-003`. Dropped if the probe shows 4xx.                                                                                                                                                                                                                                                                                                                                                                                        |
| P1-DOC-2FA-005 backup code login works          | P1       | 2FA             | UI    | Password, dialog, "Use Backup Code", fill "Backup Code" with `backupCodes[0]` exactly (case-sensitive), submit. URL and session email.                                                                                                                                                                                                                                                                                                                                                            |
| P1-DOC-2FA-006 spent backup code rejected       | P1       | 2FA             | API   | First use 201; second must be rejected with `INVALID_TWO_FACTOR_CODE` and no session. `test.fail()` right after setup, `issue` `P7-OBS-DOC-2FA-001`. Evidence JSON attached first via `testInfo.attach` + `serializeKnownBugEvidence` (`firstStatus`, `secondStatus`, `secondCode`); `attachKnownBugEvidence` needs a `page`, so API tests use the serialiser directly.                                                                                                                           |
| P1-DOC-2FA-007 same-window TOTP replay rejected | P2       | 2FA             | API   | Two separate `APIRequestContext`s, one code minted once. First 201, second must be rejected with `INVALID_TWO_FACTOR_CODE`. `test.fail()`, `issue` `P7-OBS-DOC-2FA-002`. Evidence attached first.                                                                                                                                                                                                                                                                                                 |
| P1-DOC-2FA-008 password-only blocked            | P1       | 2FA             | API   | `TWO_FACTOR_MISSING_CREDENTIALS`, no session cookie, `isAuthenticated === false`.                                                                                                                                                                                                                                                                                                                                                                                                                 |

Working-path and known-bug assertions are in separate tests (003/004, 005/006) because `test.fail` passes on any failure and would otherwise mask a regression of the working path.

## 6. Locators (semantic only; confirm against the live DOM first)

Sign-in dialog (`apps/remix/app/components/forms/signin.tsx`):

- `getByRole("dialog", { name: "Two-Factor Authentication" })`
- TOTP: `dialog.getByLabel("Token")`. Predicted accessible via `FormLabel htmlFor` to `FormControl id` to the single `input-otp` `<input>`. The six slots are non-semantic `div`s. If it fails, use `getByRole("textbox")` scoped to the dialog and log an a11y finding like Cal's.
- Backup: `dialog.getByLabel("Backup Code")`
- Toggle: `dialog.getByRole("button", { name: "Use Backup Code" | "Use Authenticator" })`
- Submit: `dialog.getByRole("button", { name: "Sign In", exact: true })`
- Error toast: `getByText` (lowest priority; check for a `status` or `alert` role first)

Enable dialog (`.../2fa/enable-authenticator-app-dialog.tsx`): page trigger `getByRole("button",{name:"Enable 2FA"})`; dialog by heading "Enable Authenticator App"; Token `getByLabel("Token")`; submit `dialog.getByRole("button",{name:"Enable 2FA"})`; result dialog by heading "Backup codes".

A11y findings (verified in source, report as findings):

- Each recovery-code copy button is an icon-only `<button>` with no accessible name (`recovery-code-list.tsx`).
- The setup secret is a bare `<p>` with no role or label, and the QR is injected SVG with no title.

## 7. Rate-limit budget

Authorize calls per test, including the fixture's enrol login (1). A UI 2FA login is 2 calls (password-only submit, then submit with a code). An API code login is 1.

| Test        | Calls |
| ----------- | ----- |
| 000 sign-in | 1     |
| 001         | 2     |
| 002         | 3     |
| 003         | 3     |
| 004         | 2     |
| 005         | 3     |
| 006         | 3     |
| 007         | 3     |
| 008         | 2     |

`@2fa` run = 21 (19 if 004 is dropped). Full `documenso-chromium` run = 22. Plus about 3 for the probe. Per-IP cap 50 per 15-minute wall-clock bucket; per-email cap 10 is never close.

Sequence budget: probe 3, quick check 21, quick check 21 = 45 of 50 if all in one bucket. That leaves no room for a full documenso run in the same bucket, and nothing for retries. Mitigations (no sleeps in tests, no bypass): check the bucket count before each run, split runs across the 15-minute boundary by waiting outside the tests, and never set `DANGEROUS_BYPASS_RATE_LIMITS` (it hides the real limiter and needs a Documenso restart). A 429 is an environment limit, not a test bug; the fixture and tests assert statuses so it fails loudly.

## 8. Risks and findings-log traps

- `--grep "@2fa"` alone also selects Cal's `@2fa` specs and pulls in Cal setup. Always `--project=documenso-chromium` (`npm run test:documenso -- --grep "@2fa"`). Cal is never started, stopped or rebuilt; HTTP health only.
- Step boundary: server accepts only the current step, so a code can be rejected if the step rolls between mint and verify (roughly latency/30 s per login). Accepted, red not silent. For 007 a crossing makes the second request fail for the wrong reason, so `test.fail` unexpectedly passes and the run goes red.
- `test.fail` masking: an unrelated early failure (429, 500 on first use, CSRF) also satisfies `test.fail`. The evidence JSON is attached before the strict assertions, so review it on every run.
- If upstream fixes replay, the fixture's enrol-then-immediate-login can collide in one 30 s step. 007 flips to unexpected-pass first. Do not add sleeps then.
- The 500 is a prediction; the probe decides 004.
- Leftover `RateLimit` rows keyed `id:<qa email>` are not removed by teardown or sweep. They are now counted and reported by the leak script (informational, exit code unchanged) to see the buildup.
- Never `git add -A`: `playwright-report/index.html` and `test-results/.last-run.json` appear as untracked. Stage explicit paths.
- Documenso is not run by CI (`.github/workflows/e2e.yml` only creates product folders), so the push gets structural CI only.

## 9. Commands (Windows, one Playwright run at a time)

1. `git status --short` and `git log --oneline -5`. If anything is modified, show `git diff` and commit it separately, or stop and ask. Never fold it into this task.
2. Health: `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3001/signin` and `.../api/auth/csrf`, both 200.
3. Probe (section 2), then leak check.
4. Build in order: `env.ts`, `auth.ts`, `signin.page.ts`, `security.page.ts`, `fixtures.ts`, `qa-user.ts` + leak script, `2fa.spec.ts`. Iterate one test at a time: `npm run test:documenso -- --grep "P1-DOC-2FA-002"`.
5. Quick check 1: `npm run test:documenso -- --grep "@2fa"`
6. Quick check 2: same command, after 1 finishes.
7. Leak check: `npx tsx scripts/count-documenso-qa-leaks.mts` (expect `users: 0`, all orphans 0, exit 0; rate-limit row count printed).
8. `npm run check` must pass.
9. Commit with explicit paths. `git push origin feat/2026-10-11-p1-phase2e-documenso-2fa`. No PR, merge or tag.

## 10. Final report must include

- For each of `P7-OBS-DOC-2FA-001` (backup code reuse), `-002` (same-window replay), `-003` (auth failure returns 500, or "not confirmed" and 004 dropped): the live observation (statuses, body `code`), the source file and line, the evidence attachment name, and the test ID.
- The a11y findings, with live confirmation of which labels resolved.
- The leak-script numbers (users, orphans, rate-limit rows) and the rate-limit hits used per run.
- What was not verified (CI does not run these tests; the enable-dialog labels if only seen once).
