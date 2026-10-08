import { normalizeSlotLabel, toZonedLabel } from "../../../src/core/timezone.js";
import { required } from "../../../src/core/required.js";
import {
  actualSlotLabels,
  expectSlotLabelsMatch,
  expectUniformSpacingWithinOrganiserDays,
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
          const opened = await openFirstAvailabilitySlot({
            booker,
            organiser,
            viewerTimeZone: timezoneId,
            user: PRO_THIRTY_MIN_SLUG.user,
            event: PRO_THIRTY_MIN_SLUG.event,
          });
          expectSlotLabelsMatch(actualSlotLabels(opened.slots), opened.expectedLabels);
          expect(opened.slots.length).toBeGreaterThan(0);
        },
      );
    });
  }

  function expectHalfHourOffsetGrid(
    result: Awaited<ReturnType<typeof openWeekdaySlots>>,
    organiserTimeZone: string,
  ): void {
    const normalized = actualSlotLabels(result.slots);
    expectSlotLabelsMatch(normalized, result.expectedLabels);
    expect(new Set(normalized).size, "duplicate slot labels").toBe(normalized.length);
    expectUniformSpacingWithinOrganiserDays({
      slots: result.slots,
      expectedEntries: result.expectedEntries,
      organiserTimeZone,
      stepMs: THIRTY_MINUTES_MS,
    });
    for (let index = 0; index < result.expectedEntries.length; index += 1) {
      const slot = required(result.slots[index], `missing slot at index ${String(index)}`);
      const entry = required(
        result.expectedEntries[index],
        `missing expected entry at index ${String(index)}`,
      );
      expectClickedSlotMatchesInstant(slot.iso, entry.instant);
      const deltaMs = Date.parse(slot.iso) - entry.instant.getTime();
      const gridRemainder = ((deltaMs % THIRTY_MINUTES_MS) + THIRTY_MINUTES_MS) % THIRTY_MINUTES_MS;
      expect(gridRemainder).toBe(0);
    }
  }

  test.describe(`offset ${KATHMANDU_TZ}`, () => {
    test.use({ timezoneId: KATHMANDU_TZ });

    test(
      `P1-CAL-TZ-003 Half-hour and 45-minute offsets (${KATHMANDU_TZ})`,
      {
        tag: ["@cal", "@tz"],
        annotation: [
          { type: "testId", description: "P1-CAL-TZ-003" },
          { type: "priority", description: "P1" },
          { type: "issue", description: TZ003_KATHMANDU_ISSUE },
        ],
      },

      async ({ booker }) => {
        test.setTimeout(timeouts().journey);
        const organiser = await readOrganiserAvailability(loadConfig().email);
        const result = await openWeekdaySlots({
          booker,
          organiser,
          viewerTimeZone: KATHMANDU_TZ,
          user: PRO_THIRTY_MIN_SLUG.user,
          event: PRO_THIRTY_MIN_SLUG.event,
        });
        expect(result.slots.length).toBeGreaterThan(0);
        test.fail(true, TZ003_KATHMANDU_ISSUE);
        expectHalfHourOffsetGrid(result, organiser.timeZone);
      },
    );
  });

  test.describe(`offset ${ADELAIDE_TZ}`, () => {
    test.use({ timezoneId: ADELAIDE_TZ });

    test(
      `P1-CAL-TZ-003 Half-hour and 45-minute offsets (${ADELAIDE_TZ})`,
      {
        tag: ["@cal", "@tz"],
        annotation: [
          { type: "testId", description: "P1-CAL-TZ-003" },
          { type: "priority", description: "P1" },
        ],
      },

      async ({ booker }) => {
        test.setTimeout(timeouts().journey);
        const organiser = await readOrganiserAvailability(loadConfig().email);
        const result = await openWeekdaySlots({
          booker,
          organiser,
          viewerTimeZone: ADELAIDE_TZ,
          user: PRO_THIRTY_MIN_SLUG.user,
          event: PRO_THIRTY_MIN_SLUG.event,
        });
        expect(result.slots.length).toBeGreaterThan(0);
        expectHalfHourOffsetGrid(result, organiser.timeZone);
      },
    );
  });

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
        expectSlotLabelsMatch(actualSlotLabels(opened.slots), opened.expectedLabels);

        await test.step("switch booker TZ to America/New_York", async () => {
          await booker.selectTimezone(NEW_YORK_TZ);
          const afterSwitch = await booker.readSlots();
          const expectedNy = toZonedLabel(opened.expectedFirstInstant, NEW_YORK_TZ);
          expect(
            normalizeSlotLabel(required(afterSwitch[0], "no slots after TZ switch").label),
          ).toBe(expectedNy);
        });

        await test.step("reload keeps America/New_York selected and first label", async () => {
          await booker.reload();
          await expect(booker.timezoneSelectRoot).toContainText(/America\/New_York|New York/i);
          const afterReload = await booker.readSlots();
          const expectedNy = toZonedLabel(opened.expectedFirstInstant, NEW_YORK_TZ);
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

      const slug = await test.step("create an isolated 30-minute event type", async () => {
        await eventTypes.goto();
        await eventTypes.create(title, THIRTY_MINUTE_DURATION);
        return eventTypes.createdSlug();
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
        const expectedInstant = opened.expectedFirstInstant;

        await guest.booker.selectSlotByIso(first.iso);
        const uid = await guest.booker.book(qaAttendee());
        bookingCleanup.register(uid);
        expectClickedSlotMatchesInstant(first.iso, expectedInstant);
        await readBookingOracle(guest.page, uid, COLOMBO_TZ, expectedInstant);
      });
    },
  );
});
