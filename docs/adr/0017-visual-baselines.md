# 0017. Visual baselines and a11y scans

- Status: Accepted
- Date: 2026-10-15

## Context

Screenshot pixels depend on OS font rendering, so baselines must come from one pinned Linux image. Cal's booker is time-driven: today's slots shrink through the day, the selected date and month label follow real time, and seeded bookings sit 1–3 days after the seed date.

The Step 0 probe on 2026-10-15 (Chromium 1.63.0, each viewport loaded twice per clock mode) found:

- With the real clock, the mobile load-to-load diff was 39% (cold first load) and today showed 1 slot left.
- With `page.clock.setFixedTime("2030-01-14T10:00:00.000Z")` the booker shows "January 2030", Mon 14 selected and 16 slots (`9:00am`–`4:30pm`). Load-to-load diff was 0 px at mobile, tablet and desktop.
- A screenshot taken as soon as `booker-container` is visible differs from the settled one by 20–65%, so the helper waits for slots, network idle, fonts and images.
- `pro` is seeded with `theme: "light"`, which overrides `prefers-color-scheme`.
- Docker Desktop `--network host` cannot reach the Windows loopback (connection refused); `host.docker.internal` works.

## Decision

- Linux-only baselines from `mcr.microsoft.com/playwright:v<exact @playwright/test>-jammy`; no platform suffix; Windows and macOS skip `toHaveScreenshot` unless `VISUAL_LOCAL=1`.
- Chromium only; 393x852, 820x1180, 1440x900; DPR 1; `en-US`; `Europe/London`; light.
- Tolerance `maxDiffPixelRatio` 0.01, animations disabled, caret hidden. Tuning only after 5 consecutive Docker reruns show non-zero drift; record the measured ratio; use a per-assertion override (never global) with a comment linking evidence. 1% of 1440x900 is 12,960 px (about one slot button), so do not loosen globally.
- Clock: `freezeClock` before the first `goto` with a future UTC instant (default `2030-01-14T10:00:00Z`); the server hides past slots using real time.
- Masking policy: mask only content outside test control (user images, third-party embeds, real-time stamps the clock cannot freeze). Never mask the thing under test. Each mask has a reason in `src/support/visual/masks.ts`.
- Who updates baselines: a manual `workflow_dispatch` job (task 6) runs `visual:update` on Linux and opens a PR with the PNG diff; locally only via `npm run visual:update` (Docker). Never commit PNGs made outside the pinned image.
- Visual, a11y **and i18n** specs run only in `visual-*` projects (`**/i18n/**` joins the match and ignore globs).
- The Docker wrapper forwards the Cal DB port as well as the web port, sets `CAL_DB_URL` to `127.0.0.1` and stubs `PRODUCTS_ROOT` (`buildVisualDockerEnv`), because fixtures write QA users from inside the container.
- Docker on Windows: an in-container TCP proxy `127.0.0.1:<port>` to `host.docker.internal` keeps the baseURL origin. Linux hosts use `--network host` plus `--user uid:gid`; CI (task 6) runs on a GitHub-hosted `ubuntu-latest` runner with `--network host`.
- Reproducibility: regenerating baselines in the pinned image is stable at the pixel level, not the byte level. Two regenerations count as stable when at most 0.01% of pixels differ and no colour channel differs by more than 2. Measured on 2026-10-15: desktop differed by 0–40 px (max delta 1/255), all on the anti-aliased rounded corners of the booker card; mobile and tablet matched.
- a11y: `@axe-core/playwright` exact pin, WCAG 2.0/2.1 A+AA tags, serious and critical reported as a JSON attachment. The a11y specs fail on serious and critical violations; known product bugs go on the allowlist in `src/support/visual/axe.ts` with a finding, and an allowlist entry that matches nothing fails as stale.

## Consequences

- Baseline churn when Playwright is bumped: the image tag moves with it, so regenerate all PNGs in one PR.
- Cal theme is user-driven, so dark baselines use a dedicated QA user from `qa-user.ts` with the theme set through the API. Never use `pro`, which parallel Cal specs share.
- Visual, a11y and i18n specs run only in `visual-*` projects; the existing product projects ignore `**/visual/**`, `**/a11y/**` and `**/i18n/**`.
- A slot click reserves that slot for every visitor for `MINUTES_TO_BOOK` (5). Specs never select `pro` slots; selection happens only on per-test QA users, whose teardown deletes their `SelectedSlots` (keyed by the event host `userId`).
- Dark baselines use the `darkThemeQaUser` fixture (tRPC `me/updateProfile`).

## Alternatives rejected

- Per-OS baselines.
- `--network host` on Docker Desktop (cannot reach the Windows loopback).
- `host.docker.internal` as baseURL (changes the origin and absolute asset URLs).
- Percy or Argos SaaS.

## Amendment 2026-10-16

Phase 3 rest batch (CI visual job, Documenso and Twenty cases). These change what is written above.

- **Baseline update.** The `Update visual baselines` workflow uploads the changed PNGs as an artifact for human review. It replaces "opens a PR". Pushes made with `GITHUB_TOKEN` do not trigger CI, so a bot-opened PR would show stale checks, and committing needs `contents: write`. The workflow refuses `main`, and normal PR runs never update baselines.
- **`--product` scoping.** `visual:test` and `visual:update` take `--product=cal|documenso|twenty|all`, which limits Playwright to that product's directory. Every Documenso or Twenty update runs with `--product`, so Cal's anti-aliased baselines are never regenerated by accident.
- **Ports per product.** Cal: web and DB. Documenso: listen port 3001, DB 5451 and Inbucket 9003, plus `--add-host p1.lvh.me:127.0.0.1`, because the public origin is `http://p1.lvh.me:3001`. Twenty: 3002 only (its fixtures are GraphQL). Secret-looking env keys (`*PASSWORD*`, `*SECRET*`, `*TOKEN*`) are masked in the printed docker command.
- **No insecure-origin flag.** The Documenso visual projects launch without `--unsafely-treat-insecure-origin-as-secure`: on 2026-10-16 the signing page rendered, opened the signature dialog and signed with `isSecureContext` false. The flag changed nothing in bundled Chromium either (`isSecureContext` stayed false).
- **Masks.** `MaskSpec` gains `selector` (Documenso: the PDF canvas) and `text` (Twenty: relative times, record position, view row count) forms. Each still carries a reason.
- **Allowlists.** Entries gain optional `contexts` (`light`, `dark`, `wcag`) and match by in-page `element.matches(target)`, because axe reports positional selectors for these products. Cal keeps `AXE_ALLOWLIST`; Documenso and Twenty have their own lists, passed explicitly, so an entry is never stale in another product's scan. Targets prefer `data-testid`, then ARIA attributes, then source-level class names; a build-hashed Twenty class is allowed only with a comment saying why nothing stable exists, and a Twenty image bump makes those stale on purpose.
- **Public reports.** The GitHub Pages copy is built from blob reports, with traces, videos and storage state removed, behind a secret-scan gate that fails the deploy on any hit. Traces stay in private Actions artifacts (a CI trace was found to hold session cookies and a login body).
- **Twenty QA member.** Theme and locale cases use a dedicated `p1-qa-*` workspace member created per worker through the public invite link, changed through the member's own `updateWorkspaceMemberSettings`, and removed with the member's own `deleteUser`. Jane is read-only (invite hash, leak counts); her preferences are never written.
- **CI gate.** Each product job runs the visual suite with `continue-on-error: true` and exports `visual` and `visual_requested`. The `visual` aggregator job fails when a product job ran and its requested visual step was skipped or failed, so a failed Documenso bypass start can no longer pass the check. A product job skipped as a whole (path filter, live-URL path, `visual_product` filter) is not gated.
