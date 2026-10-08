import {
  civilDateFromInstant,
  civilDateToIso,
  expectedSlotInstants,
  fromZonedCivil,
  monthParam,
  expectedSlotLabelsForViewerDay,
  lastWeekdayOfMonth,
  nextTransitionStrictlyAfterLeadDays,
  normalizeSlotLabel,
  nthWeekdayOfMonth,
  WEEKDAY,
} from "../../../src/core/timezone.js";
import { required } from "../../../src/core/required.js";
import { timeouts } from "../../../src/products/cal/env.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import {
  expectClickedSlotMatchesInstant,
  readBookingOracle,
} from "../../../src/products/cal/oracle.js";
import { qaAttendee } from "../../../src/products/cal/factories.js";
import {
  MIN_LEAD_DAYS,
  SUNDAY_AVAILABILITY_END_MINUTES,
  SUNDAY_AVAILABILITY_START_MINUTES,
  SLOT_STEP_MINUTES,
} from "../../../src/products/cal/schedules.js";
import { LONDON_TZ, NEW_YORK_TZ, SYDNEY_TZ } from "../../../src/products/cal/timezones.js";

const FALL_BACK_ONE_THIRTY_LABEL = "1:30am" as const;
const DST002_ISSUE =
  "P7-OBS-CAL-DST-002: both 01:30 instants listed, POST /api/book/event 409 no_available_users_found_error";

test.describe("P1-CAL-DST", () => {
  test(
    "P1-CAL-DST-001 Spring-forward day shows no phantom slot",
    {
      tag: ["@cal", "@dst"],
      annotation: [
        { type: "testId", description: "P1-CAL-DST-001" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ dstOrganiser, guestBooker, isolatedSundayEvent }) => {
      test.setTimeout(timeouts().isolatedJourney);
      const today = civilDateFromInstant(new Date(), NEW_YORK_TZ);
      const date = nextTransitionStrictlyAfterLeadDays(today, MIN_LEAD_DAYS, (year) =>
        nthWeekdayOfMonth(year, 3, WEEKDAY.sunday, 2),
      );
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: NEW_YORK_TZ,
        overnight: true,
      });
      const guest = await guestBooker(NEW_YORK_TZ);
      isolatedSundayEvent.trackGuest(guest.page);
      await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
        month: monthParam(date),
        date: civilDateToIso(date),
      });
      await guest.booker.expectLoaded();
      const slots = await guest.booker.readSlots();
      const labels = slots.map((slot) => normalizeSlotLabel(slot.label));
      expect(labels.some((label) => /^2:\d{2}am$/.test(label))).toBe(false);
      const expected = expectedSlotInstants({
        timeZone: NEW_YORK_TZ,
        date,
        startMinutes: SUNDAY_AVAILABILITY_START_MINUTES,
        endMinutes: SUNDAY_AVAILABILITY_END_MINUTES,
        stepMinutes: SLOT_STEP_MINUTES,
      });
      expect(slots).toHaveLength(expected.length);
    },
  );

  test(
    "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous",
    {
      tag: ["@cal", "@dst"],
      annotation: [
        { type: "testId", description: "P1-CAL-DST-002" },
        { type: "priority", description: "P1" },
        { type: "issue", description: DST002_ISSUE },
      ],
    },
    async ({ dstOrganiser, guestBooker, isolatedSundayEvent }, testInfo) => {
      test.fail(true, DST002_ISSUE);
      test.setTimeout(timeouts().isolatedJourney);
      const today = civilDateFromInstant(new Date(), NEW_YORK_TZ);
      const date = nextTransitionStrictlyAfterLeadDays(today, MIN_LEAD_DAYS, (year) =>
        nthWeekdayOfMonth(year, 11, WEEKDAY.sunday, 1),
      );
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: NEW_YORK_TZ,
        overnight: true,
      });
      const guest = await guestBooker(NEW_YORK_TZ);
      isolatedSundayEvent.trackGuest(guest.page);
      await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
        month: monthParam(date),
        date: civilDateToIso(date),
      });
      await guest.booker.expectLoaded();
      const slots = await guest.booker.readSlots();
      const oneThirty = slots
        .filter((slot) => normalizeSlotLabel(slot.label) === FALL_BACK_ONE_THIRTY_LABEL)
        .slice()
        .sort((left, right) => left.iso.localeCompare(right.iso));
      expect(oneThirty.length).toBeGreaterThan(0);
      const edtInstant = fromZonedCivil(NEW_YORK_TZ, { ...date, hour: 1, minute: 30 });
      const first = required(oneThirty[0], "missing first 1:30am slot");
      expectClickedSlotMatchesInstant(first.iso, edtInstant);
      await guest.booker.selectSlotByIso(first.iso);
      const uid = await guest.booker.book(qaAttendee());
      isolatedSundayEvent.trackBooking(uid);
      await readBookingOracle(guest.page, uid, NEW_YORK_TZ, edtInstant);
      testInfo.annotations.push({
        type: "issue",
        description: DST002_ISSUE,
      });
    },
  );

  test(
    "P1-CAL-DST-003 Cross-hemisphere viewer on DST day",
    {
      tag: ["@cal", "@dst"],
      annotation: [
        { type: "testId", description: "P1-CAL-DST-003" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ dstOrganiser, guestBooker, isolatedSundayEvent }) => {
      test.setTimeout(timeouts().isolatedJourney);
      const today = civilDateFromInstant(new Date(), LONDON_TZ);
      const date = nextTransitionStrictlyAfterLeadDays(today, MIN_LEAD_DAYS, (year) =>
        lastWeekdayOfMonth(year, 3, WEEKDAY.sunday),
      );
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: LONDON_TZ,
        overnight: true,
      });
      const guest = await guestBooker(SYDNEY_TZ);
      isolatedSundayEvent.trackGuest(guest.page);
      await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
        month: monthParam(date),
        date: civilDateToIso(date),
      });
      await guest.booker.expectLoaded();
      const slots = await guest.booker.readSlots();
      const actualLabels = slots.map((slot) => normalizeSlotLabel(slot.label));
      const expectedLabels = expectedSlotLabelsForViewerDay({
        organiserTimeZone: LONDON_TZ,
        viewerTimeZone: SYDNEY_TZ,
        viewerDate: date,
        windows: [
          {
            days: [WEEKDAY.sunday],
            startMinutes: SUNDAY_AVAILABILITY_START_MINUTES,
            endMinutes: SUNDAY_AVAILABILITY_END_MINUTES,
          },
        ],
        stepMinutes: SLOT_STEP_MINUTES,
        notBefore: new Date(0),
      });
      expect(actualLabels).toEqual(expectedLabels);
    },
  );
});
