import { fromZonedCivil, normalizeSlotLabel, toZonedLabel } from "../../../src/core/timezone.js";
import { required } from "../../../src/core/required.js";
import {
  availabilityStartCivil,
  expectUniformSpacing,
  openBookingAvailabilitySlot,
  openFirstAvailabilitySlot,
  openWeekdaySlots,
} from "../../../src/products/cal/booker-tz.js";
import { loadConfig, timeouts } from "../../../src/products/cal/env.js";
import { readOrganiserAvailability } from "../../../src/products/cal/db.js";
import {
  qaAttendee,
  qaEventTitle,
  THIRTY_MINUTE_DURATION,
} from "../../../src/products/cal/factories.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import {
  expectClickedSlotMatchesInstant,
  readBookingOracle,
} from "../../../src/products/cal/oracle.js";
import { PRO_THIRTY_MIN_SLUG } from "../../../src/products/cal/routes.js";
import { THIRTY_MINUTES_MS } from "../../../src/products/cal/schedules.js";
import {
  ADELAIDE_TZ,
  AUCKLAND_TZ,
  COLOMBO_TZ,
  KATHMANDU_TZ,
  LOS_ANGELES_TZ,
  NEW_YORK_TZ,
} from "../../../src/products/cal/timezones.js";

const VIEWER_TIMEZONES = [AUCKLAND_TZ, COLOMBO_TZ, LOS_ANGELES_TZ] as const;
const HALF_HOUR_VIEWERS = [KATHMANDU_TZ, ADELAIDE_TZ] as const;

const TZ003_KATHMANDU_ISSUE = "P7-OBS-CAL-TZ-003: first slot 15 min off organiser grid (+05:45)";

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
            const opened = await openFirstAvailabilitySlot({
              booker,
              organiser,
              viewerTimeZone: timezoneId,
              user: PRO_THIRTY_MIN_SLUG.user,
              event: PRO_THIRTY_MIN_SLUG.event,
            });
            expect(opened.slots.length).toBeGreaterThan(0);
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
            ...(timezoneId === KATHMANDU_TZ
              ? [{ type: "issue" as const, description: TZ003_KATHMANDU_ISSUE }]
              : []),
          ],
        },
        async ({ booker }) => {
          test.fail(timezoneId === KATHMANDU_TZ, TZ003_KATHMANDU_ISSUE);
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
          expectUniformSpacing(result.slots, THIRTY_MINUTES_MS);
          const start = availabilityStartCivil(organiser);
          const expectedFirstInstant = fromZonedCivil(organiser.timeZone, {
            ...result.date,
            ...start,
          });
          expect(normalizeSlotLabel(result.first.label)).toBe(
            toZonedLabel(expectedFirstInstant, timezoneId),
          );
          const deltaMs = Date.parse(result.first.iso) - expectedFirstInstant.getTime();
          const gridRemainder =
            ((deltaMs % THIRTY_MINUTES_MS) + THIRTY_MINUTES_MS) % THIRTY_MINUTES_MS;
          expect(gridRemainder).toBe(0);
        },
      );
    });
  }

  test.describe("timezone switcher", () => {
    test.use({ timezoneId: COLOMBO_TZ });

    test(
      "P1-CAL-TZ-004 Booker timezone switcher overrides the browser TZ",
      {
        tag: ["@cal", "@tz"],
        annotation: [
          { type: "testId", description: "P1-CAL-TZ-004" },
          { type: "priority", description: "P2" },
        ],
      },
      async ({ booker }) => {
        test.setTimeout(timeouts().journey);
        const organiser = await readOrganiserAvailability(loadConfig().email);
        const opened = await openFirstAvailabilitySlot({
          booker,
          organiser,
          viewerTimeZone: COLOMBO_TZ,
          user: PRO_THIRTY_MIN_SLUG.user,
          event: PRO_THIRTY_MIN_SLUG.event,
        });

        await test.step("switch booker TZ to America/New_York", async () => {
          await booker.selectTimezone(NEW_YORK_TZ);
          const afterSwitch = await booker.readSlots();
          const start = availabilityStartCivil(organiser);
          const expectedNy = toZonedLabel(
            fromZonedCivil(organiser.timeZone, { ...opened.date, ...start }),
            NEW_YORK_TZ,
          );
          expect(
            normalizeSlotLabel(required(afterSwitch[0], "no slots after TZ switch").label),
          ).toBe(expectedNy);
        });

        await test.step("reload keeps America/New_York selected and first label", async () => {
          await booker.reload();
          await expect(booker.timezoneSelect).toContainText(/America\/New_York|New York/i);
          const afterReload = await booker.readSlots();
          const start = availabilityStartCivil(organiser);
          const expectedNy = toZonedLabel(
            fromZonedCivil(organiser.timeZone, { ...opened.date, ...start }),
            NEW_YORK_TZ,
          );
          expect(normalizeSlotLabel(required(afterReload[0], "no slots after reload").label)).toBe(
            expectedNy,
          );
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
    async ({ guestBooker, eventTypes, eventTypeCleanup, bookingCleanup }, testInfo) => {
      test.setTimeout(timeouts().isolatedJourney);
      const title = qaEventTitle();
      eventTypeCleanup.register(title);

      let slug = "";

      await test.step("create an isolated 30-minute event type", async () => {
        await eventTypes.goto();
        await eventTypes.create(title, THIRTY_MINUTE_DURATION);
        slug = await eventTypes.createdSlug();
      });

      expect(slug.length).toBeGreaterThan(0);

      await test.step("book the first slot and verify the oracle", async () => {
        const guest = await guestBooker(COLOMBO_TZ);
        const organiser = await readOrganiserAvailability(loadConfig().email);
        const opened = await openBookingAvailabilitySlot({
          booker: guest.booker,
          organiser,
          viewerTimeZone: COLOMBO_TZ,
          user: PRO_THIRTY_MIN_SLUG.user,
          event: slug,
          testInfo,
        });
        const first = opened.first;
        const expectedInstant = new Date(first.iso);

        await guest.booker.selectSlotByIso(first.iso);
        const uid = await guest.booker.book(qaAttendee());
        bookingCleanup.register(uid);
        expectClickedSlotMatchesInstant(first.iso, expectedInstant);
        await readBookingOracle(guest.page, uid, COLOMBO_TZ, expectedInstant);
      });
    },
  );
});
