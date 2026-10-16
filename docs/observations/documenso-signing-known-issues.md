# Documenso signing E2E observations

## P7-OBS-DOC-FW-006 (low): cancelled envelope still shows signing UI

**Observed (trace + screenshot, 2026-10-13):** After the owner cancels a pending envelope, opening the recipient `/sign/{token}` URL still renders the full signing experience (for example **Sign Document**, **1 Field Remaining**, **Next Field**, name/signature controls). The unavailable heading (`/is no longer available to sign/`) does not appear.

**Server behaviour (verified):** `recipient.completeDocumentWithToken` returns HTTP **400** with `ENVELOPE_CANCELLED` (see FW-010 attachments). Completion is refused.

**Classification:** UX inconsistency (stale signing chrome while mutations reject). Not a harness `test.fail` item; API coverage lives in **P1-DOC-FW-010**.

## P7-OBS-DOC-FW-005 (low): orphan DocumentMeta / DocumentData after envelope delete

**Observed (verified, CI run [38390915947](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38390915947), `documenso-self-hosted`):** After the full Documenso chromium suite (27 tests: 23 passed, 4 expected 2FA failures), `scripts/count-documenso-qa-leaks.mts` reported **orphanDocumentMeta=11** and **orphanDocumentData=14**. **users**, organisation orphans, **passkeys**, **qaEnvelopes**, and **qaRecipients** were all **0**.

**Cause:** Documenso does not always remove `DocumentMeta` / `DocumentData` rows when envelopes are deleted during signing tests (product cleanup gap), not missing P1 teardown.

**Harness:** The leak script still fails on QA users, org orphans, passkeys, `qaEnvelopes`, and `qaRecipients`. Orphan document storage is printed and appended to the GitHub job summary under this finding; the job fails only if either count exceeds the script ceiling (100).

## P7-OBS-DOC-FW-009 (TEST BUG, fixed 2026-10-13)

**Evidence:** FW-009 failed in full `@fw` after tests 001–007. Trace `test.trace` (monotonic ms): navigate `/t/personal_15e2e48730a33702/documents` at **75687**; `waitForURL` done **76561**; `GET /api/limits` waiter done **76879**; **Documents** heading + upload `aria-disabled` checks passed at **76880–77052**; upload click at **77077** — button **detached from DOM** during retry; failure screenshot **404 Team not found**.

**Cause:** `DocumentsPage.goto()` treated `/api/limits` (200) and URL match as sufficient. The shell can show **Documents** and an enabled upload control, then replace the tree with **Team not found** before the index is ready.

**Fix:** Register and await `document.findDocumentsInternal` (HTTP **200**) before navigation with URL + limits; fail fast on **429** with `Documents index rate limited (429)`.

## CI: tRPC rate limit during full suite (run 38377317652)

**Observed (verified):** Full `documenso-chromium` job (27 tests, 2FA + passkey before `@fw`) hit `organisation.internal.getOrganisationSession` **429** during **P1-DOC-FW-002**; `envelope-editor-step-addFields` never appeared (120s wait). Locally, `@fw`-only runs stayed under the per-minute tRPC budget.

**Mitigation (ADR 0011):** CI and local scripts run harness **down/up** with `DANGEROUS_BYPASS_RATE_LIMITS=true` after **P1-DOC-RL-001** (limits enforced on the first stack); functional tests attach a browser **429 fail-fast** on any `/api/trpc/*` response. FW-002 and FW-003 remain full UI journeys; FW-004..011 still use API envelope setup where implemented (not for rate-limit budgeting).

### Rate-limit primitive **P1-DOC-RL-001**

With bypass **off**, 51 failed authorize calls in one 15m IP bucket must yield HTTP **429** on the last call (`loginRateLimit` globalMax 50 in `rate-limits.ts`).

### Product bypass flag (read at request time, not fork `.env`)

| Env                            | Source (Documenso fork)                          | Effect when `true`                                              |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------- |
| `DANGEROUS_BYPASS_RATE_LIMITS` | `rate-limit.ts` ~73–79                           | Skips all `createRateLimit` checks (login, passkey, tRPC, etc.) |
| same                           | `assert-organisation-rates-and-limits.ts` ~32–34 | Skips organisation quota assertions                             |

P1 sets this only via harness `up.mjs` env on the second stack (after RL-001); never in the Documenso fork `.env`.

## Phase 4d: user-facing asserts in the browser (FW-004..011)

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

## Phase 3 visual and a11y (probe 2026-10-16)

Probe data below was measured live on the Documenso fork `f4105e47` with real and frozen clocks; the specs re-capture it as evidence on every run. Evidence files are committed under [`evidence/`](evidence/) (one PNG and one JSON per finding). The axe findings are allowlisted in `DOCUMENSO_AXE_ALLOWLIST` (`src/products/documenso/visual.ts`); an entry that stops matching fails the scan as stale.

| ID                                                                                              | Finding                                                                                                                                                                                                                                     | Label                                  | Test                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| DOC-VIS-004-F1 ([png](evidence/DOC-VIS-004-F1.png), [json](evidence/DOC-VIS-004-F1.json))       | `/documents` pending-recipient initials `#4764ae` on `#d7e4f3` = 4.39:1 (both themes, all viewports; Step 0 had recorded yellow initials at 4.23:1, the build run shows blue `bg-water` ones, re-measured 2026-10-16)                       | PRODUCT BUG (WCAG 1.4.3)               | `contrast.a11y.spec.ts` P1-DOC-VIS-004      |
| DOC-VIS-004-F2 ([png](evidence/DOC-VIS-004-F2.png), [json](evidence/DOC-VIS-004-F2.json))       | "Organize your documents" `#a2acb9` on `#fff` = 2.29:1 (light only, all viewports)                                                                                                                                                          | PRODUCT BUG (WCAG 1.4.3)               | same                                        |
| DOC-VIS-004-F3 ([png](evidence/DOC-VIS-004-F3.png), [json](evidence/DOC-VIS-004-F3.json))       | "Ctrl+K" hint `#64748b` on `#f1f5f9` = 4.34:1 (light only, tablet and desktop)                                                                                                                                                              | PRODUCT BUG (WCAG 1.4.3)               | same                                        |
| DOC-VIS-X07-F4..F10 ([F4](evidence/DOC-VIS-X07-F4.json) … [F10](evidence/DOC-VIS-X07-F10.json)) | `/documents` full WCAG: critical `button-name` (row action button, two mobile header icon buttons, period combobox), critical `label` (hidden file inputs), serious `link-name` (header link), serious `nested-interactive` (upload button) | PRODUCT BUG                            | `contrast.a11y.spec.ts` P1-DOC-VIS-X07      |
| DOC-VIS-X01 ([png](evidence/DOC-VIS-X01.png), [json](evidence/DOC-VIS-X01.json))                | A 200-char title on the signing page at >= 768 px is `whitespace-nowrap`, 1433 px wide: document `scrollWidth` 1781 (820 wide) and 1891 (1440 wide), and the primary action is pushed to x 1704 / 1834                                      | PRODUCT BUG (re-reproduced, see below) | `long-text.visual.spec.ts` P1-DOC-VIS-X01   |
| DOC-VIS-X03 ([png](evidence/DOC-VIS-X03.png), [json](evidence/DOC-VIS-X03.json))                | A PDF request that never answers leaves the spinner on for at least 60 s: no error, no toast, no console error (the fetch has no timeout)                                                                                                   | PRODUCT BUG (re-reproduced, see below) | `pdf-failure.visual.spec.ts` P1-DOC-VIS-X03 |
| DOC-VIS-X04 ([png](evidence/DOC-VIS-X04.png), [json](evidence/DOC-VIS-X04.json))                | At 200% zoom (197 CSS px at DPR 2) "Complete" is 88 px wide at x 176, so its right edge (264) is past the viewport and only a sliver shows (WCAG 1.4.10)                                                                                    | PRODUCT BUG (re-reproduced, see below) | `signing.a11y.spec.ts` P1-DOC-VIS-X04       |

Correct behaviour, asserted as passing: a PDF HTTP 500 or a network abort shows "Something went wrong while loading the document." plus the toast "An error occurred while loading the document." (VIS-005, X02); the German signing page (`de-DE`) fits 393 px (VIS-002); the mobile 200-char title ellipsizes with the full title in `title` (VIS-003); "Complete" is reachable by keyboard within five Tabs (X05) and keeps a solid border in forced-colors mode (X06).

Observation, not asserted: "Next Field" stays enabled while no PDF has loaded.

Candidate re-reproduction: DOC-VIS-X01, X03 and X04 were run twice as separate invocations before their `test.fail` was kept; both runs failed the same way (see the build report).
