# 0012. Twenty browser session via UI login storageState

- Status: Accepted
- Date: 2026-10-13

## Context

Phase 2f task 2 wires Twenty CRM (`twentycrm/twenty:v2.44.0` on `http://127.0.0.1:3002`) through `qa-portfolio-harness` `#v0.2.7`. Harness `getAdapter('twenty').authenticate()` returns a GraphQL Bearer JWT (`storageStatePath: undefined`). Live probe (2026-10-13) showed three injection attempts (Bearer + `isCookieAuthActiveState=true`, JWT in `twenty-session`, real `Set-Cookie: twenty-session` from GraphQL) all landed on `/welcome` with the cookie-auth flag reset to `false`.

After UI login on `/welcome` (Email → Continue → Password → Sign in), the browser held:

- `twenty-session`: httpOnly **true**, secure false, SameSite Lax, 48-character value (not the ~427-char JWT)
- `analyticsCookie`, `lastAuthenticateWorkspaceDomain` (non-httpOnly)
- localStorage including `isCookieAuthActiveState=true` and workspace/user state keys

Reusing **that run's** Playwright `storageState` at `/` opened `/objects/companies` with Companies, People, and workspace chrome visible. A stale `twenty-session` cookie redirects to `/welcome`; P1 must not skip UI login because `.auth/twenty-jane.json` exists from a prior run.

`globalSetup` calls `seed()` after health (idempotent when Jane already exists). `up()` alone does not seed.

## Decision

- **`twenty-setup` project:** UI login as Jane (`jane.austen@apple.dev`, harness dev-seeder password when unset) on every Playwright run; write `.auth/twenty-jane.json` with `trace: "off"`. No harness `authenticate()` token injection.
- **`twenty-chromium`:** `dependencies: ["twenty-setup"]`, `storageState` from the current run's file.
- **Smoke oracle:** `toHaveURL(/\/objects\/companies/)`, `not.toHaveURL(/welcome/)`, Companies and People links visible. No CRM mutations in smoke.

## Consequences

- Future TZ cases (P1-TW-TZ-001..003) build on this session model.
- CI job `twenty-chromium` ([ADR 0016](./0016-twenty-ci.md)) uses the same UI login model; local runs still need `PRODUCTS_ROOT` with `twenty-CRM` and harness `up`/`seed`.
- Login a11y gap (placeholder-only Email/Password) is tracked in [twenty-login-a11y.md](../observations/twenty-login-a11y.md), not `test.fail`.
