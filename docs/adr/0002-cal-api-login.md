# 0002. Authenticate through the Cal credentials API

- Status: Accepted
- Date: 2026-10-08

## Context

Cal.diy's own Playwright fixture posts to `GET /api/auth/csrf` then `POST /api/auth/callback/credentials`. Stock Cal login UI is not patched. Seed user `pro@example.com` is documented in the fork README; the password is not stored in git.

## Decision

Framework tests log in through that API. Setup writes `storageState` to `.auth/cal-pro.json`. FW-001 writes a copy under `testInfo.outputPath` so it does not clobber the setup file. FW-002 uses a single empty-session mechanism (`test.use({ storageState })` on the describe) and asserts a wrong password does not create a session.

`csrfToken` is validated as a non-empty string before the callback POST.

## Consequences

- Page objects and specs stay UI-black-box except for this documented auth contract.
- Credentials come from `loadConfig()`; secrets are never logged.
