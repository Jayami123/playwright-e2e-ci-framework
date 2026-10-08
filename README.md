# playwright-e2e-ci-framework

Portfolio **P1 Web E2E & CI**. Playwright + TypeScript black-box tests against product forks. This repo does not modify product source.

Depends on [qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `#v0.2.0`.

## Scope

Cal.com / Cal.diy only today: auth `storageState`, four FW tests, Chromium, GitHub Actions (self-hosted Cal on PRs or secret-gated external URL).

Later suites (not in this repo yet): Documenso, Medusa, Twenty; TZ/DST, 2FA, WebKit/Firefox, visual, axe, Slack, GitHub Pages.

## Prerequisites

- Node.js 22 (`nvm use` reads `.nvmrc`)
- npm 10.9.3 (`packageManager` in `package.json`)
- Docker Desktop (harness starts Postgres for Cal)
- A local Cal.diy fork under `PRODUCTS_ROOT` (default `../products`)
- Copy `.env.example` to `.env` and set `CAL_E2E_PASSWORD` (cal.diy seed: password equals username)

## Folder structure

```
src/core/                     product-agnostic config, BasePage, console guard
src/products/cal/             Cal env, routes, test ids, auth, db, app shell, pages, fixtures
tests/setup/cal.setup.ts      API login writes .auth/cal-pro.json
tests/cal/journeys/           FW-001..004
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
npm run test:cal
npm run test:smoke
npm run report
```

`npm run test:cal` `globalSetup` calls `getAdapter('cal').up()` then waits until `GET /api/auth/csrf` returns 200.

## Debug

| Command                            | What it does                           |
| ---------------------------------- | -------------------------------------- |
| `npm run test:cal:headed`          | Chromium headed                        |
| `npm run test:cal:debug`           | Playwright Inspector                   |
| `npx playwright test --ui`         | UI mode                                |
| `npx playwright show-trace <path>` | Trace viewer (`trace: on-first-retry`) |

## FW tests

| ID            | Title                                         |
| ------------- | --------------------------------------------- |
| P1-CAL-FW-001 | API login produces a reusable storageState    |
| P1-CAL-FW-002 | wrong password does not create a session      |
| P1-CAL-FW-003 | creates and deletes an isolated event type    |
| P1-CAL-FW-004 | booker and bookings pages emit no page errors |

## CI

[`p1-e2e.yml`](.github/workflows/p1-e2e.yml) runs on pull requests, pushes to `main`, and `workflow_dispatch` (optional `cal_ref` input for the Cal fork pin). It calls reusable [`e2e.yml`](.github/workflows/e2e.yml). Concurrency cancels in-progress runs for PRs only. Permissions: `contents: read`.

**Always:** `lint` (actionlint on workflows, then ESLint + Prettier check) and `typecheck (always)`.

**E2E path** (one per run — see [ADR 0005](docs/adr/0005-ci-self-hosted-cal.md)). Fork and Dependabot PRs without the secret run self-hosted E2E:

| Secret `CAL_E2E_BASE_URL` | What runs                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set                       | `cal-chromium` shards 1–4 against that URL, then `merge Playwright HTML report`.                                                                                                                |
| Unset                     | `cal-self-hosted`: checkout [Jayami123/cal](https://github.com/Jayami123/cal), harness `up()` via `npm run test:cal` against `http://127.0.0.1:3000` (seed credentials from workflow env only). |

Self-hosted job caches Cal Yarn and Next build output, uploads HTML report (`playwright-report`), `playwright-test-results` on every completed run, and a redacted `cal-server-log`.

**Typical durations:** recorded here after the first green self-hosted run on this workflow (see the Actions run for your PR).

**Download the HTML report:** open the workflow run on GitHub → **Artifacts** → `playwright-report` → unzip → open `index.html`.

External-path blob shards retain 3 days; merged HTML and self-hosted artifacts retain 14 days.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch, PR, and commit rules.
