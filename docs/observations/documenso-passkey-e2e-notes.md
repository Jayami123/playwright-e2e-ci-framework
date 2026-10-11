# Documenso passkey E2E (Phase 2e task 4a)

## Environment: HTTP public origin and secure context

Chromium treats `http://` on a non-localhost hostname (for example `http://p1.lvh.me:3001`) as **not** a [secure context](https://w3c.github.io/webappsec-secure-contexts/), so `navigator.credentials` / WebAuthn are unavailable unless the browser is started with `--unsafely-treat-insecure-origin-as-secure=<DOCUMENSO_PUBLIC_URL>`. P1 applies that flag only on the `documenso-chromium` Playwright project (see `playwright.config.ts` and `documensoTreatInsecureOriginAsSecureLaunchArg()` in `src/products/documenso/env.ts`).

Playwright’s bundled Chromium in **headless** mode does not treat that flag as a secure context on Windows (verified 2026-10-11: `window.isSecureContext` stays `false`). The `documenso-chromium` project uses `channel: "chrome"` so headless passkey runs get `isSecureContext === true` with the same flag.
