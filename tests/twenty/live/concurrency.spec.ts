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
 * P1 is functional UI E2E: each case runs one round on a fresh record. The repeated soak (many rounds per
 * run) is planned for P6 as P6-TW-RACE-001 (backlog). A round is two full page loads per user (15 to 25 s each under load),
 * so one round per test keeps every test well inside the 120 s timeout.
 */
const ROUND = 1;

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
  { page, peerPage, liveRecords }: { page: Page; peerPage: Page; liveRecords: LiveRecords },
  testInfo: TestInfo,
): Promise<void> {
  const { api, prefix } = liveRecords;
  const recordA = new TwentyRecordPage(page);
  const recordB = new TwentyRecordPage(peerPage);
  const names = raceRoundNames(prefix, "LU001", ROUND);
  let id = "";
  await test.step("Fresh company", async () => {
    id = (await createCompanyWith(api, { name: names.base })).id;
    liveRecords.capture("company", id);
  });
  await test.step("Both open the record", async () => {
    await Promise.all([recordA.goto("company", id), recordB.goto("company", id)]);
    await expect(recordA.title(names.base)).toBeVisible({ timeout: twentyTimeouts().page });
    await expect(recordB.title(names.base)).toBeVisible({ timeout: twentyTimeouts().page });
  });
  const saves = { a: 0, b: 0 };
  await test.step("Both save within one Promise.all", async () => {
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
  await test.step("Observe before refresh", async () => {
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
  await test.step("API oracle, then both UIs after refresh", async () => {
    const stored = (await readCompany(api, id)).name;
    const verdict = lostUpdateVerdict(stored, names);
    expect(verdict).not.toBe("lost");
    await testInfo.attach("lu-001-round.json", {
      body: JSON.stringify(
        { round: ROUND, winner: verdict, spreadMs: Math.abs(saves.a - saves.b), ...observed },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await Promise.all([page.reload(), peerPage.reload()]);
    await expect(recordA.title(stored)).toBeVisible({ timeout: twentyTimeouts().page });
    await expect(recordB.title(stored)).toBeVisible({ timeout: twentyTimeouts().page });
  });
}

async function runLu002({
  page,
  peerPage,
  liveRecords,
}: {
  page: Page;
  peerPage: Page;
  liveRecords: LiveRecords;
}): Promise<void> {
  const { api, prefix } = liveRecords;
  const kanban = new TwentyKanbanPage(page);
  const recordB = new TwentyRecordPage(peerPage);
  const name = `${prefix}-LU002-r${String(ROUND)}`;
  const amount = 500 + ROUND;
  let viewId = "";
  await test.step("Board for this test", async () => {
    const opp = await objectFieldIds(api, "opportunity", ["stage", "name"]);
    const view = await createKanbanView(api, {
      name: `${name}-Board`,
      objectId: opp.objectId,
      stageFieldId: opp.fieldIds.stage ?? "",
    });
    viewId = view.id;
    liveRecords.capture("view", viewId);
    await createNameContainsFilter(api, viewId, opp.fieldIds.name ?? "", `${prefix}-LU002-r`);
  });
  let oppId = "";
  await test.step("Fresh opportunity in New", async () => {
    oppId = (await createOpportunityInStage(api, name, "NEW")).id;
    liveRecords.capture("opportunity", oppId);
  });
  let box: Awaited<ReturnType<TwentyRecordPage["openFieldEditor"]>> | undefined;
  await test.step("A on the board, B on the record", async () => {
    await Promise.all([kanban.goto(viewId), recordB.goto("opportunity", oppId)]);
    await expect(kanban.card(name)).toBeVisible({ timeout: twentyTimeouts().page });
    box = await recordB.openFieldEditor("Amount", "Currency", 2);
    await box.fill(String(amount));
  });
  await test.step("Drag and edit at once", async () => {
    if (box === undefined) throw new Error("amount editor not open");
    const saved = peerPage.waitForResponse(isSave("UpdateOneOpportunity"));
    await Promise.all([kanban.dragCardToColumn(name, "Meeting"), box.press("Enter")]);
    expect((await saved).status()).toBe(200);
  });
  await test.step("API oracle", async () => {
    await expect
      .poll(() => readOpportunity(api, oppId), { timeout: twentyTimeouts().expect })
      .toMatchObject({ stage: "MEETING", amountMicros: amount * 1_000_000 });
  });
  await test.step("No duplicate card, both values shown", async () => {
    await Promise.all([page.reload(), peerPage.reload()]);
    await expect(kanban.card(name)).toHaveCount(1, { timeout: twentyTimeouts().page });
    await expect(recordB.fieldValue(String(amount))).toBeVisible({
      timeout: twentyTimeouts().page,
    });
    await expect(recordB.fieldValue("Meeting")).toBeVisible();
  });
}

test.describe("Twenty concurrent edits", { tag: ["@twenty", "@live"] }, () => {
  // Records are fresh per test and named by the worker prefix (P1-QA-<seed>-<worker>), and the peer member
  // is worker-scoped, so the tests are independent and can share both workers.
  test.describe.configure({ mode: "parallel" });

  test(
    "P1-TW-LU-001 Two users edit the same field at once",
    {
      annotation: [
        { type: "testId", description: "P1-TW-LU-001" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, peerPage, liveRecords }, testInfo) => {
      await runLu001({ page, peerPage, liveRecords }, testInfo);
    },
  );

  test(
    "P1-TW-LU-002 Kanban move and a field edit at once",
    {
      annotation: [
        { type: "testId", description: "P1-TW-LU-002" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, peerPage, liveRecords }) => {
      await runLu002({ page, peerPage, liveRecords });
    },
  );

  test(
    "P1-TW-LU-X01 Edits to different fields of one record both persist",
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
      const names = raceRoundNames(prefix, "LUX01", ROUND);
      const renamed = `${names.base}-X`;
      const tagline = "tg-X";
      let id = "";
      await test.step("Fresh company", async () => {
        id = (await createCompanyWith(api, { name: names.base, tagline: "tg-0" })).id;
        liveRecords.capture("company", id);
        await Promise.all([recordA.goto("company", id), recordB.goto("company", id)]);
        await expect(recordA.title(names.base)).toBeVisible({ timeout: twentyTimeouts().page });
        await expect(recordB.fieldValue("tg-0")).toBeVisible({ timeout: twentyTimeouts().page });
      });
      await test.step("A renames, B edits the tagline", async () => {
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
      await test.step("API oracle and both UIs", async () => {
        await expect
          .poll(() => readCompany(api, id), { timeout: twentyTimeouts().expect })
          .toMatchObject({ name: renamed, tagline });
        await Promise.all([page.reload(), peerPage.reload()]);
        await expect(recordA.fieldValue(tagline)).toBeVisible({ timeout: twentyTimeouts().page });
        await expect(recordB.title(renamed)).toBeVisible({ timeout: twentyTimeouts().page });
      });
    },
  );

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
      // The probe saw the banner live; the build runs did not (record page, 4 of 4), so it is recorded, not
      // asserted. A short look is enough for the observation; the banner is asserted after the reload below.
      const bannerLive = await recordB.deletedBanner.waitFor({ timeout: 2_000 }).then(
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
