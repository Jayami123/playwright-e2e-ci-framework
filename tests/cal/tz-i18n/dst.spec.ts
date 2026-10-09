import {
  civilDateFromInstant,
  civilDateToIso,
  expectedSlotInstants,
  expectedSlotLabelsForViewerDay,
  fromZonedCivil,
  lastWeekdayOfMonth,
  monthParam,
  nextTransitionStrictlyAfterLeadDays,
  normalizeSlotLabel,
  nthWeekdayOfMonth,
  WEEKDAY,
  type CivilDate,
} from "../../../src/core/timezone.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { required } from "../../../src/core/required.js";
import { timeouts } from "../../../src/products/cal/env.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import {
  BOOKING_SUCCESS_HTTP_STATUS,
  expectClickedSlotMatchesInstant,
  readBookingOracle,
} from "../../../src/products/cal/oracle.js";
import { qaAttendee } from "../../../src/products/cal/factories.js";
import {
  BOOKING_NOTICE_EPOCH,
  FALL_BACK_ONE_THIRTY_AM_LABEL,
  MIN_LEAD_DAYS,
  SUNDAY_AVAILABILITY_END_MINUTES,
  SUNDAY_AVAILABILITY_START_MINUTES,
  SLOT_STEP_MINUTES,
  US_SPRING_FORWARD_PHANTOM_HOUR_LABEL,
} from "../../../src/products/cal/schedules.js";
import {
  euSpringForwardControlSunday,
  organiserMidnightEarlySlotIsos,
} from "../../../src/products/cal/dst-dates.js";
import { LONDON_TZ, NEW_YORK_TZ, SYDNEY_TZ } from "../../../src/products/cal/timezones.js";

const DST002_ISSUE =
  "P7-OBS-CAL-DST-002: both 01:30 instants listed, POST /api/book/event 409 no_available_users_found_error";

const DST003_ISSUE =
  "P7-OBS-CAL-DST-003: on EU spring-forward Sunday Cal lists organiser slots one hour early (pre-midnight Saturday GMT); evidence data-time 2027-03-27T23:00:00.000Z, 2027-03-27T23:30:00.000Z";

function usSpringForwardSundayAfterLead(): CivilDate {
  const today = civilDateFromInstant(new Date(), NEW_YORK_TZ);
  return nextTransitionStrictlyAfterLeadDays(today, MIN_LEAD_DAYS, (year) =>
    nthWeekdayOfMonth(year, 3, WEEKDAY.sunday, 2),
  );
}

function usFallBackSundayAfterLead(): CivilDate {
  const today = civilDateFromInstant(new Date(), NEW_YORK_TZ);
  return nextTransitionStrictlyAfterLeadDays(today, MIN_LEAD_DAYS, (year) =>
    nthWeekdayOfMonth(year, 11, WEEKDAY.sunday, 1),
  );
}

function euSpringForwardSundayAfterLead(): CivilDate {
  const today = civilDateFromInstant(new Date(), LONDON_TZ);
  return nextTransitionStrictlyAfterLeadDays(today, MIN_LEAD_DAYS, (year) =>
    lastWeekdayOfMonth(year, 3, WEEKDAY.sunday),
  );
}

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
      const date = usSpringForwardSundayAfterLead();
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: NEW_YORK_TZ,
        overnight: true,
      });
      const guest = await guestBooker(NEW_YORK_TZ);
      isolatedSundayEvent.trackGuest();
      await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
        month: monthParam(date),
        date: civilDateToIso(date),
      });
      await guest.booker.expectLoaded();
      const slots = await guest.booker.readSlots();
      const labels = slots.map((slot) => normalizeSlotLabel(slot.label));
      expect(labels.some((label) => US_SPRING_FORWARD_PHANTOM_HOUR_LABEL.test(label))).toBe(false);
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
      test.setTimeout(timeouts().isolatedJourney);
      const date = usFallBackSundayAfterLead();
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: NEW_YORK_TZ,
        overnight: true,
      });
      const guest = await guestBooker(NEW_YORK_TZ);
      isolatedSundayEvent.trackGuest();
      await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
        month: monthParam(date),
        date: civilDateToIso(date),
      });
      await guest.booker.expectLoaded();
      const slots = await guest.booker.readSlots();
      const oneThirty = slots
        .filter((slot) => normalizeSlotLabel(slot.label) === FALL_BACK_ONE_THIRTY_AM_LABEL)
        .slice()
        .sort((left, right) => left.iso.localeCompare(right.iso));
      const edtInstant = fromZonedCivil(NEW_YORK_TZ, { ...date, hour: 1, minute: 30 });
      expect(oneThirty.length).toBeGreaterThan(0);
      await attachKnownBugEvidence(guest.page, testInfo, {
        issue: DST002_ISSUE,
        observed: {
          oneThirtyIsos: oneThirty.map((slot) => slot.iso),
          oneThirtyLabels: oneThirty.map((slot) => normalizeSlotLabel(slot.label)),
          slotCount: slots.length,
        },
        expected: {
          firstOneThirtyIso: edtInstant.toISOString(),
          bookingHttpStatus: BOOKING_SUCCESS_HTTP_STATUS,
        },
      });
      test.fail(true, DST002_ISSUE);
      const first = required(oneThirty[0], "missing first 1:30am slot");
      expectClickedSlotMatchesInstant(first.iso, edtInstant);
      await guest.booker.selectSlotByIso(first.iso);
      const uid = await guest.booker.book(qaAttendee());
      isolatedSundayEvent.trackBooking(uid);
      await readBookingOracle(guest.page, uid, NEW_YORK_TZ, edtInstant);
    },
  );

  test(
    "P1-CAL-DST-003 Cross-hemisphere viewer on DST day",
    {
      tag: ["@cal", "@dst"],
      annotation: [
        { type: "testId", description: "P1-CAL-DST-003" },
        { type: "priority", description: "P2" },
        { type: "issue", description: DST003_ISSUE },
      ],
    },
    async ({ dstOrganiser, guestBooker, isolatedSundayEvent }, testInfo) => {
      test.setTimeout(timeouts().isolatedJourney);
      const date = euSpringForwardSundayAfterLead();
      const expectedEarlyIsos = organiserMidnightEarlySlotIsos(date, LONDON_TZ);
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: LONDON_TZ,
        overnight: true,
      });
      const guest = await guestBooker(SYDNEY_TZ);
      isolatedSundayEvent.trackGuest();
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
        notBefore: BOOKING_NOTICE_EPOCH,
      });
      const earlyIsos = slots
        .filter((slot) => expectedEarlyIsos.includes(slot.iso))
        .map((slot) => slot.iso);
      await attachKnownBugEvidence(guest.page, testInfo, {
        issue: DST003_ISSUE,
        observed: {
          slotIsos: slots.map((slot) => slot.iso),
          slotLabels: actualLabels,
          earlyIsos,
        },
        expected: {
          slotLabels: [...expectedLabels],
          earlyIsos: [],
        },
      });
      test.fail(true, DST003_ISSUE);
      expect(actualLabels).toEqual(expectedLabels);
    },
  );

  test(
    "P1-CAL-DST-003-control Cross-hemisphere viewer on non-DST Sunday",
    {
      tag: ["@cal", "@dst"],
      annotation: [
        { type: "testId", description: "P1-CAL-DST-003-control" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ dstOrganiser, guestBooker, isolatedSundayEvent }) => {
      test.setTimeout(timeouts().isolatedJourney);
      const euSpringForwardSunday = euSpringForwardSundayAfterLead();
      const controlDate = euSpringForwardControlSunday(euSpringForwardSunday);
      const expectedEarlyIsos = organiserMidnightEarlySlotIsos(euSpringForwardSunday, LONDON_TZ);
      const provisioned = await isolatedSundayEvent.provision({
        scheduleTimeZone: LONDON_TZ,
        overnight: true,
      });
      const guest = await guestBooker(SYDNEY_TZ);
      isolatedSundayEvent.trackGuest();
      await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
        month: monthParam(controlDate),
        date: civilDateToIso(controlDate),
      });
      await guest.booker.expectLoaded();
      const slots = await guest.booker.readSlots();
      const actualLabels = slots.map((slot) => normalizeSlotLabel(slot.label));
      const expectedLabels = expectedSlotLabelsForViewerDay({
        organiserTimeZone: LONDON_TZ,
        viewerTimeZone: SYDNEY_TZ,
        viewerDate: controlDate,
        windows: [
          {
            days: [WEEKDAY.sunday],
            startMinutes: SUNDAY_AVAILABILITY_START_MINUTES,
            endMinutes: SUNDAY_AVAILABILITY_END_MINUTES,
          },
        ],
        stepMinutes: SLOT_STEP_MINUTES,
        notBefore: BOOKING_NOTICE_EPOCH,
      });
      const earlyIsos = slots
        .filter((slot) => expectedEarlyIsos.includes(slot.iso))
        .map((slot) => slot.iso);
      expect(earlyIsos).toEqual([]);
      expect(actualLabels).toEqual(expectedLabels);
    },
  );
});
