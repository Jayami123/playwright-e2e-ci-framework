# 0011. Self-hosted Documenso on GitHub-hosted runners

- Status: Accepted
- Date: 2026-10-13

## Context

Phase 2e adds Documenso auth, signing, and passkey primitives (`P1-DOC-*`) against [Jayami123/documenso](https://github.com/Jayami123/documenso) via `qa-portfolio-harness` `#v0.2.6`. The public Playwright origin is `http://p1.lvh.me:3001` (hosts file → `127.0.0.1`); listen URL stays `http://127.0.0.1:3001`. Passkeys need a **secure context**, so `documenso-chromium` uses Playwright `channel: "chrome"` plus `--unsafely-treat-insecure-origin-as-secure=<publicUrl>` ([passkey notes](../observations/documenso-passkey-e2e-notes.md)).

A full `documenso-chromium` run (~27 tests) exceeds Documenso `apiTrpcRateLimit` (100 `/api/trpc/*` per IP per minute) and can exhaust `loginRateLimit` (50 authorize per IP per 15m) when limits are enforced. CI trace evidence (run 38377317652): `organisation.internal.getOrganisationSession` returned **429** during FW-002, leaving the envelope editor unloaded.

## Decision

- **Job:** `documenso-self-hosted` in reusable [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml). Independent of `CAL_E2E_BASE_URL`. PR gate: `npm run test:documenso` (runs `P1-DOC-RL-001`, bypass setup, then the full functional project).
- **Rate limits in functional E2E:** After **P1-DOC-RL-001**, harness restarts Remix with `DANGEROUS_BYPASS_RATE_LIMITS=true` in the app env (`buildDocumensoAppEnv` in harness `documenso-env.ts`, read at request time in `packages/lib/server-only/rate-limit/rate-limit.ts` ~73–79 and `assert-organisation-rates-and-limits.ts` ~32–34). Triggered by Playwright setup `tests/setup/documenso-bypass.setup.ts` via `DOCUMENSO_RESTART_WEB=1` (harness `documenso.adapter.ts` `restartWebServer()`). Never edit the Documenso fork `.env`; never start/stop outside harness `up.mjs`.
- **P1-DOC-RL-001:** Project `documenso-rate-limit-chromium` runs first with bypass **off**, asserts HTTP **429** on the 51st `POST /api/auth/email-password/authorize` in one IP bucket (`loginRateLimit` globalMax 50 / 15m).
- **Retries:** `P1_DOCUMENSO_RETRIES` default **0** on functional Documenso projects; Cal keeps CI `retries: 2`.
- **tRPC 429 fail-fast:** `attachDocumensoTrpc429Guard` on functional Documenso pages fails immediately with the tRPC URL (avoids 120s editor waits when rate limited).
- **Browsers / matrix / caches / path filters:** unchanged from the initial 0011 draft (Chrome channel, Firefox FW-001..003, `RUNNER_TEMP` clone path, caches, leak gate, failure artifacts).
- **Known bugs:** No `test.fail()` without findings HTTP/trace proof. Four 2FA cases remain strict failures until evidence-backed `test.fail()` is approved.

## Consequences

- Functional suites are not a substitute for Documenso rate-limit tests; **P1-DOC-RL-001** must stay in the `test:documenso` dependency chain.
- Harness **v0.2.6+** is required for bypass env on the Remix child and `DOCUMENSO_RESTART_WEB`.
- Required check after first green run: `e2e / documenso-self-hosted`.
