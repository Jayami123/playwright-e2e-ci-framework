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
- **Timeout:** `medusa_self_hosted_timeout_minutes` default **60**. Worst-case budget is about 27.5 minutes (pnpm install 6, build 2, migrate 4, boot 1.5, seed 1, browsers up to 10, tests about 3). Cold pnpm install is unmeasured and a 238.7 s warm migrate was seen locally. Lower it only from step-summary numbers of real runs, recorded here.
- **Visual gate:** the job outputs `visual: ""` and `visual_requested=false` until batch 2, so `e2e / visual` stays green with no Medusa visual suite and a Medusa failure does not affect it.
- **Nightly alert:** `results-medusa-chromium.json` via `P1_PW_REPORT_ID=medusa-chromium`.
- **Log artifact:** `medusa-backend.log` with secret lines, `Bearer` lines and `pk_` keys redacted.

## Observations (not asserted)

- **O-01:** a negative variant price is accepted (`price -1` returns 200). No documented Medusa contract to cite, so X03 does not assert it.
- **O-02:** `GET /store/orders/{id}` returns the full order with a publishable key and no customer token. By design per `store/orders/middlewares.js:51-57` (the order id is the capability). Not a finding.
- **Tax is always 0:** the seeded tax regions have no rates, so the tax term of the FW-003 oracle is weak. The arithmetic still includes `tax_total`. Seeded data is read-only, so rates are not changed.
- **Harness seed time:** `ensureMedusaAdminUser` runs `pnpm medusa user`, which took about 74 s on a loaded local machine against a 120 s harness limit. Cold CI timing is unmeasured.

## Alternatives

- **Spoof `X-Forwarded-Proto: https` in P1:** rejected; it hides the real environment and only a probe used it.
- **US region:** rejected; no payment provider.
- **Seeded products as line items:** rejected; reserves seeded inventory.
- **SQL hard delete of orders:** rejected; P1 never writes with SQL.
- **45-minute timeout:** rejected; cold pnpm install is unmeasured.

## Consequences

- The first PR run supplies authoritative `up` and seed seconds, pnpm install time and Playwright totals in the job summary; record them here.
- X04 and X05 are expected failures ([medusa-known-issues.md](../observations/medusa-known-issues.md)). If a race stops reproducing, the unexpected pass turns the run red. Never loosen the assertion.
- Making `e2e / medusa-self-hosted` required is a manual GitHub setting after two green runs on `main`.
- a11y findings from the probe (duplicate aria-hidden Create Product dialog, unnamed option picker, unassociated values label, unnamed order menu trigger, login error not announced, unnamed password field) are recorded in batch 2 with their own a11y tests.
