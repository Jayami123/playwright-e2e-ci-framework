# Documenso 2FA known product issues (Phase 2e)

Recorded for `P1-DOC-2FA-004`, `006`, `007`, and `009`. Playwright `test.fail()` runs after setup assertions and evidence attach, immediately before the strict security oracle. CI proof: GitHub Actions run [38388797450](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/38388797450) (`documenso-self-hosted`, `documenso-chromium`: 23 passed, 4 expected failures).

Download traces from the `playwright-test-results` artifact on that run (paths below are relative to the artifact root).

## P7-OBS-DOC-2FA-003 (P1-DOC-2FA-004)

**Observed:** `POST /api/auth/email-password/authorize` with a wrong TOTP returns HTTP **500** and body `{"code":"INVALID_TWO_FACTOR_CODE",...}` instead of a 4xx client error.

**Trace:** `auth-2fa-P1-DOC-2FA-004-wrong-code-status-is-4xx-documenso-chromium/trace.zip`

**Test:** `tests/documenso/auth/2fa.spec.ts` — fixture user has 2FA enabled (DB), mints a live/wrong TOTP pair, then calls authorize with the wrong code.

## P7-OBS-DOC-2FA-001 (P1-DOC-2FA-006)

**Observed:** The same backup code is accepted twice. First and second authorize both return HTTP **201** with a `sessionId` cookie; the second login also loads `/settings/security` in a browser context seeded from that cookie.

**Trace:** `auth-2fa-P1-DOC-2FA-006-spent-backup-code-rejected-documenso-chromium/trace.zip`

**Test:** first backup login asserts 201 + session API; second reuse asserts 201 + session API + security page; then `test.fail` before spent-code rejection asserts.

## P7-OBS-DOC-2FA-002 (P1-DOC-2FA-007)

**Observed:** The same TOTP code is accepted twice within one window. Both authorize calls return HTTP **201** with session cookies; the second context opens `/settings/security` with that session.

**Trace:** `auth-2fa-P1-DOC-2FA-007-same-window-TOTP-replay-rejected-documenso-chromium/trace.zip`

**Attachment:** `replay-totp-evidence.json` (mint step, authorize timestamps, statuses).

## P7-OBS-DOC-2FA-004 (P1-DOC-2FA-009)

**Observed:** Disabling 2FA with TOTP `000000` returns HTTP **500** and `{"code":"INCORRECT_TWO_FACTOR_CODE",...}` instead of 4xx; `twoFactorEnabled` stays **true** in the DB.

**Trace:** `auth-2fa-P1-DOC-2FA-009-disabling-2FA-requires-a-valid-code-documenso-chromium/trace.zip`

**Test:** valid TOTP login (201), security page with Disable 2FA visible, wrong disable POST captured, DB still enabled — then `test.fail` before 4xx oracle.
