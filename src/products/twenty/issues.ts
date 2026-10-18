export const TW_CSV_X07_SUBMIT_HIDDEN_ISSUE =
  'PRODUCT BUG TW-CSV-X07: the "Finish flow with errors" confirm in the People import hides its Submit button from assistive technology (aria-hidden ancestor; WCAG 2.2 SC 4.1.2, probe 2026-10-17)';
export const TW_2FA_X01_REPLAY_ISSUE =
  "PRODUCT BUG TW-2FA-X01: a TOTP code that already signed in is accepted again (OWASP ASVS 4.0.3 V2.8.4, RFC 6238 section 5.2, probe 2026-10-17)";
export const TW_2FA_X05_UNNAMED_CODE_ISSUE =
  "PRODUCT BUG TW-2FA-X05: the 2FA login code field has no accessible name (WCAG 2.2 SC 4.1.2, probe 2026-10-17)";
export const TW_LOGIN_F01_LOADER_STUCK_ISSUE =
  "PRODUCT BUG TW-LOGIN-F-01: the /welcome sign-in form stays a loader after the workspace data and client config have loaded, because the page does not re-render (1.0% of loads serial, 3.5 to 4.5% with two workers; probe 2026-10-17/18)";
export const TW_RT_002_CREATED_ROW_MISSING_ISSUE =
  "PRODUCT BUG TW-RT-002-F1: a record created through the API that matches another user's filtered People list raises the list's count live but its row never appears, against Twenty's own SSE create contract (17 of 17, probe 2026-10-18)";
