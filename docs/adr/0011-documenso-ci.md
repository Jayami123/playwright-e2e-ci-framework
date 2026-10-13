# 0011. Self-hosted Documenso on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-13

## Context

Phase 2e adds Documenso auth, signing, and passkey primitives (`P1-DOC-*`) against [Jayami123/documenso](https://github.com/Jayami123/documenso) via `qa-portfolio-harness` `#v0.2.6`. The public Playwright origin is `http://p1.lvh.me:3001` (hosts file → `127.0.0.1`); listen URL stays `http://127.0.0.1:3001`. Passkeys need a **secure context**, so `documenso-chromium` uses Playwright `channel: "chrome"` plus `--unsafely-treat-insecure-origin-as-secure=<publicUrl>` ([passkey notes](../observations/documenso-passkey-e2e-notes.md)).

A full `documenso-chromium` run (~27 tests) exceeds Documenso `apiTrpcRateLimit` (100 `/api/trpc/*` per IP per minute) and can exhaust `loginRateLimit` (50 authorize per IP per 15m) when limits are enforced. CI trace evidence (run 38377317652): `organisation.internal.getOrganisationSession` returned **429** during FW-002, leaving the envelope editor unloaded.

## Decision

- **Job:** `documenso-self-hosted` in reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml). Independent of `CAL_E2E_BASE_URL`. PR gate: harness `up` (limits enforced) → `npm run test:documenso:rate-limit` → harness `down`/`up` with bypass → `npm run test:documenso` (functional projects only; RL runs in the first phase, not inside `test:documenso`).
- **Rate limits in functional E2E:** Two harness phases (never edit the Documenso fork `.env`): (1) `up.mjs` without `DANGEROUS_BYPASS_RATE_LIMITS` → `npm run test:documenso:rate-limit` (**P1-DOC-RL-001** only, `P1_PLAYWRIGHT_HARNESS=0`); (2) `down.mjs` then `up.mjs` with `DANGEROUS_BYPASS_RATE_LIMITS=true` → `npm run test:documenso` (functional projects, RL excluded). Bypass is passed via harness `buildDocumensoAppEnv` (read at request time in fork `rate-limit.ts` ~73–79).
- **P1-DOC-RL-001:** Project `documenso-rate-limit-chromium`; asserts HTTP **429** on the 51st authorize in one IP bucket (`loginRateLimit` globalMax 50 / 15m).
- **Retries:** `P1_DOCUMENSO_RETRIES` default **0** on functional Documenso projects; Cal keeps CI `retries: 2`.
- **tRPC 429 fail-fast:** `attachDocumensoTrpc429Guard` on functional Documenso pages fails immediately with the tRPC URL (avoids 120s editor waits when rate limited).
- **Browsers / matrix / caches / path filters:** unchanged from the initial 0011 draft (Chrome channel, Firefox FW-001..003, `RUNNER_TEMP` clone path, caches, leak gate, failure artifacts).
- **Known bugs:** Four 2FA cases use `test.fail()` with HTTP/trace proof in [documenso-2fa-known-issues.md](../observations/documenso-2fa-known-issues.md) (CI run 38388797450).

## Consequences

- Functional suites are not a substitute for Documenso rate-limit tests; **P1-DOC-RL-001** must stay in the CI harness phase (`test:documenso:rate-limit`) before the bypass stack, separate from the functional Playwright project graph.
- Harness **v0.2.6+** is required for bypass env on the Remix child and `down()` stopping the web listener before compose teardown.
- Required check after first green run: `e2e / documenso-self-hosted`.
