# Documenso signing E2E observations

## P7-OBS-DOC-FW-006 (low): cancelled envelope still shows signing UI

**Observed (trace + screenshot, 2026-10-13):** After the owner cancels a pending envelope, opening the recipient `/sign/{token}` URL still renders the full signing experience (for example **Sign Document**, **1 Field Remaining**, **Next Field**, name/signature controls). The unavailable heading (`/is no longer available to sign/`) does not appear.

**Server behaviour (verified):** `recipient.completeDocumentWithToken` returns HTTP **400** with `ENVELOPE_CANCELLED` (see FW-010 attachments). Completion is refused.

**Classification:** UX inconsistency (stale signing chrome while mutations reject). Not a harness `test.fail` item; API coverage lives in **P1-DOC-FW-010**.

## P7-OBS-DOC-FW-009 (TEST BUG, fixed 2026-10-13)

**Evidence:** FW-009 failed in full `@fw` after tests 001–007. Trace `test.trace` (monotonic ms): navigate `/t/personal_15e2e48730a33702/documents` at **75687**; `waitForURL` done **76561**; `GET /api/limits` waiter done **76879**; **Documents** heading + upload `aria-disabled` checks passed at **76880–77052**; upload click at **77077** — button **detached from DOM** during retry; failure screenshot **404 Team not found**.

**Cause:** `DocumentsPage.goto()` treated `/api/limits` (200) and URL match as sufficient. The shell can show **Documents** and an enabled upload control, then replace the tree with **Team not found** before the index is ready.

**Fix:** Register and await `document.findDocumentsInternal` (HTTP **200**) before navigation with URL + limits; fail fast on **429** with `Documents index rate limited (429)`.

## ENVIRONMENT / CI risk: Documenso rate limits (login + tRPC)

**Label:** ENVIRONMENT / CI risk (not a product functional bug under test).

### `auth.login` (~50 authorize calls / IP / 15 minutes)

**Observed:** Burst re-runs of full `@fw` fail every test at `loginViaApi` with **HTTP 429** before any UI step.

**Budget:** Each test using `signedInDocumensoUser` performs one **POST /api/auth/email-password/authorize** in the page fixture. Full `@fw` (11 tests) ≈ **10** logins per run (FW-001 uses empty storage and its own login). More than a few full suites inside one 15-minute wall-clock bucket exhausts the limit.

**Mitigation:** Wait for the login bucket boundary before re-gating; do not interpret fixture **429** as a documents-page regression.

### `apiTrpcRateLimit` (~100 `/api/trpc/*` / IP / minute)

**Observed (verified 2026-10-13):** When every primitive used UI `DocumentsPage.goto()` + upload/send, a single `@fw` run exceeded **100** browser tRPC calls/minute. `document.findDocumentsInternal` returned **429**; the app showed **Team not found** while `GET /api/limits` stayed **200**.

**Harness mitigations:**

- **P1-DOC-FW-002** and **P1-DOC-FW-003** keep the UI upload/send/sign journey.
- **P1-DOC-FW-004..011** create pending envelopes via **`envelope.create` + `envelope.distribute`** on `page.request` (same procedures as the UI; not counted in browser telemetry).
- `DocumentsPage.goto()` awaits `findDocumentsInternal` **200** and fails fast on **429**.
- `tests/documenso/fw/fixtures.ts` logs **`P1_DOC_FW_TRPC_BUDGET browser=<n>`** once per worker after all tests that use the FW fixture (browser `/api/trpc` responses only; excludes FW-001 which uses the base `documenso` fixture).

### Browser `/api/trpc` budget (full `@fw`, verified)

| Phase                                           | Approx. browser `/api/trpc` per full `@fw` run                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Before (UI send + `goto` per primitive 004–011) | **>100** (rate limit failures)                                                                            |
| After (API envelope setup 004–011)              | **~44–46** on FW signed-in specs (+ ~6–7 for FW-001 `DocumentsPage.goto`, not in `P1_DOC_FW_TRPC_BUDGET`) |

Gate: `npm run test:documenso -- --grep "@fw"`; keep **browser** total **under 100/minute**; space back-to-back full suites if login **429** appears.

### Phase 4d: user-facing asserts in the browser (FW-004..011)

Setup for 004–011 is **API/tRPC** (not the documents UI). User-facing oracles still use the browser where the product surface is the signing page or HTTP status from navigation:

| Test              | Browser used for asserts                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1-DOC-FW-004** | Yes — recipient signs in fresh context (`SigningPage`); revisit `/sign` URL (`/complete`, **Document Signed** heading); complete retry is API-only. |
| **P1-DOC-FW-005** | No — API/tRPC + DB only.                                                                                                                            |
| **P1-DOC-FW-006** | No — API/tRPC + DB only.                                                                                                                            |
| **P1-DOC-FW-007** | Yes — `goto` tampered `/sign/{token}x`, expect **404**.                                                                                             |
| **P1-DOC-FW-008** | Yes — `goto` signing URL after SQL expiry seam, expect **404** or `/expired`.                                                                       |
| **P1-DOC-FW-009** | Yes — `goto` signing URL after owner delete, expect **404**; delete is API.                                                                         |
| **P1-DOC-FW-010** | No — cancel/complete/status via API + DB + attachments.                                                                                             |
| **P1-DOC-FW-011** | No — unauthenticated `envelope.get` via isolated API context.                                                                                       |
