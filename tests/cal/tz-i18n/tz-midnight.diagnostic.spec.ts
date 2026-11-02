import {
  civilDateToIso,
  addDays,
  fromZonedCivil,
  monthParam,
  toZonedLabel,
  expectedSlotEntriesForViewerDay,
} from "../../../src/core/timezone.js";
import { actualSlotLabels } from "../../../src/products/cal/booker-tz.js";
import {
  availabilityWindowsFromOrganiser,
  earliestBookableInstant,
  firstViewerWeekdayWithoutBusyTime,
  readEventTypeBookingRules,
  readOrganiserAvailability,
} from "../../../src/products/cal/db.js";
import { loadConfig, timeouts } from "../../../src/products/cal/env.js";
import { test } from "../../../src/products/cal/fixtures.js";
import {
  MIN_LEAD_DAYS,
  SLOT_STEP_MINUTES,
  WEEKDAY_SEARCH_ATTEMPTS,
} from "../../../src/products/cal/schedules.js";
import { PRO_THIRTY_MIN_SLUG } from "../../../src/products/cal/routes.js";
import { AUCKLAND_TZ } from "../../../src/products/cal/timezones.js";

/**
 * Diagnostic only: records evidence for P1-CAL-TZ-001 near Auckland midnight.
 * It asserts nothing; the label (PRODUCT BUG / TEST BUG) is decided from the attachment.
 */
const CASES = [
  { label: "day-before 23:55", dayOffset: -1, hour: 23, minute: 55 },
  { label: "day-before 23:59", dayOffset: -1, hour: 23, minute: 59 },
  { label: "day-of 00:00", dayOffset: 0, hour: 0, minute: 0 },
  { label: "day-of 00:05", dayOffset: 0, hour: 0, minute: 5 },
  { label: "control day-before 12:00", dayOffset: -1, hour: 12, minute: 0 },
] as const;

function decodeRequestInput(rawUrl: string): unknown {
  const url = new URL(rawUrl);
  const input = url.searchParams.get("input");
  if (input === null) {
    return null;
  }
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

test.describe("P1-CAL-TZ-001 diagnostic: Auckland midnight", () => {
  test.use({ storageState: { cookies: [], origins: [] }, timezoneId: AUCKLAND_TZ });

  for (const c of CASES) {
    test(`TZ-DIAG ${c.label}`, { tag: ["@cal", "@tz"] }, async ({ booker, page }, testInfo) => {
      test.setTimeout(timeouts().journey);
      const organiser = await readOrganiserAvailability(loadConfig().email);
      const viewerDate = await firstViewerWeekdayWithoutBusyTime({
        organiserEmail: organiser.email,
        viewerTimeZone: AUCKLAND_TZ,
        minLeadDays: MIN_LEAD_DAYS,
        maxAttempts: WEEKDAY_SEARCH_ATTEMPTS,
      });
      const pinned = fromZonedCivil(AUCKLAND_TZ, {
        ...addDays(viewerDate, c.dayOffset),
        hour: c.hour,
        minute: c.minute,
      });
      await page.clock.setFixedTime(pinned);

      const requestPromise = page.waitForRequest((r) => r.url().includes("getSchedule"));
      const responsePromise = page.waitForResponse((r) => r.url().includes("getSchedule"));
      await booker.gotoUserEvent(PRO_THIRTY_MIN_SLUG.user, PRO_THIRTY_MIN_SLUG.event, {
        month: monthParam(viewerDate),
        date: civilDateToIso(viewerDate),
      });
      await booker.expectLoaded();

      const request = await requestPromise;
      const response = await responsePromise;
      const responseText = await response.text();
      const rendered = await booker.readSlots();

      const browser = await page.evaluate(() => ({
        isoNow: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      }));
      const nodeNowIso = new Date().toISOString();

      const rules = await readEventTypeBookingRules(
        PRO_THIRTY_MIN_SLUG.user,
        PRO_THIRTY_MIN_SLUG.event,
      );
      const windows = availabilityWindowsFromOrganiser(organiser);
      const expectedNodeClock = expectedSlotEntriesForViewerDay({
        organiserTimeZone: organiser.timeZone,
        viewerTimeZone: AUCKLAND_TZ,
        viewerDate,
        windows,
        stepMinutes: SLOT_STEP_MINUTES,
        notBefore: earliestBookableInstant(rules.minimumBookingNoticeMinutes),
      });
      const expectedNoNotice = expectedSlotEntriesForViewerDay({
        organiserTimeZone: organiser.timeZone,
        viewerTimeZone: AUCKLAND_TZ,
        viewerDate,
        windows,
        stepMinutes: SLOT_STEP_MINUTES,
        notBefore: new Date(0),
      });

      const isoTimes = [
        ...new Set(responseText.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) ?? []),
      ].sort();
      const dayStartUtc = fromZonedCivil(AUCKLAND_TZ, {
        ...viewerDate,
        hour: 0,
        minute: 0,
      }).toISOString();
      const inViewerDayInResponse = isoTimes.filter(
        (iso) =>
          iso >= dayStartUtc && iso < new Date(Date.parse(dayStartUtc) + 24 * 3600e3).toISOString(),
      );

      const report = {
        case: c.label,
        viewerDate: civilDateToIso(viewerDate),
        pinnedBrowserClockIso: pinned.toISOString(),
        browser,
        nodeClockIso: nodeNowIso,
        requestUrlInput: decodeRequestInput(request.url()),
        responseBytes: responseText.length,
        responseSlotIsosOnViewerDay: inViewerDayInResponse.map((iso) => ({
          iso,
          aucklandLabel: toZonedLabel(new Date(iso), AUCKLAND_TZ),
        })),
        renderedLabels: actualSlotLabels(rendered),
        renderedFirstIso: rendered[0]?.iso ?? null,
        expectedWithNodeNotice: expectedNodeClock.map((e) => e.label),
        expectedWithoutNotice: expectedNoNotice.map((e) => e.label),
        missingFromRenderedVsNodeNotice: expectedNodeClock
          .map((e) => e.label)
          .filter((l) => !actualSlotLabels(rendered).includes(l)),
        extraRenderedVsNodeNotice: actualSlotLabels(rendered).filter(
          (l) => !expectedNodeClock.map((e) => e.label).includes(l),
        ),
      };

      await testInfo.attach(`tz-midnight-${c.label.replace(/[^a-z0-9]+/gi, "-")}.json`, {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
      await testInfo.attach(`tz-midnight-${c.label.replace(/[^a-z0-9]+/gi, "-")}-response.txt`, {
        body: responseText,
        contentType: "text/plain",
      });
    });
  }
});
