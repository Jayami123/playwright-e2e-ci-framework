# 0002. Authenticate through the Cal credentials API

- Status: Accepted
- Date: 2026-10-08

## Context

Cal.diy's own Playwright fixture posts to `GET /api/auth/csrf` then `POST /api/auth/callback/credentials`. Stock Cal login UI is not patched. Seed user `pro@example.com` is documented in the fork README; the password is not stored in git. For the ephemeral self-hosted CI instance only, the matching seed password is set as step env `CAL_E2E_PASSWORD` on **Run Cal E2E suite** only, not as workflow-level env and not in application source.

## Decision

Framework tests log in through that API. Setup writes `storageState` to `.auth/cal-pro.json`. FW-001 writes a copy under `os.tmpdir()` (not `testInfo.outputPath` / `test-results`) and deletes it in `finally`. FW-002 uses a single empty-session mechanism (`test.use({ storageState })` on the describe) and asserts a wrong password does not create a session.

`csrfToken` is validated as a non-empty string before the callback POST. The POST prefers the `next-auth.csrf-token` cookie value when the login page has already set one, so it does not race the page `GET /api/auth/session` that can mint a second token.

NextAuth with `redirect=false` returns HTTP 200 even on CSRF or credentials failure, with JSON `{ url: "/api/auth/signin?csrf=true" }` (or a login/error URL) and **no** session cookie. `loginCalWithCredentials` fails loudly on that body, then waits until `GET /api/auth/session` returns a `user` before navigating. Evidence from CI run [37893453667](https://github.com/Jayami123/playwright-e2e-ci-framework/actions/runs/37893453667) job 113699462738, first FW-001 attempt: callback HTTP 200, body `{"url":"http://127.0.0.1:3000/api/auth/signin?csrf=true"}`, `Set-Cookie` names none (no session token); page stayed on `/auth/login`. Label: **TEST BUG**.

## Consequences

- Page objects and specs stay UI-black-box except for this documented auth contract.
- Credentials come from `loadConfig()`; secrets are never logged.
