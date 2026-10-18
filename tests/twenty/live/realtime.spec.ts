import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import {
  countPeopleMatching,
  createPersonViaRest,
  createPersonWithJob,
  readPerson,
  updatePersonJobTitle,
} from "../../../src/products/twenty/fixtures/live-records.js";
import { TW_RT_002_CREATED_ROW_MISSING_ISSUE } from "../../../src/products/twenty/issues.js";
import { expect, test } from "../../../src/products/twenty/live-fixtures.js";
import { latencySummary } from "../../../src/products/twenty/live.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";

test.describe("Twenty real-time propagation", { tag: ["@twenty", "@live"] }, () => {
  test(
    "P1-TW-RT-001 Update in context A appears in context B",
    {
      annotation: [
        { type: "testId", description: "P1-TW-RT-001" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, peerPage, liveRecords }, testInfo) => {
      const { api, prefix } = liveRecords;
      const peopleB = new TwentyPeoplePage(peerPage);
      const recordA = new TwentyRecordPage(page);
      const samples: number[] = [];
      const person = await createPersonWithJob(api, `${prefix}-RT001-Ann`, "Probe", "rt-0");
      liveRecords.capture("person", person.id);

      const subscribed = peopleB.liveSubscription();
      await peopleB.goto();
      await peopleB.filterNameContains(`${prefix}-RT001`);
      await expect(peopleB.rowById(person.id)).toContainText("rt-0");
      await subscribed;
      const urlB = peerPage.url();

      await recordA.goto("person", person.id);
      await expect(recordA.fieldValue("rt-0")).toBeVisible({ timeout: twentyTimeouts().page });

      for (let i = 1; i <= 3; i += 1) {
        await test.step(`Edit ${String(i)}: A saves the job title`, async () => {
          const box = await recordA.openFieldEditor(`rt-${String(i - 1)}`, "Job Title");
          await box.fill(`rt-${String(i)}`);
          const saved = page.waitForResponse(
            (r) => r.request().postData()?.includes("UpdateOnePerson") === true,
          );
          await box.press("Enter");
          expect((await saved).status()).toBe(200);
        });
        const t0 = Date.now();
        await test.step(`Edit ${String(i)}: B shows it without a reload`, async () => {
          await expect
            .poll(() => peopleB.rowById(person.id).innerText(), { intervals: [50] })
            .toContain(`rt-${String(i)}`);
          samples.push(Date.now() - t0);
          expect(peerPage.url()).toBe(urlB);
        });
        await test.step(`Edit ${String(i)}: API oracle`, async () => {
          expect((await readPerson(api, person.id)).jobTitle).toBe(`rt-${String(i)}`);
        });
      }
      await testInfo.attach("rt-001-latency.json", {
        body: JSON.stringify(latencySummary(samples), null, 2),
        contentType: "application/json",
      });
    },
  );

  test(
    "P1-TW-RT-002 Record created by API appears live",
    {
      annotation: [
        { type: "testId", description: "P1-TW-RT-002" },
        { type: "priority", description: "P2" },
        { type: "issue", description: TW_RT_002_CREATED_ROW_MISSING_ISSUE },
      ],
    },
    async ({ peerPage, liveRecords, twentyQaMember }, testInfo) => {
      const { api, prefix } = liveRecords;
      const peopleB = new TwentyPeoplePage(peerPage);
      const seed = await createPersonWithJob(api, `${prefix}-RT002-Seed`, "Probe", "anchor-0");
      liveRecords.capture("person", seed.id);

      const subscribed = peopleB.liveSubscription();
      await peopleB.goto();
      await peopleB.filterNameContains(`${prefix}-RT002`);
      await expect(peopleB.rowById(seed.id)).toBeVisible();
      await subscribed;
      let navigations = 0;
      peerPage.on("framenavigated", (frame) => {
        if (frame === peerPage.mainFrame()) navigations += 1;
      });

      const created = await createPersonViaRest(
        twentyQaMember,
        `${prefix}-RT002-Rest`,
        "Probe",
        "created",
      );
      liveRecords.capture("person", created.id);
      expect(created.status).toBe(201);
      expect(await countPeopleMatching(api, `${prefix}-RT002`)).toBe(2);

      const t0 = Date.now();
      await updatePersonJobTitle(api, seed.id, "anchor-1");
      await expect(peopleB.rowById(seed.id)).toContainText("anchor-1");
      const anchorMs = Date.now() - t0;
      await expect(peopleB.viewCount()).toContainText("· 2");
      expect(navigations).toBe(0);

      await attachKnownBugEvidence(peerPage, testInfo, {
        issue: TW_RT_002_CREATED_ROW_MISSING_ISSUE,
        observed: {
          rowsById: await peopleB.rowById(created.id).count(),
          viewCount: await peopleB.viewCount().innerText(),
          anchorMs,
          apiMatches: 2,
        },
        expected: { rowsById: 1 },
      });
      test.fail(true, TW_RT_002_CREATED_ROW_MISSING_ISSUE);
      await expect(peopleB.rowById(created.id)).toBeVisible();
    },
  );
});
