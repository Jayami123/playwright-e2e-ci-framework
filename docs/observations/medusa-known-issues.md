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
