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
