# Phase 4 batch 1: Medusa foundation (admin SPA + Admin API)

## 1. Header

- Repo: `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1.
- Branch to create: `feat/2026-10-16-p1-phase4-batch1-medusa` from a freshly pulled `main`.
- **Base SHA planned from: `962ed49ed768fa1b14edecd5d3347f5c0bfbeeee`** (PR #35 merge). Verified 2026-10-16 with `git fetch` + `git rev-parse HEAD origin/main` (both 962ed49), working tree clean.
- Harness: `qa-portfolio-harness#v0.2.9` = `d702ed9b0fed5513a5aa1e34d3e7835e4613c8a1` (`package-lock.json:2196-2198`). The installed copy matches the local harness checkout (`diff -rq --strip-trailing-cr` is clean).
- Medusa fork: `Jayami123/medusa-dtc-starter` @ **`f677db438f27294fc50e4c7c6612e71ff38eeff5`** (2026-10-09, same as `origin/HEAD`), `@medusajs/medusa` **2.21.2** (`apps/backend/package.json`), pnpm 10.11.1, Node `>=22.22.0` (fork `package.json:4-7`).
- Status: **plan only, review answers applied (2026-10-16). Step 1 probe done twice.** Building waits on the separate harness PR `v0.2.10` (D10, §13 R1).
- Structure/depth model: [2026-10-11-phase-2e-task3-2fa.md](2026-10-11-phase-2e-task3-2fa.md). CI pattern: [2026-10-15-phase-2f-task6-twenty-ci.md](2026-10-15-phase-2f-task6-twenty-ci.md). Probe-first layout: [2026-10-16-phase-3-rest-batch.md](2026-10-16-phase-3-rest-batch.md).
- "Verified" means seen live in this session's probe (row ids P-xx below, run 1 and run 2), or read in source with path:line. Anything else is marked **not verified**.
- Probe scripts, JSON and screenshots stay only in the session scratchpad (`…/scratchpad/probe/`). Nothing was written to the repo, harness or fork.

## 2. Step 1: probe findings (2026-10-16, run 1 and run 2)

Medusa was started with harness `node scripts/up.mjs medusa` (exit 0, **373 s** warm: migrate 238.7 s, build skipped because the marker matches HEAD, boot 78.6 s, storefront 25.3 s). Then `npm run smoke -- medusa` (exit 0, 17 s, `seed total 0.392 s`, "already complete"). Both harness `.env` greps printed `1`. Unless a row says otherwise, run 2 matches run 1 exactly (scripted diff after normalising ids).

### Auth and session

| #    | Step                          | Request                                                                                                                  | Expected (contract)                  | Observed run 1 / run 2                                                                                                                                                               | Verdict                                                           |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| P-01 | Health                        | `GET http://127.0.0.1:9000/health`, `GET http://localhost:9000/health`                                                   | 200 `OK`                             | 200 `OK` on both hosts, both runs                                                                                                                                                    | Same; P1 still allows **127.0.0.1 only** (`medusa-env.ts:98-112`) |
| P-02 | Admin email                   | harness `.env` (value never printed)                                                                                     | –                                    | equals `admin@qa.local`: **no**; domain `test.com`                                                                                                                                   | Decision D1                                                       |
| P-03 | Login, right password         | `POST /auth/user/emailpass`                                                                                              | 200 + token                          | 200, body keys `["token"]`, token length 504; JWT `actor_type: "user"`, TTL 86400 s                                                                                                  | Pass                                                              |
| P-04 | Session                       | `POST /auth/session` (Bearer)                                                                                            | 200 + session cookie                 | 200, body `{user:{actor_id,…}}`, **no `Set-Cookie`**; then `GET /admin/users/me` with cookies → 401                                                                                  | **Blocker R1** (harness)                                          |
| P-05 | Session behind TLS proxy      | same + `X-Forwarded-Proto: https` (probe-only diagnosis)                                                                 | –                                    | 200, `Set-Cookie: connect.sid; Path=/; Expires; HttpOnly; Secure; SameSite=Lax`; `GET /admin/users/me` with that cookie over plain http → 200                                        | Root cause confirmed                                              |
| P-06 | UI login, right password      | `/app` → `/app/login`, fill, "Continue with Email"                                                                       | lands on `/app/orders`               | network: `POST /auth/user/emailpass 200`, `POST /auth/session 200` (no cookie), `GET /admin/users/me 401` ×2; **stays on `/app/login`, no error shown**; cookies: `lng` only         | **Blocker R1**                                                    |
| P-07 | Login, wrong password         | `POST /auth/user/emailpass`                                                                                              | 401                                  | 401 `{type:"unauthorized", message:"Invalid email or password"}`, no stack, 0 `Set-Cookie`                                                                                           | Pass                                                              |
| P-08 | Unknown user                  | same                                                                                                                     | 401, same body (no user enumeration) | identical to P-07                                                                                                                                                                    | Pass                                                              |
| P-09 | UI login, wrong password      | UI                                                                                                                       | error shown, no session              | text "Invalid email or password" in a plain `SPAN` (no role, no `aria-live`, not referenced by `aria-describedby`); Email textbox `[invalid]`; cookies: `lng` only; URL `/app/login` | Pass; a11y finding F-06                                           |
| P-10 | No / garbage / tampered token | `GET /admin/users/me` none; `GET /admin/orders` Bearer `garbage.token.value`; Bearer with `exp=1` and a broken signature | 401                                  | 401 `{message:"Unauthorized"}` for all three, no stack                                                                                                                               | Pass                                                              |

Root cause in source: `@medusajs/framework@2.21.2/dist/http/express-loader.js:31-34` forces `secure: true` in production. Line 55 sets `proxy: true`, line 83 `trust proxy 1`. The harness always runs `medusa start` in production mode (`qa-portfolio-harness/src/adapters/medusa-env.ts:20` `MEDUSA_HTTP_MODE = "production"`, adapter `medusa.adapter.ts:865-919`). express-session does not issue a Secure cookie on an http request. The harness README `README.md:265` says "German admin: `/app` → Profile → Language → Deutsch". That cannot work on http.

### Data, keys and key scope

| #    | Step                    | Request                                                                                        | Observed run 1 / run 2                                                                                                                                       | Verdict                    |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| P-11 | Regions                 | `GET /admin/regions?fields=*countries,*payment_providers`                                      | **Europe** `eur`, countries dk fr de it es se gb, providers `["pp_system_default"]`, automatic_taxes true. **United States** `usd`, `us`, providers **`[]`** | Decision D2                |
| P-12 | Tax                     | `GET /admin/tax-regions?fields=*tax_rates`                                                     | 7 EU countries, **0 rates each** → tax total 0                                                                                                               | Risk R5                    |
| P-13 | Sales channels / keys   | `GET /admin/sales-channels`, `GET /admin/api-keys?fields=*sales_channels`                      | one channel "Default Sales Channel"; one publishable key "Default Publishable API Key" `pk_eb2…` (len 67) linked to it                                       | Pass                       |
| P-14 | Store with key          | `GET /store/regions` + `x-publishable-api-key`                                                 | 200, 2 regions                                                                                                                                               | Pass                       |
| P-15 | Store without key       | `GET /store/regions`                                                                           | 400 `{type:"not_allowed", message:"Publishable API key required in the request header: x-publishable-api-key. …"}`                                           | Pass                       |
| P-16 | Key on admin            | `GET /admin/orders` with only `x-publishable-api-key`; also as `Bearer pk_…`                   | 401 `{message:"Unauthorized"}` both                                                                                                                          | Pass (X01)                 |
| P-17 | Admin token on store    | `GET /store/products` Bearer admin, no key; `GET /store/customers/me` Bearer admin + key       | 400 `not_allowed` (key required); 401                                                                                                                        | Pass (X01)                 |
| P-18 | Customer token on admin | seeded customer `POST /auth/customer/emailpass` (200) → `GET /admin/orders` Bearer customer    | 401                                                                                                                                                          | Pass (X01)                 |
| P-19 | Order by id, no auth    | `GET /store/orders/{guest order id}` with key, no customer token; also with customer B's token | **200 with the full order** both ways                                                                                                                        | Observation by design (§6) |

P-19 source: `@medusajs/medusa@2.21.2/dist/api/store/orders/middlewares.js:51-57` has no `authenticate` for `GET /store/orders/:id`. The list route at `:43-50` requires a customer. The order id is the capability.

### Products

| #    | Step                                      | Request / UI                                                                                                                            | Observed run 1 / run 2                                                                                                                                                                                                                                                                          | Verdict                     |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| P-20 | API create 2×2                            | `POST /admin/products` (options Size S,M × Color Red,Blue; 4 variants; eur 25; `manage_inventory:false`)                                | 200, 4 variants                                                                                                                                                                                                                                                                                 | Pass                        |
| P-21 | Search shape                              | `GET /admin/products?q=<title>` (default fields)                                                                                        | 200 `{products,count,offset,limit}`, count 1, **variants included by default** (4). With `fields=…,*variants,*options,*options.values`: options `Size:S\|M`, `Color:Red\|Blue`. **Option order differed between runs** (run 1 Size first, run 2 Color first)                                    | Pass; assert order-free     |
| P-22 | UI create dialog                          | `/app/products` → link "Create" → `/app/products/create`                                                                                | **2 identical "Create Product" `role=dialog` elements, both `aria-hidden="true"`** (`data-state=open`). Aria snapshot of `html` shows only region "Notifications alt+T". Repeated on direct navigation                                                                                          | **PRODUCT BUG F-03**        |
| P-23 | Details tab controls                      | DOM dump of the top dialog                                                                                                              | tabs "Details"/"Organize"/"Variants" (`role=tab`); `input[name=title]` labelled "Title"; switch "Yes, this is a product with variants"; after switch on: an **unnamed** `combobox` (option picker) and value input `placeholder="Red, Blue, Green"` whose `<label>` (option title) has no `for` | F-04, F-05                  |
| P-24 | Add option                                | type title in combobox → option `Create "<title>"` (listbox also lists global "Size", "Color") → `Tab` → type value + `Enter` per value | worked for both options; only the **empty** values input carries the placeholder, so a single `getByPlaceholder` resolves. `Escape` instead of `Tab` leaves the other dialog's overlay intercepting pointer events                                                                              | Locator rule §8             |
| P-25 | Continue → Organize → Continue → Variants | buttons "Continue" ×2                                                                                                                   | Variants tab: data grid, 4 rows "S / Red", "S / Blue", "M / Red", "M / Blue"; price inputs optional; footer "Cancel", "Save as draft", "Publish"                                                                                                                                                | Pass                        |
| P-26 | Publish                                   | button "Publish"                                                                                                                        | `POST /admin/products 200` (the only non-GET call); URL `/app/products/prod_<id>`; toast "Product <title> was successfully created."                                                                                                                                                            | Pass                        |
| P-27 | List                                      | `/app/products?q=<title>`                                                                                                               | table, row name "<title> - Default Sales Channel 4 variants Published", cells "4 variants", "Published", "Default Sales Channel" (auto-assigned); "1 of 1 results"                                                                                                                              | Pass                        |
| P-28 | Options lifecycle                         | `GET /admin/product-options`; SQL                                                                                                       | UI-created options are product-scoped (`is_exclusive=t`) and soft-deleted with the product (0 live). Seeded global options are unchanged: Size S/M/L/XL, Color Black/White                                                                                                                      | Cleanup rule §10            |
| P-29 | Boundaries                                | `POST /admin/products`                                                                                                                  | no options → 400 `invalid_data` "Product options are not provided for: […]"; 1×1 → 200 (1 variant); price 0 → 200; **price −1 → 200**; title 5,033 chars (with options) → 200, stored length 5033                                                                                               | X03; negative = observation |
| P-30 | Malformed bodies                          | `{title:123}`; body `{not json`                                                                                                         | 400 `invalid_data` "Invalid request: Expected type: 'string' for field 'title', got: '123'"; 400 `invalid_data` "Expected property name or '}' in JSON at position 1 …"; no stack                                                                                                               | X02                         |
| P-31 | Unknown ids                               | `GET /admin/products/prod_P1PROBEDOESNOTEXIST`; `GET` and `POST …/cancel` on `order_P1PROBEDOESNOTEXIST`                                | 404 `not_found` "Product not found"; 404 `not_found` "Order id not found: order_…" ×2                                                                                                                                                                                                           | X02                         |

### Orders, totals, cancel

| #    | Step                  | Request / UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Observed run 1 / run 2                                                                                                                                                                                                                                                                                                                               | Verdict              |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| P-32 | Store order flow      | `POST /store/carts {region_id: Europe, email, sales_channel_id}` → `POST /store/carts/{id}/line-items {variant_id, quantity:2}` → `POST /store/carts/{id}` (shipping+billing address `de`) → `GET /store/shipping-options?cart_id=` → `POST /store/carts/{id}/shipping-methods` ("Standard Shipping") → `POST /store/payment-collections {cart_id}` → `POST /store/payment-collections/{id}/payment-sessions {provider_id:"pp_system_default"}` → `POST /store/carts/{id}/complete` | every step 200; shipping options "Standard Shipping:10", "Express Shipping:10"; providers `["pp_system_default"]`; complete → `{type:"order", order}`                                                                                                                                                                                                | Decision D3          |
| P-33 | Guest customer        | `GET /admin/customers?q=<email>`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | each cart email creates a customer `has_account:false`; `DELETE /admin/customers/{id}` → 200 `deleted:true`                                                                                                                                                                                                                                          | Cleanup §10          |
| P-34 | Totals (API)          | `GET /admin/orders/{id}` (default fields)                                                                                                                                                                                                                                                                                                                                                                                                                                           | status `pending`, payment `authorized`, fulfillment `not_fulfilled`, `eur`; `item_subtotal` 50, `item_total` 50, `shipping_subtotal` 10, `shipping_total` 10, `tax_total` 0, `discount_total` 0, `subtotal` 60, `original_total` 60, `total` 60; items `[{unit_price:25, quantity:2, total:50}]`; shipping `[{amount:10}]`; Σ arithmetic = total ✓   | Oracle §9            |
| P-35 | Order detail UI       | `/app/orders/{id}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | heading `#<display_id>` (h1); "Summary" (h2); label/value pairs "Item Subtotal €50.00", "Shipping Subtotal €10.00", "Tax Total €0.00", "Order Total €60.00", "Discount Total €0.00", "Total After Discount €60.00"; badges "Authorized" ×2, "Not fulfilled", "Pending"; **no `data-testid` in `main`**                                               | Locators §8          |
| P-36 | Orders list UI        | `/app/orders`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | table with columns Order/Date/Customer/Sales Channel/Payment/Fulfillment/Order Total; row link `#<display_id>`; amount "€ 60.00 EUR"                                                                                                                                                                                                                 | Pass                 |
| P-37 | UI cancel             | first `[aria-haspopup=menu]` button in `main` (**no accessible name**) → menuitem "Cancel" → alertdialog "Are you sure?" ("You are about to cancel the order #N…") → button "Continue"                                                                                                                                                                                                                                                                                              | `POST /admin/orders/{id}/cancel 200` (only non-GET); toast "Order canceled successfully" (`LI` without role inside region `/^Notifications/`); `main` exact "Canceled" count 0 → **4**, "Authorized" 2 → **0**, same after reload; API `status:"canceled"`, `payment_status:"canceled"`, `canceled_at` set. Checked 4 times (run 1, run 2, st1, st2) | Pass; F-05b          |
| P-38 | API cancel            | `POST /admin/orders/{id}/cancel`; then again                                                                                                                                                                                                                                                                                                                                                                                                                                        | 200 `order.status:"canceled"`; second → 400 `invalid_data` "Order with id … has been canceled."                                                                                                                                                                                                                                                      | Pass                 |
| P-39 | Order deletion        | `DELETE /admin/orders/{id}`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 404 HTML "Cannot DELETE" (no route). `POST /admin/orders/{id}/archive` → 200 `archived` for canceled orders                                                                                                                                                                                                                                          | Cleanup §10          |
| P-40 | Double cancel race    | `Promise.all` of 2× `POST …/cancel` on a fresh order                                                                                                                                                                                                                                                                                                                                                                                                                                | **both 200** (4 out of 4: run 1, run 2, race-a, race-b). Final `canceled`, payment `canceled`, 1 payment `canceled_at` set, refunds 0. Order changes **`credit_line:confirmed` + `credit_line:pending`**; a single cancel leaves only `credit_line:confirmed`                                                                                        | **PRODUCT BUG F-02** |
| P-41 | Cancel vs fulfil race | `Promise.all(cancel, POST /admin/orders/{id}/fulfillments {items, location_id: European Warehouse})`                                                                                                                                                                                                                                                                                                                                                                                | **both 200** (3 out of 3: run 2, race-a, race-b). Final **`status:"canceled"` and `fulfillment_status:"fulfilled"`**, 1 uncanceled fulfillment                                                                                                                                                                                                       | **PRODUCT BUG F-01** |
| P-42 | Controls              | sequential fulfil after cancel; sequential cancel after fulfil                                                                                                                                                                                                                                                                                                                                                                                                                      | 400 `invalid_data` "…has been canceled."; 400 `not_allowed` "All fulfillments must be canceled before canceling an order" (2 out of 2 each)                                                                                                                                                                                                          | Contract             |
| P-43 | Admin language        | `/app/settings/profile`, cookies, storage, `GET /admin/users/me?fields=metadata`                                                                                                                                                                                                                                                                                                                                                                                                    | language shown "English"; stored **client-side only**: cookie `lng` (SameSite Strict) + `localStorage.lng`; user metadata empty. Source `@medusajs/dashboard/dist/chunk-SGUYOGWH.mjs:15,35` (`lookupCookie: "lng"`)                                                                                                                                  | Batch 2 input        |

P-41/P-42 contract source: `@medusajs/core-flows@2.21.2/dist/order/workflows/cancel-order.js:36-48` (rejects canceled orders and any uncanceled fulfillment) and `create-fulfillment.js:43` (`throwIfOrderIsCancelled`). Neither workflow file takes a lock (grep "lock" finds nothing), so the check and the write race.

### Records the probe created and removed

- **Deleted by id (all 200):** every `P1-PROBE-…` product (API: 4 per API run plus race/order products; UI: 1 per UI run), their product-scoped options (soft-deleted with the product), every guest customer `p1-probe-…@qa.local`. Open fulfillments on probe orders were cancelled (3 × 200).
- **Cannot be deleted (no route, P-39):** **19 probe orders**, all `archived`, and their **19 completed carts** (`email ILIKE 'p1-probe-%'`).
- Final read-only SQL (2026-10-16): live products 0, live options 0, live customers 0, open fulfillments 0, orders 19 archived, carts 19, seeded products 4, any `P1-QA-` row 0.
- Medusa was left running (harness `down` was not called); Cal, Documenso and Twenty containers were not touched.

### Probe incident

During UI run 1 the aria snapshot after a wrong-password submit recorded the password textbox value: the real local admin password plus a trailing `x`. It was not repeated in chat and the saved file was deleted. All later snapshots scrub the password and email. It is a local harness test value. I recommend rotating it in the harness `.env` (harness-owned, Jayami's call). The same trap applies to P1: never attach an aria snapshot of the login form after filling it (§11).

## 3. Resolved decisions

- **D1 Admin email.** P1 never hard-codes it. `MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD` come from env only, required, no default. Locally P1's `.env` gets the same two values as the harness `.env`. The admin already exists with domain `test.com` (P-02), and P1 reads its own `.env` via `src/core/config.ts:3-7`, because the installed harness loads `.env` from `node_modules/qa-portfolio-harness/` (`config.ts:10`), which has none. In CI the job sets `MEDUSA_ADMIN_EMAIL=admin@qa.local` (the map's value) and a per-run random password. So the map's `admin@qa.local` holds in CI only, and the plan says so.
- **D2 Region: Europe / EUR**, country `de` for addresses. Evidence P-11: it is the only region with a payment provider (`pp_system_default`); the harness-seeded US region has `[]`, so a US cart cannot get a payment session. Europe is created by the fork's migration script (`apps/backend/src/migration-scripts/initial-data-seed.ts:38,103-106`), not by the harness. It matches the map's "region EUR".
- **D3 Order creation path:** store API (P-32), eight calls, with the publishable key read via `GET /admin/api-keys` (type publishable, not revoked, linked to "Default Sales Channel"), not from the DB. The line item is a **P1-QA product created per test** (`manage_inventory:false`, eur 25), never a seeded product, so seeded inventory is never reserved. P1-local helper `src/products/medusa/store-order.ts`. The map's "P2 helper" does not exist in this repo, and P1 takes no cross-repo dependency.
- **D4 Cancel route:** UI path P-37 for FW-004; API `POST /admin/orders/{id}/cancel` (P-38) for teardown and races. The status value is `"canceled"` (one L).
- **D5 Data prefix:** the map's `qa-<run>-…` becomes **`P1-QA-<P1_SEED>-<worker>-<leaf>`** (Twenty precedent `src/products/twenty/fixtures/names.ts:3-5`). Emails are the lowercase form `p1-qa-<seed>-<worker>-<leaf>@qa.local`. Product option titles get the prefix too, so they never touch the global "Size"/"Color" (P-24, P-28).
- **D6 Faker:** use the harness exports `fakeOrg`/`setFactorySeed` (`qa-portfolio-harness/src/index.ts`, `data/factories.ts:16-35`) as the Twenty names do. `@faker-js/faker` is only a transitive harness dependency (`package-lock.json:632,2201`), not a P1 dependency. No new dependency.
- **D7 FW-004 gets its own order** instead of sharing FW-003's. Tests stay independent and order-free under any worker count. Cost: about 1 s of store API calls.
- **D8 Storefront off:** `MEDUSA_SKIP_STOREFRONT=1` in P1 global setup and CI (`medusa.adapter.ts:1032-1035`). No batch-1 case uses it. This saves the storefront `next build` (76.6 s fresh, harness log 2026-10-15) and start (25.3 s here).
- **D9 Retries 0, CI workers 1** for Medusa projects. Retries 0 is the same flake-is-red policy as Twenty (`playwright.config.ts:251,267`). Workers 1 because the race cases must not share the server with another worker's traffic.
- **D10 Session cookie (review Q1, Jayami 2026-10-16):** a separate harness PR issues a non-secure session cookie **only when the base URL is http**, tagged `v0.2.10`. Jayami reviews it with CodeRabbit and merges it first. This batch then bumps the pin to `#v0.2.10` as its **one approved exception** to "no harness bump". Spoofing `X-Forwarded-Proto` or injecting cookies in P1 is rejected.
- **D11 Extras (review Q2):** X01–X05 accepted. X06 (a11y, Create Product dialog) moves to batch 2. The customer order-by-id access (P-19) is recorded as by design (O-02).
- **D12 Order residue (review Q3):** live leftovers must be 0. Archived orders and completed carts are only counted (informational). P1 never hard-deletes with SQL.
- **D13 Admin password (review Q4):** treat the local harness admin password as exposed (probe incident). Rotating it is a harness-side step before the build (§14 Step 0).
- **D14 a11y findings scope (review):** F-03…F-06b are **not** documented in this batch. As in Phases 1–3, a11y findings are recorded together with their own a11y test, so they go into batch 2 with X06. This batch's `medusa-known-issues.md` holds only F-01 and F-02.
- **D15 CI timeout (review):** `medusa-self-hosted` uses **60 minutes**, not 45. Cold pnpm install is unmeasured and a 238.7 s migrate was seen locally. Lower it later only from real step-summary numbers.

## 4. Goal and scope

**In:** P1-MED-FW-001…005 (map wording and IDs unchanged), the Medusa project pair `medusa-setup` → `medusa-chromium`, fixtures with by-id teardown, sweep and leak check, the CI job `medusa-self-hosted`, ADR 0018, README tables, and the accepted extras X01–X05 (§6, D11).

**Out (with reasons):**

- Batch 2 (carried, not built): P1-MED-I18N-001 German order page (input: P-43, admin language is the `lng` cookie/localStorage), P1-MED-I18N-002 long product title (input: P-29, 5,033 chars accepted), P1-MED-VIS-001 orders list baseline ×3 viewports, P1-MED-VIS-002 products API 500 state, P1-MED-VIS-003 slow API skeleton, plus **X06 a11y "Create Product dialog exposed to AT"** (F-03/F-04/F-05/F-06 belong in the a11y projects, ADR 0017 matching `**/a11y/**`).
- Batch 3: Twenty CSV import + 2FA. Batch 4: Twenty live updates/reconnect, TW-VIS-X07 Arabic RTL, making `e2e / visual` required.
- Storefront (D8). Stripe/Redis (off for P1). Tax with real rates (needs a seeded tax-rate change, and seeded data is read-only; R5).

## 5. Test-case mapping

| ID                                                            | File                                                                  | Project                          | Tags                               | Oracle (independent)                                                                                                                                                                                                                                                      | Cleanup                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| (setup) "API login writes reusable Medusa admin storageState" | `tests/setup/medusa.setup.ts`                                         | `medusa-setup`                   | `@medusa`, `@setup`                | session cookie `connect.sid` present in context after `POST /auth/session`                                                                                                                                                                                                | none (no data)                                                                                                  |
| P1-MED-FW-001 Admin API login → session storageState          | `tests/medusa/journeys/auth.spec.ts`                                  | `medusa-chromium` (storageState) | `@medusa`, `@auth`, `@smoke`; P0   | UI: heading "Orders" visible, Email textbox count 0, URL `/app/orders`. API oracle: `page.request` `GET /admin/users/me` (cookie only) → 200 and `user.email === MEDUSA_ADMIN_EMAIL`                                                                                      | none                                                                                                            |
| P1-MED-FW-005 Invalid login shows an error, no session        | same file, `test.use({ storageState: { cookies: [], origins: [] } })` | `medusa-chromium`                | `@medusa`, `@auth`; P1             | UI: "Invalid email or password" visible, Email `aria-invalid="true"`, URL still `/app/login`. Cookies: no `connect.sid`. API: `page.request GET /admin/users/me` → 401. Positive control: FW-001 and the setup prove that `connect.sid` is set on success in the same run | none                                                                                                            |
| P1-MED-FW-002 Create a product with variants via the UI       | `tests/medusa/journeys/products.spec.ts`                              | `medusa-chromium`                | `@medusa`, `@products`; P0         | UI: list row "4 variants", "Published". API oracle: `GET /admin/products?q=<title>` count 1, variants 4, option titles = {prefixed Size, prefixed Color} order-free, variant option combos = the 4 expected pairs                                                         | product id captured from the `POST /admin/products` response → `DELETE /admin/products/{id}` 200 `deleted:true` |
| P1-MED-FW-003 Order detail shows correct totals               | `tests/medusa/journeys/orders.spec.ts`                                | `medusa-chromium`                | `@medusa`, `@orders`, `@money`; P1 | Expected from helper inputs (25 × 2 + 10 + 0 = 60) **and** API (`item_subtotal`, `shipping_subtotal`, `tax_total`, `total`), plus arithmetic Σ unit_price×qty + Σ shipping amount + tax − discount = total. UI rows must equal `formatEur(api value)`                     | order: cancel → archive; product: DELETE; customer: DELETE                                                      |
| P1-MED-FW-004 Cancel order from the UI                        | same file                                                             | `medusa-chromium`                | `@medusa`, `@orders`, `@state`; P1 | UI before: "Canceled" 0, "Authorized" 2. After: toast "Order canceled successfully", "Canceled" 4, "Authorized" 0, same after reload. API: `status:"canceled"`, `payment_status:"canceled"`, `canceled_at` set                                                            | archive; product DELETE; customer DELETE                                                                        |
| X01–X05                                                       | `tests/medusa/api/contract.spec.ts`, `tests/medusa/api/races.spec.ts` | `medusa-chromium`                | `@medusa`, `@api` (+`@race`)       | §6                                                                                                                                                                                                                                                                        | §6                                                                                                              |

The UI E2E rule holds: setup (login, product, order) is API-only, and every Expected-column assertion goes through the UI. API reads are only the oracles the map names (FW-002 GET products, FW-003 totals, FW-004 status), plus FW-001/005's `/admin/users/me` as the session oracle.

## 6. Extra cases (accepted 2026-10-16, D11)

| ID                    | Technique                     | Probe evidence   | Assertions (oracle = documented contract or sequential behaviour)                                                                                                                                                                                                         | Expected                 |
| --------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| P1-MED-FW-X01         | Authz between key types (API) | P-15…P-18        | step "publishable key on admin" 401; step "pk as Bearer on admin" 401; step "admin token on store without key" 400 `not_allowed`; step "customer token on admin" 401. Each body `message` present, no `stack`                                                             | pass                     |
| P1-MED-FW-X02         | Error codes (API)             | P-10, P-30, P-31 | `{title:123}` 400 `invalid_data` with message naming `title`; invalid JSON 400 `invalid_data`; unknown product 404 `not_found`; unknown order cancel 404 `not_found`; garbage and tampered Bearer 401. No body contains `/\bat .+\.js:\d+/`                               | pass                     |
| P1-MED-FW-X03         | Boundaries (API)              | P-29             | no options → 400 `invalid_data`; 1×1 → 1 variant; price 0 → 200 and the stored price is 0; title of 5,000 chars after the prefix → 200 and stored length equals sent length. **Negative price is not asserted** (observation O-01: no documented Medusa contract to cite) | pass                     |
| P1-MED-FW-X04         | Race: double cancel           | P-40 (4/4)       | hard first (working path): final `status` canceled, exactly 1 payment with `canceled_at`, refunds 0. Then evidence. Then `test.fail`: statuses sorted equal `[200, 400]` and the second body `type:"invalid_data"`, and order changes contain no `pending` entry          | **expected fail** (F-02) |
| P1-MED-FW-X05         | Race: cancel vs fulfil        | P-41 (3/3), P-42 | hard first: both calls answered (status ∈ {200,400}), order readable. Then evidence. Then `test.fail`: NOT (`status === "canceled"` AND an uncanceled fulfillment exists)                                                                                                 | **expected fail** (F-01) |
| ~~X06~~               | a11y: dialog hidden from AT   | P-22, P-23       | carried to batch 2 (a11y projects)                                                                                                                                                                                                                                        | –                        |
| ~~customer IDOR~~     | `/store/orders/{id}` by id    | P-19             | **dropped**: by design per source (`store/orders/middlewares.js:51-57`); recorded as observation O-02 in ADR 0018                                                                                                                                                         | –                        |
| ~~max option values~~ | boundary                      | not probed       | **dropped**: no probe result                                                                                                                                                                                                                                              | –                        |

Race cases can, in principle, stop reproducing on a different runner. In that case `test.fail` passes unexpectedly and the run is red, which is the honest signal (Phase 2e precedent, task3 §8). Never loosen the assertion.

## 7. Architecture (every file touched, one responsibility each)

New:

| Path                                             | Responsibility                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/products/medusa/env.ts`                     | `loadMedusaConfig()`, 127.0.0.1 guards (base and DB URL), required admin env, `MEDUSA_ROUTES`, `MEDUSA_TIMEOUTS`, auth-state path                            |
| `src/products/medusa/money.ts`                   | `formatEur(amount)`, `expectedOrderTotals(input)`, `sumOrderArithmetic(order)` (pure)                                                                        |
| `src/products/medusa/names.ts`                   | `medusaQaPrefix`, `medusaQaTitle`, `medusaQaEmail`, `medusaQaOptionTitle` (pure + harness faker)                                                             |
| `src/products/medusa/admin-api.ts`               | typed Admin API client over `APIRequestContext` (login, session, products, orders, customers, keys, fulfillments); errors carry method, path and status only |
| `src/products/medusa/store-order.ts`             | `createStoreOrder()`: the eight store calls of P-32, each status-asserted                                                                                    |
| `src/products/medusa/fixtures.ts`                | `test` with `factorySeed` (worker, auto), `medusaAdmin` (token client), `medusaQa` (create product/order, capture ids, aggregated teardown)                  |
| `src/products/medusa/sweep.ts`                   | `sweepMedusaQaRecords(prefix)` (API, by listed id) and `countMedusaQaLeaks()` (read-only SQL)                                                                |
| `src/products/medusa/known-issues.ts`            | issue strings `MED_FW_X04_DOUBLE_CANCEL_ISSUE`, `MED_FW_X05_CANCEL_FULFIL_ISSUE`                                                                             |
| `src/products/medusa/pages/login.page.ts`        | `/app/login` form                                                                                                                                            |
| `src/products/medusa/pages/orders.page.ts`       | `/app/orders` list                                                                                                                                           |
| `src/products/medusa/pages/order-detail.page.ts` | `/app/orders/{id}` summary rows, status texts, cancel flow                                                                                                   |
| `src/products/medusa/pages/products.page.ts`     | `/app/products` list + Create Product dialog                                                                                                                 |
| `global-setup/medusa.ts`                         | health → `up()` if needed (storefront skipped) → `seed()` (timed, step summary) → local sweep                                                                |
| `global-teardown/medusa.ts`                      | local sweep (skipped on `CI`)                                                                                                                                |
| `tests/setup/medusa.setup.ts`                    | API login → session → storageState                                                                                                                           |
| `tests/medusa/journeys/auth.spec.ts`             | FW-001, FW-005                                                                                                                                               |
| `tests/medusa/journeys/products.spec.ts`         | FW-002                                                                                                                                                       |
| `tests/medusa/journeys/orders.spec.ts`           | FW-003, FW-004                                                                                                                                               |
| `tests/medusa/api/contract.spec.ts`              | X01, X02, X03                                                                                                                                                |
| `tests/medusa/api/races.spec.ts`                 | X04, X05                                                                                                                                                     |
| `scripts/count-medusa-qa-leaks.mts`              | sweep + SQL counts, JSON output, step summary, exit code                                                                                                     |
| `tests/unit/medusa-env.spec.ts`                  | URL guards and required env                                                                                                                                  |
| `tests/unit/medusa-money.spec.ts`                | formatting and arithmetic                                                                                                                                    |
| `docs/adr/0018-medusa-ci.md`                     | ADR                                                                                                                                                          |
| `docs/observations/medusa-known-issues.md`       | F-01 and F-02 only (D14)                                                                                                                                     |
| `docs/plans/2026-10-16-phase4-batch1-medusa.md`  | this plan                                                                                                                                                    |

Modified:

| Path                                     | Change                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts`                   | `MEDUSA_PROJECT_NAMES`, `runsMedusa`, `./global-setup/medusa.ts`, teardown pushed beside Twenty's (both are allowed: `globalTeardown` takes an array, like `globalSetup` at line 174), projects `medusa-setup` and `medusa-chromium` (`testIgnore: VISUAL_A11Y_IGNORE`, `retries: 0`) |
| `src/core/projects.ts`                   | `NPM_SCRIPT_PROJECTS["test:medusa"] = ["medusa-chromium"]` (lines 2-15)                                                                                                                                                                                                               |
| `package.json`                           | script `"test:medusa": "playwright test --project=medusa-chromium"`                                                                                                                                                                                                                   |
| `tests/unit/playwright-projects.spec.ts` | `ALL` gains the two Medusa names; two tests (npm `test:medusa` inference; `--project=medusa-chromium` selects nothing else)                                                                                                                                                           |
| `.env.example`                           | `MEDUSA_BASE_URL`, `MEDUSA_DB_URL`, `MEDUSA_ADMIN_EMAIL`, `MEDUSA_ADMIN_PASSWORD` (empty), comments                                                                                                                                                                                   |
| `.github/workflows/e2e.yml`              | input, `changes.medusa`, job `medusa-self-hosted`, `visual` gate `needs` + `check medusa`                                                                                                                                                                                             |
| `.github/workflows/p1-e2e.yml`           | nightly-alert `MEDUSA_MD`                                                                                                                                                                                                                                                             |
| `README.md`                              | scope line, Medusa run section, implemented cases, known bugs, carried table                                                                                                                                                                                                          |
| `package.json` harness pin               | `#v0.2.10` (D10, the one approved exception)                                                                                                                                                                                                                                          |

Not changed: forks, harness, Cal/Documenso/Twenty specs and jobs, visual projects (Medusa specs live outside `visual/`, `a11y/`, `i18n/`, so visual `--list` stays 41/23).

## 8. Locators per page object (from the probe)

Semantic first. Every exception is an `eslint-disable-next-line <rule> -- <reason + finding id>` comment inside the page object only, never in a spec (precedent `src/products/cal/pages/availability.page.ts:99`, `src/products/documenso/pages/signing.page.ts:22`).

**MedusaLoginPage** (`/app/login`; P-06, P-09)

- `heading`: `getByRole("heading", { name: "Welcome to Medusa", level: 1 })`
- `email`: `getByRole("textbox", { name: "Email" })`
- `password`: `getByPlaceholder("Password")`. Exception: the password textbox has no accessible name (probe P-06/P-09; finding logged in batch 2).
- `submit`: `getByRole("button", { name: "Continue with Email" })`
- `error`: `getByText("Invalid email or password", { exact: true })`. No role exists (probe P-09; finding logged in batch 2).

**MedusaOrdersPage** (`/app/orders`; P-36)

- `heading`: `getByRole("heading", { name: "Orders", level: 1 })`
- `orderLink(displayId)`: `getByRole("link", { name: \`#${displayId}\`, exact: true })`

**MedusaOrderDetailPage** (`/app/orders/{id}`; P-35, P-37)

- `heading(displayId)`: `getByRole("heading", { name: \`#${displayId}\`, level: 1 })`
- `main`: `getByRole("main")`
- `summaryHeading`: `main.getByRole("heading", { name: "Summary", level: 2 })`
- `totalRow(label)`: `main.locator("div").filter({ has: page.getByText(label, { exact: true }) }).filter({ hasText: /€\s?\d/ }).last()`. Exception (`no-raw-locators`, `no-nth-methods`): rows are bare `div`/`p` pairs with no roles or test ids (P-35). In document order the innermost `div` holding both the label and a € value is the last match. This works for all four rows (Item Subtotal `p`, Shipping Subtotal `span` in `div` in `p`, Tax Total `span`, Order Total `p`).
- `statusText(text)`: `main.getByText(text, { exact: true })` (counts: "Canceled", "Authorized")
- `actionsMenuButton`: `main.locator("[aria-haspopup=menu]").first()`. Exception: the header trigger has no accessible name (probe P-37; finding logged in batch 2). It is the first of 4 menu triggers in `main` (P-37, 2 out of 2).
- `cancelMenuItem`: `page.getByRole("menuitem", { name: "Cancel" })`
- `confirmDialog`: `page.getByRole("alertdialog", { name: "Are you sure?" })`; `confirmButton`: `confirmDialog.getByRole("button", { name: "Continue" })`
- `toast(text)`: `page.getByRole("region", { name: /^Notifications/ }).getByText(text)`

**MedusaProductsPage** (`/app/products`; P-22…P-27)

- `heading`: `getByRole("heading", { name: "Products", level: 1 })`
- `createLink`: `getByRole("link", { name: "Create" })`
- `gotoSearch(title)`: `/app/products?q=<encoded title>`
- `row(title)`: `getByRole("row", { name: new RegExp(\`^${escapeRegExp(title)} \`) })`; `row.getByRole("cell", { name: "4 variants" })`, `row.getByRole("cell", { name: "Published" })`
- `dialog`: `getByRole("dialog", { name: "Create Product", includeHidden: true }).last()`. Exception (`no-nth-methods`): two identical aria-hidden dialogs (probe P-22; finding logged in batch 2 with X06). **The accessible name "Create Product" is not verified via `getByRole`.** The DOM shows `aria-labelledby` pointing at text "Create Product" (P-22). Build step 5 checks it first; if `count()` is 0, stop and report.
- `title`: `dialog.getByLabel("Title", { exact: true })`
- `variantsSwitch`: `dialog.getByRole("switch", { name: "Yes, this is a product with variants", includeHidden: true })`. The name is not verified via `getByRole` (DOM label text P-23); same stop rule.
- `optionPicker`: `dialog.getByRole("combobox", { includeHidden: true })`. Unnamed (probe P-23). It is the only combobox on the Details tab.
- `createOption(name)`: `page.getByRole("option", { name: \`Create "${name}"\`, includeHidden: true })`, then `optionPicker.press("Tab")`(never`Escape`, P-24)
- `emptyValuesInput`: `dialog.getByPlaceholder("Red, Blue, Green")` (only the empty one has a placeholder; probe P-23/P-24: the label is not associated). Type each value with `page.keyboard.type(value)` + `press("Enter")`.
- `continueButton`: `dialog.getByRole("button", { name: "Continue", includeHidden: true })`; `publishButton`: `…{ name: "Publish", includeHidden: true }`
- `tab(name)`: `dialog.getByRole("tab", { name, includeHidden: true })`, asserted `toHaveAttribute("data-state", "active")` (P-25 `state=active`)

`includeHidden: true` is itself the workaround for the aria-hidden dialogs (P-22) and is commented as such.

## 9. Oracle design

- **FW-002:** the expected variant set is computed from the inputs (`[S,M] × [Red,Blue]`), never read from the UI. The API (`GET /admin/products?q=`, P-21) must return `count === 1`, `variants.length === 4`, and the set of `variant.options` value pairs equal to the computed set. Compare as sorted strings because option order is not stable (P-21). The UI must show the row with "4 variants" and "Published".
- **FW-003:** two independent sources.
  1. Helper `expectedOrderTotals({ unitPrice: 25, quantity: 2, shipping: 10, tax: 0 })` gives `{ itemSubtotal: 50, shippingSubtotal: 10, taxTotal: 0, total: 60 }`. The inputs are the fixture's own price and the shipping amount read from the store `shipping-options` response.
  2. API `GET /admin/orders/{id}` fields `item_subtotal`, `shipping_subtotal`, `tax_total`, `discount_total`, `total`, `*items`, `*shipping_methods`. Assert API equals helper, and `Σ unit_price×quantity + Σ shipping amount + tax_total − discount_total === total`.
  3. The UI rows "Item Subtotal", "Shipping Subtotal", "Tax Total", "Order Total" must have text matching `^<label>\s*<formatEur(apiValue)>$`.
  - UI labels map to API fields by name: Item Subtotal ↔ `item_subtotal`, Shipping Subtotal ↔ `shipping_subtotal`, Tax Total ↔ `tax_total`, Order Total ↔ `total`. They are equal to the `*_total` fields here only because tax is 0 (P-34).
- **FW-004:** UI before/after counts (P-37), plus API `status`/`payment_status`/`canceled_at`.
- **FW-001/005:** `/admin/users/me` status and email through `page.request`, which shares the browser cookie jar.
- **Formatting:** `formatEur(n)` = `new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(n)` must give `€50.00`, `€10.00`, `€0.00`, `€60.00`. A unit test pins these strings to the probe text (P-35).
- **X04/X05:** the oracle is the sequential contract (P-42, `cancel-order.js:36-48`, `create-fulfillment.js:43`).

## 10. Test data, isolation, cleanup and leak check

- Prefix (D5): `P1-QA-<P1_SEED>-<parallelIndex>`. Product title `<prefix>-<leaf>`, option titles `<prefix>-Size` / `<prefix>-Color`, cart email `<prefix lowercased>-<leaf>@qa.local`.
- **Fixture teardown** (`runMedusaQaCleanup`, modelled on `src/products/twenty/fixtures/index.ts:79-139`). Each step is in its own try/catch, failures are pushed to an array, and one `AggregateError` is thrown at the end, after the test error if any:
  1. For each captured order id: `GET status,*fulfillments` → `POST …/fulfillments/{fid}/cancel` for every uncanceled fulfillment (expect 200) → if not canceled, `POST …/cancel` (expect 200) → if not archived, `POST …/archive` (expect 200, `order.status === "archived"`).
  2. For each captured product id: `DELETE /admin/products/{id}` (expect 200 and `deleted === true`). This soft-deletes product-scoped options too (P-28).
  3. For each captured customer id (from the completed order's email via `GET /admin/customers?q=<email>`, exact email match): `DELETE /admin/customers/{id}` (expect 200, `deleted === true`).
- **Local sweep** (`sweepMedusaQaRecords("P1-QA-")`, in global setup and teardown when `!CI`, as in `global-setup/twenty.ts:85-91`): list by prefix via the API (`/admin/products?q=P1-QA-`, `/admin/orders?q=p1-qa-` with `fields=status,*fulfillments`, `/admin/customers?q=p1-qa-`), then the same by-id steps. It paginates with `limit=100`/`offset` until fewer than `limit` come back, bounded at 100 pages (Twenty's `MAX_PAGES` idea, `sweep.ts:9`).
- **Leak check** `scripts/count-medusa-qa-leaks.mts`: runs the sweep, then read-only SQL via the harness `createPgClient(MEDUSA_DB_URL)`:
  - `SELECT count(*)::int FROM product WHERE title ILIKE 'P1-QA-%' AND deleted_at IS NULL` → `products` (must be 0)
  - `SELECT count(*)::int FROM product_option WHERE title ILIKE 'P1-QA-%' AND deleted_at IS NULL` → `options` (must be 0)
  - `SELECT count(*)::int FROM customer WHERE email ILIKE 'p1-qa-%' AND deleted_at IS NULL` → `customers` (must be 0)
  - `SELECT count(*)::int FROM "order" WHERE email ILIKE 'p1-qa-%' AND status <> 'archived'` → `liveOrders` (must be 0)
  - `SELECT count(*)::int FROM fulfillment f JOIN order_fulfillment ofu ON ofu.fulfillment_id = f.id JOIN "order" o ON o.id = ofu.order_id WHERE o.email ILIKE 'p1-qa-%' AND f.canceled_at IS NULL` → `openFulfillments` (must be 0)
  - Informational (P-39: no delete route): `archivedOrders` = `… status = 'archived'`, `carts` = `SELECT count(*)::int FROM cart WHERE email ILIKE 'p1-qa-%'`. Printed and added to the step summary, never failing; same treatment as Documenso's `P7-OBS-DOC-FW-005` leftovers (`scripts/count-documenso-qa-leaks.mts:11-38`). Locally `MEDUSA_DOWN_VOLUMES=1` + `down` resets them (harness-owned, `medusa.adapter.ts:1090-1108`). CI runners are ephemeral.
  - Exit 1 if any must-be-0 count is > 0. On `schedule` only (`P1_MEDUSA_SWEEP_FAIL_ON_BEFORE=1`) also fail on `before > 0`, as in ADR 0016.
  - Every query was run read-only in the probe with the `p1-probe` pattern. Results are in §2 "Records".
- Seeded data (4 Featured products, QA10, customer@test.com, regions, global options, key) is only read. Orders always use the per-test P1-QA product (D3).

## 11. Known-bug handling (proof process)

| Finding    | What                                                                                                                                                                                                                                   | Label                         | Evidence (2 separate runs)        | Standard / contract                                                                               | Handling                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01       | Concurrent cancel + fulfil leaves an order canceled **and** fulfilled                                                                                                                                                                  | **PRODUCT BUG**               | P-41: run 2, race-a, race-b (3/3) | Medusa's own rules: `cancel-order.js:36-48`, `create-fulfillment.js:43`; sequential controls P-42 | X05: hard asserts, `attachKnownBugEvidence`-style JSON via `serializeKnownBugEvidence` (API test, no page, as in Documenso 2FA-006, task3 plan §5), then an unconditional `test.fail(true, MED_FW_X05_CANCEL_FULFIL_ISSUE)`, then the strict assertion |
| F-02       | Concurrent double cancel: two 200s and a dangling pending credit-line change                                                                                                                                                           | **PRODUCT BUG**               | P-40: 4/4                         | sequential contract P-38 (second cancel 400 "has been canceled"), `order-validation.js:11-13`     | X04, same pattern, `MED_FW_X04_DOUBLE_CANCEL_ISSUE`                                                                                                                                                                                                    |
| F-03…F-06b | a11y: duplicate aria-hidden Create Product dialog (P-22), unnamed option picker (P-23), unassociated values label (P-23/P-24), unnamed order menu trigger (P-37), login error not announced (P-09), unnamed password field (P-06/P-09) | a11y findings                 | probe rows, 2 runs each           | WCAG 4.1.2 / 1.3.1 / 4.1.3                                                                        | **not documented in this batch** (D14); logged in batch 2 with X06                                                                                                                                                                                     |
| R1         | Session cookie never issued on http                                                                                                                                                                                                    | **ENVIRONMENT / harness gap** | P-04…P-06 ×2                      | Medusa production config requires TLS (`express-loader.js:23-34`)                                 | not a product bug; harness PR (Q1)                                                                                                                                                                                                                     |
| O-01       | Negative variant price accepted                                                                                                                                                                                                        | Observation                   | P-29 ×2                           | no documented contract                                                                            | ADR note only                                                                                                                                                                                                                                          |
| O-02       | Order readable by id without auth                                                                                                                                                                                                      | Observation (by design)       | P-19 ×2                           | `store/orders/middlewares.js:51-57`                                                               | ADR note only                                                                                                                                                                                                                                          |

Rules carried from Phases 1–3:

- `test.fail` appears only after the working-path asserts, is unconditional and is scoped to its own test. The evidence is attached before the strict assertion.
- At build time, X04/X05 must fail the same way in **both** local runs (§15) before `test.fail` is kept. If either does not reproduce, stop and report. Never loosen the assertion.
- Never attach `ariaSnapshot()` of a filled login form (probe incident). FW-005 attaches nothing extra.

## 12. CI job design (`medusa-self-hosted` in `.github/workflows/e2e.yml`)

- **Input:** `medusa_self_hosted_timeout_minutes` (number, default **60**, D15), same pattern as lines 23-34.
- **Path filter:** `changes` gains output `medusa` (non-PR always `true`, lines 102-105) and
  `med_re='^(tests/medusa/|tests/setup/medusa\.setup\.ts|src/products/medusa/|global-setup/medusa\.ts|global-teardown/medusa\.ts|scripts/count-medusa-qa-leaks\.mts|src/core/|playwright\.config\.ts|package\.json|package-lock\.json|\.github/workflows/|\.github/actions/)'` (pattern of lines 108-115).
- **Job:** `medusa-self-hosted`, `name: medusa-self-hosted`, `needs: [structural, changes]`, `runs-on: ubuntu-24.04`, `timeout-minutes: ${{ inputs.medusa_self_hosted_timeout_minutes }}`, `if: needs.changes.outputs.medusa == 'true' && inputs.visual_product == '' && !inputs.visual_only`. `visual_product`/`visual_only` appear only in `if:` expressions; **no free-text input reaches `run:`** (CodeQL lesson).
- **Outputs:** `visual: ${{ steps.visual.outcome }}` (empty: no such step yet) and `visual_requested: ${{ steps.visual_requested.outputs.requested }}`. The first step writes `requested=false` unconditionally, with a comment "flips in batch 2".
- **Gate:** `visual` job `needs` gains `medusa-self-hosted`, plus env `MED_RESULT`, `MED_VISUAL`, `MED_REQUESTED` and `check medusa …`. Line 1649: a skipped job → "job skipped". Lines 1650-1653: visual empty falls through. Lines 1655-1656: `requested == false` → "visual not requested". So the gate stays green with no Medusa visual suite, and a Medusa job failure does not affect `e2e / visual`.
- **Env (job):** `P1_WORKING_DIRECTORY: p1`, `PRODUCTS_ROOT: ${{ github.workspace }}/products`, `MEDUSA_REF: f677db438f27294fc50e4c7c6612e71ff38eeff5` (workflow-level, beside `TWENTY_REF` line 72), `MEDUSA_E2E_BASE_URL: http://127.0.0.1:9000`, `MEDUSA_E2E_DB_URL: postgres://medusa:medusa@127.0.0.1:5433/medusa` (public harness default, `config.ts:38-43`), `MEDUSA_ADMIN_EMAIL: admin@qa.local`, `MEDUSA_SKIP_STOREFRONT: "1"`.
- **Steps in order:**
  1. `visual_requested` (false).
  2. Checkout P1 → `p1/` (`persist-credentials: false`).
  3. Checkout `Jayami123/medusa-dtc-starter` at `MEDUSA_REF` → `products/medusa-dtc-starter`, then verify HEAD (lines 1268-1284 pattern).
  4. Stub `products/{cal,documenso,twenty-CRM}` (line 1289 pattern).
  5. `setup-p1` (Node from `.nvmrc` = `22`, which satisfies `>=22.22.0`).
  6. `corepack enable && corepack prepare pnpm@10.11.1 --activate`, then assert `pnpm --version` = `10.11.1` (harness `assertMedusaPnpmVersion`, `medusa-env.ts:10,82`).
  7. Hash `pnpm-lock.yaml`. Restore the pnpm store cache key `${{ runner.os }}-medusa-pnpm-${MEDUSA_REF}-${hash}` (path `$(pnpm store path)`, recorded to `$GITHUB_ENV` first).
  8. `pnpm install --frozen-lockfile` in the fork (adapter message `medusa.adapter.ts:221-225`).
  9. Restore the build cache key `${{ runner.os }}-medusa-build-${MEDUSA_REF}`, path `apps/backend/.medusa/server`. The harness skips `medusa build` when `harness-build.json` matches HEAD (`medusa.adapter.ts:325-337`).
  10. `playwright-browsers` (Chromium only).
  11. **Generate CI admin password:** `pw="$(openssl rand -hex 16)"; echo "::add-mask::${pw}"; echo "MEDUSA_ADMIN_PASSWORD=${pw}" >> "$GITHUB_ENV"`. No literal password in the repo.
  12. **Start Medusa (timed)** `id: medusa_up`: `node node_modules/qa-portfolio-harness/scripts/up.mjs medusa` with the `UP_START/SECONDS/UP_END` block of lines 1330-1349 → step summary + `MEDUSA_UP_SECONDS`.
  13. **Run Medusa E2E** (`if: steps.medusa_up.outcome == 'success'`, two variants as lines 1370-1401): `PW_WORKERS: "1"`, `npm run test:medusa -- --retries=0`; on schedule/matrix also `P1_PW_REPORT_ID: medusa-chromium`. `globalSetup` seeds (admin user via CLI) and appends the seed timing.
  14. Job summary (line 1403-1413 pattern).
  15. Merge blob → `playwright-report-medusa` (lines 1415-1436).
  16. Count leaks: `if: always() && !cancelled() && steps.medusa_up.outcome == 'success'`, `npx tsx scripts/count-medusa-qa-leaks.mts`, `P1_MEDUSA_SWEEP_FAIL_ON_BEFORE` on schedule.
  17. Redact the server log, `if: always()`: source `p1/node_modules/qa-portfolio-harness/.harness/medusa-backend.log` (`medusa.adapter.ts:120-122`), `sed` with Documenso's patterns (lines 1196-1199) plus `-e 's/pk_[A-Za-z0-9_-]+/pk_(redacted)/g'` → `medusa-backend-redacted.log`.
  18. `always()` `down.mjs medusa`.
  19. `!cancelled()` uploads `playwright-report-medusa`, `playwright-test-results-medusa-chromium` (gated on `medusa_up` success); `always()` upload `medusa-server-log` (retention 14).
  20. Save the pnpm store and build caches only `if: github.event_name == 'push' && github.ref == 'refs/heads/main' && cache-hit != 'true'`; build save also needs `hashFiles('…/.medusa/server/harness-build.json') != ''` (line 1226-1230 pattern).
- **Nightly alert:** `p1-e2e.yml` line 94 pattern: `MEDUSA_MD="$(browser_summary results-medusa-chromium.json medusa-chromium)"`, appended to the issue body.
- **Timeout arithmetic (60 min, D15):**
  - pnpm install cold: **not measured anywhere**; budget 6 min.
  - `medusa build`: 70.6–94.9 s fresh (harness logs `live-up-fresh.log`, `medusa-build-measure.log`, 2026-10-15); budget 2 min.
  - `db:migrate`: 29.1–38.7 s fresh (harness logs) and 238.7 s warm here on a loaded host; budget 4 min.
  - Boot: 10.1 s fresh (harness log), 78.6 s here; budget 1.5 min.
  - Seed: 0.392 s warm here; fresh not measured; budget 1 min.
  - Browsers: their own 10-min cap.
  - Tests: about 3 min (not measured; 10 tests).
  - Worst case is about 27.5 min. 60 gives about 2.2× headroom, because cold pnpm install is unmeasured and a 238.7 s warm migrate was seen locally. Lower it later only from real step-summary numbers, recorded in ADR 0018.
  - Raise only with the step-summary numbers of a failed run, recorded in ADR 0018.

## 13. Risks and unknowns (each with a probe)

| #   | Risk                                                                                            | Probe / evidence                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Blocker:** no session cookie on http, so admin UI login and storageState cannot work          | P-04…P-06 (2/2), source `express-loader.js:31-34` | Harness PR `v0.2.10` (D10). The proposed change is for the harness owner: write `cookieOptions: { secure: false, sameSite: "lax" }` into the runtime `medusa-config.js` when `MEDUSA_BASE_URL` is `http:` (`renderServerMedusaConfigJs`, `medusa-env.ts:233-298`, always written at `medusa.adapter.ts:993`). P1 does **not** spoof `X-Forwarded-Proto` (that was probe-only). |
| R2  | Duplicate aria-hidden dialog (P-22) changes with Medusa versions                                | P-22                                              | Pinned fork SHA; `includeHidden` + `.last()` documented; if the count becomes 1, the `.last()` still resolves                                                                                                                                                                                                                                                                  |
| R3  | Races stop reproducing on the CI runner                                                         | P-40/P-41 local only                              | Red via unexpected pass, as designed; do not retry or loosen                                                                                                                                                                                                                                                                                                                   |
| R4  | Option order unstable                                                                           | P-21 (run 1 vs run 2)                             | Order-free comparisons only                                                                                                                                                                                                                                                                                                                                                    |
| R5  | Tax is always 0 (no rates), so the tax oracle is weak                                           | P-12                                              | Arithmetic still includes `tax_total`; changing seeded tax rates is forbidden; noted in ADR 0018                                                                                                                                                                                                                                                                               |
| R6  | Archived orders and carts accumulate locally                                                    | P-39                                              | Informational counts; harness `MEDUSA_DOWN_VOLUMES=1` resets                                                                                                                                                                                                                                                                                                                   |
| R7  | `pnpm install` cold time unknown                                                                | none (not measured)                               | Timed in the CI summary; timeout raised only with that number                                                                                                                                                                                                                                                                                                                  |
| R8  | Warm migrate took 238.7 s with three other stacks running                                       | up log here                                       | CI has no other stacks; budget 4 min                                                                                                                                                                                                                                                                                                                                           |
| R9  | Accessible names "Create Product" (dialog) and the switch name are not verified via `getByRole` | P-22/P-23 (DOM text only)                         | Build step 5 checks them with `count()` before writing the page object; on 0, stop and report                                                                                                                                                                                                                                                                                  |
| R10 | Local admin password appeared in probe output                                                   | probe incident                                    | Never snapshot filled login forms; rotation is Jayami's call                                                                                                                                                                                                                                                                                                                   |

## 14. Build steps (start only after harness `v0.2.10` is merged and tagged, D10)

Commands are run in Git Bash from the repo root. After each step, if the output differs from the expected output: **stop and report** (paste the output). Do not improvise.

### Step 0. Branch and plan commit

- `git checkout main && git pull --ff-only && git rev-parse HEAD` → expect `962ed49ed768fa1b14edecd5d3347f5c0bfbeeee`. If different: stop.
- `git checkout -b feat/2026-10-16-p1-phase4-batch1-medusa`
- Save this plan as `docs/plans/2026-10-16-phase4-batch1-medusa.md`, `npx prettier --write` it, commit `docs(plan): phase 4 batch 1 medusa foundation`.
- Prerequisites, checked before any code: harness `v0.2.10` is tagged on `Jayami123/qa-portfolio-harness` (`git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness.git v0.2.10` prints one line), and the harness admin password was rotated (D13) with the same value copied into P1's `.env`. If either is missing: stop.
- Bump the pin: `npm install github:Jayami123/qa-portfolio-harness#v0.2.10`, then `git diff package.json package-lock.json` shows only the pin. Commit `chore(deps): bump qa-portfolio-harness to v0.2.10`. Then re-run P-04 (session cookie present on plain http). If it's still absent: stop.

### Step 1. Env, names and money (pure)

`src/products/medusa/env.ts` skeleton:

```
export const MEDUSA_ROUTES = { health: "/health", login: "/app/login", orders: "/app/orders",
  order: (id) => `/app/orders/${id}`, products: "/app/products",
  authEmailpass: "/auth/user/emailpass", authSession: "/auth/session", usersMe: "/admin/users/me" } as const;
export const MEDUSA_TIMEOUTS = { request: 30_000, page: 30_000, test: 120_000, expect: 15_000,
  navigation: 60_000, action: 30_000, upDeadline: 900_000, healthPoll: 5_000 } as const;
export interface MedusaE2EConfig { baseUrl; dbUrl; adminEmail; adminPassword; productsRoot; authStatePath /* .auth/medusa-admin.json */ }
export function resetMedusaConfigCache(): void
export function assertMedusaBaseUrl(raw: string): string   // hostname must be 127.0.0.1 (message as twenty env.ts:72-85)
export function assertMedusaDbUrl(raw: string): string     // postgres/postgresql + 127.0.0.1
export function loadMedusaConfig(): MedusaE2EConfig       // defaults http://127.0.0.1:9000 and postgres://medusa:medusa@127.0.0.1:5433/medusa;
                                                           // MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD via collectMissingEnv + failOnMissingEnv (src/core/config.ts:13-23); writes back process.env like twenty env.ts:110-115
export function medusaBaseUrlFromEnv(): string
export function medusaAuthStatePath(): string             // repoRoot()/.auth/medusa-admin.json; needs no env, so config load and --list never require credentials
```

`src/products/medusa/names.ts`: `medusaQaPrefix(seed, worker)` → `P1-QA-${seed}-${worker}`; `medusaQaTitle(prefix, leaf?)` (leaf default `fakeOrg().name`); `medusaQaOptionTitle(prefix, name)`; `medusaQaEmail(prefix, leaf)` → lowercase `${prefix}-${leaf}@qa.local` with non-`[a-z0-9-]` characters replaced by `-`.
`src/products/medusa/money.ts`: `formatEur(amount: number): string`; `expectedOrderTotals({unitPrice, quantity, shipping, tax}) → {itemSubtotal, shippingSubtotal, taxTotal, total}`; `orderArithmeticTotal(order) → number` (Σ items + Σ shipping amounts + tax − discount).

Unit tests (new):

- `tests/unit/medusa-env.spec.ts`, 3 tests, tag `@unit`:
  - "rejects localhost base url"
  - "rejects non-127.0.0.1 db url"
  - "fails when admin email or password is missing"
- `tests/unit/medusa-money.spec.ts`, 3 tests:
  - "formats probe amounts" (`€50.00`, `€10.00`, `€0.00`, `€60.00`)
  - "computes expected totals 25×2+10+0=60"
  - "arithmetic matches the probe order shape"

Command: `npm run test:unit -- --grep "medusa"` → **6 passed**.

### Step 2. Admin API and store order

`src/products/medusa/admin-api.ts` skeleton (every method asserts its expected status with `expect(res.status(), "<METHOD path>").toBe(n)`; it never logs bodies, tokens or keys):

```
export interface MedusaAdminApi { token: string;
  getMe(): Promise<{ email: string }>;
  getPublishableKey(): Promise<string>;                 // GET /admin/api-keys?fields=*sales_channels&limit=50 → publishable, !revoked_at, channel "Default Sales Channel"
  getEuropeRegionId(): Promise<string>;                 // GET /admin/regions → currency_code "eur"
  getDefaultSalesChannelId(): Promise<string>;
  getDefaultShippingProfileId(): Promise<string>;       // GET /admin/shipping-profiles → type "default"
  getEuropeanWarehouseId(): Promise<string>;            // GET /admin/stock-locations → name "European Warehouse"
  createProduct(input: { title; optionTitle; amountEur }): Promise<{ id; variantId }>;  // 1×1 helper product (D3)
  createProductRaw(body: unknown): Promise<APIResponse>; // X03, no status assert
  findProductsByTitle(title): Promise<{ count; products }>;  // GET /admin/products?q=&fields=id,title,status,*variants,*variants.options,*options,*options.values
  deleteProduct(id): Promise<void>;                     // 200 + deleted true
  getOrder(id, fields): Promise<MedusaOrder>;
  cancelOrder(id): Promise<APIResponse>;                // raw (races)
  createFulfillment(id, items, locationId): Promise<APIResponse>;
  cancelFulfillment(orderId, fulfillmentId): Promise<void>;
  archiveOrder(id): Promise<void>;
  listOrderChanges(id): Promise<{ change_type; status }[]>;
  findCustomerIdsByEmail(email): Promise<string[]>;     // exact match filter after q=
  deleteCustomer(id): Promise<void>;
  raw(method, path, init?): Promise<APIResponse> }      // X01/X02
export async function loginAdminToken(request: APIRequestContext, email, password): Promise<string>  // 200, token string length > 0
export async function createAdminSession(request, token): Promise<void>   // POST /auth/session Bearer → 200
export function createMedusaAdminApi(request: APIRequestContext, token: string): MedusaAdminApi
```

`src/products/medusa/store-order.ts` skeleton:

```
export interface StoreOrderInput { publishableKey; regionId; salesChannelId; variantId; quantity; email }
export interface StoreOrderResult { id: string; displayId: number; email: string; shippingAmount: number }
export async function createStoreOrder(request: APIRequestContext, input): Promise<StoreOrderResult>
  // test.step-free (helper); each call expect 200 in P-32 order; ship to {first_name:"P1", last_name:"QA", address_1:"Teststr 1", city:"Berlin", country_code:"de", postal_code:"10115"};
  // shipping option name "Standard Shipping"; provider "pp_system_default"; complete → expect type "order"
```

Command: `npm run typecheck` → exit 0.

### Step 3. Fixtures, sweep, leak script

`src/products/medusa/fixtures.ts` skeleton:

```
export interface MedusaQaFixture { prefix; api: MedusaAdminApi;
  createProduct(leaf?: string): Promise<{ id; variantId; title; unitPrice: 25 }>;
  createOrder(leaf?: string, quantity = 2): Promise<StoreOrderResult & { productId; unitPrice }>;  // creates its own product
  captureProductId(id): void; captureOrderId(id): void; }
export async function runMedusaQaCleanup({ api, captured, testError }): Promise<void>  // §10 order, AggregateError("medusaQa fixture failed")
export const test = base.extend<{ medusaAdmin: MedusaAdminApi; medusaQa: MedusaQaFixture }, { factorySeed: number }>({
  factorySeed: [/* same as twenty fixtures/index.ts:150-162 */, { scope: "worker", auto: true }],
  medusaAdmin: /* request.newContext({ baseURL }), loginAdminToken, use(createMedusaAdminApi(ctx, token)), ctx.dispose() */,
  medusaQa: /* prefix = medusaQaPrefix(factorySeed, testInfo.parallelIndex); captured {productIds, orderIds, customerEmails}; try use / finally cleanup */ });
export { expect } from "@playwright/test";
```

`src/products/medusa/sweep.ts`: `sweepMedusaQaRecords(prefix): Promise<{ before, deleted, after }>` and `countMedusaQaLeaks(): Promise<{ products, options, customers, liveOrders, openFulfillments, archivedOrders, carts }>` (SQL of §10).
`scripts/count-medusa-qa-leaks.mts`: `import "dotenv/config"` → sweep → counts → `console.log(JSON.stringify({...}, null, 2))` → step summary block "### Medusa QA leak sweep" → exit code per §10.
Command: `npx tsx scripts/count-medusa-qa-leaks.mts` (Medusa running) → JSON with `products 0, options 0, customers 0, liveOrders 0, openFulfillments 0`, `archivedOrders 0`, `carts 0` (the probe used `p1-probe`, not `p1-qa`), exit 0.

### Step 4. Config, scripts and global setup

- `playwright.config.ts`:
  - `MEDUSA_PROJECT_NAMES = ["medusa-setup", "medusa-chromium"] as const` and `runsMedusa` (same as lines 76-78).
  - `harnessSetups.push("./global-setup/medusa.ts")` when `runsMedusa`.
  - `globalTeardown` becomes an array of the Twenty and Medusa teardowns when selected.
  - Projects:
    - `medusa-setup`: `testDir ./tests/setup`, `testMatch /medusa\.setup\.ts/`, `retries 0`, timeouts from `MEDUSA_TIMEOUTS`, `baseURL: medusaBaseUrlFromEnv()` (127.0.0.1-guarded), `trace off`. Trace off also keeps the login request body out of artifacts.
    - `medusa-chromium`: `dependencies ["medusa-setup"]`, `testDir ./tests/medusa`, `testIgnore VISUAL_A11Y_IGNORE`, `retries 0`, `storageState: medusaAuthStatePath()` when `runsMedusa`.
  - The config never calls `loadMedusaConfig()`: it uses `medusaBaseUrlFromEnv()` and `medusaAuthStatePath()` only. Credentials are validated in `global-setup/medusa.ts` and `tests/setup/medusa.setup.ts`, so `--list` and the unit project never need Medusa secrets.
- `global-setup/medusa.ts`, modelled on `global-setup/twenty.ts`:
  1. `process.env.MEDUSA_SKIP_STOREFRONT ??= "1"`.
  2. `loadMedusaConfig()`.
  3. `GET /health`. 200 → log "already serving; skipping harness up()". Otherwise `getAdapter("medusa").up()` then `waitHealthy`, wrapped in an error that names `node scripts/up.mjs medusa`.
  4. Timed `adapter.seed()` with start/end ISO and seconds, plus the `GITHUB_STEP_SUMMARY` block "### Medusa seed".
  5. `if (!process.env.CI) await sweepMedusaQaRecords("P1-QA-")`.
- `global-teardown/medusa.ts`: `if (CI) return; await sweepMedusaQaRecords("P1-QA-")`.
- `src/core/projects.ts` + `package.json` script + `tests/unit/playwright-projects.spec.ts` (two tests: "npm test:medusa infers medusa-chromium when argv lacks --project", "--project=medusa-chromium does not select Cal, Documenso or Twenty").
- `.env.example`: Medusa block (comments state the 127.0.0.1 rule and that the admin values must match the harness `.env`).
- Commands:
  - `npm run test:unit` → **171 passed** (163 + 6 + 2), "Total" in `--list`: `171 tests in 24 files`.
  - `P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project=medusa-setup` → `Total: 1 test in 1 file`.

### Step 5. Page objects (verify the unverified names first)

Before writing `products.page.ts`, run a throwaway check from the scratchpad (not committed) against the live app with the real storageState from Step 6's setup. Check `getByRole("dialog", { name: "Create Product", includeHidden: true }).count()` (expect 2) and `getByRole("switch", { name: "Yes, this is a product with variants", includeHidden: true })` count on the last dialog (expect 1). If either is 0: stop and report (R9).

Skeletons (all extend `BasePage`, `src/core/base.page.ts`):

```
class MedusaLoginPage { goto(); signIn(email, password); /* locators §8 */ }
class MedusaOrdersPage { goto(); heading; orderLink(displayId) }
class MedusaOrderDetailPage { goto(id); heading(displayId); totalRow(label); statusText(text);
  openCancel(); confirmCancel(); toast(text) }
class MedusaProductsPage { goto(); gotoSearch(title); row(title); openCreate();
  fillDetails(title); addOption(name, values: readonly string[]); continueTo(tab: "Organize" | "Variants"); publish(): Promise<string /* product id from POST response */> }
```

`publish()` = `Promise.all([page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/products"), publishButton.click()])`, then expect status 200 and return `json.product.id`.
Command: `npm run lint && npm run typecheck` → exit 0.

### Step 6. Setup and FW specs

`tests/setup/medusa.setup.ts`:

```
setup("API login writes reusable Medusa admin storageState", { tag: ["@medusa", "@setup"] }, async ({ page }) => {
  // mkdir .auth; token = loginAdminToken(page.request, email, password); createAdminSession(page.request, token)
  // expect((await page.context().cookies()).map(c => c.name)).toContain("connect.sid")
  // page.goto(MEDUSA_ROUTES.orders); expect heading "Orders" visible; storageState({ path })
});
```

`tests/medusa/journeys/auth.spec.ts`:

- `P1-MED-FW-001 Admin API login → session storageState`. Options `{ tag: ["@medusa","@auth","@smoke"], annotation: [{type:"testId",description:"P1-MED-FW-001"},{type:"priority",description:"P0"}] }`.
  - steps: "open orders with saved session" (goto `/app/orders`, `toHaveURL(/\/app\/orders$/)`), "orders list is visible" (heading), "login form is absent" (`getByRole("textbox",{name:"Email"})` `toHaveCount(0)`), "session is valid on the API" (`page.request.get("/admin/users/me")` → 200, email === env).
- `P1-MED-FW-005 Invalid login shows an error, no session`, inside `test.describe` with `test.use({ storageState: { cookies: [], origins: [] } })`, P1, tags `@medusa @auth`.
  - steps: "open login" (goto `/app/login`, heading visible), "submit wrong password" (`signIn(email, password + "-wrong")`), "error is shown" (error text visible, Email `toHaveAttribute("aria-invalid","true")`, URL `/app/login`), "no session cookie" (`expect(cookie names).not.toContain("connect.sid")`), "API confirms no session" (`page.request.get("/admin/users/me")` → 401).

`tests/medusa/journeys/products.spec.ts`:

- `P1-MED-FW-002 Create a product with variants via the UI`, P0, tags `@medusa @products`; fixture `medusaQa`.
  - steps: "open create dialog", "fill details" (title = `medusaQaTitle(prefix)`), "add two options with two values" (`<prefix>-Size: S, M`, `<prefix>-Color: Red, Blue`), "continue to variants" (Organize then Variants tab active), "publish" (capture id → `medusaQa.captureProductId`; toast "Product <title> was successfully created."), "product appears in the list" (`gotoSearch`, row visible, cells "4 variants" and "Published"), "API returns 4 variants" (§9 set comparison).

`tests/medusa/journeys/orders.spec.ts`:

- `P1-MED-FW-003 Order detail shows correct totals for an API-created order`, P1, tags `@medusa @orders @money`; `order = await medusaQa.createOrder("totals", 2)` in the test body (setup via API).
  - steps: "API totals match the expected totals" (§9 helper vs API vs arithmetic), "open order detail" (heading `#<displayId>`, "Summary"), "UI totals equal API totals" (4 rows `toHaveText(new RegExp(\`^${label}\\s*${escapeRegExp(formatEur(v))}$\`))`).
- `P1-MED-FW-004 Cancel order from the UI`, P1, tags `@medusa @orders @state`; own order (D7).
  - steps: "open order" (heading; `statusText("Canceled")` count 0; `statusText("Authorized")` count 2), "cancel from the menu" (`openCancel()`, alertdialog text contains `#<displayId>`, `confirmCancel()`), "UI shows Canceled" (toast; `Canceled` count 4; `Authorized` count 0), "status survives reload" (reload, same counts), "API status is canceled" (`status` canceled, `payment_status` canceled, `canceled_at` truthy).

Commands:

- `P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project=medusa-chromium` → `Total: 5 tests in 3 files` (without extras).
- Iterate one at a time: `npm run test:medusa -- --grep "P1-MED-FW-00N"`.

### Step 7. Extras X01–X05 (accepted, D11)

`tests/medusa/api/contract.spec.ts`: X01, X02, X03, one test each, `test.step` per row of §6, tags `@medusa @api`, P2.
`tests/medusa/api/races.spec.ts`: X04, X05, tags `@medusa @api @race`, P1, each with its own order. For X05 the cleanup cancels the fulfillment first (fixture handles it).
X04 skeleton:

```
// order = medusaQa.createOrder("race", 1)
// [a, b] = await Promise.all([api.cancelOrder(id), api.cancelOrder(id)])
// working path: order status canceled; payments: 1 with canceled_at; refunds 0
// testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, serializeKnownBugEvidence({ issue, observed: { statuses, changes }, expected: { statuses: [200,400], pendingChanges: 0 } }))
// test.fail(true, MED_FW_X04_DOUBLE_CANCEL_ISSUE)
// expect([a.status(), b.status()].sort()).toEqual([200, 400]); expect(changes.filter(c => c.status === "pending")).toHaveLength(0)
```

X05 is the same shape, with `[cancelOrder, createFulfillment(items, European Warehouse id)]` and the strict assertion "not (canceled AND an uncanceled fulfillment)".
Command: `--list --project=medusa-chromium` → `Total: 10 tests in 5 files` (all accepted).

### Step 8. CI, ADR, docs

YAML per §12. ADR 0018 and README per §17. `docs/observations/medusa-known-issues.md` per §11: F-01 and F-02 only (measured facts, run timestamps, request/response statuses). No a11y findings (D14). Command: `npm run check` → exit 0 (includes actionlint).

## 15. Verification plan (hard gate before any push; paste real output)

1. `npm run check` → exit 0.
2. `npm run test:unit` → `171 passed`.
3. Medusa run 1: `npm run test:medusa` → with X01–X05 accepted: **11 passed** (1 setup + 8 + 2 expected failures X04/X05, which Playwright counts as passed), **0 failed, 0 flaky**. JSON `stats.unexpected 0`, `stats.flaky 0`. Without extras: **6 passed**. Then `npx tsx scripts/count-medusa-qa-leaks.mts` → `products 0, options 0, customers 0, liveOrders 0, openFulfillments 0`; `archivedOrders` and `carts` printed (expected 4 and 4 after one run with extras: FW-003, FW-004, X04, X05; 2 and 2 without extras).
4. Medusa run 2: same command, same summary, leaks 0. X04 and X05 must show the same observed statuses in both runs' evidence JSON (F-01/F-02 re-reproduction). If not, stop.
5. Unchanged suites, one at a time: `npm run test:cal` (20 tests), `npm run test:documenso` (27), `npm run test:twenty` (14 + setup). Each must show the same pass/expected-fail totals as on `main` before the branch (record a baseline run on `main` first). Run their leak scripts (`count-documenso-qa-leaks.mts`, `count-twenty-qa-leaks.mts`, `count-trial-qa.mts`) → 0.
6. `--list` sanity: visual-mobile/tablet/desktop still `41 tests in 23 files`; cal-chromium 20/7; documenso-chromium 27/8; twenty-chromium 14/4.
7. After push (Jayami pushes or approves the push): paste the `medusa-self-hosted` job footer, its summary rows (up seconds, seed seconds, Playwright totals, leak block), and confirm `cal-self-hosted`, `documenso-self-hosted`, `twenty-self-hosted` and `e2e / visual` are green. Read the footer for `flaky` or `retry` lines (must be none).

## 16. Commit plan (Conventional, lowercase, no trailer, explicit paths, never `git add -A`)

1. `docs(plan): phase 4 batch 1 medusa foundation`
2. `chore(deps): bump qa-portfolio-harness to v0.2.10` (D10)
3. `feat(medusa): env, names and money helpers` + `test(unit): medusa env and money helpers`
4. `feat(medusa): admin api client and store order helper`
5. `feat(medusa): qa fixture, sweep and leak check script`
6. `feat(medusa): playwright projects, global setup and npm script` (+ `tests/unit/playwright-projects.spec.ts`)
7. `feat(medusa): page objects for login, products and orders`
8. `test(medusa): admin session setup and fw-001 to fw-005`
9. `test(medusa): api contract and race cases`
10. `ci(e2e): add medusa-self-hosted job and visual gate entry`
11. `docs(medusa): adr 0018, known issues and readme coverage`

No merge, tag or force-push. No CodeRabbit run. Never the Bridge-bss account.

## 17. Docs and ADR

- `docs/adr/0018-medusa-ci.md`, format as 0011/0016 (Status Accepted, Date, Context, Decision, Alternatives, Consequences). It records: the job and the 60-minute timeout arithmetic (D15); storefront skipped; pnpm via corepack; caches (store + `.medusa/server`, saved on push to `main` only); per-run masked admin password; workers 1 and retries 0; `visual_requested=false` until batch 2; the leak gate with informational archived orders/carts; R1 and the harness fix; O-01/O-02; tax 0 (R5). Alternatives rejected: spoofing `X-Forwarded-Proto` in P1; US region; seeded products as line items; SQL hard-delete of orders.
- README:
  - Scope line: Medusa wired, job `e2e / medusa-self-hosted`.
  - "Run Medusa locally": `node scripts/up.mjs medusa` in the harness, then P1 `.env` admin vars, then `npm run test:medusa`.
  - "Implemented P1 cases": FW-001…005 (+ accepted X).
  - "Known product bugs": F-01/F-02.
  - "Carried" table: Medusa batch 2 items + X06.
  - Real numbers only, pasted from §15.
- `docs/observations/medusa-known-issues.md`: F-01 and F-02 only (D14).

## 18. Will NOT do

- No edits to the Medusa fork or the harness. No harness change in this batch apart from the approved `v0.2.10` pin bump (D10). No `X-Forwarded-Proto` spoofing or cookie injection in P1.
- No batch 2 cases (I18N, VIS, X06), no Twenty work, no storefront tests.
- No retries, sleeps, `waitForTimeout`, longer timeouts or env-conditional test logic.
- No committed evidence files, PNG or JSON exports; no new report formats, scripts beyond the leak script, or workflows beyond the job.
- No new dependencies (faker comes via harness exports, D6).
- No mutation of seeded data (products, QA10, customer, regions, tax regions, global options, key).
- No Co-Authored-By or model trailer, no CodeRabbit, no merge/tag/force-push, never Bridge-bss.

## 19. Open questions for Jayami

None. Q1–Q4 were answered on 2026-10-16 and are recorded as D10–D13. The review changes are D14 and D15.

Plan saved as docs/plans/2026-10-16-phase4-batch1-medusa.md. Not built: building starts after harness `v0.2.10` is merged and tagged.
