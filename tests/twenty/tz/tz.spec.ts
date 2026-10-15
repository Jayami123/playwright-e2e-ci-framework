import fs from "node:fs";
import { type Page } from "@playwright/test";
import {
  assertKiritimatiDateUnchanged,
  BERLIN_FALL_0030_ISO,
  BERLIN_FALL_0230_CEST_ISO,
  BERLIN_FALL_0230_CET_ISO,
  BERLIN_FALL_CTRL_ISO,
  BERLIN_SPRING_0030_ISO,
  BERLIN_SPRING_CTRL_ISO,
  csvCellByName,
  formatTwentyDate,
  formatTwentyDateTime,
  kiritimatiHalfPastIso,
  zonedDayNumber,
} from "../../../src/products/twenty/display.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { expect, test } from "../../../src/products/twenty/fixtures/index.js";
import { p1QaViewName } from "../../../src/products/twenty/fixtures/names.js";
import { TwentyObjectCalendarPage } from "../../../src/products/twenty/pages/object-calendar.page.js";
import { TwentyObjectFilterPage } from "../../../src/products/twenty/pages/object-filter.page.js";
import { TwentyObjectTablePage } from "../../../src/products/twenty/pages/object-table.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import { TwentySettingsExperiencePage } from "../../../src/products/twenty/pages/settings-experience.page.js";
import {
  BERLIN_TZ,
  COLOMBO_TZ,
  HONOLULU_TZ,
  KIRITIMATI_TZ,
  UTC_TZ,
} from "../../../src/products/twenty/timezones.js";

const CLOSE_DATE_ISO = "2027-01-01T00:30:00.000Z";
const BIRTHDAY_YMD = "2027-01-01";

const SETTINGS_TZ_COLOMBO = "(GMT+05:30) India Standard Time - Colombo";
const SETTINGS_TZ_UTC = "(GMT+00:00) Coordinated Universal Time";
const SETTINGS_TZ_HONOLULU = "(GMT-10:00) Hawaii-Aleutian Standard Time - Honolulu";
const SETTINGS_TZ_KIRITIMATI = "(GMT+14:00) Line Islands Time - Kiritimati";

async function shortTimeZoneName(page: Page, timeZone: string, iso: string): Promise<string> {
  return page.evaluate(
    ({ timeZone: tz, iso: instant }) => {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: tz,
        timeZoneName: "short",
      }).formatToParts(new Date(instant));
      const name = parts.find((part) => part.type === "timeZoneName");
      if (name === undefined || name.value.trim() === "") {
        throw new Error(`browser Intl omitted timeZoneName for ${tz}`);
      }
      return name.value;
    },
    { timeZone, iso },
  );
}

async function expectedDateTimeLabel(page: Page, iso: string, timeZone: string): Promise<string> {
  const civil = formatTwentyDateTime(iso, timeZone);
  const abbrev = await shortTimeZoneName(page, timeZone, iso);
  return `${civil} ${abbrev}`;
}

function attachGroupByEvidence(page: Page): { readonly flush: () => Promise<void> } {
  const bodies: string[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("/graphql")) {
      return;
    }
    const post = response.request().postData() ?? "";
    if (!post.includes("GroupByOpportunities")) {
      return;
    }
    bodies.push(post);
  });
  return {
    flush: async () => {
      await test.info().attach("groupby-opportunities.json", {
        body: bodies.length === 0 ? "groupBy not observed" : bodies.join("\n---\n"),
        contentType: "text/plain",
      });
    },
  };
}

async function expectRecordDateTime(
  page: Page,
  recordId: string,
  iso: string,
  timeZone: string,
): Promise<void> {
  const expected = await expectedDateTimeLabel(page, iso, timeZone);
  const record = new TwentyRecordPage(page);
  const table = new TwentyObjectTablePage(page, "opportunities");
  await record.goto("opportunity", recordId);
  await expect(record.dateValueExact(expected)).toBeVisible({ timeout: twentyTimeouts().page });
  await table.gotoIndex();
  await expect(table.cellWithExactText(recordId, expected)).toBeVisible({
    timeout: twentyTimeouts().page,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Twenty member timezone UI", { tag: ["@twenty", "@twenty-tz"] }, () => {
  test.use({ locale: "en-US", timezoneId: "America/Sao_Paulo" });

  test(
    "P1-TW-TZ-001 DATE field does not shift with member timezone",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-001" },
        { type: "priority", description: "P0" },
      ],
    },
    async ({ page, twentyQa }) => {
      const expectedDate = formatTwentyDate(BIRTHDAY_YMD);
      const pet = await test.step("Create pet with DATE birthday", async () =>
        twentyQa.createPet("tz001", BIRTHDAY_YMD));

      const petsTable = new TwentyObjectTablePage(page, "pets");
      const record = new TwentyRecordPage(page);
      const settings = new TwentySettingsExperiencePage(page);

      await test.step("Honolulu: record and table show same civil date", async () => {
        await twentyQa.setTimeZone(HONOLULU_TZ);
        await settings.goto();
        await settings.expectTimeZoneValueLabel(SETTINGS_TZ_HONOLULU);
        await record.goto("pet", pet.id);
        await expect(record.dateValueExact(expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(record.fieldsWidget.getByText(/Dec 31, 2026/)).toHaveCount(0);
        await petsTable.gotoIndex();
        await expect(petsTable.cellWithExactText(pet.id, expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(petsTable.row(pet.id).getByText(/Dec 31, 2026/)).toHaveCount(0);
      });

      await test.step("Kiritimati: record and table still show same civil date", async () => {
        await twentyQa.setTimeZone(KIRITIMATI_TZ);
        await settings.goto();
        await settings.expectTimeZoneValueLabel(SETTINGS_TZ_KIRITIMATI);
        await record.goto("pet", pet.id);
        await expect(record.dateValueExact(expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(record.fieldsWidget.getByText(/Dec 31, 2026/)).toHaveCount(0);
        await petsTable.gotoIndex();
        await expect(petsTable.cellWithExactText(pet.id, expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(petsTable.row(pet.id).getByText(/Dec 31, 2026/)).toHaveCount(0);
      });
    },
  );

  test(
    "P1-TW-TZ-002 DATE_TIME follows Asia/Colombo member timezone",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-002" },
        { type: "priority", description: "P0" },
      ],
    },
    async ({ page, twentyQa }) => {
      const opp = await test.step("Create opportunity with closeDate ISO", async () =>
        twentyQa.createOpportunity("tz002-colombo", CLOSE_DATE_ISO));
      await twentyQa.setTimeZone(COLOMBO_TZ);
      const expected = await expectedDateTimeLabel(page, CLOSE_DATE_ISO, COLOMBO_TZ);

      const record = new TwentyRecordPage(page);
      const table = new TwentyObjectTablePage(page, "opportunities");

      await test.step("Probe: Playwright timezoneId drives browser host TZ for Twenty abbrev", async () => {
        const browserHostTz = await page.evaluate(
          () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        expect(browserHostTz).toBe("America/Sao_Paulo");
      });

      await record.goto("opportunity", opp.id);
      await expect(record.dateValueExact(expected)).toBeVisible({ timeout: twentyTimeouts().page });
      console.log(
        JSON.stringify({
          probe: "colombo-close-date-ui",
          browserHostTz: "America/Sao_Paulo",
          expectedColomboCloseDate: expected,
        }),
      );

      await table.gotoIndex();
      await expect(table.cellWithExactText(opp.id, expected)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
    },
  );

  test(
    "P1-TW-TZ-002 DATE_TIME follows UTC member timezone",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-002" },
        { type: "priority", description: "P0" },
      ],
    },
    async ({ page, twentyQa }) => {
      const opp = await test.step("Create opportunity with closeDate ISO", async () =>
        twentyQa.createOpportunity("tz002-utc", CLOSE_DATE_ISO));
      await twentyQa.setTimeZone(UTC_TZ);
      const expected = await expectedDateTimeLabel(page, CLOSE_DATE_ISO, UTC_TZ);

      const record = new TwentyRecordPage(page);
      const table = new TwentyObjectTablePage(page, "opportunities");

      await record.goto("opportunity", opp.id);
      await expect(record.dateValueExact(expected)).toBeVisible({ timeout: twentyTimeouts().page });
      await expect(record.fieldsWidget.getByText(/6:00 AM/)).toHaveCount(0);

      await table.gotoIndex();
      await expect(table.cellWithExactText(opp.id, expected)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await expect(table.row(opp.id).getByText(/6:00 AM/)).toHaveCount(0);
    },
  );

  test(
    "P1-TW-TZ-X01 DATE_TIME crosses UTC civil day in Honolulu",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-X01" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, twentyQa }) => {
      const opp = await test.step("Create opportunity with closeDate ISO", async () =>
        twentyQa.createOpportunity("x01", CLOSE_DATE_ISO));
      await twentyQa.setTimeZone(HONOLULU_TZ);
      const expected = await expectedDateTimeLabel(page, CLOSE_DATE_ISO, HONOLULU_TZ);

      const record = new TwentyRecordPage(page);
      const table = new TwentyObjectTablePage(page, "opportunities");

      await record.goto("opportunity", opp.id);
      await expect(record.dateValueExact(expected)).toBeVisible({ timeout: twentyTimeouts().page });

      await table.gotoIndex();
      await expect(table.cellWithExactText(opp.id, expected)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
    },
  );

  test(
    "P1-TW-TZ-003 Berlin calendar day cells follow member DST, not UTC day",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-003" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, twentyQa }) => {
      test.setTimeout(180_000);
      const spring0030 = await twentyQa.createOpportunity(
        "tz003-spring-0030",
        BERLIN_SPRING_0030_ISO,
      );
      const springCtrl = await twentyQa.createOpportunity(
        "tz003-spring-ctrl",
        BERLIN_SPRING_CTRL_ISO,
      );
      const fall0030 = await twentyQa.createOpportunity("tz003-fall-0030", BERLIN_FALL_0030_ISO);
      const fallCtrl = await twentyQa.createOpportunity("tz003-fall-ctrl", BERLIN_FALL_CTRL_ISO);
      await twentyQa.setTimeZone(BERLIN_TZ);

      const settings = new TwentySettingsExperiencePage(page);
      await settings.goto();
      const berlinLabel = await settings.readTimeZoneValueLabel();
      console.log(JSON.stringify({ probe: "berlin-settings-label", label: berlinLabel }));
      await test.info().attach("berlin-settings-label.txt", {
        body: berlinLabel,
        contentType: "text/plain",
      });
      await settings.expectTimeZoneValueLabel(/Berlin/);

      const calendar = new TwentyObjectCalendarPage(page);
      const groupBy = attachGroupByEvidence(page);
      await calendar.gotoOpportunitiesIndex();
      const viewId = await calendar.createCloseDateCalendarView(
        p1QaViewName(twentyQa.prefix, "cal"),
      );
      twentyQa.captureViewId(viewId);

      await test.step("March 2027: 00:30 is day 28, control is day 27", async () => {
        await calendar.goToMonth(2027, 3);
        await calendar.expectRecordOnDay(
          spring0030.name,
          zonedDayNumber(BERLIN_SPRING_0030_ISO, BERLIN_TZ),
        );
        await calendar.expectRecordOnDay(
          springCtrl.name,
          zonedDayNumber(BERLIN_SPRING_CTRL_ISO, BERLIN_TZ),
        );
      });

      await test.step("October 2027: 00:30 is day 31, control is day 30", async () => {
        await calendar.goToMonth(2027, 10);
        await calendar.expectRecordOnDay(
          fall0030.name,
          zonedDayNumber(BERLIN_FALL_0030_ISO, BERLIN_TZ),
        );
        await calendar.expectRecordOnDay(
          fallCtrl.name,
          zonedDayNumber(BERLIN_FALL_CTRL_ISO, BERLIN_TZ),
        );
      });

      await groupBy.flush();

      await expectRecordDateTime(page, spring0030.id, BERLIN_SPRING_0030_ISO, BERLIN_TZ);
      await expectRecordDateTime(page, springCtrl.id, BERLIN_SPRING_CTRL_ISO, BERLIN_TZ);
      await expectRecordDateTime(page, fall0030.id, BERLIN_FALL_0030_ISO, BERLIN_TZ);
      await expectRecordDateTime(page, fallCtrl.id, BERLIN_FALL_CTRL_ISO, BERLIN_TZ);
    },
  );

  test(
    "P1-TW-TZ-X03 Is today includes Kiritimati 00:30 and excludes yesterday and tomorrow",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-X03" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, twentyQa }) => {
      const nowMs = Date.now();
      const todayIso = kiritimatiHalfPastIso(nowMs, 0);
      const yesterdayIso = kiritimatiHalfPastIso(nowMs, -1);
      const tomorrowIso = kiritimatiHalfPastIso(nowMs, 1);
      const today = await twentyQa.createOpportunity("x03-today", todayIso);
      const yesterday = await twentyQa.createOpportunity("x03-yesterday", yesterdayIso);
      const tomorrow = await twentyQa.createOpportunity("x03-tomorrow", tomorrowIso);
      await twentyQa.setTimeZone(KIRITIMATI_TZ);

      const table = new TwentyObjectTablePage(page, "opportunities");
      const filters = new TwentyObjectFilterPage(page);
      await table.gotoIndex();
      await expect(table.nameLink(today.id, today.name)).toBeVisible({
        timeout: twentyTimeouts().page,
      });

      assertKiritimatiDateUnchanged(nowMs, Date.now());
      const abbrev = await shortTimeZoneName(page, KIRITIMATI_TZ, new Date(nowMs).toISOString());
      await filters.applyCloseDateIsToday(abbrev);

      await expect(table.nameLink(today.id, today.name)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await expect(table.nameLink(yesterday.id, yesterday.name)).toHaveCount(0);
      await expect(table.nameLink(tomorrow.id, tomorrow.name)).toHaveCount(0);
      assertKiritimatiDateUnchanged(nowMs, Date.now());

      await filters.resetAndExpectChipGone();
    },
  );

  test(
    "P1-TW-TZ-X05 fall-back 02:30 rows stay distinct and sort by UTC instant",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-X05" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, twentyQa }) => {
      const cest = await twentyQa.createOpportunity("x05-cest", BERLIN_FALL_0230_CEST_ISO);
      const cet = await twentyQa.createOpportunity("x05-cet", BERLIN_FALL_0230_CET_ISO);
      await twentyQa.setTimeZone(BERLIN_TZ);
      const cestLabel = await expectedDateTimeLabel(page, BERLIN_FALL_0230_CEST_ISO, BERLIN_TZ);
      const cetLabel = await expectedDateTimeLabel(page, BERLIN_FALL_0230_CET_ISO, BERLIN_TZ);
      expect(cestLabel).not.toBe(cetLabel);

      const table = new TwentyObjectTablePage(page, "opportunities");
      await table.gotoIndex();
      await expect(table.cellWithExactText(cest.id, cestLabel)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await expect(table.cellWithExactText(cet.id, cetLabel)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await expect(table.nameLink(cest.id, cest.name)).toBeVisible();
      await expect(table.nameLink(cet.id, cet.name)).toBeVisible();

      const filters = new TwentyObjectFilterPage(page);
      await filters.filterNameContains(`${twentyQa.prefix}-x05`);
      await table.sortByCloseDateAscending();
      const cestY = await table.rowY(cest.id);
      const cetY = await table.rowY(cet.id);
      expect(cestY).toBeLessThan(cetY);
      await filters.resetUnsavedViewEdits();

      const record = new TwentyRecordPage(page);
      await record.goto("opportunity", cest.id);
      await expect(record.dateValueExact(cestLabel)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await record.goto("opportunity", cet.id);
      await expect(record.dateValueExact(cetLabel)).toBeVisible({ timeout: twentyTimeouts().page });
    },
  );

  test(
    "P1-TW-TZ-X04 CSV export stores UTC DATE_TIME and civil DATE from fixture values",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-X04" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, twentyQa }) => {
      const opp = await twentyQa.createOpportunity("x04-opp", CLOSE_DATE_ISO);
      const pet = await twentyQa.createPet("x04-pet", BIRTHDAY_YMD);
      await twentyQa.setTimeZone(COLOMBO_TZ);
      const uiClose = await expectedDateTimeLabel(page, CLOSE_DATE_ISO, COLOMBO_TZ);

      const record = new TwentyRecordPage(page);
      await record.goto("opportunity", opp.id);
      await expect(record.dateValueExact(uiClose)).toBeVisible({ timeout: twentyTimeouts().page });

      const oppTable = new TwentyObjectTablePage(page, "opportunities");
      await oppTable.gotoIndex();
      await expect(oppTable.nameLink(opp.id, opp.name)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      const oppCsvPath = await oppTable.downloadExportedView();
      const oppCsv = fs.readFileSync(oppCsvPath, "utf8");
      await test.info().attach("opportunity.csv", { body: oppCsv, contentType: "text/csv" });
      const csvClose = csvCellByName(oppCsv, opp.name, "Close date");
      expect(csvClose).toBe(opp.closeDate);
      console.log(
        JSON.stringify({
          probe: "x04-csv-vs-ui",
          fixtureCloseDate: opp.closeDate,
          csvCloseDate: csvClose,
          uiCloseDate: uiClose,
        }),
      );

      const petsTable = new TwentyObjectTablePage(page, "pets");
      await petsTable.gotoIndex();
      await expect(petsTable.nameLink(pet.id, pet.name)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      const petCsvPath = await petsTable.downloadExportedView();
      const petCsv = fs.readFileSync(petCsvPath, "utf8");
      await test.info().attach("pet.csv", { body: petCsv, contentType: "text/csv" });
      expect(csvCellByName(petCsv, pet.name, "Birthday")).toBe(pet.birthday);

      await record.goto("pet", pet.id);
      await expect(record.dateValueExact(formatTwentyDate(BIRTHDAY_YMD))).toBeVisible({
        timeout: twentyTimeouts().page,
      });
    },
  );

  test(
    "P1-TW-TZ-X02 Settings timezone change re-renders close date and restores member TZ",
    {
      annotation: [
        { type: "testId", description: "P1-TW-TZ-X02" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, twentyQa }) => {
      const opp = await test.step("Create opportunity with closeDate ISO", async () =>
        twentyQa.createOpportunity("x02", CLOSE_DATE_ISO));
      await twentyQa.rememberTimeZone();
      const original = await twentyQa.readTimeZone();

      const record = new TwentyRecordPage(page);
      const settings = new TwentySettingsExperiencePage(page);

      await test.step("Settings: Colombo then verify record UI", async () => {
        await settings.goto();
        await settings.selectTimeZoneOption(SETTINGS_TZ_COLOMBO);
        const colomboExpected = await expectedDateTimeLabel(page, CLOSE_DATE_ISO, COLOMBO_TZ);
        await record.goto("opportunity", opp.id);
        await expect(record.dateValueExact(colomboExpected)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
      });

      await test.step("Settings: UTC then verify record UI and negative", async () => {
        await settings.goto();
        await settings.selectTimeZoneOption(SETTINGS_TZ_UTC);
        const utcExpected = await expectedDateTimeLabel(page, CLOSE_DATE_ISO, UTC_TZ);
        await record.goto("opportunity", opp.id);
        await expect(record.dateValueExact(utcExpected)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(record.fieldsWidget.getByText(/6:00 AM/)).toHaveCount(0);
      });

      await test.step("Restore proof before test end", async () => {
        await twentyQa.restoreTimeZoneIfNeeded();
        expect(await twentyQa.readTimeZone()).toBe(original);
      });
    },
  );
});
