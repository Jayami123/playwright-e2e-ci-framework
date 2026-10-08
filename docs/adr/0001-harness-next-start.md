# 0001. Pin harness v0.2.0 and default to next start

- Status: Accepted
- Date: 2026-10-08

## Context

P1 must start Cal without editing product source. Local `next-dev` / webpack hangs are an environment problem, not Cal product findings. The published harness tag is the Cal `next start` work.

## Decision

Pin:

```json
"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.0"
```

Default local and FW runs use `next build` then `next start`. `CAL_WEB_MODE=dev` is the webpack fallback only. Do not patch the harness from this repo.

`PRODUCTS_ROOT=../products` is set from this package's `.env` before `getAdapter('cal')`.

If a consumer without TypeScript hits a failed harness `prepare`, fall back to `file:../qa-portfolio-harness` and record that here.

## Consequences

- `up()` starts Postgres and Cal web (default `next build` + `next start`).
- `authenticate()` still requires `CAL_API_KEY`; P1 uses the NextAuth credentials contract instead.
- Dev-server memory restarts and first-compile waits are not treated as Cal bugs.
