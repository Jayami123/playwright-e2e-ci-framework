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
- Docker on Windows: an in-container TCP proxy `127.0.0.1:<port>` to `host.docker.internal` keeps the baseURL origin. Linux hosts use `--network host` plus `--user uid:gid`; CI (task 6) runs on a GitHub-hosted `ubuntu-latest` runner with `--network host`.
- Reproducibility: regenerating baselines in the pinned image is stable at the pixel level, not the byte level. Two regenerations count as stable when at most 0.01% of pixels differ and no colour channel differs by more than 2. Measured on 2026-10-15: desktop differed by 0–40 px (max delta 1/255), all on the anti-aliased rounded corners of the booker card; mobile and tablet matched.
- a11y: `@axe-core/playwright` exact pin, WCAG 2.0/2.1 A+AA tags, serious and critical reported as a JSON attachment. The a11y specs fail on serious and critical violations; known product bugs go on the allowlist in `src/support/visual/axe.ts` with a finding, and an allowlist entry that matches nothing fails as stale.

## Consequences

- Baseline churn when Playwright is bumped: the image tag moves with it, so regenerate all PNGs in one PR.
- Cal theme is user-driven, so dark baselines use a dedicated QA user from `qa-user.ts` with the theme set through the API. Never use `pro`, which parallel Cal specs share.
- Visual and a11y specs run only in `visual-*` projects; the existing product projects ignore `**/visual/**` and `**/a11y/**`.

## Alternatives rejected

- Per-OS baselines.
- `--network host` on Docker Desktop (cannot reach the Windows loopback).
- `host.docker.internal` as baseURL (changes the origin and absolute asset URLs).
- Percy or Argos SaaS.
