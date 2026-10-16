# playwright-e2e-ci-framework

[![P1 E2E](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/p1-e2e.yml/badge.svg?branch=main)](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/p1-e2e.yml)
[![CodeQL](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Portfolio **P1 Web E2E & CI**. Playwright + TypeScript black-box tests against product forks. This repo does not modify product source.

Depends on [qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `#v0.2.10`.

## Scope

**Phase 2e (2026-10-13):** Cal FW, timezone/DST, and 2FA (table below); Documenso auth, 2FA, passkeys, signing framework cases, and rate limits — `P1-DOC-AUTH-000`, `P1-DOC-2FA-001`–`009`, `P1-DOC-PK-001`–`006`, `P1-DOC-FW-001`–`011`, `P1-DOC-RL-001`. PR CI runs Documenso on Chromium (`documenso-chromium`); nightly Firefox covers `P1-DOC-FW-001`–`003`. Self-hosted job: `e2e / documenso-self-hosted` ([ADR 0011](docs/adr/0011-documenso-ci.md)).

Four Documenso cases use **`test.fail`** for known product bugs (**confirmed 2026-10-13** on [CI run 38392549848](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38392549848)): 2FA-004 wrong TOTP HTTP 500; 2FA-006 backup reuse; 2FA-007 TOTP replay; 2FA-009 disable-2FA HTTP 500. Living list: [docs/observations/documenso-2fa-known-issues.md](docs/observations/documenso-2fa-known-issues.md).

Cal still has four **`test.fail`** cases (DST-002, DST-003, TZ-003 Kathmandu, 2FA-002 TOTP replay); see [docs/observations/cal-tz-dst-known-issues.md](docs/observations/cal-tz-dst-known-issues.md) and [docs/observations/cal-2fa-known-issues.md](docs/observations/cal-2fa-known-issues.md).

**Phase 2f (2026-10-15):** Twenty smoke (`@twenty-smoke`) plus timezone UI cases in the table below (`@twenty-tz`, serial Jane TZ). PR CI job `e2e / twenty-chromium` ([ADR 0016](docs/adr/0016-twenty-ci.md)). Typical Twenty CI duration: **TBD** (first green job summary). After **two** green `e2e / twenty-chromium` runs on `main`, add that check as required in GitHub settings (not automated in this repo). Medusa Admin is wired in Phase 4 batch 1 (below).

**Phase 4 batch 1 (2026-10-16):** Medusa admin SPA and Admin API: `P1-MED-FW-001..005` plus extras `X01..X05` (`npm run test:medusa`, 11 tests including setup; X04 and X05 are expected failures). PR CI job `e2e / medusa-self-hosted` ([ADR 0018](docs/adr/0018-medusa-ci.md)); it needs `qa-portfolio-harness` `#v0.2.11` since batch 2. Typical Medusa CI duration: **TBD** (first green job summary). Known product bugs: [medusa-known-issues.md](docs/observations/medusa-known-issues.md).

**Phase 4 batch 2 (2026-10-17):** Medusa German order page layout (`P1-MED-I18N-001`), long product title truncation (`P1-MED-I18N-002`), orders list baselines at three viewports (`P1-MED-VIS-001`), products API 500 error state (`P1-MED-VIS-002`), slow API skeleton (`P1-MED-VIS-003`) and extras `X06..X14`. They run only in the Docker `visual-*` projects, so `npm run test:medusa` is still 11 tests. The Medusa visual suite joins the `e2e / visual` gate through `e2e / medusa-self-hosted` ([ADR 0018 amendment](docs/adr/0018-medusa-ci.md)). It needs the production admin bundle from harness `v0.2.11`: the development bundle showed stack traces on the error state.

| Case                                             | Status                                                | ADR                                               |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| P1-TW-TZ-001 DATE no-shift Honolulu / Kiritimati | CI test (`@twenty-tz`)                                | [0014](docs/adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-002 DATE_TIME Colombo + UTC             | CI test                                               | [0014](docs/adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-003 Berlin calendar DST days            | CI test                                               | [0015](docs/adr/0015-twenty-dst-relative-date.md) |
| P1-TW-TZ-X01 Honolulu DATE_TIME                  | CI test                                               | [0014](docs/adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-X02 Settings TZ round-trip (last)       | CI test                                               | [0014](docs/adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-X03 relative today Kiritimati           | CI test                                               | [0015](docs/adr/0015-twenty-dst-relative-date.md) |
| P1-TW-TZ-X05 fall-back 02:30 labels              | CI test                                               | [0015](docs/adr/0015-twenty-dst-relative-date.md) |
| P1-TW-TZ-X04 CSV vs fixture UTC                  | Observation (assert CSV = stored ISO, no `test.fail`) | [0015](docs/adr/0015-twenty-dst-relative-date.md) |
| OBS-001 bare date on DATE_TIME                   | Observation (not automated)                           | [0014](docs/adr/0014-twenty-timezone-testing.md)  |

**Phase 3 (2026-10-16):** visual baselines at three viewports (393, 820, 1440), German layout and light and dark axe scans for Cal, Documenso and Twenty, and Arabic RTL layout for Cal only (Twenty RTL is carried). Baselines are Linux-only and come from the pinned Playwright Docker image ([ADR 0017](docs/adr/0017-visual-baselines.md)); locally run `npm run visual:test -- --product=<cal|documenso|twenty>`. CI runs a `visual:test` step in each product job and a `visual` aggregator job (check `e2e / visual`); the baseline update workflow and the published report are described under [CI](#ci). Public report: <https://jayami123.github.io/playwright-e2e-ci-framework/>.

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
src/products/medusa/          Medusa env, Admin API client, store order helper, fixtures, sweep, pages
tests/setup/cal.setup.ts      API login writes .auth/cal-pro.json and .auth/cal-trial.json
tests/setup/twenty.setup.ts   UI login writes .auth/twenty-jane.json every run
tests/setup/medusa.setup.ts   API login writes .auth/medusa-admin.json every run
tests/medusa/journeys/        FW-001..005
tests/medusa/api/             X01..X03 contract, X04..X05 races
tests/medusa/i18n/            @i18n German order page (Docker visual projects)
tests/medusa/visual/          @visual long title, orders list baselines, network states
tests/medusa/a11y/            @a11y X06, X07, X08, X13 (expected failures)
tests/twenty/smoke/           @twenty-smoke home spec
tests/twenty/tz/              @twenty-tz P1-TW-TZ-001, 002, 003, X01, X02, X03, X04, X05
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

### Run Medusa locally

Medusa needs the [medusa-dtc-starter](https://github.com/Jayami123/medusa-dtc-starter) fork under `PRODUCTS_ROOT` (default `../products/medusa-dtc-starter`) and harness `v0.2.11` or newer (the admin UI session cookie does not work over http before `v0.2.10`, and the admin bundle is a development build before `v0.2.11`). Start it through the harness, then set the same admin values in P1's `.env` (`MEDUSA_ADMIN_EMAIL`, `MEDUSA_ADMIN_PASSWORD`; required, no default):

```powershell
$env:PRODUCTS_ROOT = "D:\Jayami\Portfolio\products"
$env:MEDUSA_SKIP_STOREFRONT = "1"
node node_modules/qa-portfolio-harness/scripts/up.mjs medusa
npm run test:medusa
```

`globalSetup` skips `up()` when `GET /health` is 200, then runs the harness `seed()` and a local QA sweep. `medusa-setup` logs in through the API, creates the session and writes `.auth/medusa-admin.json` on every run. Orders cannot be deleted, so each test archives its order; check leftovers with `npx tsx scripts/count-medusa-qa-leaks.mts`.

The batch 2 specs need Docker (baselines are Linux-only, [ADR 0017](docs/adr/0017-visual-baselines.md)) with Medusa running on `http://127.0.0.1:9000`:

```powershell
npm run visual:test -- --product=medusa
npm run visual:update -- --product=medusa
```

## Debug

| Command                            | What it does                              |
| ---------------------------------- | ----------------------------------------- |
| `npm run test:cal:headed`          | Chromium headed                           |
| `npm run test:cal:firefox`         | Firefox `@tz` and `@2fa` only             |
| `npm run test:cal:matrix`          | Chromium + Firefox matrix (CI nightly)    |
| `npm run test:cal:debug`           | Playwright Inspector                      |
| `npm run test:twenty`              | Twenty Chromium smoke (`twenty-chromium`) |
| `npm run test:medusa`              | Medusa Chromium suite (`medusa-chromium`) |
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

### Phase 3 visual, i18n and a11y cases

Status: **pass** = passes; **expected fail** = `test.fail` for a known product bug (see the bug table).

| ID                                                | Title                                                           | Status        |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| P1-CAL-VIS-001, 002, 003                          | Booker baseline, long name and title, dark theme and axe        | pass          |
| P1-CAL-VIS-004                                    | Slots HTTP 500 shows a user-facing error                        | expected fail |
| P1-CAL-I18N-001, 002, 003                         | German and Arabic booker, German labels do not clip             | pass          |
| P1-CAL-A11Y-004, 005                              | Forced colors, reduced motion                                   | pass          |
| P1-CAL-A11Y-001, 002, 003, 006                    | Keyboard booking, focus, 200% zoom, accessible names            | expected fail |
| P1-DOC-VIS-001, 002, 003, 005                     | Signing baseline, German, long text, PDF 500                    | pass          |
| P1-DOC-VIS-004                                    | `/documents` colour contrast, light and dark                    | pass          |
| P1-DOC-VIS-X02, X05, X06, X07                     | PDF abort, keyboard, forced colors, full WCAG                   | pass          |
| P1-DOC-VIS-X01, X03, X04                          | Long-title overflow, PDF stall, 200% zoom                       | expected fail |
| P1-TW-VIS-001, 003, X03, X04, X06                 | Contrast, record baseline, error focus, German settings, WCAG   | pass          |
| P1-TW-I18N-002                                    | pseudo-en is not in the picker; no plain-English UI strings     | pass          |
| P1-TW-VIS-002, 004, X01, X02, X05, P1-TW-I18N-001 | Company chip, error empty state, table semantics, German header | expected fail |

### Phase 4 batch 1: Medusa

| Case                                                    | Status        |
| ------------------------------------------------------- | ------------- |
| P1-MED-FW-001 Admin API login, session storageState     | pass          |
| P1-MED-FW-002 Create a product with variants via the UI | pass          |
| P1-MED-FW-003 Order detail totals (API vs UI)           | pass          |
| P1-MED-FW-004 Cancel an order from the UI               | pass          |
| P1-MED-FW-005 Invalid login shows an error, no session  | pass          |
| P1-MED-FW-X01 Admin and store credentials do not cross  | pass          |
| P1-MED-FW-X02 Error codes without stack traces          | pass          |
| P1-MED-FW-X03 Product creation boundaries               | pass          |
| P1-MED-FW-X04 Concurrent double cancel (MED-F-02)       | expected fail |
| P1-MED-FW-X05 Concurrent cancel and fulfil (MED-F-01)   | expected fail |

### Phase 4 batch 2: Medusa (Docker `visual-*` projects)

| Case                                                          | Projects                | Status        |
| ------------------------------------------------------------- | ----------------------- | ------------- |
| P1-MED-I18N-001 German Admin order page layout                | desktop, tablet         | pass          |
| P1-MED-I18N-002 Long product title truncation in list         | desktop, tablet         | pass          |
| P1-MED-VIS-001 Orders list baseline                           | mobile, tablet, desktop | pass          |
| P1-MED-VIS-002 Products API 500 shows an error state          | desktop                 | pass          |
| P1-MED-VIS-003 Slow API shows a skeleton, not stale data      | desktop                 | pass          |
| P1-MED-FW-X09 Error codes map to visible states               | desktop                 | pass          |
| P1-MED-FW-X10 Response ordering on search                     | desktop                 | pass          |
| P1-MED-FW-X11 Unknown order id shows not-found, no stale data | desktop                 | pass          |
| P1-MED-FW-X12 Back after a 500 recovers                       | desktop                 | pass          |
| P1-MED-FW-X14 Title boundaries 254/256/multi-byte             | desktop, tablet         | pass          |
| P1-MED-FW-X06 Create Product dialog exposed to AT (MED-F-03)  | desktop                 | expected fail |
| P1-MED-FW-X07 Order header menu name (MED-F-05)               | desktop                 | expected fail |
| P1-MED-FW-X08 Login error announced (MED-F-06)                | desktop                 | expected fail |
| P1-MED-FW-X13 Order detail reflows at 393 px (MED-F-07)       | mobile                  | expected fail |

`npm run visual:test -- --product=medusa` runs 19 tests and skips 23 (viewport rules): 15 pass and 4 are the expected failures. Details and evidence: [medusa-known-issues.md](docs/observations/medusa-known-issues.md).

### Phase 3 known product bugs

Each run attaches a screenshot and JSON per bug to the Playwright report; details are in [documenso-signing-known-issues.md](docs/observations/documenso-signing-known-issues.md), [twenty-login-a11y.md](docs/observations/twenty-login-a11y.md) and [cal-visual-a11y.md](docs/observations/cal-visual-a11y.md).

| ID                                          | Product   | Finding                                                                                                                     | Test                                             |
| ------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| CAL-VIS-004                                 | Cal       | Slots 500 shows no error                                                                                                    | `slots-error.visual.spec.ts`                     |
| CAL-A11Y-001, 002, 003, 006                 | Cal       | Focus loss, timezone focus, weekday overlap at 200%, `$` names                                                              | `tests/cal/a11y/*`                               |
| CAL-A11Y-SMOKE-overlay-switch               | Cal       | Overlay switch has no accessible name                                                                                       | `smoke.a11y.spec.ts`                             |
| DOC-VIS-004-F1..F3                          | Documenso | `/documents` contrast (WCAG 1.4.3)                                                                                          | `contrast.a11y.spec.ts`                          |
| DOC-VIS-X07-F4..F10                         | Documenso | Unnamed buttons, link and inputs; nested interactive                                                                        | `contrast.a11y.spec.ts`                          |
| DOC-VIS-X01, X03, X04                       | Documenso | Title overflow at md+, endless PDF spinner, Complete clipped at 200%                                                        | `long-text`, `pdf-failure`, `signing.a11y` specs |
| TW-VIS-001-F1..F6                           | Twenty    | People and person contrast (WCAG 1.4.3)                                                                                     | `contrast.a11y.spec.ts`                          |
| TW-VIS-X06-F7..F14                          | Twenty    | Unnamed commands and checkboxes, nested controls, ARIA on role=none                                                         | `contrast.a11y.spec.ts`                          |
| TW-VIS-002, 004, X01, X02, X05, TW-I18N-001 | Twenty    | Chip without ellipsis, misleading empty state, discarded data, duplicate toasts, no column headers, truncated German header | `visual`, `a11y`, `i18n` specs                   |

### Phase 3 done and carried to Phase 4

| Item                                                                                 | Status                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Cal VIS, I18N, A11Y (PR #34)                                                         | Done                                            |
| Documenso VIS-001..005 and X01..X07; Twenty VIS-001..004, I18N-001..002 and X01..X06 | Done                                            |
| CI visual job, baseline update workflow, GitHub Pages, known-bug report evidence     | Done                                            |
| Medusa FW-001..005 and X01..X05 (Phase 4 batch 1)                                    | Done                                            |
| Medusa visual, i18n and a11y (VIS-001..003, I18N-001..002, X06..X14)                 | Done (Phase 4 batch 2)                          |
| TW-VIS-X07 Arabic RTL People layout                                                  | Carried (dropped 2026-10-16: not probed)        |
| `e2e / visual` as a required check                                                   | Carried (set it after two green runs on `main`) |

## CI

[`p1-e2e.yml`](.github/workflows/p1-e2e.yml) runs on pull requests, pushes to `main`, daily schedule `0 18 * * *` (18:00 UTC), and `workflow_dispatch` (optional inputs `browser_matrix`, `documenso_probe_only`). It calls reusable [`e2e.yml`](.github/workflows/e2e.yml), which checks out [Jayami123/cal](https://github.com/Jayami123/cal) at `CAL_REF` and [Jayami123/documenso](https://github.com/Jayami123/documenso) at `DOCUMENSO_REF` (pinned commit SHA in workflow env, not `main`). Product build caches are saved only on pushes to `main`. PR path filters skip `cal-self-hosted` or `documenso-self-hosted` when unrelated paths change. Concurrency group includes `event_name` so scheduled runs do not cancel PRs; PRs still cancel in-progress. Permissions: `contents: read`. Matrix policy: [ADR 0008](docs/adr/0008-cal-browser-matrix.md). Documenso self-hosted policy: [ADR 0011](docs/adr/0011-documenso-ci.md). On schedule or `browser_matrix` dispatch only, job `nightly-alert` opens or comments on a `nightly-failure` issue when the matrix fails and closes it after the next green run ([ADR 0009](docs/adr/0009-nightly-failure-alerting-via-github-issues.md)).

**Always:** `lint` (actionlint, ESLint, Prettier, and `npm run test:unit`) and `typecheck (always)`.

**E2E path** (one per run — see [ADR 0005](docs/adr/0005-ci-self-hosted-cal.md)). Fork and Dependabot PRs without the secret run self-hosted E2E:

| Secret `CAL_E2E_BASE_URL` | What runs                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set                       | `cal-chromium` shards 1–4 against that URL, then merge Playwright HTML report (job names say they skip without `CAL_E2E_BASE_URL`).                                                                                                                                                                                                                                    |
| Unset                     | `cal-self-hosted`: checkout this repo to `p1/` and [Jayami123/cal](https://github.com/Jayami123/cal) to `products/cal`, harness `up()` via `npm run test:cal` against `http://127.0.0.1:3000` (seed passwords only on the E2E step). Schedule and `workflow_dispatch` with `browser_matrix: true` also run `test:cal:firefox` sequentially with per-browser artifacts. |

**Documenso (always self-hosted, not gated on `CAL_E2E_BASE_URL`):** job `documenso-self-hosted` checks out [Jayami123/documenso](https://github.com/Jayami123/documenso) to `products/documenso`, maps `127.0.0.1 p1.lvh.me`, runs harness `up()` under Node 24, then `npm run test:documenso` on Node 22 (`documenso-chromium`, Chrome channel). `workflow_dispatch` with `documenso_probe_only: true` runs harness `up()`, secure-context preflight, and `playwright --list` only. Nightly / `browser_matrix` also runs `test:documenso:firefox` (`P1-DOC-FW-001..003` only). After the first green PR run, add required check `e2e / documenso-self-hosted` on `main`.

**Visual job (Phase 3):** each product job runs `npm run visual:test -- --product=<p>` in the pinned Playwright Docker image with `continue-on-error`, then exports `visual` and `visual_requested`. The `visual` aggregator job (check `e2e / visual`) fails when a product job ran and its requested visual step failed, was skipped, or never started, so a failed Documenso bypass start cannot turn it green. A product job that was skipped as a whole (path filter, live-URL path, `visual_product` filter) is not gated. Failures upload `visual-failure-<product>` (report plus diff, actual and expected PNGs, 14 days).

**Update baselines:** Actions → **Update visual baselines** → _Use workflow from_ your feature branch → product. It never runs on `main` and never commits. Download `visual-baselines-<product>`, unzip at the repo root, read `CHANGED.txt`, compare every changed PNG with `git show HEAD:<path>`, accept only changes the PR explains, run `npm run visual:test -- --product=<p>` twice, then commit only the reviewed PNGs (`test(visual): update <product> baselines for <reason>`).

**GitHub Pages:** pushes to `main` merge the blob reports, strip traces and videos, fail on any secret-pattern hit, and deploy to <https://jayami123.github.io/playwright-e2e-ci-framework/>. A repo admin must set Settings → Pages → Source **GitHub Actions** once, before the first merge; otherwise `pages-deploy` fails on every push. Traces stay in private Actions artifacts.

**Browser installs** retry three times (and apt downloads five times) because the Chrome `.deb` comes from `dl.google.com` and is not covered by the browser cache.

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
