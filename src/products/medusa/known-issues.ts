export const MED_FW_X04_DOUBLE_CANCEL_ISSUE =
  "PRODUCT BUG MED-F-02: two concurrent POST /admin/orders/{id}/cancel calls both return 200 and leave a dangling pending credit_line order change; a sequential second cancel is rejected with 400 (Phase 4 probe 2026-10-16, 4 of 4 runs)";
export const MED_FW_X05_CANCEL_FULFIL_ISSUE =
  "PRODUCT BUG MED-F-01: a concurrent cancel and fulfil both return 200 and leave an order that is canceled and fulfilled with an uncanceled fulfillment; sequentially each is rejected (Phase 4 probe 2026-10-16, 3 of 3 runs)";
