# playwright-e2e-ci-framework

Portfolio **P1 Web E2E & CI**. Playwright + TypeScript black-box tests against the four product forks. This repo does not modify product source.

Depends on [qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness) `#v0.2.0`.

## Phase 1 (this branch)

Cal.com / Cal.diy only: auth `storageState`, four FW tests, Chromium config, GitHub Actions structural check.

Branch: `feat/2026-10-08-phase1-cal-framework`.

## Install + run Cal locally

```powershell
cd D:\Jayami\Portfolio\p1-web-e2e-ci
copy .env.example .env
# set CAL_E2E_PASSWORD (cal.diy seed: password equals username)
npm i
npx playwright install chromium
```

Start Cal (harness `up()` starts Postgres and the web app; default is `next start` after `next build`. `CAL_WEB_MODE=dev` uses webpack on Windows):

```powershell
cd D:\Jayami\Portfolio\qa-portfolio-harness
node scripts/up.mjs cal
```

`npm run test:cal` globalSetup calls `getAdapter('cal').up()` then `waitHealthy()`.

Then:

```powershell
cd D:\Jayami\Portfolio\p1-web-e2e-ci
npm run test:cal
npm run report
```

## FW tests

| ID | Title |
|----|--------|
| P1-CAL-FW-001 | API login produces reusable storageState |
| P1-CAL-FW-002 | Wrong password does not produce a session |
| P1-CAL-FW-003 | Faker-isolated event type create/delete via POM |
| P1-CAL-FW-004 | Console/page-error guard |

## Branch / PR

Never commit on `main`. Use dated `feat/...` branches and open a PR into `main` on [playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework).

```powershell
git push -u origin HEAD
gh pr create --base main --head feat/2026-10-08-phase1-cal-framework
```

## CI

`.github/workflows/p1-e2e.yml` calls `.github/workflows/e2e.yml`. Typecheck always runs. Live `cal-chromium` shards 1-4 run only when secret `CAL_E2E_BASE_URL` is present (checked via env, not job `if: secrets.*`). Product services are not started in Actions yet. Local green + CI structural green is the Phase 1 bar.

## Not in Phase 1

- Phase 2: TZ/DST, 2FA, WebKit/Firefox nightly, Slack
- Phase 3: visual baselines, German/RTL, axe, GitHub Pages
- Phase 4: Documenso / Medusa / Twenty suites
