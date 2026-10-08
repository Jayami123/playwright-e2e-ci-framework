# 0005. Self-hosted Cal on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-08

## Context

[ADR 0003](0003-ci-secret-gating.md) runs live E2E only when repository secret `CAL_E2E_BASE_URL` points at an external deployment. Without that secret, CI was lint and typecheck only. Portfolio P1 needs Cal FW tests on every pull request without maintaining a public staging URL or sharing a live base URL secret.

The harness (`qa-portfolio-harness#v0.2.0`) already starts Postgres via compose, seeds with `yarn db-seed`, and runs Cal with `next build` + `next start` through `getAdapter('cal').up()`. Global setup in this repo waits on `GET /api/auth/csrf` after `up()`.

## Decision

Add job `cal-self-hosted` to reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml) on `ubuntu-24.04`, Node from [`.nvmrc`](../../.nvmrc), with `timeout-minutes` driven by workflow env `CAL_SELF_HOSTED_TIMEOUT_MINUTES` (default `90`).

**Mutual exclusion** (same event never runs both paths):

| Repository secret `CAL_E2E_BASE_URL` | E2E path                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Non-empty                            | Existing `cal-chromium` shards 1–4 + `merge-reports` against that URL. No `cal-self-hosted`. |
| Empty / unset                        | `cal-self-hosted` only. No external shards, no skip-only job.                                |

The structural job still sets `has_live_url` by injecting the secret into step env (not job-level `secrets.*` in `if:`).

**Checkouts** (all `persist-credentials: false`): this repo; [Jayami123/cal](https://github.com/Jayami123/cal) at `CAL_REF` (default `main`, overridable via `workflow_dispatch`) into `./cal`.

**Harness boundary**: CI runs `yarn install --immutable` in `cal/` and creates ephemeral product `.env` from `cal/.env.example` (`NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY` via `openssl`, URLs normalized to `127.0.0.1:3000`). Compose, seed, and web start stay in harness `up()`—not reimplemented in YAML.

**Run**: `npm run test:cal` with `CAL_E2E_BASE_URL` / `CAL_BASE_URL` set to `CAL_E2E_LOCAL_BASE_URL` (`http://127.0.0.1:3000`), `PRODUCTS_ROOT` = workspace, `CAL_PRODUCT_DIR` = `cal/`. Seed login uses harness defaults (`pro@example.com` / `pro`) unless optional secrets `CAL_E2E_EMAIL` / `CAL_E2E_PASSWORD` are set.

**Caching** (exact keys, no `restore-keys`): Cal Yarn cache on `cal/yarn.lock`; Next output on Cal commit SHA; Playwright browsers on version string (same as external path).

**Sharding**: Single job for self-hosted. Four matrix jobs would each pay for Postgres, seed, and `next build`. External URL path keeps four shards because the app is already up and global setup skips `up()` when CSRF is healthy.

**Artifacts** (Actions v5): merged Playwright HTML report, `test-results` on failure, redacted Cal web log from `node_modules/qa-portfolio-harness/.harness/cal-web.log`.

## Alternatives considered

- **External URL only (0003)**: Simple but blocks PR E2E without secrets and ops for a stable URL.
- **Long-lived VM**: Lower repeat build cost, but another host to patch and wire into Actions.
- **Prebuilt Cal Docker image**: Faster cold start, but image build/publish pipeline and drift from fork `main`.

## Consequences

- First self-hosted runs are long (Yarn install + optional `next build`); warm `.next` cache on the same Cal commit shortens later runs.
- Requires Docker on the runner (default on `ubuntu-24.04`).
- Fork pin via `cal_ref` dispatch input; default `main` may break tests until pin is updated.
- Teams that want self-hosted on every PR must leave `CAL_E2E_BASE_URL` unset; setting the secret selects the external path exclusively.
- [ADR 0003](0003-ci-secret-gating.md) external path is unchanged when the secret is present.
