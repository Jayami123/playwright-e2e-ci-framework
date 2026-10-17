# Medusa known product issues (Phase 4 batch 1)

Recorded for `P1-MED-FW-X04` and `P1-MED-FW-X05`. Playwright `test.fail()` runs after the working-path assertions and the evidence attach, immediately before the strict assertion. Medusa 2.21.2 (fork `f677db438f27294fc50e4c7c6612e71ff38eeff5`), reproduced locally on 2026-10-16 in the probe and again in two separate suite runs on the build branch with identical observed evidence.

The race windows are small. If either bug stops reproducing on a runner, `test.fail` passes unexpectedly and the run is red; do not loosen the assertion.

## MED-F-02 (`P1-MED-FW-X04`): concurrent double cancel

**Observed:** two concurrent `POST /admin/orders/{id}/cancel` calls on one order both return **200**. The order ends `canceled` with one payment canceled and no refund, but the order changes contain `credit_line:confirmed` **and** `credit_line:pending`. A single cancel leaves only `credit_line:confirmed`.

**Expected (sequential contract):** the second cancel is rejected with 400 `invalid_data` "Order with id … has been canceled." (probe P-38, `order-validation.js:11-13`), so the statuses are `[200, 400]` and no pending change remains.

**Evidence:** probe P-40, 4 of 4 runs; build-branch runs 1 and 2: `statuses [200, 200]`, `changes ["credit_line:confirmed", "credit_line:pending"]`.

## MED-F-01 (`P1-MED-FW-X05`): concurrent cancel and fulfil

**Observed:** `POST /admin/orders/{id}/cancel` and `POST /admin/orders/{id}/fulfillments` fired together both return **200**. The order ends `status: "canceled"` and `fulfillment_status: "fulfilled"` with one uncanceled fulfillment.

**Expected (sequential contract):** fulfil after cancel is rejected with 400 "has been canceled" and cancel after fulfil with 400 `not_allowed` "All fulfillments must be canceled before canceling an order" (probe P-42; `cancel-order.js:36-48`, `create-fulfillment.js:43`). Neither workflow takes a lock, so the check and the write race.

**Evidence:** probe P-41, 3 of 3 runs; build-branch runs 1 and 2: `cancelStatus 200`, `fulfilStatus 200`, `status canceled`, `fulfillmentStatus fulfilled`, `openFulfillments 1`.

**Cleanup note:** in this state the order-scoped `POST /admin/orders/{id}/fulfillments/{fid}/cancel` returns 400 "has been canceled". The fixture uses `POST /admin/fulfillments/{id}/cancel`, which returns 200, then archives the order.

## Tests

`tests/medusa/api/races.spec.ts`: each test creates its own order, asserts the working path, attaches `known-bug-evidence` JSON, calls `test.fail(true, <issue>)`, then asserts the strict contract.

# Phase 4 batch 2 (accessibility and reflow)

Recorded for `P1-MED-FW-X06`, `X07`, `X08` and `X13` in `tests/medusa/a11y/admin.a11y.spec.ts`, which run only in the Docker `visual-*` projects (X06 to X08 in `visual-desktop`, X13 in `visual-mobile`). Same handling as above: hard working-path assertions first, evidence attached, `test.fail(true, <issue>)`, then the strict assertion. Medusa 2.21.2 (fork `f677db438f27294fc50e4c7c6612e71ff38eeff5`) on the **production** admin bundle (harness `v0.2.11`). Probed on 2026-10-17 and reproduced in two further suite runs with identical evidence JSON.

## MED-F-03 (`P1-MED-FW-X06`): Create Product dialogs are hidden from assistive technology

**Observed:** the Create Product page renders two dialogs, both `aria-hidden="true"` while open. `getByRole("dialog", { name: "Create Product" })` finds none (`ariaHiddenDialogs: 2`, `visibleDialogs: 0`). The Title field is attached and works with `includeHidden`.

**Expected:** one exposed dialog with an accessible name (WCAG 4.1.2). While this holds, the unnamed option picker and the unassociated values label cannot be reached by assistive technology, so they are not tested.

## MED-F-05 (`P1-MED-FW-X07`): order header menu trigger has no accessible name

**Observed:** the actions menu trigger in the order header has no `aria-label`, no `aria-labelledby` and no text. Keyboard works: Tab reaches it in 6 presses from the top of the page, Enter opens the menu ("Cancel"), Escape returns focus to it. The four section menu triggers are unnamed in the same way (axe `button-name`, 8 nodes on the order page).

**Expected:** a non-empty accessible name (WCAG 4.1.2).

## MED-F-06 (`P1-MED-FW-X08`): login error is not announced

**Observed:** after a failed login (non-real credentials) the error "Invalid email or password" is a plain `SPAN`: `role` null, `aria-live` null, no `id`. The password field is labelled (probe `labels.length 1`), so the earlier "unnamed password field" note (F-06b) is retracted; `type=password` has no `textbox` role, which is why P1 locates it by placeholder.

**Expected:** an element with `role="alert"` (or a live region) carrying the message (WCAG 4.1.3).

## MED-F-07 (`P1-MED-FW-X13`): order detail needs sideways scrolling at 320 px

**Observed:** at 320 CSS px the document does not scroll sideways, but `main` (`overflow-x: auto`) has `scrollWidth` 434 against `clientWidth` 320, and the widest section menu trigger ends at x 434 (the same 434 as at 393 px, where `clientWidth` is 393). The first probe measured 438 (English) and 444 (German) at 393 px, so it is not a German problem. The test sets a 320 px viewport itself because the `visual-mobile` project is 393 px wide.

**Expected:** no horizontal scrolling at 320 CSS px (WCAG 1.4.10). The "Unfulfilled Items" block is an item list, not a data table, so the two-dimensional layout exemption does not apply. If that judgement is wrong, drop X13.

## Tests

`tests/medusa/a11y/admin.a11y.spec.ts`. X08 signs out with an empty `storageState` and attaches only `{ tag, role, ariaLive, id }`.
