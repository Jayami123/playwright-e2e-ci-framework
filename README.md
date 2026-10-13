# playwright-e2e-ci-framework

[![P1 E2E](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/p1-e2e.yml/badge.svg?branch=main)](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/p1-e2e.yml)
[![CodeQL](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Portfolio **P1 Web E2E & CI**. Playwright + TypeScript black-box tests against product forks. This repo does not modify product source.

Depends on [qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `#v0.2.7`.

## Scope

**Phase 2e (2026-10-13):** Cal FW, timezone/DST, and 2FA (table below); Documenso auth, 2FA, passkeys, signing framework cases, and rate limits — `P1-DOC-AUTH-000`, `P1-DOC-2FA-001`–`009`, `P1-DOC-PK-001`–`006`, `P1-DOC-FW-001`–`011`, `P1-DOC-RL-001`. PR CI runs Documenso on Chromium (`documenso-chromium`); nightly Firefox covers `P1-DOC-FW-001`–`003`. Self-hosted job: `e2e / documenso-self-hosted` ([ADR 0011](docs/adr/0011-documenso-ci.md)).

Four Documenso cases use **`test.fail`** for known product bugs (**confirmed 2026-10-13** on [CI run 38392549848](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38392549848)): 2FA-004 wrong TOTP HTTP 500; 2FA-006 backup reuse; 2FA-007 TOTP replay; 2FA-009 disable-2FA HTTP 500. Living list: [docs/observations/documenso-2fa-known-issues.md](docs/observations/documenso-2fa-known-issues.md).

Cal still has four **`test.fail`** cases (DST-002, DST-003, TZ-003 Kathmandu, 2FA-002 TOTP replay); see [docs/observations/cal-tz-dst-known-issues.md](docs/observations/cal-tz-dst-known-issues.md) and [docs/observations/cal-2fa-known-issues.md](docs/observations/cal-2fa-known-issues.md).

**Phase 2f (2026-10-13):** Twenty smoke wiring (`npm run test:twenty`, `@twenty-smoke`); timezone cases P1-TW-TZ-001..003 are planned next. Twenty is **not in CI yet** (known gap). Medusa Admin is not wired here yet; visual, axe, Slack, and GitHub Pages are later.

## Prerequisites

- Node.js 22 (`nvm use` reads `.nvmrc`)
- npm 10.9.3 (`packageManager` in `package.json`)
- Docker Desktop (harness starts Postgres for Cal)
- A local Cal.diy fork under `PRODUCTS_ROOT` (default `../products`)
- Copy `.env.example` to `.env` and set `CAL_E2E_PASSWORD` (cal.diy seed: password equals username)

## Folder structure

```
src/core/                     product-agnostic config, BasePage, console guard, Intl TZ helpers
src/products/cal/             Cal env, routes, test ids, auth, db, oracle, app shell, pages, fixtures
src/products/documenso/       Documenso env, auth API, DB, pages, fixtures
src/products/twenty/          Twenty env, login/home pages
tests/setup/cal.setup.ts      API login writes .auth/cal-pro.json and .auth/cal-trial.json
tests/setup/twenty.setup.ts   UI login writes .auth/twenty-jane.json every run
tests/twenty/smoke/           @twenty-smoke home spec (no P1-TW-TZ IDs yet)
tests/cal/journeys/           FW-001..004
tests/cal/auth/               2FA-001..003
tests/cal/tz-i18n/            TZ-001..004, DST-001..003
tests/documenso/              AUTH, 2FA, passkey, signing FW, rate-limit specs
tests/unit/                   Intl/timezone helper unit project (no cal-setup)
global-setup/                 harness up + health + optional dev warmup
.github/workflows/            lint, typecheck, secret-gated live shards
docs/adr/                     architecture decisions
```

## Environment variables

| Variable                   | Required | Description                                                  |
| -------------------------- | -------- | ------------------------------------------------------------ |
| `CAL_E2E_BASE_URL`         | one of   | Preferred origin. Used as the single base URL when set.      |
| `CAL_BASE_URL`             | one of   | Fallback origin when `CAL_E2E_BASE_URL` is unset.            |
| `CAL_E2E_EMAIL`            | yes      | Seed user email.                                             |
| `CAL_E2E_PASSWORD`         | yes      | Seed user password. Never committed.                         |
| `PRODUCTS_ROOT`            | no       | Path to product forks. Default `../products`.                |
| `CAL_WEB_MODE`             | no       | `prod` (default) or `dev`.                                   |
| `CAL_E2E`                  | no       | Set to `0` to skip live health checks.                       |
| `CAL_WARMUP_EVENT_TYPE_ID` | no       | Editor route to warm when `CAL_WEB_MODE=dev`.                |
| `P1_SEED`                  | no       | Faker seed, applied once per worker and logged.              |
| `P1_RUN_ID`                | no       | Prefix fragment for generated event-type titles.             |
| `PW_WORKERS`               | no       | Playwright workers. Default `1`.                             |
| `P1_CONSOLE_ALLOWLIST`     | no       | Extra `console.error` substrings to allow (comma-separated). |

`loadConfig()` fails fast and lists every missing required variable in one error. Page objects navigate with relative paths against Playwright `baseURL`.

## Install and run

```powershell
copy .env.example .env
# set CAL_E2E_EMAIL and CAL_E2E_PASSWORD
npm ci
npx playwright install chromium
```

Start Cal (harness `up()` starts Postgres and the web app; default is `next start` after `next build`. `CAL_WEB_MODE=dev` uses webpack on Windows):

```powershell
cd ..\qa-portfolio-harness
node scripts/up.mjs cal
```

Then from this repo:

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run test:cal
npm run test:cal:matrix
npm run test:smoke
npm run report
```

`npm run test:cal` `globalSetup` calls `getAdapter('cal').up()` then waits until `GET /api/auth/csrf` returns 200.

### Run Twenty locally

Twenty needs the [twenty-CRM](https://github.com/twentyhq/twenty) fork under `PRODUCTS_ROOT` (default `../products/twenty-CRM`). Start the stack through the harness only (do not run fork `docker compose` by hand):

```powershell
$env:PRODUCTS_ROOT = "D:\Jayami\Portfolio\products"
node node_modules/qa-portfolio-harness/scripts/up.mjs twenty
npm run test:twenty
```

`globalSetup` waits on `GET /healthz` (HTTP 200), calls `getAdapter('twenty').up()` when needed, then `seed()`. `twenty-setup` UI-logs in as Jane and writes `.auth/twenty-jane.json` on every run ([ADR 0012](docs/adr/0012-twenty-ui-storage-state.md)).

If `node node_modules/qa-portfolio-harness/scripts/smoke.mjs twenty` or `npm run test:twenty` prints `dist/ is missing. Run npm run build first`, npm skipped harness `prepare` (`allowScripts`). Build the harness package once:

```powershell
cd node_modules/qa-portfolio-harness
npx tsc
```

CI `npm ci` still runs `prepare`.

## Debug

| Command                            | What it does                              |
| ---------------------------------- | ----------------------------------------- |
| `npm run test:cal:headed`          | Chromium headed                           |
| `npm run test:cal:firefox`         | Firefox `@tz` and `@2fa` only             |
| `npm run test:cal:matrix`          | Chromium + Firefox matrix (CI nightly)    |
| `npm run test:cal:debug`           | Playwright Inspector                      |
| `npm run test:twenty`              | Twenty Chromium smoke (`twenty-chromium`) |
| `npx playwright test --ui`         | UI mode                                   |
| `npx playwright show-trace <path>` | Trace viewer (`trace: retain-on-failure`) |

## Implemented P1 cases

| ID             | Title                                                        |
| -------------- | ------------------------------------------------------------ |
| P1-CAL-FW-001  | API login produces a reusable storageState                   |
| P1-CAL-FW-002  | wrong password does not create a session                     |
| P1-CAL-FW-003  | creates and deletes an isolated event type                   |
| P1-CAL-FW-004  | booker and bookings pages emit no page errors                |
| P1-CAL-TZ-001  | Slot labels follow the browser timezone                      |
| P1-CAL-TZ-002  | Booked instant equals the clicked slot                       |
| P1-CAL-TZ-003  | Half-hour and 45-minute offsets (Kathmandu, Adelaide)        |
| P1-CAL-TZ-004  | Booker timezone switcher overrides the browser TZ            |
| P1-CAL-DST-001 | Spring-forward day shows no phantom 02:00–02:59 slot         |
| P1-CAL-DST-002 | Fall-back 01:30 EDT booking vs DB/UI (`test.fail` known 409) |
| P1-CAL-DST-003 | Cross-hemisphere viewer labels on EU spring-forward Sunday   |
| P1-CAL-2FA-001 | TOTP login with an otplib-generated code                     |
| P1-CAL-2FA-002 | Same TOTP code replayed in a second context (`test.fail`)    |
| P1-CAL-2FA-003 | Backup code works once                                       |

## CI

[`p1-e2e.yml`](.github/workflows/p1-e2e.yml) runs on pull requests, pushes to `main`, daily schedule `0 18 * * *` (18:00 UTC), and `workflow_dispatch` (optional inputs `browser_matrix`, `documenso_probe_only`). It calls reusable [`e2e.yml`](.github/workflows/e2e.yml), which checks out [Jayami123/cal](https://github.com/Jayami123/cal) at `CAL_REF` and [Jayami123/documenso](https://github.com/Jayami123/documenso) at `DOCUMENSO_REF` (pinned commit SHA in workflow env, not `main`). Product build caches are saved only on pushes to `main`. PR path filters skip `cal-self-hosted` or `documenso-self-hosted` when unrelated paths change. Concurrency group includes `event_name` so scheduled runs do not cancel PRs; PRs still cancel in-progress. Permissions: `contents: read`. Matrix policy: [ADR 0008](docs/adr/0008-cal-browser-matrix.md). Documenso self-hosted policy: [ADR 0011](docs/adr/0011-documenso-ci.md). On schedule or `browser_matrix` dispatch only, job `nightly-alert` opens or comments on a `nightly-failure` issue when the matrix fails and closes it after the next green run ([ADR 0009](docs/adr/0009-nightly-failure-alerting-via-github-issues.md)).

**Always:** `lint` (actionlint, ESLint, Prettier, and `npm run test:unit`) and `typecheck (always)`.

**E2E path** (one per run — see [ADR 0005](docs/adr/0005-ci-self-hosted-cal.md)). Fork and Dependabot PRs without the secret run self-hosted E2E:

| Secret `CAL_E2E_BASE_URL` | What runs                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set                       | `cal-chromium` shards 1–4 against that URL, then merge Playwright HTML report (job names say they skip without `CAL_E2E_BASE_URL`).                                                                                                                                                                                                                                    |
| Unset                     | `cal-self-hosted`: checkout this repo to `p1/` and [Jayami123/cal](https://github.com/Jayami123/cal) to `products/cal`, harness `up()` via `npm run test:cal` against `http://127.0.0.1:3000` (seed passwords only on the E2E step). Schedule and `workflow_dispatch` with `browser_matrix: true` also run `test:cal:firefox` sequentially with per-browser artifacts. |

**Documenso (always self-hosted, not gated on `CAL_E2E_BASE_URL`):** job `documenso-self-hosted` checks out [Jayami123/documenso](https://github.com/Jayami123/documenso) to `products/documenso`, maps `127.0.0.1 p1.lvh.me`, runs harness `up()` under Node 24, then `npm run test:documenso` on Node 22 (`documenso-chromium`, Chrome channel). `workflow_dispatch` with `documenso_probe_only: true` runs harness `up()`, secure-context preflight, and `playwright --list` only. Nightly / `browser_matrix` also runs `test:documenso:firefox` (`P1-DOC-FW-001..003` only). After the first green PR run, add required check `e2e / documenso-self-hosted` on `main`.

**Browser coverage (`@tz` / `@2fa` matrix cases only)**

**Local hard gate (Windows):** Chromium + Firefox. `npm run test:cal` then `npm run test:cal:firefox` ([ADR 0008](docs/adr/0008-cal-browser-matrix.md)). Safari/WebKit is a known gap.

| Engine   | Local gate (Windows)           | Nightly / dispatch (Ubuntu)  |
| -------- | ------------------------------ | ---------------------------- |
| Chromium | `test:cal`                     | Same as PR on matrix nights  |
| Firefox  | `test:cal:firefox` (with gate) | `test:cal:firefox` on matrix |

Self-hosted CI sets `PRODUCTS_ROOT` to `products/` so P1 and Cal are siblings (Next.js does not pick P1's lockfile as the Cal workspace). The harness generates Cal tRPC types, runs `next build` + `next start`, and skips rebuild when `apps/web/.next/harness-build.json` `gitSha` matches Cal `HEAD`. The job caches Cal Yarn and that Next output, uploads HTML report (`playwright-report`), `playwright-test-results` on every completed run, and a redacted `cal-server-log`. CI reporters are blob, github, list, JUnit (`test-results/junit.xml`), and JSON (`test-results/results.json`). A job-summary step (`if: ${{ !cancelled() }}`) writes passed / failed / flaky / expected-failure totals and lists known product bugs from that JSON.

**Typical durations** (first run, cold caches; [run 37787015928](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/37787015928) `cal-self-hosted`): job 7m 9s; Cal yarn install 2m52s; DB migrate+seed 32s; tRPC types (turbo) 40s; next build ~83s (compiled 43s, TypeScript 36.3s, 88/88 static pages); 5 tests ~10s. Warm ([run 37792386085](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/37792386085) attempt 2, `cal-self-hosted`, `.next` cache hit): job 5m 23s; Cal yarn install 2m49s (Yarn cache hit); Postgres pull+start ~21s; DB migrate+seed 49s; tRPC types and next build skipped (`.next` cache hit, `harness-build.json` matched Cal HEAD); next start ready ~8s; 5 tests ~15s.

**Download the HTML report:** open the workflow run on GitHub → **Artifacts** → `playwright-report` → unzip → open `index.html`.

External-path blob shards retain 3 days; merged HTML and self-hosted artifacts retain 14 days.

**Governance and supply chain:** [`pr-title.yml`](.github/workflows/pr-title.yml) enforces Conventional Commits on PR titles (and on single-commit PR bodies). [`codeql.yml`](.github/workflows/codeql.yml) scans TypeScript and workflow Actions weekly and on PRs. [Dependabot](.github/dependabot.yml) opens grouped npm and GitHub Actions update PRs (no secrets on those PRs, so CI uses the self-hosted Cal path per [ADR 0005](docs/adr/0005-ci-self-hosted-cal.md)). Third-party and first-party `uses:` refs are pinned to full commit SHAs; Dependabot bumps them on the weekly schedule.

**Security:** see [SECURITY.md](SECURITY.md). **License:** [MIT](LICENSE).

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch, PR, and commit rules.
