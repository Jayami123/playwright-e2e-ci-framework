# Phase 2f task 6: Twenty CI wiring + phase closeout

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1. Branch `feat/2026-10-15-p1-phase2f-twenty-ci` from `main` `ef4cdce` (PR #29 merged). Harness `qa-portfolio-harness#v0.2.8`. Status: plan only; nothing built.

Structure/depth model: [2026-10-11-phase-2e-task3-2fa.md](2026-10-11-phase-2e-task3-2fa.md). Model the job on the existing Documenso CI job. Reuse; do not fork the pattern.

"Verified in source" means read from code this session (2026-10-15). "Verified live" means local Docker/`healthz` this session. "Not verified" means no GitHub run of this job yet.

Never edit the Twenty fork. Never start or stop Twenty by hand. The only start path is harness `node scripts/up.mjs twenty`. No `test.fail()` / `skip` added. No `--repeat-each` in CI. `actionlint` must pass. Do not push. Do not run CodeRabbit CLI. Do not make `e2e / twenty-chromium` a required check in this PR.

---

## Decisions (from review)

- **Base:** `main` at `ef4cdce`. One feature branch for this task.
- **Job:** `twenty-chromium` in reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml). Independent of `CAL_E2E_BASE_URL`. Chromium only. No Twenty Firefox. Nightly still runs this job (schedule always sets `changes.twenty=true`).
- **Harness owns start/stop.** YAML checkouts P1 and the twenty-CRM fork (compose files only), restores the image cache, then `up.mjs twenty`. YAML does not reimplement compose, migrate, or seed. `always()` `down.mjs twenty`.
- **Retries 0** on Twenty Playwright projects (`twenty-setup` and `twenty-chromium`) plus CLI `npm run test:twenty -- --retries=0`. Same CI policy as Documenso: a flake is a red fail (`failOnFlakyTests` is on when `CI` is set). Cal keeps `CI ? 2 : 0`. Twenty has no login-budget reason; state the policy anyway.
- **`PW_WORKERS=2`.** Serial Jane `describe` in [`tests/twenty/tz/tz.spec.ts`](../../tests/twenty/tz/tz.spec.ts) stays serial. Existing fixture TZ-restore `test.skip()` when `workers > 1` stays; do not add another skip.
- **Job timeout 60 min**, not 90. If the first PR run shows seed needs more, raise it with the measured number in ADR 0016. 90 hides hangs.
- **Seed timing evidence.** Timed steps (start/end timestamps) around harness `up` and `globalSetup` `seed()`. Durations go to `$GITHUB_STEP_SUMMARY`. That turns the unknown cold start into a measured number on the first PR run.
- **Failure logs.** `always()` / `failure()` step: `docker compose logs --no-color` for Twenty `server`, `worker`, `db` to a file, uploaded as an artifact. A red seed without this is undiagnosable.
- **Redis `:latest` digest** recorded in the job summary each run. Document in ADR 0016. Do not touch the fork.
- **Image cache save** `continue-on-error: true` on the save step only (not restore, not tests). A tight cache budget must not fail the job. State in ADR 0016.
- **Uploads:** `!cancelled()` for `playwright-report`, `test-results`, and JSON (including failed runs). Documenso PR test-results `if:` at [e2e.yml](../../.github/workflows/e2e.yml) line 960 is a one-line change (`failure()` → `!cancelled()`); include it in this PR.
- **Sweep gate:** always fail if `after>0` or `viewsAfter>0`. Also fail if `before>0` on the nightly run only. On a fresh CI runner volumes are cold, so `before` should be 0; if it is not, that is a seed or fixture bug in this run. Explain in ADR 0016.
- **Required check:** do not add `e2e / twenty-chromium` in this PR. Closeout notes it as a manual GitHub setting after **2** green runs.
- **ADR 0016** for Twenty-specific CI. 0005 / 0009 / 0011 do not cover image cache, compose-only checkout, workers=2, sweep gate, no Firefox, retries 0, 60 min timeout, redis digest, or save `continue-on-error`.
- **README:** harness pin `#v0.2.8` and a Phase 2f closeout table (case, status: CI test / observation, ADR link).
- **No probe-only dispatch.** Unlike Documenso (Node 24 / Remix / secure-context), Twenty is a pinned image already proven locally. First PR run is the proof.
- **No harness PR.** v0.2.8 already supports CI mode (env, ports, seed). Commits after the tag are README-only.
- **No test spec changes** except `playwright.config.ts` `retries: 0` on Twenty projects (CI-only retry override). Timing in `global-setup/twenty.ts` is env-gated (`GITHUB_STEP_SUMMARY` / `CI`), not an oracle change.

---

## 1. How Documenso CI works (verified in source)

Reusable job `documenso-self-hosted` in [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml). Caller [`.github/workflows/p1-e2e.yml`](../../.github/workflows/p1-e2e.yml).

| Stage       | Documenso today                                                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path filter | `changes` job. Non-PR always `true`. PR regex on `tests/documenso/**`, `src/products/documenso/**`, `global-setup/documenso.ts`, leak/preflight scripts, plus shared core/config/lockfile/workflows/actions.                                                                                                                        |
| Start       | Needs `[structural, changes]`. Checkout P1 to `p1/`. Clone fork to `RUNNER_TEMP/products/documenso` at pinned `DOCUMENSO_REF`. Stub other product dirs. Hosts `127.0.0.1 p1.lvh.me`. Node 24 `npm ci` in the fork. Cache node_modules + Remix build. Then `"${NODE24}" node_modules/qa-portfolio-harness/scripts/up.mjs documenso`. |
| Health      | Inside harness `up()` (`/signin` + `/csrf` 200). YAML then runs secure-context preflight + `playwright --list`.                                                                                                                                                                                                                     |
| Session     | Not harness tokens. Each spec logs in. Functional suite uses `P1_PLAYWRIGHT_HARNESS=0` because YAML `up()` already migrated, seeded, and started Remix.                                                                                                                                                                             |
| Tests       | Two-phase: limits on then `test:documenso:rate-limit` then `down`/`up` with bypass then `npm run test:documenso` with `P1_DOCUMENSO_RETRIES: 0`. Nightly also `test:documenso:firefox` (FW-001..003).                                                                                                                               |
| Stop        | Mid-job `down` before bypass `up`. No final `always()` `down`. Runner teardown kills leftover Remix + compose.                                                                                                                                                                                                                      |
| Upload      | HTML report `!cancelled()`. PR test-results `failure()` only (line 960). Matrix uploads `!cancelled()`. JSON via `P1_PW_REPORT_ID`. Server log `always()`.                                                                                                                                                                          |
| Alert       | Caller `nightly-alert` on schedule / `browser_matrix`. Downloads `playwright-test-results-*`, summarises `results-documenso-chromium.json` / `results-documenso-firefox.json`. Red opens/keeps `nightly-failure`; green closes it.                                                                                                  |

---

## 2. Proposed Twenty diff against Documenso

Same skeleton: `changes` output then separate job then checkout P1 `p1/` then checkout fork then stub siblings then restore caches then `setup-p1` + Playwright browsers then harness `up.mjs` then tests then sweep gate then job summary then `!cancelled()` artifacts then `always()` harness `down`.

Twenty-specific deltas (reasons, not a second pattern):

- **Runtime is the pinned image**, not a Node 24 Remix build. No Node 24, no `npm ci` in the fork, no Remix cache. Checkout [Jayami123/twenty-CRM](https://github.com/Jayami123/twenty-CRM) only because harness compose cwd is `packages/twenty-docker` (fork `docker-compose.yml` + harness overlay). Pin `TWENTY_REF=7cbdfec6f346b43715bc2056932f4fad5886f733` (local HEAD 2026-10-15, same as task 2).
- **Cache docker images**, not node_modules. Key `${{ runner.os }}-twenty-images-v2.44.0`. Save only on `push` to `main` + miss. Save `continue-on-error: true`.
- **`up()` does not seed.** Leave Playwright `globalSetup` on (do **not** set `P1_PLAYWRIGHT_HARNESS=0`). YAML `up.mjs` makes `/healthz` 200; [`global-setup/twenty.ts`](../../global-setup/twenty.ts) skips `up()`, then `seed()`.
- **Session** is existing `twenty-setup` UI login to `.auth/twenty-jane.json` ([ADR 0012](../adr/0012-twenty-ui-storage-state.md)).
- **Stop in `always()`** `down.mjs twenty` (Documenso currently omits a final down).
- **No Twenty Firefox.**
- **Timeout 60** via `workflow_call` input `twenty_chromium_timeout_minutes` default 60.

```mermaid
flowchart TD
  changes["changes path filter"]
  checkoutP1["checkout P1 to p1/"]
  checkoutTw["checkout twenty-CRM at TWENTY_REF"]
  stubs["stub cal documenso medusa"]
  imgCache["restore docker image cache keyed on v2.44.0"]
  setupP1["setup-p1 Node 22"]
  browsers["Playwright Chromium"]
  up["timed harness up.mjs twenty"]
  digest["redis image digest to summary"]
  tests["PW_WORKERS=2 test:twenty retries 0"]
  seedTime["globalSetup seed duration to summary"]
  summary["Playwright JSON totals"]
  sweep["sweep gate after viewsAfter nightly before"]
  logs["on failure compose logs artifact"]
  down["always down.mjs twenty"]
  upload["!cancelled report test-results JSON"]
  alert["nightly-alert includes twenty-chromium"]
  changes --> checkoutP1 --> checkoutTw --> stubs --> imgCache --> setupP1 --> browsers --> up --> digest --> tests --> seedTime --> summary --> sweep --> logs --> down --> upload --> alert
```

---

## 3. Step 0 probe (2026-10-15, this session)

### Local memory vs runner (verified live)

`GET http://127.0.0.1:3002/healthz` **200**. Image `twentycrm/twenty:v2.44.0`. Containers up ~15 h (`docker stats --no-stream`):

| Container                     | RSS           |
| ----------------------------- | ------------- |
| `qa-harness-twenty-server-1`  | 1.145 GiB     |
| `qa-harness-twenty-worker-1`  | 1.121 GiB     |
| `qa-harness-twenty-db-1`      | 115.2 MiB     |
| `qa-harness-twenty-redis-1`   | 77.08 MiB     |
| `qa-harness-twenty-mailpit-1` | 22.97 MiB     |
| **Twenty total**              | **~2.48 GiB** |

Image sizes (`docker images`): `twentycrm/twenty:v2.44.0` 1.84 GB, `postgres:16` 642 MB, `redis:latest` 213 MB, `axllent/mailpit:v1.22.3` 43.5 MB. **~2.74 GB** to cache.

GitHub-hosted `ubuntu-24.04`: 4 vCPU / 16 GB. Each CI job is its own VM, so Cal/Documenso do not share this RAM. Playwright `PW_WORKERS=2` is typically ~1 GB extra. **Fits** next to Playwright with several GB headroom. **Inferred:** a 15 h local stack may sit higher than a fresh CI boot; still well under 16 GB.

### Cold start (not measured locally)

Did not `down`/`up` the shared local stack (it is the live Twenty used by Phase 2f). Created `2026-10-13T20:14:01Z`, last started `2026-10-14T15:40:55Z`. No local wall-clock for compose `--wait` or `workspace:seed:dev`.

Harness facts (verified in source): `composeUp(..., { wait: true })` (`up -d --wait`), overlay healthcheck `start_period: 300s`, `seed()` timeout 40 min, `TWENTY_WAIT_MS` default 10 min. CI always has **cold volumes** (ephemeral runner). Image cache only skips Hub pull.

**Job time (inferred, not verified):** cold 20–50 min; warm 15–35 min. Timeout **60**. Timed `up` and `seed` steps on the first PR run replace this estimate. If seed overruns 60, raise the timeout in ADR 0016 with that measured number.

### Harness CI support (v0.2.8, no harness PR)

Already present: `TWENTY_IMAGE_TAG` default `v2.44.0` (rejects `latest`), overlay `TAG`, ports 3002 / 5434 / 8025 / 1025, `seed()` skip if Jane present, `TWENTY_WAIT_MS`, `TWENTY_DOWN_VOLUMES`, `assertRunningServerImage`. Node 22 is enough.

**Missing in harness (do not fix in this branch):**

- No dedicated CI mode env (not needed).
- Fork Redis is `image: redis` (`:latest`). Cache key stays on the Twenty tag; digest can drift. Record the digest. Do not edit the fork.
- No `seed.mjs` (P1 `globalSetup` covers it).
- `loadConfig()` requires a real `PRODUCTS_ROOT/twenty-CRM` directory (YAML checkout, not an empty stub).

Nothing here blocks P1 YAML on `#v0.2.8`.

---

## 4. CI job `twenty-chromium`

Needs `[structural, changes]`. `if: needs.changes.outputs.twenty == 'true'`. `runs-on: ubuntu-24.04`. `timeout-minutes: ${{ inputs.twenty_chromium_timeout_minutes }}` default **60**.

Env (workflow-level, no secrets): `TWENTY_REF`, `TWENTY_IMAGE_TAG=v2.44.0`, `TWENTY_E2E_BASE_URL=http://127.0.0.1:3002`, `TWENTY_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:5434/default`, `P1_WORKING_DIRECTORY=p1`. Seed password only on the E2E step (public seeder default `TWENTY_HARNESS_DEFAULT_PASSWORD`; not workflow-level env; not `::add-mask::`). Same rule as Cal seed `pro`.

**YAML before `up()`:**

1. Checkout this repo to `p1/` (`persist-credentials: false`).
2. Checkout `Jayami123/twenty-CRM` at `TWENTY_REF` to `products/twenty-CRM` (workspace path is fine; Twenty has no Vite/`playwright` path issue). Fail if HEAD does not match `TWENTY_REF`.
3. Stub empty `products/{cal,documenso,medusa}` (`loadConfig()` requires every product dir).
4. Restore docker image cache (section 6). On hit: `docker load`. On miss: `docker pull` of the four images.
5. `setup-p1` Node 22. Playwright Chromium (no Chrome channel, no Firefox unless `run_browser_matrix` for other jobs; this job does not need Firefox).

**Start (timed):**

```bash
UP_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SECONDS=0
node node_modules/qa-portfolio-harness/scripts/up.mjs twenty
UP_SECONDS=$SECONDS
UP_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Write `up_start`, `up_end`, `up_seconds` to `$GITHUB_STEP_SUMMARY` and `$GITHUB_ENV`. `id: twenty_up` so later steps can gate on `outcome`.

**Redis digest (after `up` success):**

```bash
docker inspect qa-harness-twenty-redis-1 --format '{{index .RepoDigests 0}}'
```

Append the digest to the step summary. If inspect fails, print `redis digest: unavailable` and do not fail the job.

**Tests:** `PW_WORKERS=2`, `P1_PLAYWRIGHT_HARNESS` unset, `TWENTY_BASE_URL` / `TWENTY_DB_URL` / `PRODUCTS_ROOT` / `TWENTY_IMAGE_TAG`. Command:

```bash
npm run test:twenty -- --retries=0
```

On schedule / `browser_matrix`: also `P1_PW_REPORT_ID=twenty-chromium` (same if/else as Documenso). No `--repeat-each`.

**Seed duration:** in [`global-setup/twenty.ts`](../../global-setup/twenty.ts), time `adapter.seed()` with `Date.now()`, `console.log` start/end ISO timestamps and elapsed seconds. When `GITHUB_STEP_SUMMARY` is set, append a `### Twenty seed` block. This is CI-only reporting, not an oracle.

**Job summary:** existing `scripts/write-ci-job-summary.mts` on the JSON report (`!cancelled()`). Extra blocks already appended: `up` duration, seed duration, redis digest, sweep counts.

**Sweep:** `npx tsx scripts/count-twenty-qa-leaks.mts` after tests, `if: always() && !cancelled() && steps.twenty_up.outcome == 'success'`. Skip if `up()` failed (no Jane, no auth file).

**Failure logs:** `if: failure() && steps.twenty_up.outcome == 'success'`. From `products/twenty-CRM/packages/twenty-docker`, using the harness project name (do not invent a second compose file):

```bash
docker compose -p qa-harness-twenty \
  -f docker-compose.yml \
  -f "${P1_DIR}/node_modules/qa-portfolio-harness/docker/twenty.compose.yml" \
  logs --no-color server worker db > twenty-compose-logs.txt
```

Upload artifact `twenty-compose-logs` (`if-no-files-found: ignore`, retention 14). Do not dump Mailpit. Do not print secrets; compose logs can contain env. Redact `ENCRYPTION_KEY` / `APP_SECRET` / `PASSWORD` lines with the same `sed` pattern as the Cal server log before upload.

**Stop:** `if: always()` harness `down.mjs twenty`. Do not set `TWENTY_DOWN_VOLUMES` (ephemeral runner).

**Uploads (`!cancelled()`):** `playwright-report-twenty`, `playwright-test-results-twenty-chromium` (includes JSON / JUnit / traces). Distinct names so they do not overwrite Cal/Documenso.

---

## 5. CI-only env / config (each explained)

| Change                                                                               | Why                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `PW_WORKERS=2` on the job                                                            | Isolation already proven locally. Serial TZ file is the only Jane TZ writer under two workers.                  |
| `--retries=0` + project `retries: 0`                                                 | Global config would retry 2 under `CI`. Match Documenso.                                                        |
| `P1_PW_REPORT_ID=twenty-chromium` on schedule/matrix                                 | Nightly-alert `find_json`.                                                                                      |
| `TWENTY_BASE_URL=http://127.0.0.1:3002`, `TWENTY_IMAGE_TAG=v2.44.0`, `PRODUCTS_ROOT` | Harness + P1 env (127.0.0.1 only).                                                                              |
| Seed password on the E2E step only                                                   | Public seeder default. Same as Cal `pro`.                                                                       |
| `CI` already set by Actions                                                          | `failOnFlakyTests`, blob/github/json reporters. Sweep stays skipped in global teardown; YAML gate runs instead. |
| `GITHUB_STEP_SUMMARY` seed append                                                    | Measure seed on the first PR run.                                                                               |

No `P1_PLAYWRIGHT_HARNESS=0` (seed would be skipped).

---

## 6. Docker image cache

Images: `twentycrm/twenty:v2.44.0`, `postgres:16`, `redis`, `axllent/mailpit:v1.22.3`.

- Restore every run. Key `${{ runner.os }}-twenty-images-v2.44.0`. No `restore-keys` (exact key only, same as Documenso).
- On hit: `docker load -i` the tar.
- On miss: `docker pull` each ref (harness `up --wait` would pull anyway; doing it first makes the miss visible in the step log).
- **SAVE only** `push` to `main` + miss: `docker save … | gzip`. `continue-on-error: true` on the **save** step only. Restore, pull, tests, and sweep must not use `continue-on-error`.
- First PR is always a cache miss. First `main` save may be slow (~2.7 GB). If save fails or the 10 GB repo cache budget is tight, the job stays green and the next run pulls from Hub. ADR 0016 states this.

---

## 7. Path filters

`changes` job gains `twenty` output. Non-PR (`schedule`, `workflow_dispatch`, `push` to `main`) sets `twenty=true` (same as `cal` / `documenso`).

PR regex:

```
^(tests/twenty/|tests/setup/twenty\.setup\.ts|src/products/twenty/|global-setup/twenty\.ts|global-teardown/twenty\.ts|scripts/count-twenty-qa-leaks\.mts|playwright\.config\.ts|package\.json|package-lock\.json|\.github/workflows/|\.github/actions/)
```

That covers `src/products/twenty/**`, `tests/twenty/**`, the harness pin (`package.json` / `package-lock.json`), `playwright.config.ts`, and the workflow file, plus the Documenso-analogue extras (setup, global-setup/teardown, leak script, actions).

`lint` / `structural` / unit always run. Twenty job does not `needs: lint`.

---

## 8. Nightly-alert and sweep gate

[`.github/workflows/p1-e2e.yml`](../../.github/workflows/p1-e2e.yml) `nightly-alert`: add

```bash
TWENTY_MD="$(browser_summary results-twenty-chromium.json twenty-chromium)"
```

and append `$TWENTY_MD` to the issue body. A red Twenty job still sets `needs.e2e.result=failure`, so the issue opens/stays open. A green run (all product jobs green) closes it. Expected failures for Twenty: **0** (no `test.fail()`). Known-bug list stays empty unless a future `issue` annotation appears.

**Sweep script** `scripts/count-twenty-qa-leaks.mts`: call `sweepTwentyQaRecords("P1-QA-")`. Print JSON `{ before, deleted, after, viewsBefore, viewsDeleted, viewsAfter }`. Append those numbers to `$GITHUB_STEP_SUMMARY`.

Fail the job if:

- `after>0` or `viewsAfter>0` (every event: PR, main, nightly, dispatch).
- **and** `before>0` when `github.event_name == 'schedule'` (nightly only).

Pass `P1_TWENTY_SWEEP_FAIL_ON_BEFORE=1` from YAML on `schedule` only. The script fails on `before>0` only when that env is `1`.

Why nightly-only `before>0`: a PR sweep that cleans fixture leftovers can still exit 0 when `after=0` (same as local). Nightly is a fresh runner and cold volumes, so `before` at sweep time is leftovers from **this** suite's fixtures, not a previous night. That is a seed/fixture bug and must fail the scheduled run. ADR 0016 states this.

Keep [`global-teardown/twenty.ts`](../../global-teardown/twenty.ts) skip on `CI` so the YAML step is the single gate.

---

## 9. Documenso upload one-liner

[`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml) line 960:

```yaml
if: failure() && steps.documenso_up_bypass.outcome == 'success' && !inputs.run_browser_matrix
```

Change to:

```yaml
if: ${{ !cancelled() && steps.documenso_up_bypass.outcome == 'success' && !inputs.run_browser_matrix }}
```

Matrix Documenso uploads already use `!cancelled()`. This is the only PR-path mismatch. In scope because it is one line.

---

## 10. README Phase 2f closeout table

Fix harness pin to `#v0.2.8`. Replace "Twenty is **not in CI yet**" with the job name and ADR 0016.

Add a table (case, status, ADR):

| Case                                             | Status                                                | ADR                                             |
| ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------- |
| P1-TW-TZ-001 DATE no-shift Honolulu / Kiritimati | CI test (`@twenty-tz`)                                | [0014](../adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-002 DATE_TIME Colombo + UTC             | CI test                                               | [0014](../adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-003 Berlin calendar DST days            | CI test                                               | [0015](../adr/0015-twenty-dst-relative-date.md) |
| P1-TW-TZ-X01 Honolulu DATE_TIME                  | CI test                                               | [0014](../adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-X02 Settings TZ round-trip (last)       | CI test                                               | [0014](../adr/0014-twenty-timezone-testing.md)  |
| P1-TW-TZ-X03 relative today Kiritimati           | CI test                                               | [0015](../adr/0015-twenty-dst-relative-date.md) |
| P1-TW-TZ-X05 fall-back 02:30 labels              | CI test                                               | [0015](../adr/0015-twenty-dst-relative-date.md) |
| P1-TW-TZ-X04 CSV vs fixture UTC                  | Observation (assert CSV = stored ISO, no `test.fail`) | [0015](../adr/0015-twenty-dst-relative-date.md) |
| OBS-001 bare date on DATE_TIME                   | Observation (not automated)                           | [0014](../adr/0014-twenty-timezone-testing.md)  |

Typical Twenty CI duration stays **TBD** until the PR job summary. Required check: "After 2 green `e2e / twenty-chromium` runs, add that check on `main` by hand. Not part of this PR."

Update [ADR 0012](../adr/0012-twenty-ui-storage-state.md) and [0013](../adr/0013-twenty-qa-api-fixture.md) consequences that say Twenty is local-only / not in CI. Do not rewrite 0014 / 0015.

---

## 11. ADR 0016 contents

File [`docs/adr/0016-twenty-ci.md`](../adr/0016-twenty-ci.md). Format like 0011 (Context, Decision, Alternatives, Consequences). Date 2026-10-15. Status Accepted.

Must record:

- Job `twenty-chromium`, image `twentycrm/twenty:v2.44.0`, fork checkout only for compose, harness `up`/`down`.
- Retries 0 (same policy as Documenso, not a rate-limit budget).
- `PW_WORKERS=2`, serial TZ file, no `--repeat-each`, no Firefox.
- Timeout 60 min; raise only with a measured `up`/`seed` number.
- Image cache key on `v2.44.0`; save `continue-on-error`; restore/tests are hard fails.
- Redis `:latest` in the fork; digest logged each run; no fork edit.
- Sweep: fail `after>0` / `viewsAfter>0` always; fail `before>0` on `schedule` only (cold volumes).
- Timed `up` and `seed` in the job summary.
- Compose logs artifact on failure.
- Required check is a post-merge GitHub setting after 2 green runs, not this PR.

---

## 12. Files

New:

- This plan (already this file)
- [`docs/adr/0016-twenty-ci.md`](../adr/0016-twenty-ci.md)
- [`scripts/count-twenty-qa-leaks.mts`](../../scripts/count-twenty-qa-leaks.mts)

Modified:

- [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml)
- [`.github/workflows/p1-e2e.yml`](../../.github/workflows/p1-e2e.yml)
- [`playwright.config.ts`](../../playwright.config.ts) (Twenty `retries: 0`)
- [`global-setup/twenty.ts`](../../global-setup/twenty.ts) (seed timestamps + step-summary append)
- [`README.md`](../../README.md)
- [`docs/adr/0012-twenty-ui-storage-state.md`](../adr/0012-twenty-ui-storage-state.md)
- [`docs/adr/0013-twenty-qa-api-fixture.md`](../adr/0013-twenty-qa-api-fixture.md)
- [`.env.example`](../../.env.example) (`TWENTY_IMAGE_TAG`, `PW_WORKERS=2` note for Twenty CI)

Not changed: Twenty fork, harness, `tests/twenty/**` specs, Cal jobs (except `changes` gaining `twenty`).

---

## 13. Risks

- **First-boot seed duration unknown.** Timeout 60. Timed steps give the number. If the first PR hits 60, raise in ADR 0016 with evidence. Do not invent YAML workarounds or fork edits.
- **`redis:latest` drift** vs image cache. Digest in the summary. Do not pin in the fork.
- **Docker save of ~2.7 GB** may fail or crowd the 10 GB cache. Save `continue-on-error`. Next run pulls from Hub.
- **compose `--wait` + 300s `start_period`** can look idle. Do not add sleeps in tests.
- **Compose logs may contain env.** Redact name-based secret lines before upload.
- **Do not commit** `.auth/twenty-jane.json`, `playwright-report/`, `test-results/`. Stage explicit paths.

---

## 14. Commands / verification (Windows, after this plan is accepted)

Gates: `npx prettier --write` on changed files; `npm run check`; `npm run test:unit`; one local `PW_WORKERS=2 npm run test:twenty -- --retries=0` (once, not repeated). Commit with explicit paths. Do not push. Do not run CodeRabbit CLI.

1. `cd "/d/Jayami/Portfolio/p1-web-e2e-ci" && git checkout main && git pull` (expect `ef4cdce`) then `git checkout -b feat/2026-10-15-p1-phase2f-twenty-ci`.
2. Build YAML, sweep script, seed timing, ADR 0016, README table, 0012/0013, Documenso one-liner.
3. `npx prettier --write` on the changed files.
4. `npm run check` (lint, Prettier, typecheck, actionlint) and `npm run test:unit`.
5. One `PW_WORKERS=2 npm run test:twenty -- --retries=0`. Paste the Playwright summary and sweep `before` / `after` / `viewsAfter`.
6. Commit with explicit paths. Do not push.

Real CI proof is the PR job summary (`up` seconds, seed seconds, redis digest, Playwright totals, sweep). Jayami judges from that.

---

## 15. Final report must include

- Documenso vs Twenty table (section 1–2).
- docker stats RSS and image sizes (section 3, this probe).
- Local `test:twenty` summary + sweep line.
- `npm run check` / `test:unit` exits.
- Whether the Documenso `if:` one-liner was included.
- ADR 0016 yes. Required check: noted for after 2 green runs, not this PR.
- What was not verified: CI wall-clock and seed duration (first PR run), redis digest stability, image-cache save on `main`.
