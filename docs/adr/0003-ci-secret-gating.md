# 0003. Gate live E2E on an injected secret, not job-level secrets.*

- Status: Accepted
- Date: 2026-10-08

## Context

GitHub-hosted runners cannot see local Docker / `yarn dev`. Job `if: ${{ secrets.X != '' }}` always sees an empty secret, so live E2E never started and skip always ran.

## Decision

`p1-e2e.yml` is the trigger (pull request, push to `main`, `workflow_dispatch`) and calls reusable `e2e.yml`. The reusable workflow injects `CAL_E2E_BASE_URL` into env and writes `has_live_url` to job outputs.

Live Chromium shards run only when that output is true. Otherwise lint and typecheck still run, and the skip job writes the reason to `$GITHUB_STEP_SUMMARY`. That is structural green, not a faked E2E pass.

Shard matrix is `1..4` × Chromium / Cal only. Blob reports retain 3 days. Permissions stay `contents: read`.

## Consequences

- CI is green without a live Cal URL.
- Enabling Actions E2E against an external deployment is adding secrets (`CAL_E2E_BASE_URL`, `CAL_E2E_EMAIL`, `CAL_E2E_PASSWORD`) and re-running, not changing job `if:` expressions.
- When the secret is unset, [ADR 0005](0005-ci-self-hosted-cal.md) runs self-hosted Cal E2E instead of a skip-only job.
