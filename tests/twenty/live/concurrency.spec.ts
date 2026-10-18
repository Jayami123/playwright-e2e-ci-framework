import type { Page, TestInfo } from "@playwright/test";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import {
  createCompanyWith,
  createKanbanView,
  createNameContainsFilter,
  createOpportunityInStage,
  objectFieldIds,
  readCompany,
  readCompanyAnyState,
  readOpportunity,
  softDeleteCompany,
} from "../../../src/products/twenty/fixtures/live-records.js";
import { expect, test, type LiveRecords } from "../../../src/products/twenty/live-fixtures.js";
import { lostUpdateVerdict, raceRoundNames } from "../../../src/products/twenty/live.js";
import { TwentyKanbanPage } from "../../../src/products/twenty/pages/kanban.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";

/**
 * A round is two full page loads per user (15 to 25 s each, depending on machine load). Two rounds in one
 * test took 90 to 120 s of the 120 s timeout, so each test runs one round and the 10 rounds are 10 tests.
 */
const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const X01_ROUNDS = [1, 2, 3] as const;

function isSave(operation: string): (r: { request(): { postData(): string | null } }) => boolean {
  return (r) => r.request().postData()?.includes(operation) === true;
}

/** Counts warning-like regions so a silent last-write-wins is recorded as an observation. */
async function warningCount(page: Page): Promise<number> {
  const roles = ["status", "alert", "alertdialog"] as const;
  let total = 0;
  for (const role of roles) total += await page.getByRole(role).count();
  return total;
}

async function runLu001(
  first: number,
  last: number,
  { page, peerPage, liveRecords }: { page: Page; peerPage: Page; liveRecords: LiveRecords },
  testInfo: TestInfo,
): Promise<void> {
  const { api, prefix } = liveRecords;
  const recordA = new TwentyRecordPage(page);
  const recordB = new TwentyRecordPage(peerPage);
  const rounds: unknown[] = [];
  for (let n = first; n <= last; n += 1) {
    const names = raceRoundNames(prefix, "LU001", n);
    let id = "";
    await test.step(`Round ${String(n)}: fresh company`, async () => {
      id = (await createCompanyWith(api, { name: names.base })).id;
      liveRecords.capture("company", id);
    });
    await test.step(`Round ${String(n)}: both open the record`, async () => {
      await Promise.all([recordA.goto("company", id), recordB.goto("company", id)]);
      await expect(recordA.title(names.base)).toBeVisible({ timeout: twentyTimeouts().page });
      await expect(recordB.title(names.base)).toBeVisible({ timeout: twentyTimeouts().page });
    });
    const saves = { a: 0, b: 0 };
    await test.step(`Round ${String(n)}: both save within one Promise.all`, async () => {
      const [boxA, boxB] = await Promise.all([
        recordA.openTitleEditor(names.base),
        recordB.openTitleEditor(names.base),
      ]);
      await boxA.fill(names.a);
      await boxB.fill(names.b);
      const savedA = page.waitForResponse(isSave("UpdateOneCompany"));
      const savedB = peerPage.waitForResponse(isSave("UpdateOneCompany"));
      const t0 = Date.now();
      await Promise.all([boxA.press("Enter"), boxB.press("Enter")]);
      const [ra, rb] = await Promise.all([
        savedA.then((r) => ({ r, at: Date.now() })),
        savedB.then((r) => ({ r, at: Date.now() })),
      ]);
      expect(ra.r.status()).toBe(200);
      expect(rb.r.status()).toBe(200);
      saves.a = ra.at - t0;
      saves.b = rb.at - t0;
    });
    let observed = {};
    await test.step(`Round ${String(n)}: observe before refresh`, async () => {
      const [aTitle, bTitle] = await Promise.all([
        page.getByRole("heading", { level: 3 }).filter({ hasText: names.base }).innerText(),
        peerPage.getByRole("heading", { level: 3 }).filter({ hasText: names.base }).innerText(),
      ]);
      observed = {
        aTitle,
        bTitle,
        warnings: (await warningCount(page)) + (await warningCount(peerPage)),
      };
    });
    await test.step(`Round ${String(n)}: API oracle`, async () => {
      const stored = (await readCompany(api, id)).name;
      const verdict = lostUpdateVerdict(stored, names);
      expect(verdict).not.toBe("lost");
      rounds.push({ n, winner: verdict, spreadMs: Math.abs(saves.a - saves.b), ...observed });
      await Promise.all([page.reload(), peerPage.reload()]);
      await expect(recordA.title(stored)).toBeVisible({ timeout: twentyTimeouts().page });
      await expect(recordB.title(stored)).toBeVisible({ timeout: twentyTimeouts().page });
    });
  }
  await testInfo.attach("lu-001-rounds.json", {
    body: JSON.stringify({ rounds }, null, 2),
    contentType: "application/json",
  });
}

async function runLu002(
  first: number,
  last: number,
  { page, peerPage, liveRecords }: { page: Page; peerPage: Page; liveRecords: LiveRecords },
): Promise<void> {
  const { api, prefix } = liveRecords;
  const kanban = new TwentyKanbanPage(page);
  const recordB = new TwentyRecordPage(peerPage);
  let viewId = "";
  await test.step("Board for this test", async () => {
    const opp = await objectFieldIds(api, "opportunity", ["stage", "name"]);
    const view = await createKanbanView(api, {
      name: `${prefix}-LU002-r${String(first)}-Board`,
      objectId: opp.objectId,
      stageFieldId: opp.fieldIds.stage ?? "",
    });
    viewId = view.id;
    liveRecords.capture("view", viewId);
    await createNameContainsFilter(api, viewId, opp.fieldIds.name ?? "", `${prefix}-LU002-r`);
  });
  for (let n = first; n <= last; n += 1) {
    const name = `${prefix}-LU002-r${String(n)}`;
    const amount = 500 + n;
    let oppId = "";
    await test.step(`Round ${String(n)}: fresh opportunity in New`, async () => {
      oppId = (await createOpportunityInStage(api, name, "NEW")).id;
      liveRecords.capture("opportunity", oppId);
    });
    let box: Awaited<ReturnType<TwentyRecordPage["openFieldEditor"]>> | undefined;
    await test.step(`Round ${String(n)}: A on the board, B on the record`, async () => {
      await Promise.all([kanban.goto(viewId), recordB.goto("opportunity", oppId)]);
      await expect(kanban.card(name)).toBeVisible({ timeout: twentyTimeouts().page });
      box = await recordB.openFieldEditor("Amount", "Currency", 2);
      await box.fill(String(amount));
    });
    await test.step(`Round ${String(n)}: drag and edit at once`, async () => {
      if (box === undefined) throw new Error("amount editor not open");
      const saved = peerPage.waitForResponse(isSave("UpdateOneOpportunity"));
      await Promise.all([kanban.dragCardToColumn(name, "Meeting"), box.press("Enter")]);
      expect((await saved).status()).toBe(200);
    });
    await test.step(`Round ${String(n)}: API oracle`, async () => {
      await expect
        .poll(() => readOpportunity(api, oppId), { timeout: twentyTimeouts().expect })
        .toMatchObject({ stage: "MEETING", amountMicros: amount * 1_000_000 });
    });
    await test.step(`Round ${String(n)}: no duplicate card, both values shown`, async () => {
      await Promise.all([page.reload(), peerPage.reload()]);
      await expect(kanban.card(name)).toHaveCount(1, { timeout: twentyTimeouts().page });
      await expect(recordB.fieldValue(String(amount))).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await expect(recordB.fieldValue("Meeting")).toBeVisible();
    });
  }
}

test.describe("Twenty concurrent edits", { tag: ["@twenty", "@live"] }, () => {
  for (const round of ROUNDS) {
    test(
      `P1-TW-LU-001 Two users edit the same field at once (round ${String(round)})`,
      {
        annotation: [
          { type: "testId", description: "P1-TW-LU-001" },
          { type: "priority", description: "P1" },
        ],
      },
      async ({ page, peerPage, liveRecords }, testInfo) => {
        await runLu001(round, round, { page, peerPage, liveRecords }, testInfo);
      },
    );
  }

  for (const round of ROUNDS) {
    test(
      `P1-TW-LU-002 Kanban move and a field edit at once (round ${String(round)})`,
      {
        annotation: [
          { type: "testId", description: "P1-TW-LU-002" },
          { type: "priority", description: "P1" },
        ],
      },
      async ({ page, peerPage, liveRecords }) => {
        await runLu002(round, round, { page, peerPage, liveRecords });
      },
    );
  }

  for (const n of X01_ROUNDS) {
    test(
      `P1-TW-LU-X01 Edits to different fields of one record both persist (round ${String(n)})`,
      {
        annotation: [
          { type: "testId", description: "P1-TW-LU-X01" },
          { type: "priority", description: "P2" },
        ],
      },
      async ({ page, peerPage, liveRecords }) => {
        const { api, prefix } = liveRecords;
        const recordA = new TwentyRecordPage(page);
        const recordB = new TwentyRecordPage(peerPage);
        const names = raceRoundNames(prefix, "LUX01", n);
        const renamed = `${names.base}-X`;
        const tagline = "tg-X";
        let id = "";
        await test.step(`Round ${String(n)}: fresh company`, async () => {
          id = (await createCompanyWith(api, { name: names.base, tagline: "tg-0" })).id;
          liveRecords.capture("company", id);
          await Promise.all([recordA.goto("company", id), recordB.goto("company", id)]);
          await expect(recordA.title(names.base)).toBeVisible({ timeout: twentyTimeouts().page });
          await expect(recordB.fieldValue("tg-0")).toBeVisible({
            timeout: twentyTimeouts().page,
          });
        });
        await test.step(`Round ${String(n)}: A renames, B edits the tagline`, async () => {
          const [boxA, boxB] = await Promise.all([
            recordA.openTitleEditor(names.base),
            recordB.openFieldEditor("tg-0", "Tagline"),
          ]);
          await boxA.fill(renamed);
          await boxB.fill(tagline);
          const savedA = page.waitForResponse(isSave("UpdateOneCompany"));
          const savedB = peerPage.waitForResponse(isSave("UpdateOneCompany"));
          await Promise.all([boxA.press("Enter"), boxB.press("Enter")]);
          expect((await savedA).status()).toBe(200);
          expect((await savedB).status()).toBe(200);
        });
        await test.step(`Round ${String(n)}: API oracle and both UIs`, async () => {
          await expect
            .poll(() => readCompany(api, id), { timeout: twentyTimeouts().expect })
            .toMatchObject({ name: renamed, tagline });
          await Promise.all([page.reload(), peerPage.reload()]);
          await expect(recordA.fieldValue(tagline)).toBeVisible({
            timeout: twentyTimeouts().page,
          });
          await expect(recordB.title(renamed)).toBeVisible({ timeout: twentyTimeouts().page });
        });
      },
    );
  }

  test(
    "P1-TW-LU-X02 A delete while B edits never brings the record back",
    {
      annotation: [
        { type: "testId", description: "P1-TW-LU-X02" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ peerPage, liveRecords }, testInfo) => {
      const { api, prefix } = liveRecords;
      const recordB = new TwentyRecordPage(peerPage);
      const names = raceRoundNames(prefix, "LUX02", 1);
      const id = (await createCompanyWith(api, { name: names.base, tagline: "tg-0" })).id;
      liveRecords.capture("company", id);
      const subscribed = recordB.liveSubscription("company", id);
      await recordB.goto("company", id);
      await expect(recordB.fieldValue("tg-0")).toBeVisible({ timeout: twentyTimeouts().page });
      const box = await recordB.openFieldEditor("tg-0", "Tagline");
      await box.fill("tg-B");
      await subscribed;
      await softDeleteCompany(api, id);
      // The probe saw the banner live; the build runs did not (record page, 4 of 4), so it is recorded, not asserted.
      const bannerLive = await recordB.deletedBanner.waitFor({ timeout: 10_000 }).then(
        () => true,
        () => false,
      );
      const saved = peerPage.waitForResponse(isSave("UpdateOneCompany"));
      await box.press("Enter");
      const saveStatus = (await saved).status();
      const state = await readCompanyAnyState(api, id);
      await testInfo.attach("x02-observation.json", {
        body: JSON.stringify(
          { bannerLive, saveStatus, deletedRowTagline: state.deleted[0]?.tagline },
          null,
          2,
        ),
        contentType: "application/json",
      });
      expect(state.live).toBe(0);
      expect(state.deleted).toHaveLength(1);
      await peerPage.reload();
      await expect(recordB.deletedBanner).toBeVisible({ timeout: twentyTimeouts().page });
      await expect(recordB.restoreText).not.toHaveCount(0);
    },
  );
});
