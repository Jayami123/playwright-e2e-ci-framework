# 0001. Pin harness and default to next start

- Status: Accepted
- Date: 2026-10-08

## Context

P1 must start Cal without editing product source. Local `next-dev` / webpack hangs are an environment problem, not Cal product findings. The published harness tag is the Cal `next start` work, including generated tRPC types and commit-aware `.next` skip.

## Decision

Pin (temporary SHA until `v0.2.1` is tagged on the harness):

```json
"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#54b1493890a8dfe71bf6c5ddaed21c2aad436b4f"
```

After the harness tag exists, repin to `#v0.2.1`.

Default local and FW runs use `next build` then `next start`. Before `next build`, the harness runs `yarn turbo run build --filter=@calcom/trpc` so `packages/trpc/types/server/routers/_app.d.ts` exists (`AppRouter` is gitignored output). Skip a rebuild only when `apps/web/.next/required-server-files.json` exists and `apps/web/.next/harness-build.json` `gitSha` matches Cal `HEAD`. Uncommitted Cal edits are not detected; use `CAL_WEB_REBUILD=1`. `CAL_WEB_MODE=dev` is the webpack fallback only. Do not patch the harness from this repo.

Locally, `PRODUCTS_ROOT=../products` is set from this package's `.env` before `getAdapter('cal')`. Self-hosted CI checks P1 out to `p1/` and Cal to `products/cal` as siblings (`PRODUCTS_ROOT` = `${{ github.workspace }}/products`) so Next.js does not treat P1's lockfile as the Cal workspace root.

If a consumer without TypeScript hits a failed harness `prepare`, fall back to `file:../qa-portfolio-harness` and record that here.

## Consequences

- `up()` starts Postgres and Cal web (tRPC types, then `next build` + `next start` unless the SHA-matched `.next` marker is present).
- `authenticate()` still requires `CAL_API_KEY`; P1 uses the NextAuth credentials contract instead.
- Dev-server memory restarts and first-compile waits are not treated as Cal bugs.
