# 0004. Timeouts, locators, workers, and console allowlist

- Status: Accepted
- Date: 2026-10-08

## Context

Timeouts must differ for `next start` versus `CAL_WEB_MODE=dev` first compile. Extra Playwright workers against one webpack queue time out CSRF. Event-type list accessible names include slug and duration, so exact name matches miss the row. Cal.diy logs a documented React 19 `element.ref` `console.error`.

## Decision

- One `TIMEOUTS` object keyed by `CalWebMode` (`"prod" | "dev"`). Local retries stay `0`; CI retries twice.
- Workers come from `PW_WORKERS` and default to `1`.
- Event-type links use an anchored, escaped title regex (no `.first()`). Prefer `getByRole` / `getByLabel` / `getByTestId`.
- Console allowlist starts with `Accessing element.ref was removed in React 19`. `P1_CONSOLE_ALLOWLIST` adds more. Do not allowlist HTTP 500s or `pageerror` module-build failures.
- Editor warmup (`GET /event-types/:id`) runs only in `dev` mode. There is no hardcoded event-type id fallback.

## Consequences

- Prod-mode FW runs use the short budget; dev-mode pays compile cost in warmup and editor timeout, not by treating hangs as product bugs.
- Locator and console policy stay in this ADR rather than as comments in specs.
