export const MED_FW_X04_DOUBLE_CANCEL_ISSUE =
  "PRODUCT BUG MED-F-02: two concurrent POST /admin/orders/{id}/cancel calls both return 200 and leave a dangling pending credit_line order change; a sequential second cancel is rejected with 400 (Phase 4 probe 2026-10-16, 4 of 4 runs)";
export const MED_X06_DIALOG_HIDDEN_ISSUE =
  "PRODUCT BUG MED-F-03: the Create Product page renders two dialogs that are both aria-hidden=true while open, so assistive technology exposes no dialog (WCAG 4.1.2; Phase 4 batch 2 probe 2026-10-17, 2 of 2 runs)";
export const MED_X07_MENU_TRIGGER_NAME_ISSUE =
  "PRODUCT BUG MED-F-05: the order header actions menu trigger has no accessible name, although it opens by keyboard (WCAG 4.1.2; Phase 4 batch 2 probe 2026-10-17, 2 of 2 runs)";
export const MED_X08_LOGIN_ERROR_ISSUE =
  "PRODUCT BUG MED-F-06: the invalid-credentials error on the login page is a plain span with no role, live region or id, so it is not announced (WCAG 4.1.3; Phase 4 batch 2 probe 2026-10-17, 2 of 2 runs)";
export const MED_X13_REFLOW_ISSUE =
  "PRODUCT BUG MED-F-07: the order detail page needs horizontal scrolling of the main region at 320 CSS px, the width WCAG 1.4.10 requires to reflow (also measured at 393 px) (Phase 4 batch 2 probe 2026-10-17, 2 of 2 runs)";
export const MED_FW_X05_CANCEL_FULFIL_ISSUE =
  "PRODUCT BUG MED-F-01: a concurrent cancel and fulfil both return 200 and leave an order that is canceled and fulfilled with an uncanceled fulfillment; sequentially each is rejected (Phase 4 probe 2026-10-16, 3 of 3 runs)";
