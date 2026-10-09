# 0005. Self-hosted Cal on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-08

## Context

[ADR 0003](0003-ci-secret-gating.md) runs live E2E only when repository secret `CAL_E2E_BASE_URL` points at an external deployment. Without that secret, CI was lint and typecheck only. Portfolio P1 needs Cal FW tests on every pull request without maintaining a public staging URL or sharing a live base URL secret.

Checking P1 and Cal into the same directory made Next.js treat P1's `package-lock.json` as the workspace root. The harness (`qa-portfolio-harness` `#v0.2.1`) starts Postgres via compose, seeds with `yarn db-seed`, generates Cal tRPC types (`yarn turbo run build --filter=@calcom/trpc`), and runs `next build` + `next start` through `getAdapter('cal').up()`. It skips `next build` when `apps/web/.next/required-server-files.json` exists and `harness-build.json` `gitSha` matches Cal `HEAD`. Global setup in this repo waits on `GET /api/auth/csrf` after `up()`. The harness resolves the Cal fork at `PRODUCTS_ROOT/cal` (no `CAL_PRODUCT_DIR` in CI). Because harness `loadConfig()` also checks sibling product roots, CI creates empty `documenso/`, `medusa/`, and `twenty-CRM/` directories under `PRODUCTS_ROOT` before calling `getAdapter('cal')`.

## Decision

Add job `cal-self-hosted` to reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml) on `ubuntu-24.04`, Node from [`.nvmrc`](../../.nvmrc), with `timeout-minutes: ${{ inputs.self_hosted_timeout_minutes }}` (default `90` via `workflow_call` input).

**Mutual exclusion** (same event never runs both paths):

| Repository secret `CAL_E2E_BASE_URL` | E2E path                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Non-empty                            | Existing `cal-chromium` shards 1–4 + `merge-reports` against that URL. No `cal-self-hosted`. |
| Empty / unset                        | `cal-self-hosted` only. No external shards.                                                  |

Fork and Dependabot pull requests use the same rule: without the secret, they always run self-hosted E2E (not a skip-only structural pass).

The structural job still sets `has_live_url` by injecting the secret into step env (not job-level `secrets.*` in `if:`).

**Checkouts** (all `persist-credentials: false`): this repo into `p1/`; [Jayami123/cal](https://github.com/Jayami123/cal) at workflow env `CAL_REF` (`main`) into `products/cal`. Job env `PRODUCTS_ROOT` is `${{ github.workspace }}/products`. P1 steps use `working-directory: p1`.

**Harness boundary**: CI runs `yarn install --immutable` in `products/cal` and creates ephemeral product `.env` from `products/cal/.env.example` (`NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY` generated in shell, `::add-mask::` before any other use, validated non-empty). URLs normalized to `127.0.0.1:3000`. Compose, seed, tRPC types, and `next build` / `next start` stay in harness `up()`—not reimplemented in YAML.

**Run**: `npm run test:cal` (from `p1/`) with step-level env only: `CAL_E2E_BASE_URL` / `CAL_BASE_URL` = `CAL_E2E_LOCAL_BASE_URL` (`http://127.0.0.1:3000`), `CAL_E2E_EMAIL` from workflow env (`pro@example.com`), `CAL_E2E_PASSWORD` / `CAL_DST_PASSWORD` only on **Run Cal E2E suite** (public seed `pro` / `trial`). Those passwords are not workflow-level env, so they do not appear in every step's env header. Repository secrets for E2E credentials are **not** used on this path (seeded DB accepts only the seed user; custom passwords must not reach traces or artifacts). The public seed values are intentionally **not** `::add-mask::`'d (masking `pro` / `trial` would redact unrelated log text).

**Caching** (exact keys, no `restore-keys`): Cal Yarn on `products/cal/yarn.lock`; Next output (including `harness-build.json`) via `actions/cache/restore@v4` + conditional `actions/cache/save@v4` with key `${{ runner.os }}-cal-next-${{ steps.checkout_cal.outputs.commit }}` when `required-server-files.json` exists (save steps run only on pushes to `main`, not on pull requests); Playwright browsers via composite action.

**Sharding**: Single job for self-hosted. Four matrix jobs would each pay for Postgres, seed, and `next build`. External URL path keeps four shards because the app is already up and global setup skips `up()` when CSRF is healthy.

**Artifacts** (Actions v5): merged Playwright HTML report (`if-no-files-found: ignore` on upload), `playwright-test-results` on every non-cancelled run (`if-no-files-found: ignore`; includes JUnit `test-results/junit.xml` and JSON `test-results/results.json` from CI reporters), redacted Cal web log. Log redaction removes name-based secret lines and replaces **values** of `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`, and any DATABASE_URL userinfo password with `[REDACTED]`. The public seed password `pro` is intentionally **not** redacted (documented seed user for the ephemeral instance). A `Write Playwright job summary` step (`if: ${{ !cancelled() }}`) reads the JSON report and writes passed / failed / flaky / expected-failure totals plus known product bugs (`issue` annotations that failed as expected) to `$GITHUB_STEP_SUMMARY`. An expected failure that unexpectedly passes stays a hard Playwright failure.

Live-only jobs keep their `if:` gates and are named `(live Cal only, skipped without CAL_E2E_BASE_URL)` so a self-hosted run does not look like a missing shard. They are not required checks on `main` (`e2e / lint`, `e2e / typecheck (always)`, `e2e / cal-self-hosted`).

**DRY**: Composite actions [`.github/actions/setup-p1`](../../.github/actions/setup-p1) and [`.github/actions/playwright-browsers`](../../.github/actions/playwright-browsers) accept `working-directory`. Lint job runs [actionlint](https://github.com/rhysd/actionlint) (install script pinned to a release tag) on `.github/workflows` before `npm ci`.

## Alternatives considered

- **External URL only (0003)**: Simple but blocks PR E2E without secrets and ops for a stable URL.
- **Long-lived VM**: Lower repeat build cost, but another host to patch and wire into Actions.
- **Prebuilt Cal Docker image**: Faster cold start, but image build/publish pipeline and drift from fork `main`.

## Consequences

- First self-hosted runs are long (Yarn install + optional `next build`); a warm `.next` cache for the same Cal commit SHA lets the harness skip rebuild when `harness-build.json` matches `HEAD`.
- Requires Docker on the runner (default on `ubuntu-24.04`).
- Cal checkout tracks workflow env `CAL_REF` (`main` today); bump it in `e2e.yml` when tests need a different fork revision.
- Teams that want self-hosted on every PR must leave `CAL_E2E_BASE_URL` unset; setting the secret selects the external path exclusively.
- [ADR 0003](0003-ci-secret-gating.md) external path is unchanged when the secret is present.
