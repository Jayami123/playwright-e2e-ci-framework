# playwright-e2e-ci-framework

Portfolio **P1 Web E2E & CI**. Playwright + TypeScript black-box tests against product forks. This repo does not modify product source.

Depends on [qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `#v0.2.0`.

## Scope

Cal.com / Cal.diy only today: auth `storageState`, four FW tests, Chromium, GitHub Actions with secret-gated live shards.

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
npm i
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

| ID            | Title                                           |
| ------------- | ----------------------------------------------- |
| P1-CAL-FW-001 | API login produces reusable storageState        |
| P1-CAL-FW-002 | Wrong password does not produce a session       |
| P1-CAL-FW-003 | Faker-isolated event type create/delete via POM |
| P1-CAL-FW-004 | Console/page-error guard                        |

## CI

`.github/workflows/p1-e2e.yml` runs on pull requests, pushes to `main`, and `workflow_dispatch`. It calls reusable `e2e.yml`.

- Lint and typecheck always run.
- Live `cal-chromium` shards 1–4 run only when secret `CAL_E2E_BASE_URL` is present (checked via env, not job `if: secrets.*`).
- CI reporters: blob + github + list. Blob artifacts retain 3 days.
- Without the live URL, the skip job writes the reason to `$GITHUB_STEP_SUMMARY`.
- Product services are not started in Actions yet.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch, PR, and commit rules.
