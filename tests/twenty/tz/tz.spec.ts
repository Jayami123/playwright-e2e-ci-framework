import { type Page } from "@playwright/test";
import { formatTwentyDate, formatTwentyDateTime } from "../../../src/products/twenty/display.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { expect, test } from "../../../src/products/twenty/fixtures/index.js";
import { TwentyObjectTablePage } from "../../../src/products/twenty/pages/object-table.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import { TwentySettingsExperiencePage } from "../../../src/products/twenty/pages/settings-experience.page.js";
import {
  COLOMBO_TZ,
  HONOLULU_TZ,
  KIRITIMATI_TZ,
  UTC_TZ,
} from "../../../src/products/twenty/timezones.js";

const CLOSE_DATE_ISO = "2027-01-01T00:30:00.000Z";
const BIRTHDAY_YMD = "2027-01-01";

const SETTINGS_TZ_COLOMBO = "(GMT+05:30) India Standard Time - Colombo";
const SETTINGS_TZ_UTC = "(GMT+00:00) Coordinated Universal Time";

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

      await test.step("Honolulu: record and table show same civil date", async () => {
        await twentyQa.setTimeZone(HONOLULU_TZ);
        await record.goto("pet", pet.id);
        await expect(record.dateValueExact(expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(record.fieldsWidget.getByText("Dec 31, 2026", { exact: true })).toHaveCount(0);
        await petsTable.gotoIndex();
        await expect(petsTable.cellWithExactText(pet.id, expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(petsTable.row(pet.id).getByText("Dec 31, 2026", { exact: true })).toHaveCount(
          0,
        );
      });

      await test.step("Kiritimati: record and table still show same civil date", async () => {
        await twentyQa.setTimeZone(KIRITIMATI_TZ);
        await record.goto("pet", pet.id);
        await expect(record.dateValueExact(expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(record.fieldsWidget.getByText("Dec 31, 2026", { exact: true })).toHaveCount(0);
        await petsTable.gotoIndex();
        await expect(petsTable.cellWithExactText(pet.id, expectedDate)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
        await expect(petsTable.row(pet.id).getByText("Dec 31, 2026", { exact: true })).toHaveCount(
          0,
        );
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
      await expect(record.fieldsWidget.getByText("6:00 AM", { exact: true })).toHaveCount(0);

      await table.gotoIndex();
      await expect(table.cellWithExactText(opp.id, expected)).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      await expect(table.row(opp.id).getByText("6:00 AM", { exact: true })).toHaveCount(0);
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
        await expect(record.fieldsWidget.getByText("6:00 AM", { exact: true })).toHaveCount(0);
      });

      await test.step("Restore proof before test end", async () => {
        await twentyQa.restoreTimeZoneIfNeeded();
        expect(await twentyQa.readTimeZone()).toBe(original);
      });
    },
  );
});
