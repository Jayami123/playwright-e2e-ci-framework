# Phase 3 rest batch: CI visual job, GitHub Pages, Documenso and Twenty visual/i18n cases, closeout

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1. Branch `feat/2026-10-16-p1-phase3-rest-batch` from `main` `3bf45b8` (PR #34). Harness `#v0.2.9`. Documenso fork `f4105e47`, Twenty image `twentycrm/twenty:v2.44.0` (fork `7cbdfec` is reference only). Product forks under `D:\Jayami\Portfolio\products` are read-only. Status: **Step 0 probe done (2026-10-16); review round 2 applied (extras accepted, aggregator, Pages, candidate re-repro, committed evidence, stable allowlist targets). Built 2026-10-16; see the PR for deviations (Documenso F1 re-measured as blue `bg-water` 4.39:1, Twenty F4 widened to tablet, extra entries Documenso X07-F10 and Twenty X06-F14, X03 Tab bound 60, `tw-people-de` clipped below the top bar).**

This batch is master-plan tasks 6 (CI visual job, baseline update flow, browser-install resilience, GitHub Pages), 7 (Documenso and Twenty visual/i18n cases) and 8 (closeout). One plan, one build, one PR titled `test(visual): phase 3 rest batch ci, documenso and twenty cases`.

"Verified" means seen live on 2026-10-16 or read in source. Anything a builder cannot confirm at build time: stop and report, do not improvise.

## Resolved decisions

- **CI shape (you, 2026-10-16):** a `visual:test` Docker step in each of `cal-self-hosted`, `documenso-self-hosted` and `twenty-self-hosted`, with `continue-on-error: true`, plus a `visual` aggregator job in `e2e.yml` that `needs` all three. The check shows as `e2e / visual`.
  - Each product job exports two outputs: `visual` (the step outcome) and `visual_requested`, which a first step sets to `true` on every normal run and to `false` only on probe-only or matrix runs.
  - The gate fails when `visual_requested` is `true` (or empty because the job died first) and the visual step was skipped, empty or failed. So a Documenso bypass start that fails can no longer turn the check green. The same rule applies to Cal and Twenty (review round 2).
- **Baseline update (my pick):** a `workflow_dispatch` workflow `Update visual baselines` that reuses `e2e.yml` with `visual_mode: update`, `visual_only: true` and one product. It **uploads the changed PNGs as an artifact**; a human reviews and commits them. Not a bot commit: pushes made with `GITHUB_TOKEN` do not trigger CI, so the PR would show stale checks, and committing needs `contents: write`. It refuses `main`. Normal PR runs never update baselines.
- **Don't change Jane (you).** Twenty theme and locale cases use a dedicated **P1-QA workspace member** created per worker through the public invite link (verified possible, so no Jane fallback). Jane is only read (invite hash, leak check).
- **Public reports (you):** the Pages copy carries no traces, no videos and no storage state; a secret-scan gate fails the deploy on any hit. Traces stay in private Actions artifacts.
- **Closeout (you):** README "Scope" and "Implemented P1 cases" tables plus the existing `docs/observations/*-known-issues.md`. No new .md files beyond this plan and the ADR 0017 amendment.
- **Documenso secure context:** the visual projects need **no** `--unsafely-treat-insecure-origin-as-secure` flag (P3.0: the signing page works fully without a secure context).
- **Allowlists are per product.** Cal keeps `AXE_ALLOWLIST`; Documenso and Twenty get their own lists, passed explicitly, so one product's entries are never stale in another product's scan. Entries gain optional `contexts` (`light`/`dark`) and match by in-page `element.matches(target)` (axe reports positional selectors for these products).
- **Cal baselines are never regenerated.** Every update in this batch runs with `--product=documenso` or `--product=twenty`, which limits Playwright to `tests/documenso` or `tests/twenty`.
- **Commits:** Conventional Commits, lowercase subjects, **no Co-Authored-By or model trailer** (your rule overrides the tool default).
- **Extra cases (you, round 2):** **accepted** `P1-DOC-VIS-X01`–`X07` and `P1-TW-VIS-X01`–`X06`. **Dropped** `P1-TW-VIS-X07` (RTL, not probed), which is carried to Phase 4. All counts below include the accepted extras.
- **Candidate bugs are re-reproduced before `test.fail` (you, round 2).** `DOC-VIS-X01`, `X03` and `X04` are candidates. So are `TW-VIS-X01`, `X02` and `X05`: I apply the same rule to them because they carry the same label.
  - In Step 14, each must fail the same way on a second, separate run before its `test.fail` is kept.
  - Each spec calls `attachKnownBugEvidence` before the `test.fail` assertion.
  - If one does not reproduce, stop and report. Never loosen the assertion.
- **Committed evidence (you, round 2):** one small PNG plus one JSON per product bug under `docs/observations/evidence/`, exported from the second Docker run and linked from the observations files. CI artifacts expire after 14 days.
- **Allowlist targets (you, round 2):** use a stable `data-testid` or ARIA role/attribute where the probe found one. Tailwind utility classes (Documenso) are source-level names, not build hashes. Hashed Twenty classes stay only where nothing stable exists, and each such entry carries a `// hashed v2.44.0 class:` comment saying why.
- **GitHub Pages (you, round 2):** you enable Pages (Settings → Pages → Source "GitHub Actions") **before merging**, otherwise `pages-deploy` fails on every push to `main` (Step 17).

## Step 0: probe findings (verified 2026-10-16)

Probe scripts and screenshots live in the session scratchpad only (`…/scratchpad/probe/`); nothing was written to the repo. "Evidence" below names the screenshot or measurement; at build time the same evidence is re-captured by the spec through `attachKnownBugEvidence`.

### Baselines and housekeeping

| #   | Item                                 | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0  | `--list` (`P1_PLAYWRIGHT_HARNESS=0`) | cal-chromium 20 tests/7 files; documenso-chromium 27/8; twenty-chromium 14/4; unit 137/19; visual-mobile/tablet/desktop 15/10 each.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P0  | Leaks before                         | Twenty sweep 0/0/0 (records, views); Cal QA users 0; Documenso users 0, qaEnvelopes 0, qaRecipients 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P0  | Jane                                 | `colorScheme System`, `locale en`, `timeZone system`; `.auth/twenty-jane.json` sha256 `61a89e9f…462a6c`. Unchanged at the end of the probe (re-checked twice).                                                                                                                                                                                                                                                                                                                                                                                                                |
| P0b | Trace secrets                        | CI trace zip (run 38475954875, `playwright-report-documenso-firefox`): `set-cookie` 11 (`sessionId`, `csrfToken`, `lang`, `preferred-team-url`), `Cookie:` 4, `sessionId` 613, one stored login request body containing `"password"`. HTML reports and `results.json`: no cookies or tokens; only the public CI DB defaults `postgres://documenso:***@127.0.0.1:5451` and `postgres://postgres:***@127.0.0.1:5434` (same values as `e2e.yml` env). `twenty-session`, `tokenPair`, `Bearer`, `refreshToken`, `loginToken`: 0 everywhere. **So traces must never reach Pages.** |
| P1  | Documenso start                      | `scripts/up.mjs documenso` (bypass on): build matched HEAD (skipped), `/signin` and `/api/auth/csrf` 200 on `p1.lvh.me:3001`. Left running.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CI  | PR #34 failure                       | `npx playwright install chrome --with-deps` downloads `google-chrome-stable_current_amd64.deb` from dl.google.com; `curl: (92) HTTP/2 stream 1 was not closed cleanly`. The `~/.cache/ms-playwright` cache (already keyed on the Playwright version) cannot cover that `.deb`, so the fix is a retry wrapper.                                                                                                                                                                                                                                                                 |
| CI  | Pages                                | `GET /repos/…/pages` 404, `has_pages: false`, repo public. Nothing published yet. A repo admin must set Settings → Pages → Source "GitHub Actions" before the first deploy.                                                                                                                                                                                                                                                                                                                                                                                                   |
| CI  | Action pins                          | `actions/upload-pages-artifact` v5.0.0 = `fc324d3547104276b827a68afc52ff2a11cc49c9`; `actions/deploy-pages` v5.0.1 = `368f82528645a54fb793d4d04e342629a3f51346`.                                                                                                                                                                                                                                                                                                                                                                                                              |
| CI  | Cal lifetime                         | The harness spawns Cal's web server **non-detached** inside the `test:cal` run (`cal.adapter.ts` `spawnLogged` without `detached`). The visual step must not assume Cal survived; it health-checks and runs `up.mjs cal` if needed.                                                                                                                                                                                                                                                                                                                                           |
| CI  | Twenty seed                          | The harness has no seed script; seeding runs in `global-setup/twenty.ts`. A visual-only run seeds by running `--project=twenty-setup` first.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Documenso

| #    | Item                                 | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P3.0 | Secure context                       | Without the flag: `isSecureContext` false, `crypto.subtle` undefined, yet "Sign Document" and the canvas render, the signature dialog opens, a typed signature enables "Sign", 0 page/console errors. With the flag (bundled Chromium) nothing changes (`isSecureContext` still false). **Decision: no flag.**                                                                                                                                                     |
| P3   | Signing route                        | `/sign/<recipientToken>` renders `DocumentSigningPageViewV2`. Token from `readSentEnvelopeByRecipientEmail(email).recipientToken`.                                                                                                                                                                                                                                                                                                                                 |
| P3   | PDF request                          | `GET /api/files/token/<token>/envelope/<envelopeId>/envelopeItem/<itemId>/dataId/<documentDataId>/current/item.pdf` (version segment `current`, not inlined). Matcher: `/\/api\/files\/token\/[^/]+\/envelope\/[^/]+\/envelopeItem\/[^/]+\/dataId\/[^/]+\/[^/]+\/item\.pdf(\?.*)?$/`.                                                                                                                                                                              |
| P3   | Signing page facts                   | Headings: the envelope title (`h1`) and "Sign Document" (desktop: "Sign Document\n1 Field Remaining"). Visible buttons mobile/tablet: "Actions", "Expand", "Next Field"; desktop: "Next Field", "Collapse sidebar", "Download PDF", "Reject Document". Text "1 Field Remaining". Canvas `.konva-container canvas` at mobile 9,70 377×181; tablet 17,94 788×378; desktop 481,94 800×384. Only test id: `signature-pad-dialog-button`. **No date text on the page.** |
| P3   | Pixel drift                          | 0 px (ratio 0, max delta 0) between two loads at 393, 820 and 1440, with real and frozen clock.                                                                                                                                                                                                                                                                                                                                                                    |
| P3   | German                               | `locale: "de-DE"` (Accept-Language) and the `lang` cookie both give `html[lang=de]`, "Dokument signieren", "Aktionen", "Abschließen". After `envelope.field.sign` (HTTP 200) "Next Field" becomes "Complete"/"Abschließen". Mobile "Abschließen" at x261 y760 107×36 (inside 393×852); tablet x666 y1082; desktop header x1309 y12. No horizontal overflow. **Two Complete buttons exist; one is hidden (0×0), so locators must take the visible one.**            |
| P3   | Long title (200) mobile              | Header `h1` `truncate` (ellipsis, nowrap) with `title` = full 200 chars, width 252; document `scrollWidth` 393 = `clientWidth`.                                                                                                                                                                                                                                                                                                                                    |
| P3   | Long title tablet/desktop            | md+ header `h1` is `whitespace-nowrap` with no truncation, 1433 px wide; document `scrollWidth` 1781 (cw 820) and 1891 (cw 1440); "Actions" pushed to x1704 (tablet), "Next Field" to x1834 (desktop). **PRODUCT BUG candidate** (screenshots `doc-long-sign-tablet.png`, `doc-long-sign-desktop.png`).                                                                                                                                                            |
| P3   | Long recipient name (80)             | Not shown as text. Desktop sidebar: textbox labelled "Full Name", value 80 chars, x16 w287, scrolls internally. Mobile: after clicking "Expand" (bottom widget) the same "Full Name" textbox at x25 w343 inside 393. ("Actions" on mobile is only a menu: Download PDF, Reject.)                                                                                                                                                                                   |
| P3   | Documents list                       | `/t/<teamUrl>/documents`. Title `a[title]` truncate with ellipsis (mobile w160, desktop w320, `title` = full title). Columns: Created, Title, Sender, Recipient, Status, Actions. Recipient shows initials avatar (`aria-haspopup=dialog`). Row action button `data-testid="document-table-action-btn"`. "Created" shows the real timestamp (dynamic). On mobile the table scrolls inside its container; document width stays 393.                                 |
| P3   | Theme                                | No `theme` cookie: follows `prefers-color-scheme` (`html.light`/`html.dark`, body `rgb(255,255,255)` / `rgb(38,38,38)`). `POST /api/theme` JSON `{theme:"dark"}` → 200 and a `theme` cookie that wins over emulation.                                                                                                                                                                                                                                              |
| P3   | axe `color-contrast` on `/documents` | Both themes, all viewports: pending-recipient initials `span.bg-yellow-200.text-yellow-700` `#a16207` on `#fef08a` 4.23:1 (one node per pending row). Light only, all viewports: "Organize your documents" `div.text-muted-foreground\/60` `#a2acb9` on `#fff` 2.29:1. Light only, tablet/desktop: "Ctrl+K" hint `div.bg-muted.px-1\.5` `#64748b` on `#f1f5f9` 4.34:1. **PRODUCT BUGs** (WCAG 1.4.3).                                                              |
| P3   | axe full WCAG on `/documents`        | critical `button-name` (`document-table-action-btn`, mobile header `.space-x-4 > button` ×2, a `role=combobox` filter); critical `label` (two hidden file inputs, one is `document-upload-input`); serious `link-name` (tablet/desktop, `a.md\:inline`); serious `nested-interactive` (`.bg-primary` `role=presentation` button). **PRODUCT BUGs.**                                                                                                                |
| P3   | PDF 500 / abort                      | 500 (JSON, empty or HTML body) and `route.abort()`: spinner at 1 s; by 5 s the error state "Something went wrong while loading the document." plus toast "Error" / "An error occurred while loading the document."; toast gone by 15 s, error state stays. One PDF request (no retries). Correct behaviour. "Next Field" stays enabled without a PDF (observation).                                                                                                |
| P3   | PDF stall                            | Response never arrives: spinner at 1, 5, 15, 30 and 60 s; no error, no toast, no console error. **PRODUCT BUG candidate** (`doc-pdf-stall-desktop-{1,5,15,30,60}s.png`).                                                                                                                                                                                                                                                                                           |
| P3   | Keyboard                             | Desktop, field signed: Tab 1 = logo link, Tab 2 = "Complete"; Enter opens dialog with heading "Are you sure?".                                                                                                                                                                                                                                                                                                                                                     |
| P3   | forced-colors                        | `(forced-colors: active)` matches; Complete border `solid rgb(0,0,0)`.                                                                                                                                                                                                                                                                                                                                                                                             |
| P3   | 200% zoom                            | 197×426 at DPR 2: no page scroll (`scrollWidth` 197) but Complete at x176 w88, right edge 264 > 197: clipped, only a sliver visible (`doc-zoom200.png`). **PRODUCT BUG candidate** (WCAG 1.4.10).                                                                                                                                                                                                                                                                  |
| P5   | Docker                               | Pinned image `v1.63.0-jammy` on the Windows host, proxies for 3001, 5451, 3002, 5434 to `host.docker.internal` and `--add-host p1.lvh.me:127.0.0.1`: Documenso `/signin` and `/csrf` 200, signing page renders at 393 (heading and canvas, 0 errors), a real `pg` query to the Documenso DB works. Inbucket (`127.0.0.1:9003`, used by mailbox cleanup) is published the same way as 5451; Step 3's round trip proves it from the container.                       |

### Twenty

| #    | Item                 | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4.0 | QA member            | `currentWorkspace { isPublicInviteLinkEnabled: true, inviteHash }` (metadata, read as Jane). `signUpInWorkspace(email, password, workspaceId, workspaceInviteHash)` → 200 with `loginToken`. UI login (`/welcome` → email → "Continue" → "Password" → "Sign in") lands on `/create/profile` (textboxes with placeholders "Tim", "Apple", "Head of Partnerships"; button "Continue") → `/objects/companies`.                                                                                                                                                                                                                                                                                                                                                                                           |
| P4.0 | QA member rights     | Generic `updateWorkspaceMember` → FORBIDDEN. Self-service `updateWorkspaceMemberSettings(input: { workspaceMemberId, update: { colorScheme, locale } })` (metadata) → `true`, read back Dark / de-DE. The member can read seeded people and create/destroy its own companies and people.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P4.0 | QA member teardown   | The QA user's own `deleteUser { id }` (metadata) removes the user and the workspace member: `workspaceMembers(filter: {userEmail: {like: "p1-qa-%"}})` → 0, and a later `signIn` fails with `UNAUTHENTICATED: User not found`. No Jane write needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P4   | Auth                 | Cookie `twenty-session` on `127.0.0.1`; `/graphql` and `/metadata` require `Origin: http://127.0.0.1:3002` with cookie auth (else 403 `CSRF_ORIGIN_MISMATCH`). Front end has `window._env_ = {}` (API on the page origin), so the in-container proxy on 3002 works (P5: People loads 80 rows in the container). Twenty fixtures are GraphQL-only: **no Twenty DB port needed**.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P4   | People list          | `/objects/people`. GraphQL ops on load include `FindManyPeople` and `AggregatePeople`. Rows `data-testid="row-id-<uuid>"` (60 rendered). **No `columnheader` roles** (table semantics missing). Header shows "All People · 1,200" (count text). One console 404 on every load (observation).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P4   | Record pages         | Person `20202020-b000-4485-94de-70c2a98daef2` (Jeffery Griffin, Zuora) and company `20202020-a000-4485-94de-70c2a98daef2` (Housecall Pro), fixed seed ids. Tablet/desktop heading = record name; mobile has no heading role. `top-bar-title` holds breadcrumb "People /" and position "(442/1,200)" (depends on the row count). Field cells show relative times ("over 3 years ago" with the clock frozen at 2030). Test ids: `top-bar-title`, `record-fields-widget`, `tab-<uuid>`.                                                                                                                                                                                                                                                                                                                  |
| P4   | Pixel drift          | 0 px for People, person and company pages at all three viewports, real and frozen clock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P4   | Theme                | Member `System` follows `prefers-color-scheme`. Member `Dark` wins over emulated light, and the app rewrites `localStorage.persistedColorSchemeState` to `"Dark"` (server value wins over the saved storage state). Body background: light `color(display-p3 0.945 …)`, dark `color(display-p3 0.114 …)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P4   | axe `color-contrast` | People, both themes, all viewports: view count "· 1,200" `span.s1oavrdv` (light 2.09:1 `#b3b3b3`/`#fff`, dark 3.12:1). People, both themes, tablet/desktop: sidebar "Workspace" `.section-title-label` (light 1.99:1, dark 3.06:1). People light only: column header labels `span.s1ahrbok` `#999`/`#fff` 2.84:1 (mobile: Name, Emails; desktop: all 8), footer "Calculate" `span.sj3hran` and aggregate labels `[data-testid=tooltip]` 2.84:1 (desktop). Person page, both themes, tablet/desktop: "Workspace", breadcrumb `[data-testid=top-bar-title] .s1wv6onj` and position `span.s1oujbzf` (light 2.77:1, dark 4.42:1). Mobile person: 0. **PRODUCT BUGs** (WCAG 1.4.3). The `s…` classes are build hashes of the pinned image; a Twenty bump makes them stale, and the stale check catches it. |
| P4   | axe full WCAG        | People: serious `aria-command-name` (61–71 nodes), serious `aria-toggle-field-name` (180, tablet/desktop), serious `nested-interactive` (2). Person: critical `aria-allowed-attr` (4–5), serious `nested-interactive` (4–5). **PRODUCT BUGs.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P4   | Long company (150)   | Created as the QA member; person linked with input field `companyId`. People list (filter Name contains "Chip Probe"): chip `a` clipped to its cell (mobile 152 px, desktop 141 px, `overflow:hidden` on the parent, `text-overflow: clip`, **no ellipsis**), no overlap (chip right 732 vs next cell 733; desktop 920 vs 921), hover tooltip shows the **full** name, no `title` attribute. Person page chip: cut mid-word with no ellipsis (`tw-long-person-mobile.png`). Company page header: `text-overflow: ellipsis`, no `title`, no page overflow. **PRODUCT BUG candidate: no ellipsis on the company chip.**                                                                                                                                                                                 |
| P4   | GraphQL `errors[]`   | `FindManyPeople` fulfilled 200 `{data:null, errors:[…]}`: request made 4 times (retries); at 2 s and 6 s a blank table with no message; by 12 s three identical toasts "An error occurred." (`role=status`) and the empty state "No Person found / No records matching the filter criteria were found." while the view header still says "All People · 1,201". Partial `{data:{…real…}, errors:[…]}`: same, by 6 s; the real data is discarded (0 rows). Focus stays on `BODY` (toast is `role=status`, does not steal focus). **PRODUCT BUG: misleading "No Person found" empty state on a failed query; duplicate toasts** (`tw-gql-dataNull-12s.png`).                                                                                                                                             |
| P4   | de-DE                | QA member `locale de-DE`: `html[lang=de-DE]`; nav "Unternehmen", "Personen", "Aufgaben", "Notizen"; buttons "Erstellen", "Alle Personen · 1,201", "Filter", "Sortieren", "Optionen". No page overflow at 1440 and 820. Column header "Berufsbezeichnung" (Job Title) truncated with ellipsis (`scrollWidth` 121 > `clientWidth` 113) at both widths. Company chips clip without ellipsis in every locale (same bug as above). Settings → Experience: no overflow. **PRODUCT BUG (minor i18n): German header label truncated at default column width.**                                                                                                                                                                                                                                                |
| P4   | pseudo-en            | The language picker (Settings → Experience → Language, with a "Search" box) lists 33 languages and **no "Pseudo-English"** (search "Pseudo-English" → no options). The API accepts `locale "pseudo-en"` and the UI then renders pseudo strings ("Ƥēōƥĺē", "Ƒĩĺţēŕ", "Śēţţĩńĝś", all Settings → Experience labels). Plain-English strings left: only custom-object names from the seed (Rockets, Pets, Survey results, Employment Histories, Pet Care Agreements, Star History) and record data, which are data, not UI.                                                                                                                                                                                                                                                                               |
| P6   | Teardown             | Twenty: QA records destroyed by the QA member, QA user self-deleted, P1-QA members 0, sweep 0/0/0. Documenso: owner torn down; users 0, qaEnvelopes 0, qaRecipients 0; `orphanDocumentMeta`/`Data` 2 each = known product leftover P7-OBS-DOC-FW-005 (under the ceiling of 100, script exit 0). Cal QA users 0. No `lang`/`theme` cookie in any `.auth/*.json`; probe storage states deleted.                                                                                                                                                                                                                                                                                                                                                                                                         |

## Labelled findings (before any `test.fail`)

| Finding                                                                                           | Label                                                | Evidence                                           | Handling                                                                                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Documenso `/documents` contrast (3 elements)                                                      | **PRODUCT BUG** (WCAG 1.4.3)                         | axe nodes with colours and ratios above            | `DOCUMENSO_AXE_ALLOWLIST` entries with finding ids `DOC-VIS-004-F1..F3`, theme- and viewport-scoped |
| Documenso `/documents` other serious/critical (button-name, label, link-name, nested-interactive) | **PRODUCT BUG**                                      | axe full WCAG                                      | X07: allowlist entries `DOC-VIS-X07-F4..F9`                                                         |
| Documenso long title overflows at md+                                                             | **PRODUCT BUG candidate**                            | `scrollWidth` 1781/1891, primary action off-screen | X01: second-run repro (Step 14), evidence, then `test.fail` on tablet/desktop                       |
| Documenso PDF stall shows an endless spinner                                                      | **PRODUCT BUG candidate** (you asked for this label) | Spinner at every mark to 60 s, no message          | X03: second-run repro, evidence, then `test.fail` after 30 s                                        |
| Documenso Complete clipped at 200% zoom                                                           | **PRODUCT BUG candidate** (WCAG 1.4.10)              | Right edge 264 > 197                               | X04: second-run repro, evidence, then `test.fail`                                                   |
| Twenty contrast (People, person)                                                                  | **PRODUCT BUG** (WCAG 1.4.3)                         | axe nodes above                                    | `TWENTY_AXE_ALLOWLIST` entries `TW-VIS-001-F1..F6`                                                  |
| Twenty other serious/critical                                                                     | **PRODUCT BUG**                                      | axe full WCAG                                      | X06: allowlist entries `TW-VIS-X06-F7+`                                                             |
| Twenty company chip has no ellipsis                                                               | **PRODUCT BUG** (master plan expects ellipsis)       | `text-overflow: clip`, cut mid-word                | TW-VIS-002: other asserts hard, then `test.fail`, `expect(textOverflow).toBe("ellipsis")`           |
| Twenty failed People query shows "No Person found"                                                | **PRODUCT BUG**                                      | screenshot at 12 s, header count 1,201             | TW-VIS-004: toast hard-asserted, then `test.fail` on the empty-state assertion                      |
| Twenty duplicate error toasts / partial data discarded                                            | **PRODUCT BUG candidate**                            | 3 identical toasts; 0 rows from partial data       | X01, X02: second-run repro, evidence, then `test.fail`                                              |
| Twenty table has no column-header roles                                                           | **PRODUCT BUG candidate** (WCAG 1.3.1)               | `getByRole("columnheader")` count 0                | X05: second-run repro, evidence, then `test.fail`                                                   |
| Twenty German header truncated                                                                    | **PRODUCT BUG** (minor i18n)                         | `Berufsbezeichnung` sw 121 > cw 113                | TW-I18N-001: overflow and labels hard, baseline saved, then `test.fail` on "no truncated header"    |
| pseudo-en not in the picker                                                                       | Observation (by design: dev-only in source)          | 33 options, none pseudo                            | TW-I18N-002 asserts it and sets the locale through the API                                          |
| "Next Field" enabled without a PDF; Twenty 404 on load                                            | Observation                                          | probe                                              | Not asserted                                                                                        |
| Bundled Chromium ignores the insecure-origin flag                                                 | TEST/PROBE note                                      | `isSecureContext` false with flag                  | No flag needed; noted in ADR                                                                        |

---

## Files

| Path                                                                                                                                                                                                                                                                                 | New/edit                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/support/visual/docker.ts`                                                                                                                                                                                                                                                       | edit: `VisualTarget`, `parseVisualArgs`, `portFromLoopbackUrl`, product port/env/host builders, `testPaths`, redaction of secret env keys |
| `scripts/visual-docker.mts`                                                                                                                                                                                                                                                          | edit: `--product`, per-product health checks, ports, env                                                                                  |
| `src/support/visual/masks.ts`                                                                                                                                                                                                                                                        | edit: `MaskSpec` gains `selector` and `text` forms; Documenso and Twenty masks                                                            |
| `src/support/visual/axe.ts`                                                                                                                                                                                                                                                          | edit: `contexts`, `allowlistFor`, in-page `matches` resolution, `allowedByFinding`                                                        |
| `src/support/report/secret-scan.ts`                                                                                                                                                                                                                                                  | new (pure)                                                                                                                                |
| `src/support/report/bug-evidence.ts`, `scripts/export-bug-evidence.mts`                                                                                                                                                                                                              | new: pure attachment → evidence-file mapping, plus the exporter (Step 14)                                                                 |
| `docs/observations/evidence/*.png`, `*.json`                                                                                                                                                                                                                                         | generated: one PNG + one JSON per product bug (no .md)                                                                                    |
| `scripts/scan-report-secrets.mts`, `scripts/prepare-pages-report.mts`                                                                                                                                                                                                                | new                                                                                                                                       |
| `src/products/documenso/envelope-api.ts`                                                                                                                                                                                                                                             | edit: optional `title`                                                                                                                    |
| `src/products/documenso/visual.ts`                                                                                                                                                                                                                                                   | new: constants, bug strings, `DOCUMENSO_AXE_ALLOWLIST`                                                                                    |
| `src/products/documenso/visual-fixtures.ts`                                                                                                                                                                                                                                          | new: `pendingEnvelope`, `ownerPage`                                                                                                       |
| `src/products/documenso/pages/signing.page.ts`, `documents.page.ts`                                                                                                                                                                                                                  | edit: visual helpers                                                                                                                      |
| `src/products/twenty/fixtures/auth.ts`                                                                                                                                                                                                                                               | edit: `readAdminWorkspaceIds` (no storage state)                                                                                          |
| `src/products/twenty/fixtures/qa-member.ts`                                                                                                                                                                                                                                          | new                                                                                                                                       |
| `src/products/twenty/fixtures/records.ts`                                                                                                                                                                                                                                            | edit: `createPerson(…, companyId?)`                                                                                                       |
| `src/products/twenty/visual.ts`                                                                                                                                                                                                                                                      | new: constants, bug strings, `TWENTY_AXE_ALLOWLIST`                                                                                       |
| `src/products/twenty/visual-fixtures.ts`                                                                                                                                                                                                                                             | new: `twentyQaMember`, `memberPrefs`, `qaRecords`                                                                                         |
| `src/products/twenty/pages/people.page.ts`                                                                                                                                                                                                                                           | new                                                                                                                                       |
| `src/products/twenty/pages/record.page.ts`, `settings-experience.page.ts`                                                                                                                                                                                                            | edit                                                                                                                                      |
| `src/products/twenty/env.ts`                                                                                                                                                                                                                                                         | edit: `personRecord`, `companyRecord`, `people` routes                                                                                    |
| `scripts/count-twenty-qa-leaks.mts`                                                                                                                                                                                                                                                  | edit: count P1-QA members                                                                                                                 |
| `tests/documenso/visual/signing.visual.spec.ts`, `long-text.visual.spec.ts`, `pdf-failure.visual.spec.ts`                                                                                                                                                                            | new                                                                                                                                       |
| `tests/documenso/i18n/german.i18n.spec.ts`                                                                                                                                                                                                                                           | new                                                                                                                                       |
| `tests/documenso/a11y/contrast.a11y.spec.ts`, `signing.a11y.spec.ts` (X04–X06)                                                                                                                                                                                                       | new                                                                                                                                       |
| `tests/twenty/a11y/contrast.a11y.spec.ts`, `table.a11y.spec.ts` (X05)                                                                                                                                                                                                                | new                                                                                                                                       |
| `tests/twenty/visual/long-company.visual.spec.ts`, `record.visual.spec.ts`, `graphql-error.visual.spec.ts`                                                                                                                                                                           | new                                                                                                                                       |
| `tests/twenty/i18n/german.i18n.spec.ts`, `pseudo.i18n.spec.ts`                                                                                                                                                                                                                       | new                                                                                                                                       |
| `tests/unit/visual-helpers.spec.ts`                                                                                                                                                                                                                                                  | edit (docker, masks, allowlist contexts)                                                                                                  |
| `tests/unit/report-secret-scan.spec.ts`, `tests/unit/visual-constants.spec.ts`, `tests/unit/report-bug-evidence.spec.ts`                                                                                                                                                             | new                                                                                                                                       |
| `tests/cal/a11y/smoke.a11y.spec.ts`                                                                                                                                                                                                                                                  | edit: one `attachAxeEvidence` call for the overlay-switch finding (no baseline change)                                                    |
| `.github/actions/playwright-browsers/action.yml`                                                                                                                                                                                                                                     | edit: apt retries, install retry                                                                                                          |
| `.github/workflows/e2e.yml`                                                                                                                                                                                                                                                          | edit: inputs, visual steps, outputs, `visual` job, blob uploads                                                                           |
| `.github/workflows/p1-e2e.yml`                                                                                                                                                                                                                                                       | edit: `pages-build`, `pages-deploy`                                                                                                       |
| `.github/workflows/visual-baselines.yml`                                                                                                                                                                                                                                             | new                                                                                                                                       |
| `docs/adr/0017-visual-baselines.md`                                                                                                                                                                                                                                                  | amend                                                                                                                                     |
| `README.md`, `docs/observations/documenso-signing-known-issues.md`, `docs/observations/twenty-login-a11y.md`, `CHANGELOG.md`                                                                                                                                                         | edit (closeout)                                                                                                                           |
| 8 new PNGs: `tests/documenso/visual/__screenshots__/visual-{mobile,tablet,desktop}/doc-signing-pending.png`, `tests/twenty/visual/__screenshots__/visual-{mobile,tablet,desktop}/tw-person-record.png`, `tests/twenty/i18n/__screenshots__/visual-{tablet,desktop}/tw-people-de.png` | generated                                                                                                                                 |

`playwright.config.ts` needs **no change**: the visual projects already match `**/visual/**`, `**/a11y/**` and `**/i18n/**` under `./tests`, and `documenso-chromium`/`twenty-chromium` already ignore them.

## Case matrix

"Only" means the other visual projects skip through `onlyOnProjects`. Every assertion goes through the UI; API/DB is setup only.

### Mapped cases

| ID             | File                         | Projects                          | Setup (API/fixture)                                                                              | UI assertion                                                                                                                                                                                                                                                                                     | Expected                        | Bug evidence                        |
| -------------- | ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------- |
| P1-DOC-VIS-001 | documenso/visual/signing     | all                               | QA owner, pending envelope (title `QA visual baseline.pdf`, recipient `QA Signer`), clock frozen | "Sign Document" heading, canvas, "Next Field" visible; baseline `doc-signing-pending` (mask PDF canvas)                                                                                                                                                                                          | pass                            | –                                   |
| P1-DOC-VIS-002 | documenso/i18n/german        | mobile only                       | pending envelope; field signed via `envelope.field.sign`; `locale: "de-DE"`                      | `html[lang=de]`, "Dokument signieren", visible "Abschließen" box fully inside 393×852, no horizontal overflow                                                                                                                                                                                    | pass                            | –                                   |
| P1-DOC-VIS-003 | documenso/visual/long-text   | mobile only                       | pending envelope with 200-char title and 80-char name                                            | List: title link has `title` = full title, `text-overflow: ellipsis`, truncated, no overlap with the row action button, no page overflow. Signing: header `h1` same checks, no overlap with "Actions"; after "Expand" the "Full Name" textbox has the 80-char value and sits inside the viewport | pass                            | –                                   |
| P1-DOC-VIS-004 | documenso/a11y/contrast      | all (2 tests: light, dark)        | owner page with two pending envelopes                                                            | `color-contrast` scan on `/t/<team>/documents`; blocking = [] after the allowlist; stale = []                                                                                                                                                                                                    | pass (allowlisted bugs F1–F3)   | axe JSON attachment                 |
| P1-DOC-VIS-005 | documenso/visual/pdf-failure | desktop, mobile                   | PDF route → 500                                                                                  | spinner disappears; "Something went wrong while loading the document." visible; toast "An error occurred while loading the document." visible                                                                                                                                                    | pass                            | –                                   |
| P1-TW-VIS-001  | twenty/a11y/contrast         | all (2 tests: Light, Dark member) | QA member, `colorScheme` via settings mutation                                                   | body background matches theme; `color-contrast` on People and the person record; blocking = [] after allowlist; stale = []                                                                                                                                                                       | pass (allowlisted F1–F6)        | axe JSON attachment                 |
| P1-TW-VIS-002  | twenty/visual/long-company   | mobile, desktop                   | QA company (150 chars) + QA person linked                                                        | People list filtered to the person: chip visible, no overlap with next cell, hover tooltip = full name; company page: header ellipsis, no page overflow; **then** chip `text-overflow` is `ellipsis`                                                                                             | **expected fail** (last assert) | `TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE`  |
| P1-TW-VIS-003  | twenty/visual/record         | all                               | QA member (System, light), seeded person                                                         | heading/name visible (tablet/desktop heading, mobile `top-bar-title`); baseline `tw-person-record` (mask relative times and record position)                                                                                                                                                     | pass                            | –                                   |
| P1-TW-VIS-004  | twenty/visual/graphql-error  | desktop only                      | route `FindManyPeople` → 200 `{data:null, errors}`                                               | toast "An error occurred." (`role=status`) visible within 20 s; **then** "No Person found" must not show                                                                                                                                                                                         | **expected fail** (last assert) | `TW_VIS004_EMPTY_STATE_ISSUE`       |
| P1-TW-I18N-001 | twenty/i18n/german           | desktop, tablet                   | QA member `locale de-DE`                                                                         | `html[lang=de-DE]`, "Personen", "Filter", "Sortieren", "Optionen" visible; no page overflow; no clipped button; baseline `tw-people-de`; **then** no header label truncated                                                                                                                      | **expected fail** (last assert) | `TW_I18N001_HEADER_TRUNCATED_ISSUE` |
| P1-TW-I18N-002 | twenty/i18n/pseudo           | desktop only                      | QA member; `locale pseudo-en` via API after the picker check                                     | picker search "Pseudo-English" shows no option; nav and Settings → Experience strings collected; plain-English UI strings (minus the data list) = [] (attached as findings)                                                                                                                      | pass                            | findings JSON attachment            |

### Extra cases (accepted 2026-10-16, except TW-VIS-X07)

Rows marked "expected fail" for a **candidate** (DOC X01, X03, X04; TW X01, X02, X05) keep their `test.fail` only after the Step 14 second-run reproduction.

| ID             | File                         | Projects                                       | Setup                                  | UI assertion                                                                                                                                 | Expected           | Note                              |
| -------------- | ---------------------------- | ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------- |
| P1-DOC-VIS-X01 | documenso/visual/long-text   | tablet, desktop                                | long-title envelope                    | after evidence: document `scrollWidth ≤ clientWidth + 1` and the primary action ("Next Field" desktop, "Actions" tablet) inside the viewport | expected fail      | md+ `whitespace-nowrap` header    |
| P1-DOC-VIS-X02 | documenso/visual/pdf-failure | desktop                                        | PDF route `abort("failed")`            | same as VIS-005                                                                                                                              | pass               | network failure, not HTTP         |
| P1-DOC-VIS-X03 | documenso/visual/pdf-failure | desktop                                        | PDF route never fulfilled              | after a 30 s wait (test timeout 60 s): spinner gone or an error/timeout message visible                                                      | expected fail      | your PDF-delay rule; desktop only |
| P1-DOC-VIS-X04 | documenso/a11y/signing       | mobile (viewport overridden to 197×426, DPR 2) | field signed                           | visible Complete fully inside 197 px                                                                                                         | expected fail      | WCAG 1.4.10                       |
| P1-DOC-VIS-X05 | documenso/a11y/signing       | desktop                                        | field signed                           | Complete reached by keyboard within 5 Tabs; Enter opens "Are you sure?"; Escape closes it                                                    | pass               | keyboard reach                    |
| P1-DOC-VIS-X06 | documenso/a11y/signing       | desktop                                        | field signed, `forcedColors: "active"` | media query matches; Complete visible with a solid border                                                                                    | pass               | forced colors                     |
| P1-DOC-VIS-X07 | documenso/a11y/contrast      | all                                            | owner page                             | full WCAG A/AA serious/critical blocking = [] after allowlist F1–F9; stale = []                                                              | pass (allowlisted) | records the other bugs            |
| P1-TW-VIS-X01  | twenty/visual/graphql-error  | desktop                                        | partial `{data, errors}`               | rows from `data` are shown                                                                                                                   | expected fail      | candidate                         |
| P1-TW-VIS-X02  | twenty/visual/graphql-error  | desktop                                        | `{data:null, errors}`                  | exactly 1 error toast                                                                                                                        | expected fail      | candidate                         |
| P1-TW-VIS-X03  | twenty/visual/graphql-error  | desktop                                        | `{data:null, errors}`                  | toast has `role=status`; focus not moved into the toast; Tab still reaches "Filter"                                                          | pass               | focus after error toast           |
| P1-TW-VIS-X04  | twenty/i18n/german           | desktop                                        | QA member de-DE                        | Settings → Experience: no page overflow, no clipped text                                                                                     | pass               | long German words                 |
| P1-TW-VIS-X05  | twenty/a11y/table            | all                                            | QA member                              | People table exposes `columnheader` roles                                                                                                    | expected fail      | WCAG 1.3.1 candidate              |
| P1-TW-VIS-X06  | twenty/a11y/contrast         | all                                            | QA member Light                        | full WCAG serious/critical blocking = [] after allowlist; stale = []                                                                         | pass (allowlisted) | records the other bugs            |
| P1-TW-VIS-X07  | –                            | –                                              | –                                      | Arabic (`ar-SA`) RTL People layout                                                                                                           | **dropped**        | not probed; carried to Phase 4    |

### Expected counts

Existing (Cal batch, unchanged): mobile 11 run/4 skipped, tablet 9/6, desktop 13/2; 6 expected failures.

**With the accepted extras**, each visual project lists **41 tests in 23 files**:

- Cal 15/10, unchanged.
- Documenso 13 tests in 6 files: core 6 plus X01–X07; `signing.a11y.spec.ts` is the extra file.
- Twenty 13 tests in 7 files: core 7 plus X01–X06; `table.a11y.spec.ts` is the extra file.

Where each test runs:

- Documenso mobile: VIS-001..005, X04, X07.
- Documenso tablet: VIS-001, VIS-004×2, X01, X07.
- Documenso desktop: VIS-001, VIS-004×2, VIS-005, X01, X02, X03, X05, X06, X07.
- Twenty mobile and tablet: core, plus X05 and X06.
- Twenty desktop: all 13.

| Project        | Cal run/skip | Documenso run/skip | Twenty run/skip | Total run/skip | New expected failures                                                             |
| -------------- | ------------ | ------------------ | --------------- | -------------- | --------------------------------------------------------------------------------- |
| visual-mobile  | 11 / 4       | 8 / 5              | 6 / 7           | 25 / 16        | TW-VIS-002, DOC-X04, TW-X05 (3)                                                   |
| visual-tablet  | 9 / 6        | 5 / 8              | 6 / 7           | 20 / 21        | TW-I18N-001, DOC-X01, TW-X05 (3)                                                  |
| visual-desktop | 13 / 2       | 10 / 3             | 13 / 0          | 36 / 5         | TW-VIS-002, TW-VIS-004, TW-I18N-001, DOC-X01, DOC-X03, TW-X01, TW-X02, TW-X05 (8) |

By product run (all three projects):

- `--product=documenso`: 23 run (19 passed + 4 expected failures: X01×2, X03, X04), 16 skipped.
- `--product=twenty`: 25 run (15 passed + 10 expected failures: VIS-002×2, VIS-004, I18N-001×2, X01, X02, X05×3), 14 skipped.
- `--product=cal`: 33 run (27 passed + 6 expected failures), 12 skipped (unchanged).

Builders: paste the real `--list` totals into the final report. If they differ from 41/23, stop and reconcile before running.

---

## Steps

### Step 1. Branch and "before" counts

```bash
cd /d/Jayami/Portfolio/p1-web-e2e-ci
git checkout main && git pull && git checkout -b feat/2026-10-16-p1-phase3-rest-batch
git log --oneline -1   # 3bf45b8 Merge pull request #34 …
for p in cal-chromium documenso-chromium twenty-chromium unit visual-mobile visual-tablet visual-desktop; do printf "%-22s " "$p"; P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project="$p" 2>&1 | grep '^Total'; done
```

Expected (recorded 2026-10-16): cal-chromium 20/7, documenso-chromium 27/8, twenty-chromium 14/4, unit 137/19, visual-* 15/10 each. **Done when** they match; otherwise stop.

Products: Cal, Documenso and Twenty must already be up through the harness (`/api/auth/csrf` 200 on `127.0.0.1:3000`, `/signin` 200 on `p1.lvh.me:3001`, `/healthz` 200 on `127.0.0.1:3002`). Never start or stop them by hand; use `node node_modules/qa-portfolio-harness/scripts/up.mjs <product>` with an absolute `PRODUCTS_ROOT=D:/Jayami/Portfolio/products`.

### Step 2. Pure helpers: Docker (`src/support/visual/docker.ts`)

Replace the Cal-only argument shape with a product-aware one. Keep `playwrightImage`, `dbPortFromUrl`, `containerDbUrl`, `CONTAINER_PRODUCTS_ROOT`, `STUB_PRODUCTS` and the existing redaction as they are.

```ts
import type { VisualProduct } from "./masks.js";

export type VisualMode = "update" | "test";
export type VisualTarget = VisualProduct | "all";

export const VISUAL_PROJECTS = ["visual-mobile", "visual-tablet", "visual-desktop"] as const;
export const CONTAINER_WORKDIR = "/work";
export const DOCUMENSO_PUBLIC_HOST = "p1.lvh.me";
/** Playwright positional filters; "all" runs every visual/a11y/i18n spec. */
export const VISUAL_TEST_DIRS: Readonly<Record<VisualProduct, string>> = {
  cal: "tests/cal",
  documenso: "tests/documenso",
  twenty: "tests/twenty",
};

export interface VisualArgs {
  readonly mode: VisualMode;
  readonly target: VisualTarget;
  readonly extraArgs: readonly string[];
}

/** argv after "tsx scripts/visual-docker.mts": <update|test> [--product=<p>] [playwright args…]. */
export function parseVisualArgs(argv: readonly string[]): VisualArgs {
  const [mode, ...rest] = argv;
  if (mode !== "update" && mode !== "test") {
    throw new Error(
      "usage: visual-docker.mts <update|test> [--product=cal|documenso|twenty|all] [playwright args]",
    );
  }
  let target: VisualTarget = "all";
  const extraArgs: string[] = [];
  for (const arg of rest) {
    const m = /^--product=(cal|documenso|twenty|all)$/.exec(arg);
    if (m?.[1] !== undefined) {
      target = m[1] as VisualTarget;
    } else if (arg.startsWith("--product")) {
      throw new Error(`unknown --product value: ${arg}`);
    } else {
      extraArgs.push(arg);
    }
  }
  return { mode, target, extraArgs };
}

export function productsFor(target: VisualTarget): VisualProduct[] {
  return target === "all" ? ["cal", "documenso", "twenty"] : [target];
}

/** Only http://127.0.0.1:<port>. "localhost" can resolve to ::1 in the container; the proxy binds IPv4. */
export function portFromLoopbackUrl(envName: string, raw: string): number {
  const url = new URL(raw);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "") {
    throw new Error(`Visual runs need ${envName}=http://127.0.0.1:<port>, got ${raw}`);
  }
  return Number(url.port);
}

export function calPortFromBaseUrl(baseUrl: string): number {
  return portFromLoopbackUrl("CAL_E2E_BASE_URL", baseUrl);
}

/** Documenso: the public URL must be http://p1.lvh.me:<same port as the listen URL>. */
export function documensoPortFromUrls(listenUrl: string, publicUrl: string): number {
  const port = portFromLoopbackUrl("DOCUMENSO_BASE_URL", listenUrl);
  const pub = new URL(publicUrl);
  if (pub.hostname !== DOCUMENSO_PUBLIC_HOST || Number(pub.port) !== port) {
    throw new Error(
      `DOCUMENSO_PUBLIC_URL must be http://${DOCUMENSO_PUBLIC_HOST}:${String(port)}, got ${publicUrl}`,
    );
  }
  return port;
}

export interface VisualEnvInput {
  readonly cal?: { readonly port: number; readonly dbUrl: string; readonly webMode: string };
  readonly documenso?: {
    readonly listenUrl: string;
    readonly publicUrl: string;
    readonly dbUrl: string;
    readonly inbucketOrigin: string;
  };
  readonly twenty?: {
    readonly baseUrl: string;
    readonly email?: string;
    readonly password?: string;
  };
  /** Host env CI / P1_PW_REPORT_ID, passed through so CI writes blob/JSON reports. */
  readonly ci?: string;
  readonly reportId?: string;
}

export function buildVisualDockerEnv(input: VisualEnvInput): Record<string, string> {
  const env: Record<string, string> = {
    P1_PLAYWRIGHT_HARNESS: "0",
    HOME: "/tmp",
    PRODUCTS_ROOT: CONTAINER_PRODUCTS_ROOT,
  };
  if (input.cal !== undefined) {
    env.CAL_E2E_BASE_URL = `http://127.0.0.1:${String(input.cal.port)}`;
    env.CAL_WEB_MODE = input.cal.webMode;
    env.CAL_DB_URL = containerDbUrl(input.cal.dbUrl);
  }
  if (input.documenso !== undefined) {
    env.DOCUMENSO_BASE_URL = input.documenso.listenUrl;
    env.DOCUMENSO_PUBLIC_URL = input.documenso.publicUrl;
    env.DOCUMENSO_DB_URL = containerDbUrl(input.documenso.dbUrl);
    env.DOCUMENSO_INBUCKET_ORIGIN = input.documenso.inbucketOrigin;
  }
  if (input.twenty !== undefined) {
    env.TWENTY_BASE_URL = input.twenty.baseUrl;
    if (input.twenty.email !== undefined) env.TWENTY_EMAIL = input.twenty.email;
    if (input.twenty.password !== undefined) env.TWENTY_PASSWORD = input.twenty.password;
  }
  if (input.ci !== undefined && input.ci !== "") env.CI = input.ci;
  if (input.reportId !== undefined && input.reportId !== "") env.P1_PW_REPORT_ID = input.reportId;
  return env;
}

export interface DockerRunInput {
  readonly mode: VisualMode;
  readonly image: string;
  readonly hostRoot: string;
  readonly hostPlatform: NodeJS.Platform;
  /** Host ports the container must reach on 127.0.0.1 (web, DB, mail). */
  readonly forwardPorts: readonly number[];
  /** "--add-host" entries, e.g. "p1.lvh.me:127.0.0.1". */
  readonly extraHosts: readonly string[];
  /** Playwright positional path filters (VISUAL_TEST_DIRS values); empty = all. */
  readonly testPaths: readonly string[];
  readonly uidGid?: string;
  readonly env: Readonly<Record<string, string>>;
  readonly extraArgs: readonly string[];
}
```

`buildDockerRunArgs` changes:

- `playwright` = `node node_modules/@playwright/test/cli.js test ${projects} ${update} ${testPaths} ${extraArgs}` (paths and extra args through `shQuote`).
- Proxies loop over `[...new Set(input.forwardPorts)]` (non-Linux only, as today).
- Push `--add-host <entry>` for every `extraHosts` entry on **both** platforms, after the network flags.

`redactDockerArgs` additionally masks any `KEY=value` whose key matches `/(PASSWORD|SECRET|TOKEN)/` → `KEY=***`, so `TWENTY_PASSWORD` never prints.

Ports per product (from env, defaults from the env modules): Cal web + Cal DB (as today); Documenso listen port (3001), DB port (5451) and Inbucket port (9003); Twenty 3002 only. `extraHosts` = `["p1.lvh.me:127.0.0.1"]` when Documenso is in the target.

**Done when** `npm run typecheck` exits 0 (callers are fixed in Step 3; unit tests in Step 13).

### Step 3. Wrapper (`scripts/visual-docker.mts`)

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getAdapter } from "qa-portfolio-harness";
import { getStatus } from "../src/core/http-status.js";
import {
  buildDockerRunArgs,
  buildVisualDockerEnv,
  calPortFromBaseUrl,
  dbPortFromUrl,
  documensoPortFromUrls,
  DOCUMENSO_PUBLIC_HOST,
  parseVisualArgs,
  playwrightImage,
  portFromLoopbackUrl,
  productsFor,
  redactDockerArgs,
  VISUAL_TEST_DIRS,
  type VisualEnvInput,
} from "../src/support/visual/docker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

async function requireHealthy(name: string, url: string, hint: string): Promise<void> {
  const status = await getStatus(url, 120_000);
  if (status !== 200) {
    console.error(
      `${name} is not healthy (GET ${url} -> ${String(status)}). Start it through the harness:\n  ${hint}`,
    );
    process.exit(2);
  }
}
```

`main()`:

1. `const args = parseVisualArgs(process.argv.slice(2))` (print usage and `exit(2)` on throw).
2. For each product in `productsFor(args.target)`, health-check, then add env, ports and test path:
   - **cal:** base `CAL_E2E_BASE_URL ?? CAL_BASE_URL ?? http://127.0.0.1:3000`, `GET /api/auth/csrf`, DB from `getAdapter("cal").dbUrl` (as today).
   - **documenso:** listen `DOCUMENSO_BASE_URL ?? http://127.0.0.1:3001`, public `DOCUMENSO_PUBLIC_URL ?? http://p1.lvh.me:3001`, `GET <public>/signin`, DB `DOCUMENSO_DB_URL` (required; exit 2 if unset), Inbucket `DOCUMENSO_INBUCKET_ORIGIN ?? http://127.0.0.1:9003` (`portFromLoopbackUrl`).
   - **twenty:** `TWENTY_BASE_URL ?? http://127.0.0.1:3002`, `GET /healthz`, pass `TWENTY_EMAIL`/`TWENTY_PASSWORD` only if set on the host.
   - Hint text: `PRODUCTS_ROOT=D:/Jayami/Portfolio/products node node_modules/qa-portfolio-harness/scripts/up.mjs <product>`.
3. `testPaths` = `args.target === "all" ? [] : [VISUAL_TEST_DIRS[args.target]]`.
4. `env = buildVisualDockerEnv({ ...parts, ci: process.env.CI, reportId: process.env.P1_PW_REPORT_ID })`.
5. Print `docker ${redactDockerArgs(args).slice(0, -1).join(" ")} '<inner command>'`, then spawn as today.

npm scripts stay: `npm run visual:test -- --product=documenso` passes the flag through.

The in-container round trip through every port (DB, Inbucket, GraphQL) is proven by the first real Documenso and Twenty runs in Step 14, because each spec provisions and tears down its own QA data from inside Docker. For now, check only the printed command:

```bash
npm run visual:test -- --product=documenso --list
```

Expected: the printed `docker …` line, then Playwright's "No tests found" with exit 1 (no Documenso visual specs exist yet). That's fine at this step.

**Done when** typecheck passes and the printed docker command shows `-e TWENTY_PASSWORD=***` (when set), `--add-host p1.lvh.me:127.0.0.1` for Documenso, and `tests/documenso` as the path filter.

### Step 4. Masks, axe allowlist contexts, secret scan (pure)

`src/support/visual/masks.ts`:

```ts
export type MaskSpec =
  | { readonly testId: string; readonly reason: string }
  | { readonly selector: string; readonly reason: string }
  | { readonly text: RegExp; readonly reason: string };

const MASKS: Readonly<Record<VisualProduct, readonly MaskSpec[]>> = {
  cal: [{ testId: CAL_TEST_IDS.avatar, reason: "profile image; …(unchanged)" }],
  documenso: [
    {
      selector: ".konva-container canvas",
      reason:
        "PDF raster drawn by pdf.js/Konva; master plan masks the PDF canvas (Step 0: no date text on the signing page)",
    },
  ],
  twenty: [
    { text: /\bago$/, reason: "relative createdAt/updatedAt; seed time differs per CI run" },
    { text: /^\(\d+\/[\d,]+\)$/, reason: "record position depends on the workspace row count" },
    { text: /^· [\d,]+$/, reason: "view row count depends on the workspace row count" },
  ],
};

export function maskLocators(page: Page, product: VisualProduct): Locator[] {
  return maskSpecs(product).map((spec) =>
    "testId" in spec
      ? page.getByTestId(spec.testId)
      : "selector" in spec
        ? page.locator(spec.selector)
        : page.getByText(spec.text),
  );
}
```

The raw `locator()` needs `// eslint-disable-next-line playwright/no-raw-locators -- PDF canvas has no role or test id` (same as `signing.page.ts`).

`src/support/visual/axe.ts`:

```ts
export interface AxeAllowlistEntry {
  readonly rule: string;
  /** CSS selector; matched against the node's axe target, its data-testid, or in-page element.matches(target). */
  readonly target: string;
  /** "PRODUCT BUG <id>: …" — <id> is the issue reference recorded in docs/observations. */
  readonly finding: string;
  readonly viewports?: readonly string[];
  /** Scan contexts this entry applies to (e.g. "light", "dark"); omitted = every context. */
  readonly contexts?: readonly string[];
}

/** Pure. Drops entries for other viewports or contexts so they are never reported stale. */
export function allowlistFor(
  allowlist: readonly AxeAllowlistEntry[],
  project: string | undefined,
  context?: string,
): AxeAllowlistEntry[] {
  return allowlist.filter(
    (e) =>
      (e.viewports === undefined || (project !== undefined && e.viewports.includes(project))) &&
      (e.contexts === undefined || (context !== undefined && e.contexts.includes(context))),
  );
}
/** @deprecated kept for existing callers */
export function allowlistForProject(
  allowlist: readonly AxeAllowlistEntry[],
  project: string | undefined,
): AxeAllowlistEntry[] {
  return allowlistFor(allowlist, project);
}
```

- `AxeScanOptions` gains `readonly context?: string`.
- `resolveAllowlistTargets(page, allowlist, nodeTargets: readonly string[] = [])`: keep the id resolution, and also add every `nodeTargets` string (skip ones containing `>>>`) for which `document.querySelector(t)?.matches(entry.target)` is true. Use a string expression as today (no DOM lib).
- In `axeScan`, collect `results.violations.filter(isBlocking).flatMap(v => v.nodes.map(n => n.target.map(targetToString).join(" ")))` (axe targets are arrays; join exactly as `targetToString` does per element) and pass them.
- Use `allowlistFor(opts.allowlist ?? AXE_ALLOWLIST, opts.project, opts.context)`.
- `AXE_ALLOWLIST` (Cal) is unchanged.
- `AxePartition` gains `readonly allowedByFinding: Readonly<Record<string, readonly string[]>>`: finding id (the text before the first `:`) → the node targets that entry covered. `partitionViolations` fills it where it already records `used.add(entry)`. It's pure and unit-tested (Step 13), and feeds the per-bug evidence JSON (Step 14).
- **Target rule (round 2):** an entry's `target` uses, in order of preference:
  1. A `data-testid`.
  2. An ARIA role or stable HTML attribute (`[role=…]`, `[type=…]`, `[id^=…]`).
  3. A source-level class name. Tailwind utilities in Documenso and `section-title-label` in Twenty are names from source, not build hashes.
  4. A hashed build class, only when 1–3 don't exist. Each such entry gets a `// hashed v2.44.0 class: <why nothing stable exists>` comment.

`src/support/report/secret-scan.ts` (new, pure):

```ts
export interface SecretHit {
  readonly file: string;
  readonly pattern: string;
  readonly count: number;
}

/** From the P0b scan of a CI trace: these must never appear in a published report. */
export const SECRET_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "set-cookie header", re: /set-cookie/gi },
  { name: "cookie header", re: /"cookie"\s*:|Cookie:/g },
  { name: "documenso session", re: /sessionId=/g },
  { name: "csrf token", re: /csrfToken=/g },
  { name: "twenty session", re: /twenty-session/g },
  { name: "twenty token pair", re: /tokenPair/g },
  { name: "bearer token", re: /Bearer [A-Za-z0-9._-]{8,}/g },
  { name: "refresh token", re: /refreshToken/g },
  { name: "json password field", re: /"password"\s*:\s*"[^"]+"/g },
  { name: "db url with credentials", re: /postgres(?:ql)?:\/\/[^:/@"\s]+:[^@"\s]+@[^/"\s]+/g },
];

/** Public CI defaults committed in e2e.yml; allowed verbatim. */
export const ALLOWED_DB_URLS: readonly string[] = [
  "postgres://documenso:password@127.0.0.1:5451",
  "postgres://postgres:postgres@127.0.0.1:5434",
  "postgresql://postgres:@127.0.0.1:5450",
];

export function findSecretHits(file: string, text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    const matches = [...text.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]);
    const relevant =
      name === "db url with credentials"
        ? matches.filter((m) => !ALLOWED_DB_URLS.includes(m))
        : matches;
    if (relevant.length > 0) hits.push({ file, pattern: name, count: relevant.length });
  }
  return hits;
}
```

**Done when** typecheck and lint pass.

### Step 5. Documenso product code

`envelope-api.ts`: `createAndDistributePendingEnvelopeViaTrpc(http, teamId, recipient, pdfPath, title = "example.pdf")`; use `title` in the payload. Existing callers are unchanged.

`src/products/documenso/visual.ts` (new):

```ts
import type { AxeAllowlistEntry } from "../../support/visual/axe.js";

export const DOC_VISUAL_TITLE = "QA visual baseline.pdf";
export const DOC_VISUAL_RECIPIENT_NAME = "QA Signer";
/** Exactly 200 chars (unit test asserts). */
export const DOC_LONG_TITLE =
  "QA long title Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agre.pdf";
/** Exactly 80 chars (unit test asserts). */
export const DOC_LONG_RECIPIENT_NAME =
  "QA Recipient Longname-Check Longname-Check Longname-Check Longname-Check Longnam";
/** Step 0: GET /api/files/token/<t>/envelope/<e>/envelopeItem/<i>/dataId/<d>/current/item.pdf */
export const DOC_PDF_ROUTE =
  /\/api\/files\/token\/[^/]+\/envelope\/[^/]+\/envelopeItem\/[^/]+\/dataId\/[^/]+\/[^/]+\/item\.pdf(\?.*)?$/;
export const DOC_PDF_ERROR_TEXT = "Something went wrong while loading the document.";
export const DOC_PDF_TOAST_TEXT = "An error occurred while loading the document.";

export const DOC_X01_LONG_TITLE_OVERFLOW_ISSUE =
  "PRODUCT BUG DOC-VIS-X01: a 200-char document title on the signing page at >=768px is not truncated (whitespace-nowrap), the page scrolls horizontally and the primary action is pushed off-screen (Phase 3 probe 2026-10-16)";
export const DOC_X03_PDF_STALL_ISSUE =
  "PRODUCT BUG DOC-VIS-X03: a PDF request that never answers leaves an endless spinner with no error or timeout message (fetch has no timeout; Phase 3 probe 2026-10-16)";
export const DOC_X04_ZOOM_COMPLETE_ISSUE =
  "PRODUCT BUG DOC-VIS-X04: at 200% zoom (197 CSS px) the Complete button is clipped past the right edge and cannot be scrolled into view (WCAG 1.4.10, Phase 3 probe 2026-10-16)";

/** Step 0 axe nodes on /t/<team>/documents. Ids are referenced in docs/observations/documenso-signing-known-issues.md. */
export const DOCUMENSO_AXE_ALLOWLIST: readonly AxeAllowlistEntry[] = [
  {
    rule: "color-contrast",
    // No data-testid/role on the avatar span; scoped by its popover trigger attribute plus source Tailwind classes.
    target: '[aria-haspopup="dialog"] .bg-yellow-200.text-yellow-700',
    finding: "PRODUCT BUG DOC-VIS-004-F1: pending-recipient initials #a16207 on #fef08a 4.23:1",
  },
  {
    rule: "color-contrast",
    // Plain text div ("Organize your documents"); no testid/role exists. Source Tailwind class, not a hash.
    target: ".text-muted-foreground\\/60",
    finding: "PRODUCT BUG DOC-VIS-004-F2: 'Organize your documents' #a2acb9 on #fff 2.29:1",
    contexts: ["light", "wcag"],
  },
  {
    rule: "color-contrast",
    // "Ctrl+K" hint div; no testid/role exists. Source Tailwind classes, not a hash.
    target: ".bg-muted.px-1\\.5",
    finding: "PRODUCT BUG DOC-VIS-004-F3: 'Ctrl+K' hint #64748b on #f1f5f9 4.34:1",
    contexts: ["light", "wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  // X07 (accepted):
  {
    rule: "button-name",
    target: '[data-testid="document-table-action-btn"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F4: row action menu button has no accessible name",
    contexts: ["wcag"],
  },
  {
    rule: "button-name",
    // Two unnamed icon buttons in the mobile header: no testid, no role beyond <button>. Structural selector from source.
    target: ".space-x-4 > button",
    finding: "PRODUCT BUG DOC-VIS-X07-F5: mobile header icon buttons have no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-mobile"],
  },
  {
    rule: "button-name",
    target: 'button[role="combobox"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F6: period filter combobox has no accessible name",
    contexts: ["wcag"],
  },
  {
    rule: "label",
    // One node has data-testid="document-upload-input", the other none: the stable type attribute covers both.
    target: 'input[type="file"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F7: hidden upload inputs have no label",
    contexts: ["wcag"],
  },
  {
    rule: "link-name",
    // Header logo link: no testid/role/aria; source Tailwind responsive class.
    target: "a.md\\:inline",
    finding: "PRODUCT BUG DOC-VIS-X07-F8: header link has no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "nested-interactive",
    target: 'button[role="presentation"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F9: upload button nested interactive",
    contexts: ["wcag"],
  },
];
```

Contexts: VIS-004 scans pass `context: "light"` or `"dark"` with only the F1–F3 entries (`const DOC_VIS004_ALLOWLIST = DOCUMENSO_AXE_ALLOWLIST.filter((e) => e.finding.startsWith("PRODUCT BUG DOC-VIS-004-"))`). F1 has no `contexts`, so it applies in both themes. X07 runs in the default light theme with full WCAG tags, passes `context: "wcag"` and the whole list: the colour-contrast nodes then match F1–F3 (F2/F3 list `wcag` for that reason) and the other rules match F4–F9.

`src/products/documenso/visual-fixtures.ts` (new):

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request, type Page } from "@playwright/test";
import { loginViaApi, newDocumensoApiContext } from "./auth.js";
import {
  createAndDistributePendingEnvelopeViaTrpc,
  signEnvelopeFieldViaTrpc,
} from "./envelope-api.js";
import { documensoPublicUrlFromEnv, documensoSignPath } from "./env.js";
import { expect, test as base } from "./fixtures.js";
import { qaDocumensoSigningRecipient } from "./factories.js";
import { deleteInbucketMailbox } from "./inbucket.js";
import { readSentEnvelopeByRecipientEmail, type DocumensoSentEnvelopeRecord } from "./qa-user.js";
import { DOC_VISUAL_RECIPIENT_NAME, DOC_VISUAL_TITLE } from "./visual.js";

const EXAMPLE_PDF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets/example.pdf",
);

export interface PendingEnvelope {
  readonly title: string;
  readonly recipientName: string;
  readonly sent: DocumensoSentEnvelopeRecord;
  readonly signPath: string;
  /** Sign the only field through the token API (setup only; the UI asserts the result). */
  signField(): Promise<void>;
}

interface DocumensoVisualFixtures {
  envelopeText: { readonly title: string; readonly recipientName: string };
  pendingEnvelope: PendingEnvelope;
  /** Page signed in as the envelope owner (cookies from the API login). */
  ownerPage: Page;
}

export const test = base.extend<DocumensoVisualFixtures>({
  envelopeText: [
    { title: DOC_VISUAL_TITLE, recipientName: DOC_VISUAL_RECIPIENT_NAME },
    { option: true },
  ],
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  baseURL: async ({}, use) => use(documensoPublicUrlFromEnv()),

  pendingEnvelope: async ({ documensoUser, envelopeText }, use, testInfo) => {
    const recipient = {
      ...qaDocumensoSigningRecipient(testInfo.parallelIndex),
      name: envelopeText.recipientName,
    };
    const http = await newDocumensoApiContext();
    try {
      const login = await loginViaApi(http, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, login.authorizeDiagnostic).toBe(201);
      await createAndDistributePendingEnvelopeViaTrpc(
        http,
        documensoUser.teamId,
        recipient,
        EXAMPLE_PDF,
        envelopeText.title,
      );
      const sent = await readSentEnvelopeByRecipientEmail(recipient.email);
      const token = await request.newContext({ baseURL: documensoPublicUrlFromEnv() });
      try {
        await use({
          title: envelopeText.title,
          recipientName: envelopeText.recipientName,
          sent,
          signPath: documensoSignPath(sent.recipientToken),
          signField: async () => {
            const r = await signEnvelopeFieldViaTrpc(token, {
              token: sent.recipientToken,
              fieldId: sent.signatureFieldId,
              typedSignature: "QA Signer",
            });
            expect(r.httpStatus, r.bodyText).toBe(200);
          },
        });
      } finally {
        await token.dispose();
      }
    } finally {
      await http.dispose();
      await deleteInbucketMailbox(recipient.email);
      // documensoUser teardown deletes the owner, team and envelopes (FW precedent: qaEnvelopes 0 after).
    }
  },

  ownerPage: async ({ browser, documensoUser, pendingEnvelope, viewport, colorScheme }, use) => {
    void pendingEnvelope; // the owner list needs the envelope to exist first
    // Same pattern as tests/documenso/fw/fixtures.ts: API login → storageState → new context.
    const http = await newDocumensoApiContext();
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "p1-doc-visual-owner-"));
    try {
      const login = await loginViaApi(http, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, login.authorizeDiagnostic).toBe(201);
      const statePath = path.join(stateDir, "storage-state.json");
      await http.storageState({ path: statePath }); // Step 0: cookies csrfToken, sessionId only (no lang/theme)
      const context = await browser.newContext({
        baseURL: documensoPublicUrlFromEnv(),
        storageState: statePath,
        viewport,
        colorScheme,
        locale: "en-US",
        timezoneId: "Europe/London",
        deviceScaleFactor: 1,
      });
      try {
        await use(await context.newPage());
      } finally {
        await context.close();
      }
    } finally {
      await http.dispose();
      await rm(stateDir, { recursive: true, force: true });
    }
  },
});
export { expect };
```

`viewport` and `colorScheme` are Playwright's built-in option fixtures, so `test.use({ colorScheme: "dark" })` in a spec reaches the owner context. Theme comes only from emulation; never set the `theme` or `lang` cookie in a saved state.

Page objects:

`signing.page.ts` add:

```ts
  /** Step 0: two Complete/Abschließen buttons exist; one is hidden (0x0). */
  visibleCompleteButton(name: string | RegExp = "Complete"): Locator {
    return this.page.getByRole("button", { name, exact: typeof name === "string" }).filter({ visible: true });
  }

  headerTitle(): Locator {
    return this.page.getByRole("heading", { level: 1 }).filter({ visible: true });
  }

  fullNameInput(): Locator {
    return this.page.getByLabel("Full Name");
  }

  async expandMobileWidget(): Promise<void> {
    await this.page.getByRole("button", { name: "Expand" }).click();
  }

  pdfCanvas(): Locator {
    // eslint-disable-next-line playwright/no-raw-locators -- canvas has no role
    return this.page.locator(".konva-container canvas");
  }

  async gotoAndWaitForPdf(signPath: string): Promise<void> {
    await this.page.goto(signPath, { waitUntil: "domcontentloaded" });
    await expect(this.pdfCanvas()).toHaveCount(1, { timeout: documensoTimeouts().journey });
  }
```

`documents.page.ts` add `titleLink(title: string): Locator` → `this.page.getByRole("link", { name: title })` and `rowActionButton(): Locator` → `this.page.getByTestId("document-table-action-btn")`.

Geometry helpers come from `src/support/visual/layout.ts` (`rectsOverlap`, `rectInsideWidth`). Read computed style with `locator.evaluate((e) => getComputedStyle(e).textOverflow)` written as a string expression (no DOM lib), the same as the Cal specs.

**Done when** typecheck and lint pass.

### Step 6. Twenty product code

`env.ts` `TWENTY_ROUTES` add: `people: "/objects/people"`, `personRecord: (id) => `/object/person/${id}``, `companyRecord: (id) => `/object/company/${id}``, `settingsExperience` (exists).

`fixtures/auth.ts` add, exported, with no storage state:

```ts
/** Jane's workspace and member ids from the API alone (visual runs have no .auth state). */
export async function readAdminWorkspaceIds(): Promise<UiWorkspaceIds> {
  const { baseUrl } = loadTwentyConfig();
  const signIn = await signInJane();
  const workspace = signIn.workspaces[0];
  if (
    workspace === undefined ||
    workspace.loginToken === undefined ||
    workspace.loginToken === null
  ) {
    throw new Error("Twenty signIn returned no workspace for Jane");
  }
  const token = await exchangeWorkspaceAccess(
    workspace.loginToken,
    selectWorkspaceOrigin(workspace, baseUrl),
  );
  const me = await fetchCurrentUser(`Bearer ${token}`);
  const memberId = me.workspaceMember?.id;
  if (me.currentWorkspace?.id === undefined || memberId === undefined) {
    throw new Error("Twenty currentUser has no workspace/member");
  }
  return { workspaceId: me.currentWorkspace.id, memberId };
}
```

Then `createPinnedTwentyApiSession(...(await readAdminWorkspaceIds()))` gives the admin session (read-only use: invite hash, leak count).

`records.ts`: `createPerson(api, firstName, lastName, companyId?: string)` → `input: { name: {...}, ...(companyId === undefined ? {} : { companyId }) }` (Step 0: field `companyId`).

`fixtures/qa-member.ts` (new):

```ts
import { type Browser } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTwentyConfig, TWENTY_ROUTES } from "../env.js";
import { TwentyLoginPage } from "../pages/login.page.js";
import { exchangeWorkspaceAccess, type TwentyPinnedApiSession } from "./auth.js";
import { twentyGraphql } from "./graphql.js";

export interface TwentyQaMember {
  readonly email: string;
  readonly memberId: string;
  readonly storageStatePath: string;
  /** Bearer session of the QA member itself (settings, own records, self-delete). */
  readonly authorization: string;
}

export type MemberPrefs = {
  readonly colorScheme?: "Light" | "Dark" | "System";
  readonly locale?: string;
};

/** Pure; unit-tested. Email prefix "p1-qa-" is what the leak check counts. */
export function qaMemberEmail(seed: number, worker: number): string {
  return `p1-qa-${String(seed)}-${String(worker)}@example.test`;
}
/** Pure; fixed so screenshots never show a seed. */
export const QA_MEMBER_NAME = { firstName: "P1-QA Visual", lastName: "Member" } as const;
/** Pure; unit-tested: exactly 150 chars, starts with the P1-QA prefix (sweep-safe). */
export function longCompanyName(prefix: string): string {
  return `${prefix}-${"Longcompany-Truncation-Check ".repeat(8)}`.slice(0, 150);
}

export async function provisionQaMember(
  admin: TwentyPinnedApiSession,
  browser: Browser,
  email: string,
  password: string,
): Promise<TwentyQaMember>;
export async function setQaMemberPrefs(member: TwentyQaMember, prefs: MemberPrefs): Promise<void>;
export async function deleteQaMember(member: TwentyQaMember): Promise<void>;
export async function countQaMembers(admin: TwentyPinnedApiSession): Promise<number>;
```

Bodies (all verified in Step 0):

- **provision:**
  1. Admin query `/metadata` `currentWorkspace { id inviteHash isPublicInviteLinkEnabled }`; throw if the link is disabled (fallback is Jane plus a restore guard, recorded in the final report; do not silently switch).
  2. `signUpInWorkspace(email, password, workspaceId, workspaceInviteHash)` (no auth) → `loginToken.token`.
  3. `exchangeWorkspaceAccess(loginToken, baseUrl)` → access token.
  4. In a fresh `browser.newContext({ baseURL })`, run `TwentyLoginPage.goto()` + `signIn(email, password)`, wait for URL `/create/profile`, fill placeholder "Tim" with `QA_MEMBER_NAME.firstName` and "Apple" with `QA_MEMBER_NAME.lastName`, click "Continue", wait for `/objects/`.
  5. Write `storageState` to `mkdtemp(os.tmpdir(), "p1-tw-qa-")/state.json`.
  6. `currentUser { workspaceMember { id } }` with the member's bearer → `memberId`.
- **setPrefs:** `/metadata` `updateWorkspaceMemberSettings(input: { workspaceMemberId, update })` with the member's bearer; expect `true`; read back `currentUser.workspaceMember { colorScheme locale }` and throw on mismatch.
- **delete:** member bearer `mutation { deleteUser { id } }`; then `rm` the temp dir (it holds a session cookie and must not leak into artifacts).
- **count:** admin `workspaceMembers(filter: { userEmail: { like: "p1-qa-%" } }) { totalCount }`.

`src/products/twenty/visual-fixtures.ts` (new):

```ts
import { test as base } from "@playwright/test";
import { parsePositiveInt } from "../../core/config.js";
import { loadTwentyConfig } from "./env.js";
import { createPinnedTwentyApiSession, readAdminWorkspaceIds } from "./fixtures/auth.js";
import { p1QaPrefix } from "./fixtures/names.js";
import {
  countQaMembers,
  deleteQaMember,
  provisionQaMember,
  qaMemberEmail,
  setQaMemberPrefs,
  type MemberPrefs,
  type TwentyQaMember,
} from "./fixtures/qa-member.js";

interface Worker {
  twentyQaMember: TwentyQaMember;
}
interface Fixtures {
  memberPrefs: MemberPrefs;
  /** Applies memberPrefs before the test, resets to System/en after. */
  appliedPrefs: void;
  qaPrefix: string;
}

export const test = base.extend<Fixtures, Worker>({
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  baseURL: async ({}, use) => use(loadTwentyConfig().baseUrl),
  twentyQaMember: [
    async ({ browser }, use, workerInfo) => {
      const seed = parsePositiveInt(process.env.P1_SEED, Date.now());
      const admin = await createPinnedTwentyApiSession(
        ...(Object.values(await readAdminWorkspaceIds()) as [string, string]),
      );
      const password = `P1-qa-${String(seed)}-${String(workerInfo.parallelIndex)}-Pw9!`;
      const member = await provisionQaMember(
        admin,
        browser,
        qaMemberEmail(seed, workerInfo.parallelIndex),
        password,
      );
      const errors: unknown[] = [];
      try {
        await use(member);
      } finally {
        try {
          await deleteQaMember(member);
        } catch (e) {
          errors.push(e);
        }
        try {
          if ((await countQaMembers(admin)) !== 0)
            errors.push(new Error("P1-QA Twenty member leaked"));
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, "twentyQaMember teardown failed");
    },
    { scope: "worker" },
  ],
  storageState: async ({ twentyQaMember }, use) => use(twentyQaMember.storageStatePath),
  memberPrefs: [{}, { option: true }],
  appliedPrefs: [
    async ({ twentyQaMember, memberPrefs }, use) => {
      await setQaMemberPrefs(twentyQaMember, memberPrefs);
      try {
        await use();
      } finally {
        await setQaMemberPrefs(twentyQaMember, { colorScheme: "System", locale: "en" });
      }
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  qaPrefix: async ({}, use, testInfo) =>
    use(p1QaPrefix(process.env.P1_SEED ?? "0", testInfo.parallelIndex)),
});
export { expect } from "@playwright/test";
```

Builder notes:

- Replace the `Object.values` cast with explicit `const ids = await readAdminWorkspaceIds(); createPinnedTwentyApiSession(ids.workspaceId, ids.memberId)`.
- QA records (TW-VIS-002) are created with the QA member's bearer (Step 0: the member can create and destroy its own records) via a small `memberApi(member)` adapter returning `TwentyPinnedApiSession`-shaped `query`, then `createCompany`/`createPerson`/`destroy*` in `try/finally` inside the spec's fixture `longCompanyRecords`.
- Prefs are member-scoped, never Jane.

`pages/people.page.ts` (new):

```ts
export class TwentyPeoplePage extends BasePage {
  readonly filterButton = this.page.getByRole("button", { name: "Filter", exact: true }).first();
  rows(): Locator {
    return this.page.getByTestId(/^row-id-/);
  }
  errorToast(): Locator {
    return this.page.getByRole("status").filter({ hasText: "An error occurred." });
  }
  emptyState(): Locator {
    return this.page.getByText("No Person found");
  }
  async goto(): Promise<void> {
    await this.gotoPath(TWENTY_ROUTES.people);
    await expect(this.filterButton).toBeVisible({ timeout: twentyTimeouts().page });
  }
  /** Step 0: Filter → "Search fields" "Name" → Enter → placeholder "Name" → value → Enter, then two Escapes (ADR: portal needs 2). */
  async filterNameContains(value: string): Promise<void> {
    /* copy TwentyObjectFilterPage.filterNameContains + closeFloatingPortals */
  }
}
```

`record.page.ts`: extend `TwentyRecordKind` with `"person" | "company"` using the new routes. `settings-experience.page.ts`: add `languagePicker()` (`getByText("English", { exact: true })` on the value button), `languageSearch()` (`getByPlaceholder("Search")`) and `languageOption(name)` (`getByText(name, { exact: true })`).

`src/products/twenty/visual.ts` (new): `TW_PERSON_ID = "20202020-b000-4485-94de-70c2a98daef2"`, `TW_PERSON_NAME = "Jeffery Griffin"`, `TW_PEOPLE_OPERATION = "FindManyPeople"`, the de labels, the pseudo-data allowlist (`["Rockets","Pets","Survey results","Employment Histories","Pet Care Agreements","Star History","Apple"]`), bug strings (`TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE`, `TW_VIS004_EMPTY_STATE_ISSUE`, `TW_I18N001_HEADER_TRUNCATED_ISSUE`, `TW_X01_PARTIAL_DATA_DISCARDED_ISSUE`, `TW_X02_DUPLICATE_TOASTS_ISSUE`, `TW_X05_NO_COLUMNHEADERS_ISSUE`, each starting `"PRODUCT BUG <id>: "` like the Documenso ones) and:

```ts
export const TWENTY_AXE_ALLOWLIST: readonly AxeAllowlistEntry[] = [
  {
    rule: "color-contrast",
    // hashed v2.44.0 class: the "· 1,200" count span has no testid, role or id (Step 0 outerHTML `<span class="s1oavrdv">`).
    target: ".s1oavrdv",
    finding: "PRODUCT BUG TW-VIS-001-F1: view row count '· 1,200' light 2.09:1, dark 3.12:1",
  },
  {
    rule: "color-contrast",
    // Source-level class name (`section-title-label`), not a hash; the node has no testid or role.
    target: ".section-title-label",
    finding: "PRODUCT BUG TW-VIS-001-F2: sidebar 'Workspace' label light 1.99:1, dark 3.06:1",
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "color-contrast",
    // hashed v2.44.0 class: header label spans carry only a per-render `base-ui-_r_*_` id and the generic
    // `data-base-ui-tooltip-trigger` attribute (shared by other tooltips), so the hash is the narrowest stable match.
    target: ".s1ahrbok",
    finding: "PRODUCT BUG TW-VIS-001-F3: column header labels #999 on #fff 2.84:1",
    contexts: ["light", "wcag"],
  },
  {
    rule: "color-contrast",
    // Stable: aggregate labels have data-testid="tooltip"; the "Calculate" span has id "tooltip-<uuid>-footer".
    target: '[data-testid="tooltip"], [id^="tooltip-"][id$="-footer"]',
    finding: "PRODUCT BUG TW-VIS-001-F4: table footer aggregate labels 2.84:1",
    contexts: ["light", "wcag"],
    viewports: ["visual-desktop"],
  },
  {
    rule: "color-contrast",
    // Scoped by data-testid="top-bar-title"; hashed v2.44.0 class for the inner breadcrumb div (no own testid/role).
    target: '[data-testid="top-bar-title"] .s1wv6onj',
    finding: "PRODUCT BUG TW-VIS-001-F5: record breadcrumb 'People /' light 2.77:1, dark 4.42:1",
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "color-contrast",
    // Scoped by data-testid="top-bar-title"; hashed v2.44.0 class for the position span (no own testid/role).
    target: '[data-testid="top-bar-title"] .s1oujbzf',
    finding: "PRODUCT BUG TW-VIS-001-F6: record position '(442/1,200)' light 2.77:1, dark 4.42:1",
    viewports: ["visual-tablet", "visual-desktop"],
  },
];
```

**X06 entries** (accepted). The Step 0 full-WCAG nodes (`aria-command-name`, `aria-toggle-field-name`, `nested-interactive`, `aria-allowed-attr`) had positional targets only, so their selectors come from the first X06 run's axe JSON attachment (ids `TW-VIS-X06-F7+`, context `wcag`), following the target rule in Step 4:

- Prefer the attributes Step 0 already showed: `[aria-haspopup="true"][role="button"]` for the menu triggers, `[role="none"][aria-roledescription]` for the person-page draggable fields, and `[id^="row-virtual-index-"]` children for the row command items.
- Fall back to a commented hashed class only if none of those attributes exist.
- The rule names and node counts must match Step 0: People 61–71 / 180 / 2; person 4–5 / 4–5. If they differ, stop and report.

**Allowlists and pages:** People scans use F1–F4, person scans use F2, F5 and F6. Pass a per-page list (`TWENTY_AXE_ALLOWLIST.filter(e => PEOPLE_FINDINGS.has(e.finding.split(":")[0]))`) so an entry for the other page is never reported stale. Same for Documenso F1–F3 versus X07. The first build run attaches the axe JSON; if a node or contrast value differs from the table above, stop and report, do not edit the list to fit.

`scripts/count-twenty-qa-leaks.mts`: after the sweep, `const admin = …readAdminWorkspaceIds…; const members = await countQaMembers(admin);` print `qaMembers`, append to the step summary, and set `exitCode = 1` if `members > 0`.

**Done when** typecheck and lint pass.

### Step 7. Documenso specs

Common imports per file (drop unused ones or lint fails):

```ts
import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import { DocumentsPage } from "../../../src/products/documenso/pages/documents.page.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { rectInsideWidth, rectsOverlap } from "../../../src/support/visual/layout.js";
import { attachAxeReport, axeScan, describeViolation } from "../../../src/support/visual/axe.js";
```

**VIS-001** `tests/documenso/visual/signing.visual.spec.ts`:

```ts
test(
  "P1-DOC-VIS-001 pending signing page baseline",
  { tag: ["@documenso", "@visual"], annotation: { type: "testId", description: "P1-DOC-VIS-001" } },
  async ({ page, pendingEnvelope }) => {
    await freezeClock(page, VISUAL_FROZEN_INSTANT);
    const signing = new SigningPage(page);
    await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
    await expect(page.getByRole("heading", { name: /^Sign Document/ })).toBeVisible();
    await expect(signing.nextFieldButton().filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/1 Field Remaining/).first()).toBeVisible();
    await stableScreenshot(page, "doc-signing-pending", { mask: maskLocators(page, "documenso") });
  },
);
```

PRODUCT vs TEST bug: a diff that moves only inside the masked canvas cannot happen. A diff in the header or widget with identical DOM text is a **TEST BUG** (stability: rerun twice, compare in Step 10). A changed label is a product change: re-baseline only after review.

**VIS-002** `tests/documenso/i18n/german.i18n.spec.ts`: `test.use({ locale: "de-DE" })`; `onlyOnProjects(…, ["visual-mobile"])`; `await pendingEnvelope.signField()`; `gotoAndWaitForPdf`; then:

- `expect(page.locator("html")).toHaveAttribute("lang", "de")` (raw html locator with the lint disable comment, as Cal i18n does).
- Heading `/^Dokument signieren/`.
- `const complete = signing.visibleCompleteButton("Abschließen"); await expect(complete).toBeVisible();`
- `const box = await complete.boundingBox();` and `expect(rectInsideWidth(box, 393)).toBe(true)`, `expect(box.y + box.height).toBeLessThanOrEqual(852)`.
- Document `scrollWidth <= clientWidth + 1`.

PRODUCT vs TEST: an English label means `Accept-Language` didn't reach the server, which is a **TEST BUG** (check `test.use` placement). A box outside the viewport, or `scrollWidth > clientWidth` with German labels, is a **PRODUCT BUG**: attach evidence and stop for labelling.

**VIS-003** `tests/documenso/visual/long-text.visual.spec.ts`: `test.use({ envelopeText: { title: DOC_LONG_TITLE, recipientName: DOC_LONG_RECIPIENT_NAME } })`; mobile only.

- **List** (`ownerPage`): `DocumentsPage.goto(teamUrl)`; `const link = documents.titleLink(DOC_LONG_TITLE)`; `toHaveAttribute("title", DOC_LONG_TITLE)`; text-overflow `"ellipsis"`; `scrollWidth > clientWidth`; `rectsOverlap(linkBox, actionBtnBox)` false (action button = `rowActionButton()` in the same row: `page.getByRole("row").filter({ has: link }).getByTestId("document-table-action-btn")`); document `scrollWidth <= clientWidth + 1`.
- **Signing** (`page`): `headerTitle()` has `title` = full title, ellipsis, doesn't overlap the "Actions" button box; `expandMobileWidget()`; `fullNameInput()` `toHaveValue(DOC_LONG_RECIPIENT_NAME)`; `rectInsideWidth(inputBox, 393)`.

PRODUCT vs TEST: a missing `title` attribute or `clip` instead of `ellipsis` is a **PRODUCT** change (stop and re-probe). A row locator that matches 0 rows is a **TEST BUG**.

**X01** (accepted, candidate, same file): `onlyOnProjects([tablet, desktop])`.

1. Open the signing page.
2. Precondition (hard): the visible header `h1` text equals the title.
3. `await attachKnownBugEvidence(page, testInfo, { issue: DOC_X01_LONG_TITLE_OVERFLOW_ISSUE, observed: { scrollWidth, clientWidth, primaryActionRight }, expected: { scrollWidthMax: clientWidth + 1 } })`. It must run **before** `test.fail`.
4. `test.fail(true, DOC_X01_LONG_TITLE_OVERFLOW_ISSUE)`.
5. `expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)`.

**VIS-004** `tests/documenso/a11y/contrast.a11y.spec.ts`: two tests in a `describe` per scheme:

```ts
for (const scheme of ["light", "dark"] as const) {
  test.describe(`P1-DOC-VIS-004 ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(
      `P1-DOC-VIS-004 /documents ${scheme} color-contrast`,
      {
        tag: ["@documenso", "@a11y"],
        annotation: { type: "testId", description: "P1-DOC-VIS-004" },
      },
      async ({ ownerPage, documensoUser }, testInfo) => {
        await new DocumentsPage(ownerPage).goto(documensoUser.teamUrl);
        await expect(ownerPage.locator("html")).toHaveClass(scheme); // Step 0: html.light / html.dark
        const scan = await axeScan(ownerPage, {
          project: testInfo.project.name,
          rules: ["color-contrast"],
          allowlist: DOC_VIS004_ALLOWLIST,
          context: scheme,
        });
        await attachAxeReport(testInfo, `axe-documents-${scheme}`, scan.report);
        expect(scan.partition.blocking.map(describeViolation)).toEqual([]);
        expect(scan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);
      },
    );
  });
}
```

PRODUCT vs TEST: a new blocking node is either a new product bug (record it with an id and evidence) or the allowlist selector no longer matching (`stale`). Stale means the product changed: re-probe, never widen the selector.

**VIS-005** `tests/documenso/visual/pdf-failure.visual.spec.ts`: `onlyOnProjects([desktop, mobile])`.

```ts
let hits = 0;
await page.route(DOC_PDF_ROUTE, async (route) => {
  hits += 1;
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: '{"error":"P1 mocked failure"}',
  });
});
await page.goto(pendingEnvelope.signPath, { waitUntil: "domcontentloaded" });
await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
await expect(page.getByText(DOC_PDF_ERROR_TEXT)).toBeVisible({ timeout: 15_000 });
await expect(page.getByText(DOC_PDF_TOAST_TEXT)).toBeVisible({ timeout: 15_000 });
await expect(signing.pdfCanvas()).toHaveCount(0);
```

PRODUCT vs TEST: `hits === 0` is a **TEST BUG** (route did not match: re-check the URL in the trace). Hits > 0 with no error text after 15 s is a **PRODUCT BUG** (attach evidence).

**X02** (accepted): same as VIS-005 with `route.abort("failed")`.

**X03** (accepted, candidate, **desktop only**): kept cheap, with one 30 s wait and its own 60 s timeout so it can't stretch the job.

```ts
test(
  "P1-DOC-VIS-X03 a stalled PDF request ends in an error or timeout message",
  { tag: ["@documenso", "@visual"], annotation: { type: "testId", description: "P1-DOC-VIS-X03" } },
  async ({ page, pendingEnvelope }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
    test.setTimeout(60_000); // 30 s observation + ~10 s setup + 5 s final assert; never longer
    let hits = 0;
    await page.route(DOC_PDF_ROUTE, () => {
      hits += 1;
      return new Promise<void>(() => {});
    }); // never answers
    await page.goto(pendingEnvelope.signPath, { waitUntil: "domcontentloaded" });
    // eslint-disable-next-line playwright/no-raw-locators -- Documenso Spinner has no role (pdf-viewer-states.tsx)
    const spinner = page.locator(".animate-spin");
    const errorText = page.getByText(DOC_PDF_ERROR_TEXT);
    await expect.poll(() => hits, { timeout: 10_000 }).toBeGreaterThan(0); // precondition: route matched
    await expect(spinner.first()).toBeVisible(); // precondition: loading state shown
    const t0 = Date.now();
    // One 30 s observation window, polled every 5 s (no waitForTimeout): still spinning, no message.
    await expect
      .poll(
        async () =>
          Date.now() - t0 >= 30_000
            ? "done"
            : (await errorText.count()) === 0
              ? "waiting"
              : "error",
        {
          timeout: 32_000,
          intervals: [5_000],
        },
      )
      .toBe("done");
    await attachKnownBugEvidence(page, testInfo, {
      issue: DOC_X03_PDF_STALL_ISSUE,
      observed: {
        hits,
        waitedMs: Date.now() - t0,
        spinner: await spinner.count(),
        errorText: await errorText.count(),
      },
      expected: { spinner: 0, errorOrTimeoutMessage: 1 },
    });
    test.fail(true, DOC_X03_PDF_STALL_ISSUE);
    await expect(errorText.or(page.getByText(/timed? ?out|try again/i)).first()).toBeVisible({
      timeout: 5_000,
    });
  },
);
```

If the poll returns `"error"` before 30 s, the product now handles the stall. The test then fails as "unexpected": stop and report, and don't loosen anything. That's also how a non-reproducing candidate shows up in Step 14.

**X04–X06** (accepted) `tests/documenso/a11y/signing.a11y.spec.ts`:

- **X04 (candidate):** `test.use({ viewport: { width: 197, height: 426 }, deviceScaleFactor: 2 })`, mobile only.
  1. Sign the field.
  2. Precondition (hard): the visible Complete button is visible and the document `scrollWidth` is ≤ 198, so there's no page scroll.
  3. `attachKnownBugEvidence` with `{ boxRight: box.x + box.width, viewport: 197 }`, **before** `test.fail`.
  4. `test.fail(true, DOC_X04_ZOOM_COMPLETE_ISSUE)`.
  5. `expect(box.x + box.width).toBeLessThanOrEqual(197 + 1)`.
- **X05:** desktop; sign field; press Tab up to 5 times until `visibleCompleteButton()` is focused (`toBeFocused` poll); Enter → `getByRole("dialog")` heading "Are you sure?"; Escape → dialog count 0. **Never click "Sign" in the dialog.**
- **X06:** `test.use({ forcedColors: "active" })`; Complete visible; computed `borderStyle` "solid".

### Step 8. Twenty specs

Common imports (from `tests/twenty/<dir>/`):

```ts
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import {
  TW_PERSON_ID,
  TW_PERSON_NAME,
  TW_PEOPLE_OPERATION,
  TWENTY_AXE_ALLOWLIST,
} from "../../../src/products/twenty/visual.js";
```

**TW-VIS-001** `tests/twenty/a11y/contrast.a11y.spec.ts`: for `colorScheme` in `["Light", "Dark"]`, use `test.use({ memberPrefs: { colorScheme }, colorScheme: colorScheme === "Dark" ? "light" : "dark" })`. The emulation is deliberately the opposite, proving the member setting wins (Step 0).

- People: `TwentyPeoplePage.goto()`; expect `rows()` count > 0; body background `toHaveCSS("background-color", …)` with the Step 0 value (`color(display-p3 0.945 0.945 0.945)` light, `color(display-p3 0.114 0.114 0.114)` dark); scan `color-contrast` with the People allowlist and `context: colorScheme.toLowerCase()`; blocking [] and stale [].
- Person record: same with the person allowlist.

PRODUCT vs TEST: a background that doesn't match means the prefs weren't applied: a **TEST BUG** (check `appliedPrefs` read-back).

**TW-VIS-002** `tests/twenty/visual/long-company.visual.spec.ts`, mobile and desktop. Fixture `longCompanyRecords` creates company `longCompanyName(qaPrefix)` and person `${qaPrefix}-Chip Probe` with `companyId`, both destroyed in `finally`.

- People: `filterNameContains("Chip Probe")`; `rows()` count 1; `chip = rows().first().getByRole("link", { name: /Longcompany/ })` visible; chip right edge ≤ next cell left (evaluate as in Step 0); hover → `page.getByText(companyName, { exact: true })` visible (tooltip).
- Company page: header name element `text-overflow: ellipsis`; document `scrollWidth <= clientWidth + 1`.
- Then evidence (chip `textOverflow`, `scrollWidth`, `clientWidth`), `test.fail(true, TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE)`, `expect(chipTextOverflow).toBe("ellipsis")`.

PRODUCT vs TEST: `rows()` 0 means the filter flow drifted: **TEST BUG**.

**TW-VIS-003** `tests/twenty/visual/record.visual.spec.ts`, all viewports: `freezeClock`; `TwentyRecordPage.goto("person", TW_PERSON_ID)`; `expect(page.getByTestId("record-fields-widget")).toBeVisible()`; `expect(page.getByTestId("top-bar-title")).toContainText(TW_PERSON_NAME)`; `stableScreenshot(page, "tw-person-record", { mask: maskLocators(page, "twenty") })`.

**TW-VIS-004** `tests/twenty/visual/graphql-error.visual.spec.ts`, desktop:

```ts
let hits = 0;
await page.route("**/graphql", async (route) => {
  const op = (route.request().postDataJSON() as { operationName?: string } | null)?.operationName;
  if (op !== TW_PEOPLE_OPERATION) return route.fallback();
  hits += 1;
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: null,
      errors: [{ message: "P1 mocked failure", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
    }),
  });
});
await people.goto();
await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
await expect(people.errorToast().first()).toBeVisible({ timeout: 20_000 });
await attachKnownBugEvidence(page, testInfo, {
  issue: TW_VIS004_EMPTY_STATE_ISSUE,
  observed: {
    hits,
    toasts: await people.errorToast().count(),
    emptyState: await people.emptyState().count(),
  },
  expected: { emptyState: 0 },
});
test.fail(true, TW_VIS004_EMPTY_STATE_ISSUE);
await expect(people.emptyState(), "a failed query must not claim there are no records").toHaveCount(
  0,
);
```

- **X01 (partial, candidate):** fulfil with real data plus `errors` (`route.fetch()`, then spread the JSON). Precondition (hard): the toast is visible. Then `attachKnownBugEvidence` with `{ rows, dataRowsInResponse }`, `test.fail(true, TW_X01_PARTIAL_DATA_DISCARDED_ISSUE)`, and `expect(people.rows()).not.toHaveCount(0)`.
- **X02 (candidate):** precondition: at least one toast is visible. Then `attachKnownBugEvidence` with `{ toasts }`, `test.fail(true, TW_X02_DUPLICATE_TOASTS_ISSUE)`, and `expect(people.errorToast()).toHaveCount(1)`.
- **X03:** toast `role=status`; `document.activeElement` not inside it; Tab reaches "Filter" within 10 presses.

**TW-I18N-001** `tests/twenty/i18n/german.i18n.spec.ts`: `test.use({ memberPrefs: { locale: "de-DE" } })`; desktop and tablet.

- `html[lang=de-DE]`; `getByRole("link", { name: "Personen", exact: true })`; buttons "Filter", "Sortieren", "Optionen" visible.
- Document `scrollWidth <= clientWidth + 1`; no visible button with `scrollWidth > clientWidth + 1`.
- `freezeClock` before `goto`; `stableScreenshot(page, "tw-people-de", { mask: maskLocators(page, "twenty") })`.
- Then collect header labels with `text-overflow: ellipsis` and `scrollWidth > clientWidth` (expect ["Berufsbezeichnung"] in the evidence), `test.fail(true, TW_I18N001_HEADER_TRUNCATED_ISSUE)`, `expect(truncatedHeaders).toEqual([])`.

**X04** (accepted): Settings → Experience shows no page overflow and no clipped text, so it passes.

**TW-I18N-002** `tests/twenty/i18n/pseudo.i18n.spec.ts`, desktop:

1. With locale `en`: Settings → Experience, open the picker, search "Pseudo-English", `expect(page.getByText("Pseudo-English", { exact: true })).toHaveCount(0)`.
2. `setQaMemberPrefs(member, { locale: "pseudo-en" })` (setup; the fixture resets it), reload.
3. Collect the visible leaf texts of the sidebar `navigation` and of Settings → Experience.
4. `plainEnglish = texts.filter(t => /^[A-Za-z][A-Za-z ,.'&-]{2,}$/.test(t) && !TW_PSEUDO_DATA.includes(t))`.
5. Attach JSON, then `expect(plainEnglish).toEqual([])`.

PRODUCT vs TEST: any string found is a **PRODUCT** i18n finding: record it in observations with the screenshot, and keep the assertion (no allowlist without an issue id).

**X05** (accepted, candidate) `tests/twenty/a11y/table.a11y.spec.ts`: People. Precondition (hard): `rows()` > 0. Then `attachKnownBugEvidence` with `{ columnheaders: 0, rows }`, **before** `test.fail(true, TW_X05_NO_COLUMNHEADERS_ISSUE)`, then `expect(page.getByRole("columnheader")).not.toHaveCount(0)`.

**Rule for every `test.fail` in this batch:** setup asserted first, then `attachKnownBugEvidence`, then `test.fail`, then the single product assertion. Nothing runs after that assertion.

### Step 9. CI: browser install resilience (`.github/actions/playwright-browsers/action.yml`)

Add a first step and wrap each install:

```yaml
- name: Configure apt retries
  shell: bash
  run: |
    set -euo pipefail
    echo 'Acquire::Retries "5";' | sudo tee /etc/apt/apt.conf.d/80-p1-retries >/dev/null
- name: Install Chromium only
  if: inputs.install_firefox_webkit != 'true'
  shell: bash
  working-directory: ${{ inputs.working-directory }}
  run: |
    set -euo pipefail
    for attempt in 1 2 3; do
      if npx playwright install chromium --with-deps; then exit 0; fi
      echo "::warning::playwright install chromium failed (attempt ${attempt}/3)"
      sleep $((attempt * 20))
    done
    exit 1
```

Same loop for "Chromium and Firefox" and "Install Chrome" (the step that failed on PR #34: `dl.google.com` `.deb`, not cacheable). The existing `~/.cache/ms-playwright` cache keyed by the Playwright version stays. The visual steps need no browser install (the container has them); they `docker pull` the image with the same 3-attempt loop.

### Step 10. CI: visual steps, outputs, aggregator (`.github/workflows/e2e.yml`)

New `workflow_call` inputs:

```yaml
visual_mode:
  description: test (compare) or update (regenerate baselines, upload PNGs)
  type: string
  default: test
visual_only:
  description: Skip functional suites; run only harness up + visual
  type: boolean
  default: false
visual_product:
  description: Limit to one product (cal, documenso, twenty); empty = all
  type: string
  default: ""
```

- Each product job's `if:` gains `&& (inputs.visual_product == '' || inputs.visual_product == '<product>')`.
- Every functional test step's `if:` gains `&& !inputs.visual_only`.
- Twenty gains, for `visual_only`, a seed step `npx playwright test --project=twenty-setup` (runs `global-setup/twenty.ts`, which seeds).

Per product job (Documenso shown; Cal and Twenty identical apart from env and names), after the functional artifact uploads and **before** any harness `down`:

```yaml
outputs:
  visual: ${{ steps.visual.outcome }}
  visual_requested: ${{ steps.visual_requested.outputs.requested }}
steps:
  # FIRST step of the job (before checkout), so the output exists even if a later step fails:
  - name: Decide whether visual is requested
    id: visual_requested
    env:
      PROBE_ONLY: ${{ inputs.documenso_probe_only }} # Cal/Twenty: use "false"
      MATRIX: ${{ inputs.run_browser_matrix }}
    run: |
      set -euo pipefail
      # true on every normal run (PR, push, visual_only dispatch); false only for probe-only or matrix runs
      if [ "$PROBE_ONLY" = "true" ] || [ "$MATRIX" = "true" ]; then requested=false; else requested=true; fi
      echo "requested=${requested}" >> "$GITHUB_OUTPUT"
  # … existing steps …
  - name: Pull Playwright image (visual)
    if: ${{ !inputs.documenso_probe_only && !inputs.run_browser_matrix && steps.documenso_up_bypass.outcome == 'success' }}
    working-directory: ${{ env.P1_WORKING_DIRECTORY }}
    run: |
      set -euo pipefail
      image="mcr.microsoft.com/playwright:v$(node -p "require('./package.json').devDependencies['@playwright/test']")-jammy"
      for attempt in 1 2 3; do
        if docker pull "$image"; then exit 0; fi
        sleep $((attempt * 20))
      done
      exit 1
  - name: Run Documenso visual suite (Docker)
    id: visual
    if: ${{ !inputs.documenso_probe_only && !inputs.run_browser_matrix && steps.documenso_up_bypass.outcome == 'success' }}
    continue-on-error: true
    working-directory: ${{ env.P1_WORKING_DIRECTORY }}
    env:
      P1_PW_REPORT_ID: visual-documenso
      DOCUMENSO_BASE_URL: ${{ env.DOCUMENSO_E2E_LISTEN_URL }}
      DOCUMENSO_PUBLIC_URL: ${{ env.DOCUMENSO_E2E_PUBLIC_URL }}
      DOCUMENSO_DB_URL: ${{ env.DOCUMENSO_E2E_DB_URL }}
      PRODUCTS_ROOT: ${{ env.PRODUCTS_ROOT }}
      VISUAL_MODE: ${{ inputs.visual_mode }}
    run: |
      set -euo pipefail
      case "$VISUAL_MODE" in test|update) ;; *) echo "::error::bad visual_mode $VISUAL_MODE"; exit 1 ;; esac
      npm run "visual:${VISUAL_MODE}" -- --product=documenso --output=test-results-visual
  - name: Merge visual HTML report
    if: ${{ !cancelled() && steps.visual.outcome != 'skipped' && steps.visual.outcome != '' }}
    working-directory: ${{ env.P1_WORKING_DIRECTORY }}
    run: |
      set -euo pipefail
      if [ -n "$(find blob-report-visual-documenso -type f -print -quit 2>/dev/null)" ]; then
        npx playwright merge-reports --reporter html ./blob-report-visual-documenso
        rm -rf playwright-report-visual-documenso && mv playwright-report playwright-report-visual-documenso
      fi
  - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
    if: ${{ steps.visual.outcome == 'failure' }}
    with:
      name: visual-failure-documenso
      path: |
        ${{ env.P1_WORKING_DIRECTORY }}/playwright-report-visual-documenso
        ${{ env.P1_WORKING_DIRECTORY }}/test-results-visual/**/*-diff.png
        ${{ env.P1_WORKING_DIRECTORY }}/test-results-visual/**/*-actual.png
        ${{ env.P1_WORKING_DIRECTORY }}/test-results-visual/**/*-expected.png
      if-no-files-found: ignore
      retention-days: 14
  - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
    if: ${{ !cancelled() && steps.visual.outcome != 'skipped' && github.event_name == 'push' && github.ref == 'refs/heads/main' }}
    with:
      name: blob-visual-documenso
      path: ${{ env.P1_WORKING_DIRECTORY }}/blob-report-visual-documenso
      if-no-files-found: ignore
      retention-days: 3
```

Details:

- `--output=test-results-visual` keeps the functional `test-results` (already uploaded) untouched. JSON and JUnit land in `test-results/results-visual-documenso.json` via `P1_PW_REPORT_ID`.
- The container gets `CI` because the host runner sets `CI=true` and the wrapper passes it through (blob, JSON and JUnit reporters; `forbidOnly`; `failOnFlakyTests`; visual projects keep `retries: 0`).
- On the Linux runner the wrapper uses `--network host` (no proxies) plus `--add-host p1.lvh.me:127.0.0.1`. **First CI run must show this works**; if Docker rejects `--add-host` with host networking, drop it on Linux (the runner's `/etc/hosts` already maps `p1.lvh.me` and public DNS resolves `*.lvh.me` to 127.0.0.1) and record that in ADR 0017.
- **Cal:** the visual step is preceded by `curl -fsS -o /dev/null http://127.0.0.1:3000/api/auth/csrf || node node_modules/qa-portfolio-harness/scripts/up.mjs cal` (with the same Cal env as the E2E step), because the harness Cal process belongs to the `test:cal` run (Step 0).
- **Twenty:** the visual step goes before "Stop Twenty (harness down)". Env: `TWENTY_BASE_URL`, `TWENTY_PASSWORD: tim@apple.dev` (seed default, masked in the printed docker command). The existing "Count Twenty QA leaks" step now also counts P1-QA members; move it **after** the visual step.
- **Update mode** (`visual_mode == 'update'`) adds a step that uploads `visual-baselines-<product>`: the changed PNGs from `git status --porcelain -- 'tests/<product>/**/__screenshots__/**'` copied with their paths into `baselines/`, plus `baselines/CHANGED.txt` (the porcelain lines) and the HTML report.
- **Functional blob reports for Pages:** each product job also uploads its non-matrix `blob-report` as `blob-functional-<product>` on push to `main` (retention 3).

Aggregator:

```yaml
visual:
  name: visual
  needs: [changes, cal-self-hosted, documenso-self-hosted, twenty-chromium]
  if: ${{ always() && !cancelled() }}
  runs-on: ubuntu-24.04
  timeout-minutes: 5
  steps:
    - name: Gate on visual outcomes
      env:
        CAL_RESULT: ${{ needs.cal-self-hosted.result }}
        CAL_VISUAL: ${{ needs.cal-self-hosted.outputs.visual }}
        CAL_REQUESTED: ${{ needs.cal-self-hosted.outputs.visual_requested }}
        DOC_RESULT: ${{ needs.documenso-self-hosted.result }}
        DOC_VISUAL: ${{ needs.documenso-self-hosted.outputs.visual }}
        DOC_REQUESTED: ${{ needs.documenso-self-hosted.outputs.visual_requested }}
        TW_RESULT: ${{ needs.twenty-chromium.result }}
        TW_VISUAL: ${{ needs.twenty-chromium.outputs.visual }}
        TW_REQUESTED: ${{ needs.twenty-chromium.outputs.visual_requested }}
      run: |
        set -euo pipefail
        status=0
        check() {
          local name="$1" result="$2" visual="$3" requested="$4"
          # Job never started (path filter, live-URL path, visual_product filter): nothing to gate.
          if [ "$result" = "skipped" ]; then echo "$name: job skipped"; return; fi
          case "$visual" in
            success) echo "$name: visual passed"; return ;;
            failure) echo "::error::$name: visual suite failed (see visual-failure-$name artifact)"; status=1; return ;;
          esac
          # visual is skipped or empty from here on.
          if [ "$requested" = "false" ]; then
            echo "$name: visual not requested (probe-only or matrix run)"
          else
            # requested=true, or empty because the job died before writing it (e.g. bypass start failed).
            echo "::error::$name: visual was requested but did not run (job result: ${result}, visual: '${visual}')"
            status=1
          fi
        }
        check cal "$CAL_RESULT" "$CAL_VISUAL" "$CAL_REQUESTED"
        check documenso "$DOC_RESULT" "$DOC_VISUAL" "$DOC_REQUESTED"
        check twenty "$TW_RESULT" "$TW_VISUAL" "$TW_REQUESTED"
        exit "$status"
```

Gate truth table (one row per product):

| job result        | `visual_requested` | `visual`      | Gate                                                           |
| ----------------- | ------------------ | ------------- | -------------------------------------------------------------- |
| skipped           | –                  | –             | pass (job not run)                                             |
| any               | any                | success       | pass                                                           |
| any               | any                | failure       | **fail**                                                       |
| success           | false              | skipped/empty | pass (probe-only/matrix)                                       |
| any               | true               | skipped/empty | **fail** (e.g. Documenso bypass start failed, job still green) |
| failure/cancelled | empty              | empty         | **fail** (job died before the first step wrote the output)     |

Step 13 adds no unit test for this shell. Instead, Step 17's CI check proves it: on the first PR run the gate log must print "visual passed" for all three products.

After two green `e2e / visual` runs on `main`, add it as a required check (manual, in GitHub settings; not automated here).

### Step 11. CI: GitHub Pages (`.github/workflows/p1-e2e.yml`)

Prerequisite (repo admin, once): Settings → Pages → Build and deployment → Source **GitHub Actions**. Without it, `deploy-pages` fails with "Pages site not found". The `github-pages` environment is created by the first deploy.

```yaml
pages-build:
  name: pages-build
  needs: e2e
  if: ${{ !cancelled() && github.event_name == 'push' && github.ref == 'refs/heads/main' }}
  runs-on: ubuntu-24.04
  timeout-minutes: 15
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        persist-credentials: false
    - uses: ./.github/actions/setup-p1
    - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
      with:
        pattern: blob-*
        path: all-blobs
        merge-multiple: true
    - name: Merge, scrub and scan the report
      run: |
        set -euo pipefail
        mkdir -p test-results
        npx playwright merge-reports --config playwright.merge.config.ts ./all-blobs
        npx tsx scripts/prepare-pages-report.mts playwright-report
        npx tsx scripts/scan-report-secrets.mts playwright-report test-results/results.json
    - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
      with:
        path: playwright-report

pages-deploy:
  name: pages-deploy
  needs: pages-build
  if: ${{ !cancelled() && needs.pages-build.result == 'success' }}
  runs-on: ubuntu-24.04
  timeout-minutes: 10
  concurrency:
    group: pages
    cancel-in-progress: false
  permissions:
    pages: write
    id-token: write
  environment:
    name: github-pages
    url: ${{ steps.deploy.outputs.page_url }}
  steps:
    - id: deploy
      uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

Workflow-level `permissions: contents: read` stays. Only `pages-deploy` gets `pages: write` and `id-token: write`.

`scripts/prepare-pages-report.mts` deletes `<dir>/trace/`, every `<dir>/data/*.zip` (traces) and every `*.webm`/`*.mp4`, then fails if any remain. `scripts/scan-report-secrets.mts` walks every text file under `<dir>` (skip `.png`/`.jpg`) plus the extra files given, runs `findSecretHits`, prints `file pattern count` (never the value), and exits 1 on any hit. The HTML report's embedded data is the same content as `results.json` (merged by `playwright.merge.config.ts`), so that file is scanned too. The functional and visual JSON includes the axe reports as attachments under `data/*.json`, so they are published.

Report merge across machines: the blobs come from runner checkouts (`…/p1`) and the container (`/work`). **Verify locally in Step 12** that `merge-reports` accepts a container blob plus a host blob; if paths conflict, stop and report.

### Step 12. Baseline update workflow (`.github/workflows/visual-baselines.yml`)

```yaml
name: Update visual baselines

on:
  workflow_dispatch:
    inputs:
      product:
        description: Product whose baselines to regenerate
        type: choice
        options: [cal, documenso, twenty]
        required: true

permissions:
  contents: read

concurrency:
  group: visual-baselines-${{ github.ref }}
  cancel-in-progress: false

jobs:
  guard:
    name: refuse main
    runs-on: ubuntu-24.04
    timeout-minutes: 2
    steps:
      - name: Refuse main
        if: ${{ github.ref == 'refs/heads/main' }}
        run: |
          echo "::error::Run this on a feature branch; baselines never change on main directly."
          exit 1
      - run: echo "Updating ${{ inputs.product }} baselines on ${{ github.ref_name }}"
  update:
    needs: guard
    uses: ./.github/workflows/e2e.yml
    with:
      visual_mode: update
      visual_only: true
      visual_product: ${{ inputs.product }}
    secrets: inherit
```

Human review step (goes into README "CI" and the ADR amendment):

1. Actions → "Update visual baselines" → **Use workflow from: <your branch>** → product.
2. Download `visual-baselines-<product>`. Unzip at the repo root (paths are preserved). Read `CHANGED.txt`.
3. Open the artifact's HTML report and compare every changed PNG with the old one (`git show HEAD:<path>`). Accept only changes explained by the PR.
4. `npm run visual:test -- --product=<product>` twice locally (Docker) and confirm 0 diffs; or push and let the PR's `e2e / visual` run.
5. Commit only the reviewed PNGs: `test(visual): update <product> baselines for <reason>`. The PR reviewer checks the rich image diff in "Files changed".

Never on `main`, never automatic, never on a normal PR run.

### Step 13. Unit tests (`npm run test:unit`)

`tests/unit/visual-helpers.spec.ts` (edit; update the existing docker tests to the new input shapes):

1. `parseVisualArgs(["test"])` → target `all`; `["update","--product=twenty","--grep","X"]` → twenty plus extra args; `["test","--product=medusa"]` throws; `["bogus"]` throws.
2. `portFromLoopbackUrl` accepts `http://127.0.0.1:3002`; rejects `localhost`, `https`, and a missing port.
3. `documensoPortFromUrls("http://127.0.0.1:3001","http://p1.lvh.me:3001")` → 3001; a mismatched port or host throws.
4. `buildVisualDockerEnv({ documenso })` sets the four `DOCUMENSO_*` keys with the DB host `127.0.0.1`; `{ twenty: { baseUrl, password } }` sets `TWENTY_PASSWORD`; `ci: "true"`, `reportId: "visual-twenty"` pass through; empty strings are dropped.
5. `buildDockerRunArgs` with `forwardPorts [3001,5451,9003,3001]` starts 3 proxies on win32 (deduped) and 0 on linux; `extraHosts` produces `--add-host p1.lvh.me:127.0.0.1` on both; `testPaths ["tests/documenso"]` appears quoted after the projects.
6. `redactDockerArgs` masks `TWENTY_PASSWORD=tim@apple.dev` → `TWENTY_PASSWORD=***` and keeps `TWENTY_BASE_URL`.
7. Masks: `documenso` has one `selector` spec; `twenty` has three `text` specs, each with a reason.
8. `allowlistFor` drops an entry whose `contexts` excludes the context, keeps one without `contexts`, and drops a context-scoped entry when no context is given.
9. `partitionViolations` with a resolved extra node target allows that node (existing path) and leaves an unresolved one blocking.
10. `partitionViolations` fills `allowedByFinding` with `{ "PRODUCT BUG DOC-VIS-004-F1": [<target>] }` for the covered node and has no key for an unused entry.

`tests/unit/report-bug-evidence.spec.ts` (new; `src/support/report/bug-evidence.ts`):

1. `evidenceBaseName("P1-DOC-VIS-X03")` → `"DOC-VIS-X03"`, and `evidenceBaseName("PRODUCT BUG TW-VIS-001-F3")` → `"TW-VIS-001-F3"`.
2. `pickRepresentative([...])` prefers desktop over tablet over mobile, and light over dark, for one bug id seen in several projects.
3. `collectEvidence(report)` on a minimal Playwright JSON report:
   - It picks `known-bug-screenshot` and `known-bug-evidence` for `test.fail` tests (keyed by the `testId` annotation).
   - It picks `axe-evidence-*.json` and `axe-evidence-*.png` per allowlisted finding.
   - It ignores tests without these attachments.
   - It maps container paths `/work/…` to the repo root.
4. `assertEvidenceFile(name, bytes, text)` throws for a PNG over 500 KB and for JSON with any `findSecretHits` hit.

`tests/unit/report-secret-scan.spec.ts` (new):

1. A `set-cookie` line, `sessionId=…`, `Bearer abcdefgh123`, and a `"password":"x"` body each produce one hit.
2. Each allowed CI DB URL produces no hit; `postgres://u:secret@db:5432` produces one.
3. Plain test titles containing the word "password" (no JSON field) produce no hit.

`tests/unit/visual-constants.spec.ts` (new):

1. `DOC_LONG_TITLE.length === 200` and `DOC_LONG_RECIPIENT_NAME.length === 80`.
2. `DOC_PDF_ROUTE` matches the Step 0 URL shape and not `/api/files/upload-pdf`.
3. `longCompanyName("P1-QA-1-0")` has length 150 and starts with `P1-QA-1-0-`.
4. `qaMemberEmail(5, 1) === "p1-qa-5-1@example.test"`.
5. Every `DOCUMENSO_AXE_ALLOWLIST` and `TWENTY_AXE_ALLOWLIST` finding starts with `PRODUCT BUG ` followed by an id.

Expected: unit **137 + 22 = 159 tests** in **22 files**. If an existing docker test is split or merged while updating it to the new input shape, the number moves by that amount; paste what `--list` prints. **Done when** all pass.

### Step 14. Run, generate baselines, verify stability

```bash
# 1. Documenso: compare-only run first (no baselines yet → VIS-001 fails with "missing snapshot"; everything else as expected)
PRODUCTS_ROOT=D:/Jayami/Portfolio/products npm run visual:test -- --product=documenso
# 2. generate Documenso baselines twice and compare the PNG pairs (≤0.01% px, max channel delta 2)
RUN1=$(mktemp -d)
npm run visual:update -- --product=documenso && cp -r tests/documenso/visual/__screenshots__ "$RUN1/doc"
npm run visual:update -- --product=documenso
# compare "$RUN1/doc" with tests/documenso/visual/__screenshots__ pairwise (in-browser canvas diff as in Step 0, or ImageMagick `compare -metric AE`)
# 3. same for Twenty
npm run visual:update -- --product=twenty && cp -r tests/twenty/visual/__screenshots__ "$RUN1/tw-visual" && cp -r tests/twenty/i18n/__screenshots__ "$RUN1/tw-i18n"
npm run visual:update -- --product=twenty
# 4. full compare runs, twice (the gate)
npm run visual:test -- --product=documenso
npm run visual:test -- --product=twenty
npm run visual:test -- --product=cal
npm run visual:test -- --product=documenso && npm run visual:test -- --product=twenty
```

Expected after baselines (accepted extras included), and `git status` must show **no** change under `tests/cal/**/__screenshots__`:

- **Documenso:** 23 run (19 passed + 4 expected failures), 16 skipped.
- **Twenty:** 25 run (15 passed + 10 expected failures), 14 skipped.
- **Cal (unchanged):** 33 run (27 passed + 6 expected failures), 12 skipped.

**Candidate re-reproduction (round 2 rule; before keeping any candidate's `test.fail`).** Run each candidate group on its own, twice, as two separate invocations:

```bash
npm run visual:test -- --product=documenso --grep "P1-DOC-VIS-X0[134]"   # repro run A
npm run visual:test -- --product=documenso --grep "P1-DOC-VIS-X0[134]"   # repro run B
npm run visual:test -- --product=twenty --grep "P1-TW-VIS-X0[125]"       # repro run A
npm run visual:test -- --product=twenty --grep "P1-TW-VIS-X0[125]"       # repro run B
```

Expected each time: Documenso 4 expected failures (X01 on tablet and desktop, X03 desktop, X04 mobile); Twenty 5 expected failures (X01 and X02 desktop, X05 on all three). 0 unexpected passes, 0 other failures.

Compare the `known-bug-evidence` JSON of run A and run B. It must show the same failure shape:

| Case   | Same shape in both runs           |
| ------ | --------------------------------- |
| X01    | `scrollWidth > clientWidth + 1`   |
| X03    | `waitedMs ≥ 30000`, `errorText 0` |
| X04    | `boxRight > 198`                  |
| TW-X01 | `rows 0` with data rows present   |
| TW-X02 | `toasts > 1`                      |
| TW-X05 | `columnheaders 0`                 |

If any candidate reports "Expected to fail, but passed", fails a precondition, or fails with a different assertion, **stop and report**. Don't loosen the assertion, and don't keep its `test.fail`.

**Evidence export (round 2).** After the second compare run, export one PNG plus one JSON per product bug:

```bash
CI=1 P1_PW_REPORT_ID=visual-documenso npm run visual:test -- --product=documenso
CI=1 P1_PW_REPORT_ID=visual-twenty npm run visual:test -- --product=twenty
CI=1 P1_PW_REPORT_ID=visual-cal npm run visual:test -- --product=cal
npx tsx scripts/export-bug-evidence.mts --out docs/observations/evidence \
  test-results/results-visual-documenso.json test-results/results-visual-twenty.json test-results/results-visual-cal.json
```

What the exporter does:

- **Sources:** it reads the attachments, picks one representative project per bug id (desktop > tablet > mobile, light > dark), and writes `<ID>.png` plus `<ID>.json` (for example `DOC-VIS-X03.png`, `TW-VIS-001-F3.json`).
- **Checks:** it runs `assertEvidenceFile` on each, so any PNG over 500 KB or any secret hit fails the export. Never compress or crop to fit: report it instead.
- **Allowlisted findings:** each scan in VIS-004, X07, TW-VIS-001 and X06 calls a new `attachAxeEvidence(page, testInfo, name, scan)` helper (`src/support/visual/axe.ts`). It attaches a viewport screenshot `axe-evidence-<name>.png` and `axe-evidence-<name>.json` built from `allowedByFinding`.
- **Cal:** the Cal overlay-switch `button-name` finding gets the same helper call in `tests/cal/a11y/smoke.a11y.spec.ts`. That's one line; no Cal baseline is touched.

Expected files:

| Product   | Bugs                                                                                                            | Files   |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| Documenso | DOC-VIS-004-F1..F3, DOC-VIS-X01, X03, X04, DOC-VIS-X07-F4..F9 (12 bugs)                                         | 24      |
| Twenty    | TW-VIS-001-F1..F6, TW-VIS-002, TW-VIS-004, TW-I18N-001, TW-VIS-X01, X02, X05, plus TW-VIS-X06-F7+ (12 + n bugs) | 24 + 2n |
| Cal       | CAL-VIS-004, CAL-A11Y-001, -002, -003, -006, CAL-A11Y-SMOKE-overlay-switch (6 bugs)                             | 12      |

Paste the exporter's file list.

Blob merge check (Step 11 risk): run one product with `CI=1 P1_PW_REPORT_ID=visual-documenso`, then `npx playwright merge-reports --config playwright.merge.config.ts ./blob-report-visual-documenso ./blob-report` (a host functional blob from `npm run test:documenso` with `CI=1`). Expected: one HTML report listing both projects.

Leak checks after every run:

```bash
npx tsx scripts/count-documenso-qa-leaks.mts   # users 0, qaEnvelopes 0, qaRecipients 0 (orphanDocument* ≤ 100: P7-OBS-DOC-FW-005)
npx tsx scripts/count-twenty-qa-leaks.mts      # after 0, viewsAfter 0, qaMembers 0
```

### Step 15. ADR 0017 amendment (behaviour changed; no new .md)

Add a dated "Amendment 2026-10-16" section:

- The baseline-update workflow uploads an artifact for human review (replaces "opens a PR"), with the reason (`GITHUB_TOKEN` pushes don't trigger CI).
- `--product` scoping, and Cal baselines are never touched by Documenso/Twenty updates.
- Ports per product (Documenso 3001, 5451, 9003 plus `--add-host p1.lvh.me:127.0.0.1`; Twenty 3002 only).
- No insecure-origin flag for Documenso visual specs (with the probe result).
- Mask types (`selector`, `text`) and their reasons.
- Allowlist `contexts`, per-product lists and in-page `matches` resolution.
- Pages publishes scrubbed reports (no traces, videos or storage state) behind a secret-scan gate, and traces stay in Actions artifacts.
- The Twenty QA member (public invite link, self-service settings, self-delete) and the rule that Jane is read-only.

### Step 16. Task 8 closeout (README, observations, CHANGELOG)

- **README "Scope":** a "Phase 3 (2026-10-16)" paragraph covering visual baselines at 3 viewports for Cal, Documenso and Twenty, German/RTL layout, dark/light axe, the `e2e / visual` check, the baseline workflow and the Pages URL `https://jayami123.github.io/playwright-e2e-ci-framework/`.
- **README "Implemented P1 cases":** add every Phase 3 case with status, including Cal VIS-001..004, I18N-001..003 and A11Y-001..006 from PR #34.
- **README "Phase 3 known product bugs"** table, with columns ID, product, finding, test (`spec > title`) and evidence. The evidence column links the committed `docs/observations/evidence/<ID>.png` and `<ID>.json` (permanent), plus the CI run that first went green (artifacts expire after 14 days).
  - Cal: VIS-004, A11Y-001, A11Y-002, A11Y-003, A11Y-006, the overlay switch `button-name`.
  - Documenso: DOC-VIS-004-F1..F3, X01, X03, X04, X07-F4..F9.
  - Twenty: TW-VIS-001-F1..F6, TW-VIS-002, TW-VIS-004, TW-I18N-001, X01, X02, X05, X06-F7+.
- **`docs/observations/documenso-signing-known-issues.md`:** append "Phase 3 visual and a11y" with each Documenso finding id, its axe or measurement data from Step 0, and relative links to its evidence files.
- **`docs/observations/twenty-login-a11y.md`:** append "Phase 3 visual, i18n and a11y" with each Twenty finding and its evidence links.
- **Cal bugs:** README's table links their evidence files. They have no observations file of their own, and no new .md is allowed.
- **README "CI":** the `visual` job, failure artifacts, the baseline workflow and its review steps, Pages and its prerequisite, and the install retries.
- **CHANGELOG "Unreleased":** one line each for the visual CI job, baseline workflow, Pages, Documenso/Twenty visual cases and install retries.
- **Phase 3 done vs carried to Phase 4** (README table):
  - Done: Cal VIS/I18N/A11Y (PR #34); Documenso VIS-001..005; Twenty VIS-001..004 and I18N-001..002; CI visual job, baseline workflow, Pages.
  - Also done: the accepted extras DOC-VIS-X01..X07 and TW-VIS-X01..X06, plus committed evidence.
  - Carried: Medusa visual/i18n (MED-VIS/I18N, blocked on the Medusa suite); TW-VIS-X07 RTL (dropped 2026-10-16: not probed); any candidate that failed its Step 14 re-reproduction (listed with the reason); making `e2e / visual` a required check (after two green runs on `main`).

### Step 17. Gates, then commit and push (explicit paths, no `git add -A`, no trailer, no PR)

```bash
npx prettier --write <every changed file>
npm run check            # lint + prettier --check + typecheck + actionlint
npm run test:unit        # 159 passed (paste)
npx tsx scripts/scan-report-secrets.mts docs/observations/evidence   # 0 hits
npm run visual:test -- --product=documenso && npm run visual:test -- --product=twenty && npm run visual:test -- --product=cal   # run 1
npm run visual:test -- --product=documenso && npm run visual:test -- --product=twenty && npm run visual:test -- --product=cal   # run 2
npm run test:twenty      # existing Twenty gate: twenty-setup + twenty-chromium (14 tests), same result as on main
npx tsx scripts/count-documenso-qa-leaks.mts && npx tsx scripts/count-twenty-qa-leaks.mts
```

Commits (lowercase, Conventional, no Co-Authored-By):

1. `ci: retry playwright browser installs and apt downloads`
2. `feat(visual): product-aware docker wrapper, masks and axe contexts`
3. `test(documenso): vis-001..005 and x01..x07 with baselines`
4. `test(twenty): vis-001..004, i18n-001..002 and x01..x06 with baselines and qa member fixture`
5. `ci(visual): visual job, baseline workflow and github pages`
6. `docs(observations): phase 3 product bug evidence`
7. `docs: phase 3 closeout, adr 0017 amendment and rest batch plan`

Push the branch. The PR (title `test(visual): phase 3 rest batch ci, documenso and twenty cases`) is opened only after you review.

**Before merging, you do this (a builder cannot):**

1. Open the repo Settings → **Pages** → Build and deployment → Source → select **GitHub Actions**. Until this is set, `pages-deploy` fails on every push to `main` and turns `main` red.
2. Confirm the PR's `e2e / visual` gate log printed "visual passed" for cal, documenso and twenty, not "not requested".
3. Merge. On the first `main` run, check that `pages-build` printed 0 secret hits and that `pages-deploy` shows the URL `https://jayami123.github.io/playwright-e2e-ci-framework/`.

## Verification (paste real output into the final report)

- `--list` totals per visual project and for unit (expected above; recomputed with accepted extras).
- Both `visual:test` runs per product with passed/skipped/expected-failure counts. The second run must equal the first.
- The stability comparison for the 8 new PNGs (px count, max delta).
- Candidate re-reproduction: runs A and B for the Documenso and Twenty candidates, with the matching `observed` values side by side.
- The evidence exporter's file list (counts as in Step 14) and the 0-hit secret scan of `docs/observations/evidence`.
- The `e2e / visual` gate log line for each product.
- `git status` showing no change under `tests/cal/**/__screenshots__`.
- Leak scripts: Documenso users/envelopes/recipients 0; Twenty after 0, views 0, qaMembers 0; `.auth/twenty-jane.json` hash unchanged (`61a89e9f…`); Jane prefs `System`/`en`/`system`.
- `npm run check` and `npm run lint:actions` clean.
- The local blob-merge check output.
- After push: `e2e / visual` result, with the `visual-failure-*` artifact if red. The first `main` run's `pages-build` scan output (0 hits) and the deployed URL.

## Traps

- **Two Complete buttons** (one hidden): always `.filter({ visible: true })`.
- **Never click "Sign" in the Documenso dialog**: completing the document changes the envelope state that other assertions expect. The FW suite already covers completion.
- **Twenty filter portal needs two Escapes** (PR #34 finding); reuse `closeFloatingPortals`.
- **Twenty record position and view counts** change with any leftover QA row; they are masked, and the leak check must be 0 before generating baselines.
- **Hashed Twenty classes** (`s1oavrdv`, `s1ahrbok`, …) belong to `v2.44.0`. A Twenty bump makes them stale. That's intended: re-probe, never loosen.
- **`visual:update` without `--product`** would regenerate Cal's anti-aliased VIS-001 PNGs; always pass `--product`.
- **`test-results` is cleared by every Playwright run**: the visual step uses `--output=test-results-visual`.
- **`.env` `PRODUCTS_ROOT=../products`** resolves from the harness folder; run the wrapper with an absolute `PRODUCTS_ROOT` (PR #34 trap).
- **The QA member storage state holds a live session**: it lives in `os.tmpdir()`, is deleted in teardown, and is never attached to a report.
- **`documenso_up_bypass`** is required before any Documenso visual run (login rate limits).

## Risks and open questions

1. **Docker `--add-host` with `--network host` on the Linux runner:** unverified there (verified only on Docker Desktop with the proxy). The fallback is in Step 10.
2. **Blob merge across runner and container paths:** verified locally in Step 14 before CI depends on it.
3. **Cal web lifetime after `test:cal` in CI:** handled by the health check plus `up.mjs cal` before the Cal visual step; costs about 1–2 min if Cal has to restart.
4. **Pages enablement** is your step before merging (Step 17). If it's missed, every push to `main` goes red at `pages-deploy`.
5. **CI time:** each product job gains a docker pull (about 1.5 GB) plus the visual run (Documenso about 3 min, Twenty about 5 min, Cal unchanged).
6. **Twenty public invite link** is enabled in the seed. If a Twenty bump disables it, the fixture throws and the fallback (Jane plus a restore guard) needs your approval.
7. **Inbucket from the container** follows the same mechanism as the verified DB port, but its first real use is Step 14's first Documenso run.
8. **Evidence (resolved, round 2):** committed under `docs/observations/evidence/`, one PNG plus one JSON per bug, about 60 small files, each PNG ≤ 500 KB, secret-scanned (Step 14).
9. **Extras (resolved, round 2):** DOC-VIS-X01..X07 and TW-VIS-X01..X06 accepted; TW-VIS-X07 dropped to Phase 4. Candidates keep `test.fail` only after the Step 14 re-reproduction.
10. **X06 allowlist selectors** are derived from the first X06 run (Step 6), because Step 0 only saw positional targets for those rules. If no stable attribute exists for a node, the entry uses a commented hashed class.
