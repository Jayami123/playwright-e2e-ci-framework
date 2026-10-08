# 0005. Self-hosted Cal on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-08

## Context

[ADR 0003](0003-ci-secret-gating.md) runs live E2E only when repository secret `CAL_E2E_BASE_URL` points at an external deployment. Without that secret, CI was lint and typecheck only. Portfolio P1 needs Cal FW tests on every pull request without maintaining a public staging URL or sharing a live base URL secret.

Checking P1 and Cal into the same directory made Next.js treat P1's `package-lock.json` as the workspace root. The harness (`qa-portfolio-harness` at SHA `54b1493890a8dfe71bf6c5ddaed21c2aad436b4f` until `#v0.2.1`) starts Postgres via compose, seeds with `yarn db-seed`, generates Cal tRPC types (`yarn turbo run build --filter=@calcom/trpc`), and runs `next build` + `next start` through `getAdapter('cal').up()`. It skips `next build` when `apps/web/.next/required-server-files.json` exists and `harness-build.json` `gitSha` matches Cal `HEAD`. Global setup in this repo waits on `GET /api/auth/csrf` after `up()`. The harness resolves the Cal fork at `PRODUCTS_ROOT/cal` (no `CAL_PRODUCT_DIR` in CI). Because harness `loadConfig()` also checks sibling product roots, CI creates empty `documenso/`, `medusa/`, and `twenty-CRM/` directories under `PRODUCTS_ROOT` before calling `getAdapter('cal')`.

## Decision

Add job `cal-self-hosted` to reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml) on `ubuntu-24.04`, Node from [`.nvmrc`](../../.nvmrc), with `timeout-minutes: ${{ inputs.self_hosted_timeout_minutes }}` (default `90` via `workflow_call` input).

**Mutual exclusion** (same event never runs both paths):

| Repository secret `CAL_E2E_BASE_URL` | E2E path                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Non-empty                            | Existing `cal-chromium` shards 1–4 + `merge-reports` against that URL. No `cal-self-hosted`. |
| Empty / unset                        | `cal-self-hosted` only. No external shards.                                                  |

Fork and Dependabot pull requests use the same rule: without the secret, they always run self-hosted E2E (not a skip-only structural pass).

The structural job still sets `has_live_url` by injecting the secret into step env (not job-level `secrets.*` in `if:`).

**Checkouts** (all `persist-credentials: false`): this repo into `p1/`; [Jayami123/cal](https://github.com/Jayami123/cal) at `inputs.cal_ref` (default `main`, overridable via `workflow_dispatch`) into `products/cal`. Job env `PRODUCTS_ROOT` is `${{ github.workspace }}/products`. P1 steps use `working-directory: p1`.

**Harness boundary**: CI runs `yarn install --immutable` in `products/cal` and creates ephemeral product `.env` from `products/cal/.env.example` (`NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY` generated in shell, `::add-mask::` before any other use, validated non-empty). URLs normalized to `127.0.0.1:3000`. Compose, seed, tRPC types, and `next build` / `next start` stay in harness `up()`—not reimplemented in YAML.

**Run**: `npm run test:cal` (from `p1/`) with step-level env only: `CAL_E2E_BASE_URL` / `CAL_BASE_URL` = `CAL_E2E_LOCAL_BASE_URL` (`http://127.0.0.1:3000`), `CAL_E2E_EMAIL` / `CAL_E2E_PASSWORD` = workflow env defaults (`pro@example.com` / `pro`). Repository secrets for E2E credentials are **not** used on this path (seeded DB accepts only the seed user; custom passwords must not reach traces or artifacts).

**Caching** (exact keys, no `restore-keys`): Cal Yarn on `products/cal/yarn.lock`; Next output (including `harness-build.json`) via `actions/cache/restore@v4` + conditional `actions/cache/save@v4` with key `${{ runner.os }}-cal-next-${{ steps.checkout_cal.outputs.commit }}` when `required-server-files.json` exists; Playwright browsers via composite action.

**Sharding**: Single job for self-hosted. Four matrix jobs would each pay for Postgres, seed, and `next build`. External URL path keeps four shards because the app is already up and global setup skips `up()` when CSRF is healthy.

**Artifacts** (Actions v5): merged Playwright HTML report (`if-no-files-found: ignore` on upload), `playwright-test-results` on every non-cancelled run (`if-no-files-found: ignore`), redacted Cal web log. Log redaction removes name-based secret lines and replaces **values** of `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`, and any DATABASE_URL userinfo password with `[REDACTED]`. The public seed password `pro` is intentionally **not** redacted (documented seed user for the ephemeral instance).

**DRY**: Composite actions [`.github/actions/setup-p1`](../../.github/actions/setup-p1) and [`.github/actions/playwright-browsers`](../../.github/actions/playwright-browsers) accept `working-directory`. Lint job runs [actionlint](https://github.com/rhysd/actionlint) (install script pinned to a release tag) on `.github/workflows` before `npm ci`.

## Alternatives considered

- **External URL only (0003)**: Simple but blocks PR E2E without secrets and ops for a stable URL.
- **Long-lived VM**: Lower repeat build cost, but another host to patch and wire into Actions.
- **Prebuilt Cal Docker image**: Faster cold start, but image build/publish pipeline and drift from fork `main`.

## Consequences

- First self-hosted runs are long (Yarn install + optional `next build`); a warm `.next` cache for the same Cal commit SHA lets the harness skip rebuild when `harness-build.json` matches `HEAD`.
- Requires Docker on the runner (default on `ubuntu-24.04`).
- Fork pin via `cal_ref` dispatch input; default `main` may break tests until pin is updated.
- Teams that want self-hosted on every PR must leave `CAL_E2E_BASE_URL` unset; setting the secret selects the external path exclusively.
- [ADR 0003](0003-ci-secret-gating.md) external path is unchanged when the secret is present.
