# 0010. Multi-product Playwright setup gating

- Status: Accepted
- Date: 2026-10-13

## Context

Playwright `globalSetup` is config-level, not per project. The default `package.json` script `"test": "playwright test"` passes no `--project` flag. `selectedProjects` with an empty argv returns true for every project name, so a bare `npm test` used to set both `runsCal` and `runsDocumenso` and run [global-setup/index.ts](../../global-setup/index.ts) (Cal `up()`) and [global-setup/documenso.ts](../../global-setup/documenso.ts) together.

Named npm scripts are already safe: [src/core/projects.ts](../../src/core/projects.ts) `argvForProjectSelection` injects `--project` from `npm_lifecycle_event` for `test:cal`, `test:documenso`, and related scripts. Phase 2e task 1b (2026-10-11) recorded the footgun on undifferentiated `npm test`.

`P1_PLAYWRIGHT_HARNESS=0` skips harness startup when set explicitly; that does not fix the surprise of product Docker on a generic test command.

## Decision

- Keep argv/lifecycle gating for named scripts (`test:cal`, `test:documenso`, firefox/rate-limit variants, `test:unit`).
- Map npm lifecycle `"test"` to `["unit"]` in `NPM_SCRIPT_PROJECTS`. `npm test` runs only the unit project and never starts Cal or Documenso harnesses by surprise. That is the standard safe default (`npm test` equals `npm run test:unit` for project selection).
- Do not add a second Playwright config or a required `P1_PRODUCT` env.

## Alternatives considered

- **Per-product globalSetup via project dependencies.** A `cal-harness` / `documenso-harness` setup project that calls `adapter.up()`. Playwright still runs every project on a bare `npx playwright test`, so Cal would still start unless those projects are also filtered. More projects, little extra safety for `npm test` once lifecycle maps to unit.
- **Env flag.** `P1_PLAYWRIGHT_HARNESS=0` already exists. A required `P1_PRODUCT=cal|documenso` is another footgun for local runs.
- **Separate configs.** `playwright.cal.config.ts` vs `playwright.documenso.config.ts`. Clean isolation, duplicated reporter/timeout/CI wiring. Heavier than the argv map we already have.
- **Leave `npm test` as a documented footgun.** Rejected. A bare `npm test` must not start product harnesses.

## Consequences

- Product E2E stays on `npm run test:cal` / `test:documenso` (and named variants).
- The unit test that **no `--project` flag selects every product** still holds for `npx playwright test` with empty argv and no `npm_lifecycle_event` map. That path is not `npm test`; do not “fix” the unit test by changing `selectedProjects` defaults.
