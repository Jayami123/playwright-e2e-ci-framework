# Phase 2e task 6: closeout

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci`, GitHub `Jayami123/playwright-e2e-ci-framework`, code P1. Start from latest `main` (merge `f8aa6cc`) on `feat/2026-10-13-p1-phase2e-task6-closeout`. Do not edit the Documenso fork. Do not start or stop Documenso by hand. No new `test.fail()`.

Two commits:

1. Docs: this plan, ADR 0010, 2FA observation text, README Phase 2e summary.
2. Code: `npm test` runs only the unit project (`projects.ts` + its unit test).

## Live probe: what already exists (do not duplicate)

**ADRs** (`docs/adr/`): 0001 harness next start; 0002 Cal API login; 0003 CI secret gating; 0004 timeouts/locators/console; 0005 self-hosted Cal; 0006 Cal TZ/DST; 0007 Cal 2FA; 0008 Cal browser matrix; 0009 nightly-alert; **0011 Documenso CI**. **0010 is missing.** Task 3 reserved 0010 for 2FA docs; 2FA known-issues already live, so 0010 in this task is **multi-product setup gating**, not a second 2FA ADR.

**Observations:**

- [docs/observations/documenso-2fa-known-issues.md](../observations/documenso-2fa-known-issues.md) — P7-OBS-DOC-2FA-001..004. The file currently cites run [38388797450](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38388797450), which **failed the leak check**. Main evidence for this closeout is the green run [38392549848](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38392549848) (`documenso-chromium`: 23 passed, 4 expected failures). Keep 38388797450 only as the first run that showed the bugs.
- [docs/observations/documenso-signing-known-issues.md](../observations/documenso-signing-known-issues.md) — FW-006 cancel UX, FW-005 orphans, FW-009 test bug (fixed), tRPC 429 / RL-001 / ADR 0011 bypass
- [docs/observations/documenso-passkey-e2e-notes.md](../observations/documenso-passkey-e2e-notes.md) — secure context + PK-006 capture TEST BUG (fixed)
- Cal TZ/DST and Cal 2FA known-issues files (out of Phase 2e closeout except README pointer)

_*P7-OBS-DOC-* already recorded (do not rewrite as new findings):_*

- 2FA-001/002/003/004 (tests 006/007/004/009) in 2FA known-issues
- FW-005 orphans, FW-006 cancel UI, FW-009 fixed test bug
- PK-001 (auth AppError HTTP 500, logged in passkey specs), PK-002 (no unique index, observation-only)
- FW-008 SQL seam is a test annotation, not a product-bug `test.fail`

**Gating already in code:** [src/core/projects.ts](../../src/core/projects.ts) `argvForProjectSelection` injects `--project` from `npm_lifecycle_event` for named scripts (`test:cal`, `test:documenso`, …). [playwright.config.ts](../../playwright.config.ts) starts Cal and/or Documenso `globalSetup` only when `runsCal` / `runsDocumenso` is true. `P1_PLAYWRIGHT_HARNESS=0` skips harness. Unit test still states: **no `--project` flag selects every product** (true for `npx playwright test` with empty argv).

## 1. ADR 0010 multi-product setup gating (new file)

Write [docs/adr/0010-multi-product-setup-gating.md](../adr/0010-multi-product-setup-gating.md). Format like 0008/0011 (Context, Decision, Alternatives, Consequences). Date 2026-10-13. Status Accepted.

**Context (findings 2026-10-11 task 1b):** Playwright `globalSetup` is config-level, not per project. `package.json` `"test": "playwright test"` has no `--project`. `selectedProjects` with empty flags returns true for every name. So a bare `npm test` used to set `runsCal` and `runsDocumenso`, and both [global-setup/index.ts](../../global-setup/index.ts) (Cal `up()`) and [global-setup/documenso.ts](../../global-setup/documenso.ts) ran. Named scripts are already safe because `argvForProjectSelection` injects `--project`.

**Decision:**

- Keep argv/lifecycle gating for named scripts (`test:cal`, `test:documenso`, firefox/rate-limit variants, `test:unit`).
- Map npm lifecycle `"test"` to `["unit"]` in `NPM_SCRIPT_PROJECTS`. `npm test` runs only the unit project, so it can never start Cal (or Documenso) by surprise. That is the standard safe default.
- Do not add a second Playwright config or a required `P1_PRODUCT` env.

**Alternatives considered (rejected):**

- **Per-product globalSetup via project dependencies.** A `cal-harness` / `documenso-harness` setup project that calls `adapter.up()`. Playwright still runs every project on a bare `npx playwright test`, so Cal would still start unless those projects are also filtered. More projects, little extra safety for `npm test` once lifecycle maps to unit.
- **Env flag.** `P1_PLAYWRIGHT_HARNESS=0` already exists. A required `P1_PRODUCT=cal|documenso` is another footgun for local runs.
- **Separate configs.** `playwright.cal.config.ts` vs `playwright.documenso.config.ts`. Clean isolation, duplicated reporter/timeout/CI wiring. Heavier than the argv map we already have.
- **Leave `npm test` as a documented footgun.** Rejected. A bare `npm test` must not start product harnesses.

**Consequences:**

- `npm test` equals `npm run test:unit`. Product E2E stays on `npm run test:cal` / `test:documenso`.
- The unit test that **no `--project` flag selects every product** still holds for `npx playwright test` (empty argv, no `npm_lifecycle_event` map). That path is not `npm test`. Call it out in the ADR so the unit test is not "fixed" away.

Implement the map in commit 2, not in the docs commit.

## 2. Stale 2FA-006 / 007 observation text

File: [docs/observations/documenso-2fa-known-issues.md](../observations/documenso-2fa-known-issues.md).

**Header / CI proof:** cite green run [38392549848](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38392549848) (`documenso-self-hosted`, `documenso-chromium`: 23 passed, 4 expected failures) as the main evidence. Keep [38388797450](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38388797450) only as the first run that showed the bugs (that job failed the leak check). Point trace downloads at 38392549848.

**006 today (stale):** "second reuse asserts 201 + session API + security page; then `test.fail` before spent-code rejection asserts."

**006 in code** ([tests/documenso/auth/2fa.spec.ts](../../tests/documenso/auth/2fa.spec.ts) ~262–325): first login **asserted** 201 + session; second login **recorded** (`secondStatus`, cookie, session email, `securityPageLoaded`) into `known-bug.json`; then `test.fail`; then spent-code oracle (`INVALID_TWO_FACTOR_CODE`, no session cookie). Rewrite the **Test:** paragraph to match that. Keep **Observed:** (product still accepts the backup twice).

**007:** Observed (both authorizes 201) is still the product finding. There is no **Test:** line. Add one matching 006: first TOTP login asserted; second login recorded into `replay-totp-evidence.json` / `known-bug.json` (including `securityPageLoaded`); same-step asserted; then `test.fail`; then replay-reject oracle. Do not change the spec.

## 3. Double-run proof (two `workflow_dispatch` on this branch)

Do **not** add `--repeat-each=2` to CI YAML.

**Standard option: two sequential `workflow_dispatch` runs** of [p1-e2e.yml](../../.github/workflows/p1-e2e.yml) **on this feature branch before merge**, not on `main` after. Put both URLs in the PR description. Defaults: `browser_matrix=false`, `documenso_probe_only=false`. Path filters do not apply to dispatch (they would skip Documenso on a docs-only PR). Each run is the real job: harness `up` with limits → `test:documenso:rate-limit` → down/`up` with bypass → `test:documenso` → leak gate.

`--repeat-each=2` only repeats Playwright tests in one process. It does not re-run RL-001, the bypass restart, or the leak script. Reject it as the closeout proof.

Success: both runs green, **0 flaky**, the **same 4 expected failures** (P1-DOC-2FA-004, 006, 007, 009). For each run record the job-summary line **and** the leak-gate summary (orphan DocumentMeta/DocumentData counts). Concurrency already does not cancel dispatch.

No workflow file change for this.

## 4. README Phase 2e summary

[README.md](../../README.md) **Scope** is stale ("Cal.com only", "14 of 66", "Later suites: Documenso"). Replace that block with a short Phase 2e summary, not a second case table:

- Covered: Cal FW/TZ/DST/2FA (existing table stays below); Documenso AUTH-000, 2FA-001..009, PK-001..006, FW-001..011, RL-001; PR Chromium; nightly Firefox FW-001..003; CI job `documenso-self-hosted`.
- Four known Documenso bugs (`test.fail`), **confirmed 2026-10-13** on run [38392549848](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38392549848): 2FA-004 HTTP 500 on wrong TOTP; 2FA-006 backup reuse; 2FA-007 TOTP replay; 2FA-009 disable-2FA 500. Living list: [documenso-2fa-known-issues.md](../observations/documenso-2fa-known-issues.md) (so the README list does not go stale silently).
- CI: badge already points at `p1-e2e.yml`; name job `e2e / documenso-self-hosted` and [ADR 0011](../adr/0011-documenso-ci.md).

Keep the existing Cal case table. Do not list every Documenso ID. Fix the "not in this repo yet" sentence. Folder structure: add `tests/documenso/` and `src/products/documenso/` in the tree (one or two lines).

## Files

Commit 1:

- New: `docs/adr/0010-multi-product-setup-gating.md`, `docs/plans/2026-10-13-phase-2e-task6-closeout.md`
- Modified: `docs/observations/documenso-2fa-known-issues.md`, `README.md`

Commit 2:

- Modified: `src/core/projects.ts` (`NPM_SCRIPT_PROJECTS["test"] = ["unit"]`)
- Modified: `tests/unit/playwright-projects.spec.ts` (lifecycle `test` does not select Cal/Documenso; keep the empty-argv "selects every product" case for `npx playwright test`)

Not modified: specs, workflows, harness, fork.

## Commands

1. `git checkout main && git pull` (expect `f8aa6cc`). `git checkout -b feat/2026-10-13-p1-phase2e-task6-closeout`.
2. Write plan (this file), ADR 0010 (decision includes `npm test` → unit, implemented in commit 2), observation edits, README. Commit 1: `docs(p1): close out phase 2e ADRs and README`.
3. Map `"test"` → `["unit"]` and unit test. Commit 2: `fix(p1): make npm test run unit project only`.
4. `npm run check`. Grep the diff (section Verification).
5. Push the branch. Two `workflow_dispatch` on **this ref** (not `main`). Paste URLs, summaries, leak-gate orphan lines into the PR body.
6. Open PR. Do not merge.

## Verification

- `npm run check` (lint, prettier, typecheck, actionlint).
- Grep the branch diff vs `main` and confirm:
  - no new `test.fail`, `.skip`, or `.only`
  - no spec or workflow files changed besides `src/core/projects.ts` and `tests/unit/playwright-projects.spec.ts`
- Two `workflow_dispatch` on the feature branch: both green, 0 flaky, same 4 expected failures, leak-gate orphan counts recorded.
- No Documenso start/stop locally; no fork edit.

## Out of scope

New product tests, new `test.fail`, Medusa/Twenty, rewriting 0011, duplicating 2FA/signing/passkey findings, `--repeat-each`, merge.
