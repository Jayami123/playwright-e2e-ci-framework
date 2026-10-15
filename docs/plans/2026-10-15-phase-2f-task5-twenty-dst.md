# Phase 2f task 5: Twenty DST + relative-date UI E2E

Repo `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1.

**Git:** branch `feat/2026-10-15-p1-phase2f-twenty-dst` from `main` `d0d35cd` (PR #28 merged).

Harness already healthy: `GET http://127.0.0.1:3002/healthz` **200**, image `twentycrm/twenty:v2.44.0`. Never edit the Twenty fork. Never start/stop Twenty by hand.

Structure/depth model: [docs/plans/2026-10-11-phase-2e-task3-2fa.md](2026-10-11-phase-2e-task3-2fa.md). Reuse task 4 as-is: serial Jane describe in [tests/twenty/tz/tz.spec.ts](../../tests/twenty/tz/tz.spec.ts) (ADR 0013/0014), `test.use({ locale: "en-US", timezoneId: "America/Sao_Paulo" })`, `setMemberTimeZone` strict write-back, Settings Experience POM, [src/products/twenty/display.ts](../../src/products/twenty/display.ts) oracle, `createPet`/`createOpportunity`, `P1-QA-` sweep `after=0`.

**Standing rule:** UI E2E. API/fixtures for setup only. Every assertion through the Twenty UI. UI is the source of truth.

---

## Review constraints (mandatory)

1. **Jane Honolulu leftover is a TEST BUG.** Explain which run left Jane on `Pacific/Honolulu` (task 4 X01 / restore path or a killed run). If teardown can be skipped (failed `setTimeZone` before restore is registered), register restore before the first write. Unit-test the fixture fix. Report the cause with evidence.
2. **GroupByOpportunities** `timeZone` / `granularity` is evidence only. Attach the redacted payload. It is not the pass condition. The pass condition is the UI calendar day cell.
3. **Calendar views are in the sweep**, not optional. Sweep leftover views named `P1-QA-%` via `/metadata`. Report views before/after (`after=0`) alongside records.
4. **X03 midnight edge.** Compute today / yesterday / tomorrow instants from one `Date.now()` captured once. Assert the Kiritimati civil date is unchanged before opening the filter and after the row assert. If the day rolled over, fail with `clock crossed midnight` rather than a flaky mismatch. Unit-test the helper at a near-midnight `nowMs`.
5. **X03 negative** also includes a **tomorrow 00:30 Kiritimati** record that must be absent, so both sides of the range are proven.
6. **X05** ties to a real risk: the two fall-back rows must not be deduplicated (both visible, distinct labels) and sort order is by UTC instant. Sanity-check that the order assert can fail (reverse it temporarily, confirm it fails, revert, do not commit the reverse).
7. **X04 stays an OBSERVATION.** Assert CSV values against the fixture's stored values. Record CSV-UTC vs UI-zoned in ADR 0015. No `test.fail()`.
8. **Month nav:** compute the click count from the current month heading read from the UI (not only the system clock), then assert the target heading. No visibility loops.
9. **Berlin Settings label:** read it once live. Record the full string in ADR 0015 with the observation date (the label may change with DST). Do not hard-code the GMT offset in the E2E oracle; match `/Berlin/`.
10. **Do not click Update view.** Leave INDEX with no filter: end X03 by asserting the filter chip is gone.

Gates unchanged: prettier, `npm run check`, `npm run test:unit`, `npx playwright test --project=twenty-chromium --grep @twenty-tz --retries=0 --repeat-each=3`, `PW_WORKERS=2 npm run test:twenty -- --retries=0`. Do not push. Do not run CodeRabbit CLI.

---

## 1. Live probe findings (2026-10-15)

Stack: `http://127.0.0.1:3002` Jane UI login. Throwaway prefix `P1-QA-probe-`. Six DST opportunities created and destroyed by id. Calendar view `P1-QA-probe-cal` (`viewId=cfbf39ae-3e70-4575-b19c-0dc4acd2c3b8`) destroyed via `DestroyView` on `/metadata` (not `/graphql`). Jane TZ restored to `"system"` at probe end.

### TEST BUG: Jane left on Pacific/Honolulu

At probe start, `FindOneWorkspaceMember` returned `timeZone: Pacific/Honolulu`, `updatedAt: 2026-10-14T21:17:24.804Z`. The planning probe itself had not yet written TZ.

Cause (code evidence, then which writer):

- Only `tests/twenty/tz/tz.spec.ts` and skipped `fixture/self.spec.ts` call `setTimeZone`. X01's last GraphQL write is `Pacific/Honolulu` ([tz.spec.ts](../../tests/twenty/tz/tz.spec.ts) X01). TZ-001 writes Honolulu then Kiritimati. X02 writes Honolulu through Settings after `rememberTimeZone`.
- Fixture `setTimeZone` captured baseline, **wrote**, then registered `restoreTimeZone` ([fixtures/index.ts](../../src/products/twenty/fixtures/index.ts)). If `setMemberTimeZone` throws after the mutation persisted (existing unit: mutation can return a different IANA zone), restore is never registered and fixture `finally` skips TZ restore.
- A killed Playwright worker after the Honolulu write (Ctrl+C, agent stop, SIGKILL) also skips `finally`. X01 is the last API Honolulu write. A kill there, or TZ-001 killed after its first write, leaves Jane on Honolulu. Later runs then capture Honolulu as `originalTimeZone` and "restore" back to Honolulu.

Fix: register restore **before** the first write. Unit-test that a throwing write still restores the baseline.

### Group by DATE_TIME by day

Table Options "Group by" is SELECT / many-to-one only. Closest real UI: custom **Calendar** view, date field **Close date**, month layout. That sends `GroupByOpportunities` with `closeDate: { granularity: "DAY", timeZone: "<member IANA>" }`. Attach as evidence. Pass condition is the day cell.

March 2027 (Berlin): control on **27**; spring 00:30 on **28**. UTC day of that 00:30 instant is **27**.

`destroyView` lives on `/metadata`. `getViews` lists views for the sweep.

### Relative date filter

`Filter` (named inner button; distinct from **Add filter**) → Close date → operand **Is today (<abbrev>)**. Chip `Close date : Today (<abbrev>)`. GraphQL is a precomputed UTC range for the member-TZ day. Do not click **Update view**. End X03 on INDEX with Reset, then assert the chip is gone.

### CSV export

Command Menu **Export View** downloads `opportunity.csv`. Close date is UTC ISO. DATE cells are `YYYY-MM-DD`. OBSERVATION: assert CSV against fixture stored values. No `test.fail()`.

### X05 labels

Fall-back 02:30 CEST vs 02:30 CET render distinct `GMT+2` vs `GMT+1`. Sort by Close date Ascending = UTC order. Both rows visible (no dedup).

### Locators

- `getByRole("button", { name: "Filter" })` is unique versus **Add filter**.
- `getByRole("button", { name: "Options" })` matches two nodes (wrapper `div role="button"` + inner `<button>`). Avoid Options; view picker + Filter + Sort cover these cases.
- Month heading is `MMMM yyyy` (SelectControl), sibling TZ abbrev. Assert `/^March 2027\b/`, not the heading abbrev (March 2027 heading was GMT+2 while day cells were GMT+1).

---

## 2. Case list

Keep TZ-001, TZ-002, X01. Add the following **before X02**. Tags `@twenty` `@twenty-tz`. Serial Jane.

- **P1-TW-TZ-003** (P2): Berlin Calendar month, Close date. Four opportunities. Settings label `/Berlin/` (live string in ADR 0015). UI-create Calendar view named with the worker prefix. Attach GroupBy evidence (not the pass). Month nav from the UI heading. Assert each QA name on the Berlin calendar day cell. Also table + record civil+abbrev. Destroy view via `/metadata`.
- **P1-TW-TZ-X03** (P2): member `Pacific/Kiritimati`. One `nowMs`. Today 00:30 visible; yesterday 00:30 and tomorrow 00:30 absent. Midnight guard. Reset. Chip gone.
- **P1-TW-TZ-X05** (P2): Berlin. Two 02:30 labels, both visible, distinct, UTC sort. Order-assert sanity-checked during implementation.
- **P1-TW-TZ-X04** (P2, OBSERVATION): Colombo. CSV vs fixture stored values. ADR records UTC vs UI.

---

## 3. Commands (Git Bash; one Playwright run at a time)

1. Health: `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3002/healthz` → 200
2. `npx prettier --write <changed files>`
3. `npm run check`
4. `npm run test:unit`
5. `npx playwright test --project=twenty-chromium --grep @twenty-tz --retries=0 --repeat-each=3`
6. `PW_WORKERS=2 npm run test:twenty -- --retries=0` (records **and** views `after=0`)
7. `rg setTimeZone tests src/products/twenty`
8. Commit with **explicit paths**. Do **not** push. Do **not** run CodeRabbit CLI
