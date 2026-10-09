# 0009. Nightly failure alerting via GitHub issues

- Status: Accepted
- Date: 2026-10-10

## Context

Phase 2c added a scheduled and `workflow_dispatch` browser matrix on [`p1-e2e.yml`](../../.github/workflows/p1-e2e.yml) ([ADR 0008](0008-cal-browser-matrix.md)). The Phase 2c plan deferred a Slack alert because there is no Slack workspace. Operators still need a signal when the matrix job goes red without watching Actions every day.

## Decision

- Add job `nightly-alert` on the **caller** workflow [`p1-e2e.yml`](../../.github/workflows/p1-e2e.yml), not inside reusable `e2e.yml`. It runs only on `schedule` or `workflow_dispatch` with `browser_matrix: true`, `needs: e2e`, and `if: always()`. It never runs on `pull_request` or push.
- Job `concurrency: nightly-alert` so two overlapping matrix runs cannot both create an issue at the same moment.
- Job permissions: `issues: write`, `contents: read`, `actions: read` (download matrix JSON artifacts). Workflow default stays `contents: read`.
- On **failure** of the `e2e` reusable job: ensure label `nightly-failure` exists (`gh label create ... || true`). If an open issue has that label, comment with the run URL and Chromium/Firefox summary text from [`scripts/write-ci-job-summary.mts`](../../scripts/write-ci-job-summary.mts) reading `results-chromium.json` / `results-firefox.json` from uploaded artifacts. If none exists, create an issue titled `Nightly E2E failed: <UTC date>`.
- On **success**: if an open `nightly-failure` issue exists, comment `Recovered in <run URL>` and close it. Otherwise no-op.
- Use `gh` with `GITHUB_TOKEN` only. No new third-party actions.

## Alternatives considered

- **Slack incoming webhook:** Deferred. Requires a workspace and a repository secret; can be added later without removing the issue flow.
- **Email / PagerDuty:** Extra accounts and secrets; disproportionate for a solo portfolio repo.

## Consequences

- Failures are visible in the repo issue list with a stable label; no external secret to rotate.
- `issues: write` on one job increases blast radius if that step were compromised; scope is limited to issues, not contents.
- Duplicate issues are unlikely while `concurrency: nightly-alert` holds; repeated failures append comments on the same open issue.
- Slack can replace or supplement this later with a webhook step in the same job.
