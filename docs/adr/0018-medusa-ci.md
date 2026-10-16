# 0018. Self-hosted Medusa on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-16

## Context

Phase 4 batch 1 adds Medusa admin SPA and Admin API coverage (`P1-MED-FW-001..005` plus extras `X01..X05`) against the fork `Jayami123/medusa-dtc-starter` at `f677db438f27294fc50e4c7c6612e71ff38eeff5` (Medusa 2.21.2, pnpm 10.11.1, Node 22) on `http://127.0.0.1:9000`, started through `qa-portfolio-harness` `#v0.2.10`. ADRs 0005, 0009, 0011 and 0016 do not cover pnpm via corepack, the `.medusa/server` build cache, a per-run admin password, or a non-secure session cookie on http.

The harness always runs `medusa start` in production mode, which forces `secure: true` on the session cookie (`@medusajs/framework` `express-loader.js:31-34`). Over plain http no `connect.sid` is issued, so the admin UI login cannot work. Harness `v0.2.10` fixes this by writing `cookieOptions: { secure: false, sameSite: "lax" }` into the runtime `medusa-config.js` only when `MEDUSA_BASE_URL` is `http:`. P1 does not spoof `X-Forwarded-Proto` or inject cookies.

## Decision

- **Job:** `medusa-self-hosted` in reusable [`e2e.yml`](../../.github/workflows/e2e.yml). Path filter output `medusa`; non-PR events always run it. It runs only when `visual_product` is empty and `visual_only` is false.
- **Pin bump:** harness `#v0.2.9` to `#v0.2.10`, the one approved exception to "no harness bump" in this batch.
- **Fork:** checkout at pinned `MEDUSA_REF`, HEAD verified, stub `cal`, `documenso` and `twenty-CRM` roots under `PRODUCTS_ROOT`. No fork edits.
- **Storefront off:** `MEDUSA_SKIP_STOREFRONT=1`. No batch 1 case uses it, which saves the storefront `next build` and start.
- **pnpm:** `corepack prepare pnpm@10.11.1`, version asserted, then `pnpm install --frozen-lockfile`. The pnpm store is cached by `MEDUSA_REF` plus the `pnpm-lock.yaml` hash. The harness skips `medusa build` when the `harness-build.json` marker matches HEAD, so `apps/backend/.medusa/server` is cached by `MEDUSA_REF`. Both caches are saved only on push to `main` after a miss, with `continue-on-error`.
- **Admin credentials:** `MEDUSA_ADMIN_EMAIL=admin@qa.local` and a per-run `openssl rand -hex 16` password, masked with `::add-mask::` and written to `GITHUB_ENV`. No literal password in the repo. Locally the two values come from P1's `.env` and must match the harness `.env` (the user already exists).
- **Region:** Europe / EUR, country `de`. It is the only seeded region with a payment provider (`pp_system_default`); the US region has none, so a US cart cannot get a payment session.
- **Order creation:** the store API (eight calls), with the publishable key read via `GET /admin/api-keys`. Every order uses a per-test `P1-QA-` product (`manage_inventory: false`, EUR 25), so seeded inventory is never reserved.
- **Workers and retries:** `PW_WORKERS=1` and `retries: 0`. Workers stay at 1 because the race cases must not share the server with other traffic. Retries 0 is the same flake-is-red policy as Twenty.
- **Cleanup:** orders have no delete route. Fixture teardown cancels open fulfillments (via `POST /admin/fulfillments/{id}/cancel`, because the order-scoped route rejects canceled orders), cancels the order, then archives it. Products and guest customers are deleted by id. A local sweep runs in global setup and teardown when `CI` is unset.
- **Leak gate:** `scripts/count-medusa-qa-leaks.mts` fails on live products, options, customers, non-archived orders and open fulfillments. Archived orders and completed carts are counted and printed, never failing. `schedule` also fails on `before > 0` (`P1_MEDUSA_SWEEP_FAIL_ON_BEFORE=1`).
- **Timeout:** `medusa_self_hosted_timeout_minutes` default **60**. Worst-case budget is about 27.5 minutes (pnpm install 6, build 2, migrate 4, boot 1.5, seed 1, browsers up to 10, tests about 3). A 238.7 s warm migrate was seen locally. First green PR [run 38934316725](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38934316725) (5449fa0): job **2 m 42 s** in total, `pnpm install --frozen-lockfile` 14 s, harness up + seed 69 s, Medusa E2E suite 35 s; the pnpm store and build cache saves were skipped (saved on push to `main` only), so a run that misses the caches may take longer. Lower the timeout only from more real step-summary numbers, recorded here.
- **Visual gate:** the job outputs `visual: ""` and `visual_requested=false` until batch 2, so `e2e / visual` stays green with no Medusa visual suite and a Medusa failure does not affect it.
- **Nightly alert:** `results-medusa-chromium.json` via `P1_PW_REPORT_ID=medusa-chromium`.
- **Log artifact:** `medusa-backend.log` with secret lines, `Bearer` lines and `pk_` keys redacted.

## Observations (not asserted)

- **O-01:** a negative variant price is accepted (`price -1` returns 200). No documented Medusa contract to cite, so X03 does not assert it.
- **O-02:** `GET /store/orders/{id}` returns the full order with a publishable key and no customer token. By design per `store/orders/middlewares.js:51-57` (the order id is the capability). Not a finding.
- **Tax is always 0:** the seeded tax regions have no rates, so the tax term of the FW-003 oracle is weak. The arithmetic still includes `tax_total`. Seeded data is read-only, so rates are not changed.
- **Harness seed time:** `ensureMedusaAdminUser` runs `pnpm medusa user`, which took about 74 s on a loaded local machine against a 120 s harness limit. In CI ([run 38934316725](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38934316725)) harness up and seed together took 69 s (16:46:31Z to 16:47:40Z).

## Alternatives

- **Spoof `X-Forwarded-Proto: https` in P1:** rejected; it hides the real environment and only a probe used it.
- **US region:** rejected; no payment provider.
- **Seeded products as line items:** rejected; reserves seeded inventory.
- **SQL hard delete of orders:** rejected; P1 never writes with SQL.
- **45-minute timeout:** rejected; cold pnpm install is unmeasured.

## Consequences

- The first green PR run ([run 38934316725](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38934316725)) supplied the numbers recorded under Timeout and Harness seed time; later runs on `main` add more.
- X04 and X05 are expected failures ([medusa-known-issues.md](../observations/medusa-known-issues.md)). If a race stops reproducing, the unexpected pass turns the run red. Never loosen the assertion.
- Making `e2e / medusa-self-hosted` required is a manual GitHub setting after two green runs on `main`.
- a11y findings from the probe (duplicate aria-hidden Create Product dialog, unnamed option picker, unassociated values label, unnamed order menu trigger, login error not announced, unnamed password field) are recorded in batch 2 with their own a11y tests.

## Amendment (batch 2, 2026-10-17)

Batch 2 adds `P1-MED-I18N-001/002`, `P1-MED-VIS-001/002/003` and the extras `X06..X14` (plan [2026-10-17-p1-phase4-batch2-medusa.md](../plans/2026-10-17-p1-phase4-batch2-medusa.md)). This amendment supersedes the "Visual gate" bullet and the "only when `visual_product` is empty" rule above.

- **Visual suite in the job.** `medusa-self-hosted` now also runs `npm run visual:test -- --product=medusa` (Docker, port 9000 only; the fixtures use the HTTP API, never SQL) and publishes `visual: ${{ steps.visual.outcome }}`. The job output reads `steps.visual.outcome`, never `.conclusion`: with `continue-on-error: true` a failed step still has `conclusion: success`, so `.conclusion` would hide the failure from the `e2e / visual` gate. `visual_requested` is true on every run except browser-matrix runs, so Medusa is gated exactly like Cal, Documenso and Twenty. The job runs when `visual_product` is empty or `medusa`; `visual_only` skips the functional steps and seeds with `--project=medusa-setup`. `visual-baselines.yml` offers `medusa`. The functional blob report is uploaded as `blob-functional-medusa` on pushes to `main` (parity with Twenty).
- **Harness `v0.2.11` and the build cache key (E-01).** The harness built the admin with `NODE_ENV=development` (`medusa build` sets it; the admin bundler only forces production for plugin builds), so the served admin was a development bundle: error boundary stack traces, "Error Details (Development Mode)", dev React warnings. Harness PR [#20](https://github.com/Jayami123/qa-portfolio-harness/pull/20) (tag `v0.2.11`) builds with `NODE_ENV=production` and records `mode` in `harness-build.json`. P1 bumps the pin (the one approved exception, as in batch 1) and the build cache key gains the suffix `-h0.2.11`, because the old key holds a development bundle. No `NODE_ENV` override or bundle patching exists in P1. Re-probe on the production bundle (two runs): no dev details or stack traces, 0 page errors, 4 console errors for a failed list call instead of 10.
- **Data design.** Visual orders use constant emails (`p1-qa-vis-<worker>-<leaf>@qa.local`) and product titles (`P1-QA-VIS-<worker>-<leaf>`); the per-test token goes only into the shipping last name, which the orders `q` filter searches and the list does not show. Per-run emails shifted column widths and gave a 1.09 % diff at 820 px, above the 1 % tolerance (probe Q-19). 255-character titles are built by `medusaQaTitleOfLength` (exact UTF-16 length, never splits a surrogate pair) and created through the API; the stored length is the oracle.
- **Masks (`src/support/visual/masks.ts`).** Orders list: whole cells for display id and `created_at`, plus the search box. Order detail (German): breadcrumb id, heading row, and the creation date line. The date line was left out of the plan's mask list; without it the two German baselines drifted by 0.02 % (desktop) and 0.24 % (tablet) between runs a minute apart, and with it 0.0027 % and 0 %. Every mask is asserted to match before the shot. The flags are not masked but stubbed: the list loads one flag per row from `cdn.jsdelivr.net`, which is outside test control, and `waitForVisualStability` waits for every image.
- **Hold gate instead of a delay.** The map's "delay 3 s" is a gate that holds the request until the test releases it (`holdRequests`). A timer races the assertion on a slow runner. There is no `waitForTimeout` and no timer anywhere in the batch.
- **Language isolation.** The admin language is the `lng` cookie, set per test context. The Profile "Save" would write the shared admin user (`POST /admin/users/{id}`), so P1 never uses it.
- **Console recorder.** `consoleRecorder` collects console errors and page errors without asserting; the core console guard fails on any entry and cannot record an expected error. VIS-002 asserts the recorder holds the failed resource line and the two lines the admin's error boundary logs, and nothing else.
- **Timing.** The full Medusa visual suite (3 viewports, 19 run, 23 skipped by viewport rules) took **357 s** and **352 s** locally including container start. Worst case is the 27.5 minutes above, 1 minute for the image pull, a rebuild after the key bump (inside the 2 minute build budget) and a 10 minute visual budget: **38.5 minutes, below the 60 minute timeout**. The timeout stays 60.
- **Observations (not asserted).** O-03: the error state has no in-page retry control (the map's "with retry" is covered by asserting the recovery message and recovery after a reload). O-04: the loading skeleton has no `aria-busy`, `role=status` or `role=progressbar`, so it is not exposed to assistive technology. O-05: while a filter change loads, the previous rows stay with no indicator (`keepPreviousData`). F-06b (unnamed password field) is retracted: the field is labelled.
- **Known bugs.** F-03, F-05, F-06 and F-07 are expected failures X06, X07, X08 and X13 ([medusa-known-issues.md](../observations/medusa-known-issues.md)).
