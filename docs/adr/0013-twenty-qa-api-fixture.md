# 0013. Twenty QA API fixture (pinned workspace ACCESS token)

- Status: Accepted
- Date: 2026-10-14

## Context

Phase 2f task 3 adds GraphQL-backed QA data for Twenty (`twentycrm/twenty:v2.44.0` on `http://127.0.0.1:3002`). Browser sessions stay on UI `storageState` ([ADR 0012](./0012-twenty-ui-storage-state.md)); CRM setup/teardown uses HTTP GraphQL without cookie auth.

Live probe (2026-10-14):

- Harness `authenticate()` returns a **WORKSPACE_AGNOSTIC** JWT (`workspaceId` null). `POST /graphql` CRM mutations fail (`Unknown type "CompanyCreateInput"`).
- Jane `signIn` lists Apple (`20202020-1c25-4d02-bf25-6aeccf7ea419`) and YCombinator workspaces. Exchanging Apple `loginToken` yields **ACCESS** with matching `workspaceId` / `workspaceMemberId`. YCombinator exchange returns `FORBIDDEN` (`Token is not valid for this workspace`) with single-workspace overlay.
- UI `storageState` localStorage `currentWorkspaceState.id` and `currentWorkspaceMemberState.id` match Apple ACCESS claims and `currentUser`.
- Opportunity `closeDate` metadata is **DATE_TIME** (not DATE). Only seed DATE field observed: `pet.birthday` (pets out of scope).
- GraphQL may return HTTP **200** with `errors[]` (even when `data` is set) or a top-level `{ message, extensions }` body (wrong password on `/metadata`). Clients must throw.
- ACCESS TTL **1800s** (30m). Real mid-run expiry was not waited out; `UNAUTHENTICATED` triggers **one** re-exchange then failure.

## Decision

- Pin workspace by **id** from the UI session file, exchange that workspace `loginToken`, assert ACCESS JWT + `currentUser` match UI ids (error text lists **ids only**, never tokens).
- Mint a fresh pinned session **per test** via `twentyQa` fixture; teardown destroys captured ids, restores member TZ if changed, then throws `AggregateError` on any failure (destroy failure still runs TZ restore).
- Record names: `P1-QA-<seed>-<worker>-…` from `P1_SEED`, worker index, and harness Faker (`setFactorySeed`).
- `sweepTwentyQaRecords(prefix)` deletes companies/opportunities by `name ilike` and people by `firstName ilike`. Global setup/teardown sweep prefix `P1-QA-` only (non-CI). Live idempotence tests use `P1-QA-<seed>-<worker>-SweepProbe-` prefix only.
- Member TZ changes use `/graphql` `updateWorkspaceMember`; restore original in `finally`. Jane seed TZ is `"system"`. TZ mutation tests stay serial; parallel isolation specs create records only.

## Consequences

- P1-TW-TZ-001..003 (tasks 4–5) can depend on `twentyQa` without rediscovering auth or sweep rules.
- **Open for task 4:** TZ-001 oracle vs live DATE_TIME `closeDate` — not decided here.
- CI runs `PW_WORKERS=2` under `twenty-chromium` ([ADR 0016](./0016-twenty-ci.md)); local isolation proof still uses `PW_WORKERS=2` with `@twenty-fixture`.
