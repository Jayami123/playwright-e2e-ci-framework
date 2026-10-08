import { fromZonedCivil, normalizeSlotLabel, toZonedLabel } from "../../../src/core/timezone.js";
import { required } from "../../../src/core/required.js";
import {
  assertThirtyMinuteSpacing,
  availabilityStartCivil,
  openFirstAvailabilitySlot,
  openWeekdaySlots,
} from "../../../src/products/cal/booker-tz.js";
import { installTimezoneHandler } from "../../../src/products/cal/app-shell.js";
import { readOrganiserAvailability } from "../../../src/products/cal/db.js";
import { loadConfig, timeouts } from "../../../src/products/cal/env.js";
import {
  qaAttendee,
  qaEventTitle,
  THIRTY_MINUTE_DURATION,
} from "../../../src/products/cal/factories.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { readBookingOracle } from "../../../src/products/cal/oracle.js";
import { BookerPage } from "../../../src/products/cal/pages/booker.page.js";
import { PRO_THIRTY_MIN_SLUG } from "../../../src/products/cal/routes.js";

const VIEWER_TIMEZONES = ["Pacific/Auckland", "Asia/Colombo", "America/Los_Angeles"] as const;
const HALF_HOUR_VIEWERS = ["Asia/Kathmandu", "Australia/Adelaide"] as const;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

test.describe("P1-CAL-TZ booker timezone", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const timezoneId of VIEWER_TIMEZONES) {
    test.describe(`viewer ${timezoneId}`, () => {
      test.use({ timezoneId });

      test(
        `P1-CAL-TZ-001 Slot labels follow the browser timezone (${timezoneId})`,
        {
          tag: ["@cal", "@tz"],
          annotation: [
            { type: "testId", description: "P1-CAL-TZ-001" },
            { type: "priority", description: "P0" },
          ],
        },
        async ({ booker }) => {
          test.setTimeout(timeouts().journey);
          const organiser = await readOrganiserAvailability(loadConfig().email);

          await test.step("open pro/30min on the next weekday", async () => {
            const result = await openFirstAvailabilitySlot({
              booker,
              organiser,
              viewerTimeZone: timezoneId,
              user: PRO_THIRTY_MIN_SLUG.user,
              event: PRO_THIRTY_MIN_SLUG.event,
            });
            expect(normalizeSlotLabel(result.first.label)).toBe(result.expectedLabel);
          });
        },
      );
    });
  }

  for (const timezoneId of HALF_HOUR_VIEWERS) {
    test.describe(`offset ${timezoneId}`, () => {
      test.use({ timezoneId });

      test(
        `P1-CAL-TZ-003 Half-hour and 45-minute offsets (${timezoneId})`,
        {
          tag: ["@cal", "@tz"],
          annotation: [
            { type: "testId", description: "P1-CAL-TZ-003" },
            { type: "priority", description: "P1" },
          ],
        },
        async ({ booker }, testInfo) => {
          test.setTimeout(timeouts().journey);
          const organiser = await readOrganiserAvailability(loadConfig().email);
          const result = await openWeekdaySlots({
            booker,
            organiser,
            viewerTimeZone: timezoneId,
            user: PRO_THIRTY_MIN_SLUG.user,
            event: PRO_THIRTY_MIN_SLUG.event,
          });
          const normalized = result.slots.map((slot) => normalizeSlotLabel(slot.label));
          expect(new Set(normalized).size, "duplicate slot labels").toBe(normalized.length);
          assertThirtyMinuteSpacing(result.slots, THIRTY_MINUTES_MS);
          const actualFirst = normalizeSlotLabel(result.first.label);
          testInfo.annotations.push({
            type: "observation",
            description: `TZ-003 ${timezoneId} first=${actualFirst} expected=${result.expectedLabel} iso=${result.first.iso}`,
          });
          const startUtc = fromZonedCivil(organiser.timeZone, {
            ...result.date,
            ...availabilityStartCivil(organiser),
          }).getTime();
          const deltaMs = Date.parse(result.first.iso) - startUtc;
          const gridRemainder =
            ((deltaMs % THIRTY_MINUTES_MS) + THIRTY_MINUTES_MS) % THIRTY_MINUTES_MS;
          testInfo.annotations.push({
            type: "observation",
            description: `TZ-003 ${timezoneId} organiser-start deltaMs=${String(deltaMs)} gridRemainder=${String(gridRemainder)}`,
          });
        },
      );
    });
  }

  test.describe("timezone switcher", () => {
    test.use({ timezoneId: "Asia/Colombo" });

    test(
      "P1-CAL-TZ-004 Booker timezone switcher overrides the browser TZ",
      {
        tag: ["@cal", "@tz"],
        annotation: [
          { type: "testId", description: "P1-CAL-TZ-004" },
          { type: "priority", description: "P2" },
        ],
      },
      async ({ booker }, testInfo) => {
        test.setTimeout(timeouts().journey);
        const organiser = await readOrganiserAvailability(loadConfig().email);
        const opened = await openFirstAvailabilitySlot({
          booker,
          organiser,
          viewerTimeZone: "Asia/Colombo",
          user: PRO_THIRTY_MIN_SLUG.user,
          event: PRO_THIRTY_MIN_SLUG.event,
        });

        await test.step("switch booker TZ to America/New_York", async () => {
          await booker.selectTimezone("America/New_York");
          const afterSwitch = await booker.readSlots();
          const start = availabilityStartCivil(organiser);
          const expectedNy = toZonedLabel(
            fromZonedCivil(organiser.timeZone, { ...opened.date, ...start }),
            "America/New_York",
          );
          expect(
            normalizeSlotLabel(required(afterSwitch[0], "no slots after TZ switch").label),
          ).toBe(expectedNy);
        });

        await test.step("reload and record persistence", async () => {
          const before = (await booker.timezoneSelect.innerText()).trim();
          await booker.reload();
          const after = (await booker.timezoneSelect.innerText()).trim();
          testInfo.annotations.push({
            type: "observation",
            description: `TZ-004 reload persistence: before=${before} after=${after}`,
          });
        });
      },
    );
  });
});

test.describe("P1-CAL-TZ-002 booked instant", () => {
  test(
    "P1-CAL-TZ-002 Booked instant equals the clicked slot",
    {
      tag: ["@cal", "@tz"],
      annotation: [
        { type: "testId", description: "P1-CAL-TZ-002" },
        { type: "priority", description: "P0" },
      ],
    },
    async ({ browser, eventTypes, eventTypeCleanup, bookingCleanup }, testInfo) => {
      test.setTimeout(timeouts().isolatedJourney);
      const title = qaEventTitle();
      eventTypeCleanup.register(title);
      let slug = title;

      await test.step("create an isolated 30-minute event type", async () => {
        await eventTypes.goto();
        await eventTypes.create(title, THIRTY_MINUTE_DURATION);
        slug = await eventTypes.createdSlug(title);
      });

      const guest = await browser.newContext({
        timezoneId: "Asia/Colombo",
        storageState: { cookies: [], origins: [] },
      });
      const guestPage = await guest.newPage();
      try {
        await installTimezoneHandler(guestPage);
        const booker = new BookerPage(guestPage);
        const organiser = await readOrganiserAvailability(loadConfig().email);
        const opened = await openFirstAvailabilitySlot({
          booker,
          organiser,
          viewerTimeZone: "Asia/Colombo",
          user: PRO_THIRTY_MIN_SLUG.user,
          event: slug,
        });
        const first = opened.first;
        await booker.selectSlotByIso(first.iso);
        const attendee = qaAttendee();
        const uid = await booker.book(attendee);
        bookingCleanup.register(uid);
        const oracle = await readBookingOracle(guestPage, uid);
        const clickedIso = new Date(first.iso).toISOString();
        const confirmationIso = oracle.confirmationStartUtc?.toISOString();
        expect(oracle.dbStartUtc.toISOString()).toBe(clickedIso);
        expect([clickedIso, undefined]).toContain(confirmationIso);
        testInfo.annotations.push({
          type: "observation",
          description: `TZ-002 confirmationStartUtc=${confirmationIso ?? "absent"}`,
        });
      } finally {
        await guest.close();
      }
    },
  );
});
