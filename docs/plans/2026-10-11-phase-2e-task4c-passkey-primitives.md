# Phase 2e task 4c: extra passkey primitive tests

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci`, branch `feat/2026-10-11-p1-phase2e-documenso-2fa`. User cited head `1b9a7a7`; current HEAD is `d550daa` (4b plan commit on top of those tests). Documenso `f4105e47` at `http://p1.lvh.me:3001`. Plan only. Do not start, stop, or rebuild Documenso.

All three candidates are testable without fork changes. Keep 004, 005, and 006.

## 1. Code reading (verified)

### P1-DOC-PK-004 challenge replay

[passkey.ts](D:/Jayami/Portfolio/products/documenso/packages/auth/server/routes/passkey.ts) `POST /api/auth/passkey/authorize`: `anonymousVerificationToken.delete({ where: { id: csrfToken } })` runs **before** lookup. A second POST with the same `{ csrfToken, credential }` hits `delete` → null → `AppError(INVALID_REQUEST)`. No session is created (`onAuthorize` is never reached).

Hono `onError` uses `err.statusCode || 500`. Predicted HTTP 500, body `{ code: "INVALID_REQUEST" }`. Same family as PK-003 `NOT_SETUP`.

Single-use is proven. 004 should **pass** (refusal). Do not `test.fail`. Record live status in the report (`P7-OBS-DOC-PK-001` already covers auth AppError → 500; do not assert 4xx here).

### P1-DOC-PK-005 clone detection

[verifyAuthenticationResponse](D:/Jayami/Portfolio/products/documenso/node_modules/@simplewebauthn/server/esm/authentication/verifyAuthenticationResponse.js) lines 144-150: if either authenticator `counter` or stored `credential.counter` is greater than 0, and authenticator `counter <= stored`, it throws. Authorize catches that as `null` and throws `INVALID_REQUEST` (again predicted HTTP 500). Both-zero skips the check, so a rewind is only meaningful **after one successful get**.

**Choice: CDP rewind, not a DB bump.** A cloned/restored authenticator presents the same credential id and key with a lower signCount. That is the WebAuthn clone model. Bumping `"Passkey"."counter"` in SQL only pretends the RP is ahead; it is easier but less realistic.

Steps: enrol, sign out, passkey sign-in once (002 path, stored counter becomes 1), `WebAuthn.getCredentials` (must include `privateKey`, `credentialId`, `rpId`, `userHandle`), `removeCredential`, `addCredential` with the same fields and `signCount: 0`, sign out, Passkey again. Expected: `INVALID_REQUEST`, no session.

If the first live `getCredentials` object has no `privateKey`, stop and switch this test to `UPDATE "Passkey" SET counter = counter + 1000` in the same task. Do not put an `if` in the spec.

Do not `test.fail`. Clone detection is implemented.

### P1-DOC-PK-006 duplicate credentialId

Schema `Passkey.credentialId` is `Bytes` with **no `@unique`**. [create-passkey.ts](D:/Jayami/Portfolio/products/documenso/packages/lib/server-only/auth/create-passkey.ts) always `passkey.create`. `excludeCredentials` is only on **options**, not on insert.

Calling tRPC `auth.passkey.create` twice with the same body is not enough on its own: create **deletes** `PASSKEY_CHALLENGE` tokens before verify, so a naive second POST is `NOT_FOUND` (tRPC maps that to HTTP 404) and never inserts.

Testable path without a fork change: capture the first UI tRPC `POST /api/trpc/auth.passkey.create` (superjson body + session cookies), re-insert `VerificationToken` (`identifier = 'PASSKEY_CHALLENGE'`, `token` = original challenge, `userId`, future `expires`; `token` is `@unique` but the row was deleted), POST the **exact same** tRPC body again. That skips `excludeCredentials` and re-runs insert.

Predicted: second create 200, `"Passkey"` count for the user is 2. Confirm live on the first 006 run. If count is 2, keep `test.fail` and still assert `count === 1` (unexpected pass when a unique index lands). If count stays 1, drop `test.fail` and report the prediction was wrong. Evidence JSON: `secondHttpStatus`, `passkeyCount` only (do not attach credential/attestation; `serializeKnownBugEvidence` would redact those keys anyway).

`P7-OBS-DOC-PK-002` (severity low): defence-in-depth: no unique index on `Passkey.credentialId`; duplicate only reachable via a test-only DB seam (re-inserted challenge), not exploitable through the API alone.

## 2. How each test is built

Reuse `enrolPasskeyForSignIn` from [passkey-signin.spec.ts](tests/documenso/auth/passkey-signin.spec.ts): move it to [src/products/documenso/passkey-enrol.ts](src/products/documenso/passkey-enrol.ts) and import from both specs. `documensoUser` + `virtualAuthenticator`, empty storageState, tag `@passkey`. File [tests/documenso/auth/passkey-primitives.spec.ts](tests/documenso/auth/passkey-primitives.spec.ts).

| ID  | UI                                                                | API / CDP / SQL                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 004 | enrol + sign out + Passkey (capture authorize request body)       | `newDocumensoApiContext()` POST same JSON to `/api/auth/passkey/authorize` with `Origin` = public URL. Assert `INVALID_REQUEST`, `isAuthenticated === false`, no session cookie on that context. First UI authorize remains 200. |
| 005 | enrol + sign out + Passkey (success) + sign out + Passkey (clone) | CDP remove/add between the two sign-ins.                                                                                                                                                                                         |
| 006 | enrol (captures tRPC create)                                      | `insertPasskeyChallenge(userId, challenge)`, replay create via `page.request` (session cookies). Assert count 1 with `test.fail` only if the live run shows count 2.                                                             |

No CSS, XPath, sleeps, retries, or `if` oracles. Locators already in [SignInPage](src/products/documenso/pages/signin.page.ts) / [PasskeysSettingsPage](src/products/documenso/pages/passkeys.page.ts). `menu-switcher` stays in the page object.

004 must not reuse the page context for the replay (the first authorize already set a session cookie there). Fresh API context is the oracle for "no session".

## 3. Rate limits

Existing `@passkey` (001-003): 3 logins, 2 passkey authorizes.

New: 004 = 1 login + 2 passkey; 005 = 1 login + 2 passkey; 006 = 1 login + 0 passkey.

One `@passkey` run (001-006): **6 logins, 6 passkey authorizes**. Twice: **12 logins, 12 passkey**.

`passkeyRateLimit` is max **10 per IP per 15 m**. Two `@passkey` runs in one bucket will 429. Do not set `DANGEROUS_BYPASS_RATE_LIMITS`. Between the two `@passkey` gate runs, wait for the next 15-minute wall-clock bucket (check `"RateLimit"` `action = 'auth.passkey'` IP row). Login 12 + `@2fa` 23 = 35 of 50; logins fit in one bucket.

## 4. Cleanup and leak

User delete still cascades `Passkey` and `VerificationToken`. 006's extra row and restored challenge go with the user. `AnonymousVerificationToken` is deleted on first 004 authorize; the replay does not insert. Leak script already fails on leftover QA passkeys. No leak-script change.

New SQL helpers in [qa-user.ts](src/products/documenso/qa-user.ts): `insertPasskeyChallenge(userId, token, expiresAt)` (006 only). Do not log the token.

## 5. Files

- New: `tests/documenso/auth/passkey-primitives.spec.ts`, `src/products/documenso/passkey-enrol.ts`, `docs/plans/2026-10-11-phase-2e-task4c-passkey-primitives.md`.
- Edit: `tests/documenso/auth/passkey-signin.spec.ts` (import shared enrol), `src/products/documenso/pages/security.page.ts` (waiter), `src/products/documenso/qa-user.ts`, `src/products/documenso/auth.ts` (`postPasskeyAuthorize` for 004 replay), maybe `env.ts` if a tRPC path constant is needed.
- After the build, commit this plan with the code. The 4b plan is already on `d550daa`.
- Not added: dependency, fork edit, PK-007.

## 6. Checks

Health: `GET http://p1.lvh.me:3001/signin` and `.../api/auth/csrf`, both 200. Never touch Cal. One Playwright process at a time.

1. `npm run test:documenso -- --grep "P1-DOC-PK-004"`
2. `npm run test:documenso -- --grep "P1-DOC-PK-005"`
3. `npm run test:documenso -- --grep "P1-DOC-PK-006"` (confirm count before locking `test.fail`)
4. `npm run test:documenso -- --grep "P1-DOC-2FA-001"` after the waiter change
5. Gate: `@passkey` twice **in different 15 m passkey buckets**, then `@2fa` once
6. `npx tsx scripts/count-documenso-qa-leaks.mts` exit 0
7. `npm run check` must pass
8. Explicit-path commit (include this plan). `git push origin feat/2026-10-11-p1-phase2e-documenso-2fa`. No PR

## Review notes (2026-10-11)

`P7-OBS-DOC-PK-002` is defence-in-depth: no unique index on `Passkey.credentialId`; duplicate only reachable via a test-only DB seam (re-inserted challenge), not exploitable through the API alone. Severity low. Keep `test.fail` only if the live run shows count 2.
