# P1 Phase 1 decisions

## Harness dependency

Pinned to the published tag:

```json
"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.1.0"
```

That tag is `b103330` (PR #1 + PR #2). `npm i` in this repo succeeded: `prepare` (`tsc`) compiled `dist/` because this package already has TypeScript as a `devDependency`.

If a consumer without TypeScript hits a failed `prepare`, fall back to:

```json
"qa-portfolio-harness": "file:../qa-portfolio-harness"
```

Do not patch the harness from P1. Record any fallback here.

PR #2 behavior P1 relies on:

- `up()` starts Postgres **and** Cal web (Windows: `next dev --webpack`; Turbopack crashes on `instrumentation.ts`)
- `authenticate()` requires `CAL_API_KEY`; `proveAuth()` hits a Bearer probe
- `waitHealthy` / health poller updated

`PRODUCTS_ROOT=../products` is set from this package’s `.env` **before** `getAdapter('cal')`.

## Auth

Cal.diy’s own Playwright fixture posts to `GET /api/auth/csrf` then `POST /api/auth/callback/credentials` (`apps/web/playwright/fixtures/users.ts` `apiLogin`). Phase 1 reuses that contract. Seed user `pro@example.com` is documented in the fork README; password is not stored in git.

## CI

GitHub-hosted runners cannot see local Docker / `yarn dev`. Live Chromium shards run **only** when `secrets.CAL_E2E_BASE_URL` is set. Otherwise the workflow typechecks and prints a skip job. That is structural green, not a faked E2E pass.

Shard matrix is `1..4` × chromium / cal only. WebKit, Firefox, visual, TZ, 2FA, Slack, GH Pages are Phase 2–3.

## Timing / flake

No CI duration or flake-rate claims. FW-001 logs elapsed ms. Targets belong here later, after measurement.

## Locators

Prefer `getByRole` / `getByLabel` / `getByTestId`. Product test ids used: `new-event-type`, `event-type-quick-chat`, `event-type-options-{id}`, `dialog-confirmation`.

## Console guard

Allowlist starts with one documented Cal.diy React 19 `console.error` (`Accessing element.ref was removed in React 19`). `P1_CONSOLE_ALLOWLIST` adds more. Do not allowlist HTTP 500s or `pageerror` module-build failures.

## Live Cal on Windows webpack

Harness `up()` webpack is required (Turbopack 404s app routes). Webpack `UnhandledSchemeError` on `node:*` specifiers in the client graph blocked every HTML route. The local cal.diy fork (not this repo) now registers webpack `resolveForScheme("node")` in `apps/web/next.config.ts`. After that, `/auth/login`, `/event-types`, `/bookings/upcoming`, and `/pro/30min` return 200/307.

`globalSetup` waits on `GET /api/auth/csrf` and skips `adapter.up()` when that already returns 200, so a later health probe of `GET /` cannot kill a listening webpack process.

Base URL default is `http://127.0.0.1:3000` (Windows `localhost` is often IPv6).
