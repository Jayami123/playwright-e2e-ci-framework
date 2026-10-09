# 0007. Cal two-factor authentication testing

- Status: Accepted
- Date: 2026-10-09

## Context

Phase 2b adds P1-CAL-2FA-001..003 against self-hosted Cal v6 at `http://127.0.0.1:3000`. Upstream `apps/web/playwright/login.2fa.e2e.ts` decrypts `users.twoFactorSecret`; P1 must not read `CALENDSO_ENCRYPTION_KEY` or DB ciphertext. Faker QA users use email `qa-*@qa.local` created by SQL INSERT (signup can be disabled). Cal TOTP uses otplib window `[1, 0]` (`packages/lib/totp.ts`). Live probes (2026-10-09) recorded login roles, settings test ids, and a localhost vs `127.0.0.1` redirect on credentials submit; session oracle uses Playwright `baseURL` on `127.0.0.1`.

## Decision

- **Users:** `qaCalUser()` + `createCalQaUser` insert `users` (with `gen_random_uuid()`), `UserPassword` (bcrypt cost 12), default `Working Hours` schedule, and weekday availability. Teardown deletes by captured id in one transaction (`Availability` before `Schedule`).
- **Enrolment:** 001 enables 2FA in the settings UI (`TwoFactorSettingsPage`); 002/003 use authenticated `POST /api/auth/two-factor/totp/setup` and `/enable` with otplib-generated codes. Secrets come from setup JSON or on-screen `two-factor-secret`, never from the DB.
- **Login oracles:** `GET /api/auth/session` via `sessionHasEmail`; failure signals use Cal `ErrorCode` query values (`incorrect-two-factor-code`, `incorrect-backup-code`), not CSRF. After success, navigate explicitly to `/event-types` (do not trust `router.push(WEBAPP_URL)` alone).
- **TOTP budget:** `assertTotpBudget` checks `totpMsRemainingInCurrentStep` (unit-tested with injected epoch ms). E2E call sites use `generateTotpCodeForTyping`, which calls `resolveTotpTypingEpochMs` to mint at the current step when at least `TOTP_TYPING_BUDGET_MS` (25 s) remain, otherwise at the start of the next step. No sleeps, no regenerate loop, no server clock mocking.
- **002 replay:** Strict assert B has no session and callback error is `incorrect-two-factor-code`. Live run **verified** Cal accepts replay in the same window; keep `test.fail` + `P7-OBS-CAL-2FA-002` ([cal-2fa-known-issues.md](../observations/cal-2fa-known-issues.md)).
- **001 storageState:** No persisted `pro-2fa` file; empty `storageState` per test. Traces stay `retain-on-failure`; ephemeral users are deleted in fixture teardown so secrets in traces are dead.
- **Locators:** Login TOTP via `keyboard.type` after Submit is visible; backup field scoped with `login-form` filter on visible “Backup code” text (Cal `BackupCode.tsx` uses `label=""`). Settings enable dialog located by heading inside `dialog`.
- **A11y (P7):** `data-testid="two-factor-switch"` is a `role=switch` with no accessible name (`two-factor-auth-view.tsx`). Login OTP uses six `name="2faN"` inputs with a sibling `Label` that has no `htmlFor` (`TwoFactor.tsx`, WCAG 4.1.2). See [cal-2fa-known-issues.md](../observations/cal-2fa-known-issues.md).
- **Local sweep:** `global-setup/index.ts` runs `countCalQaUsers` / `sweepCalQaUsers` before local runs (same CI guard as trial QA sweep).

## Consequences

- QA user INSERT must stay aligned with Prisma required columns (e.g. `uuid`).
- `test:cal` gains three specs; one expected failure when replay bug persists (four total with TZ/DST known bugs).
- Revisit 002 when Cal adds TOTP replay tracking; remove `test.fail` only after live proof of rejection.
