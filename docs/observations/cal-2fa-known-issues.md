# Cal 2FA known product issues (Phase 2b)

Recorded for P1-CAL-2FA-002. Playwright `test.fail` and `{ type: "issue" }` run after setup when live replay is confirmed. Evidence attaches before the strict RFC replay assertion.

## P7-OBS-CAL-2FA-002

Same TOTP code submitted in two isolated browser contexts within one otplib window: context B receives a session user after context A already consumed the code. Expected RFC 6238 §5.2 reuse rejection (`incorrect-two-factor-code`, no session on B). **Verified** on `http://127.0.0.1:3000` during Phase 2b implementation (2026-10-09): `P1-CAL-2FA-002` marks `test.fail` when `sessionUserOnB` is true.
