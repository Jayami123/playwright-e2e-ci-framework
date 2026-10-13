# 0011. Self-hosted Documenso on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-13

## Context

Phase 2e adds Documenso auth, signing, and passkey primitives (`P1-DOC-*`) against [Jayami123/documenso](https://github.com/Jayami123/documenso) via `qa-portfolio-harness` `#v0.2.5`. Documenso requires **Node 24** for product `npm ci` and harness `up()`, while P1 stays on Node 22 from `.nvmrc`. The public Playwright origin is `http://p1.lvh.me:3001` (hosts file → `127.0.0.1`); listen URL stays `http://127.0.0.1:3001`. Passkeys need a **secure context**, so `documenso-chromium` uses Playwright `channel: "chrome"` plus `--unsafely-treat-insecure-origin-as-secure=<publicUrl>` ([passkey notes](../observations/documenso-passkey-e2e-notes.md)).

Product login rate limits (no bypass in P1 CI): **10** per email, **50** per IP per **15m**; every authorize counts. The full `documenso-chromium` project spends about **41** of the 50/IP budget per serial run (FW-001..011, 2FA-001..009, AUTH-000, PK-001..006). Global CI `retries: 2` for Cal would multiply authorize calls on a red Documenso run and can exhaust the bucket, so Documenso projects read `P1_DOCUMENSO_RETRIES` (default **0**).

## Decision

- **Job:** `documenso-self-hosted` in reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml). Independent of `CAL_E2E_BASE_URL` and `cal-self-hosted`. PR gate: `npm run test:documenso` (`documenso-chromium` full project).
- **Harness boundary:** CI checks out P1 to `p1/` and Documenso to `products/documenso`, stubs empty `cal/`, `medusa/`, `twenty-CRM/`, maps `p1.lvh.me` in `/etc/hosts`, restores caches, runs Node 24 `npm ci` when cache misses, then `"${NODE24}" p1/node_modules/qa-portfolio-harness/scripts/up.mjs documenso` with `PRODUCTS_ROOT`, `DOCUMENSO_BASE_URL`, `DOCUMENSO_PUBLIC_URL`, `DOCUMENSO_DB_URL`. Compose, migrate, seed, Remix build, and start stay in harness `up()` — not reimplemented in YAML.
- **Probe dispatch:** `workflow_dispatch` input `documenso_probe_only` runs harness `up()`, `scripts/assert-documenso-secure-context.mts` (Chrome must be `isSecureContext`; bundled Chromium logged for ADR), and `playwright test --project=documenso-chromium --list` only — no suite, no leak gate.
- **Browsers:** `playwright-browsers` input `install_chrome: true` for Documenso. Nightly / `browser_matrix`: same Chromium suite, then `documenso-firefox` with `grep` `P1-DOC-FW-001|P1-DOC-FW-002|P1-DOC-FW-003` (~+3 authorizes, ~44 total). PK-* stay Chromium-only (CDP + Chrome channel). No WebKit ([ADR 0008](0008-cal-browser-matrix.md) policy).
- **Retries:** `documenso-chromium` and `documenso-firefox` set `retries` from `P1_DOCUMENSO_RETRIES` (default 0). CI sets `P1_DOCUMENSO_RETRIES: 0`.
- **Caches** (restore every run; save only on `push` to `main` on miss; no `restore-keys`): Documenso `node_modules` + Prisma client keyed `${{ runner.os }}-documenso-nm-${{ documenso commit }}-${{ hashFiles(package-lock.json) }}`; Remix `apps/remix/build` keyed `${{ runner.os }}-documenso-remix-${{ documenso commit }}` (matches harness HEAD skip). Cal `node_modules` cache uses the same pattern with `yarn.lock`. Playwright browser cache unchanged.
- **Path filters (PR only):** `changes` job sets `cal` / `documenso` outputs; heavy jobs skip when false. `schedule`, `workflow_dispatch`, and `push` to `main` always run both.
- **Parallelism:** Drop `lint` from `needs` on `cal-self-hosted` and `cal-chromium` so E2E overlaps lint; `lint` remains a required check.
- **Teardown:** `scripts/count-documenso-qa-leaks.mts` at job end (`if: always() && !cancelled()`, skip when `up()` failed or probe-only). `rateLimitRows` informational only.
- **Artifacts:** On failure, upload `p1/test-results` (`trace.zip`, screenshots) as `playwright-test-results-documenso-chromium` / `-firefox`. On completed non-cancelled runs: HTML report, JUnit/JSON (`P1_PW_REPORT_ID=documenso-chromium` / `documenso-firefox` on matrix), redacted `documenso-web.log`. `nightly-alert` summarizes Documenso matrix JSON alongside Cal.
- **Known bugs:** No `test.fail()` without findings HTTP/trace proof (removed in this ADR’s PR). Re-add only with evidence, setup asserts first, `issue` annotation.

## Consequences

- First Documenso CI runs are long (npm ci, Remix build, Docker). Warm caches on `main` shrink repeat runs; probe dispatch records wall-clock before/after.
- Required check after first green run: `e2e / documenso-self-hosted` (document in PR body; do not rename existing checks).
- `DANGEROUS_BYPASS_RATE_LIMITS` is out of scope; a 429 in dispatch needs a separate harness change, never a fork edit.
- Linux `isSecureContext` for Chrome vs bundled Chromium is **not verified** until the probe workflow dispatch completes.
