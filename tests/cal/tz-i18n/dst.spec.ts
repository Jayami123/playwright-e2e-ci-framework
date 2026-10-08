import type { Browser, Page, TestInfo } from "@playwright/test";
import {
  civilDateFromInstant,
  civilDateToIso,
  expectedSlotInstants,
  fromZonedCivil,
  monthParam,
  nextEuSpringForward,
  nextUsFallBack,
  nextUsSpringForward,
  normalizeSlotLabel,
  toZonedLabel,
} from "../../../src/core/timezone.js";
import { installTimezoneHandler } from "../../../src/products/cal/app-shell.js";
import { timeouts } from "../../../src/products/cal/env.js";
import {
  qaAttendee,
  qaEventTitle,
  qaScheduleName,
  THIRTY_MINUTE_DURATION,
} from "../../../src/products/cal/factories.js";
import { required } from "../../../src/core/required.js";
import { expect, test, type DstOrganiser } from "../../../src/products/cal/fixtures.js";
import { cancelBookingByUid, readBookingOracle } from "../../../src/products/cal/oracle.js";
import {
  BookerPage,
  BookingRejectedError,
  type SlotView,
} from "../../../src/products/cal/pages/booker.page.js";

const NY = "America/New_York";
const LONDON = "Europe/London";
const SYDNEY = "Australia/Sydney";
const SUNDAY_START_MINUTES = 0;
const SUNDAY_END_MINUTES = 17 * 60;
const CLOCK_MIDNIGHT = "12:00am";
const CLOCK_NINE_AM = "9:00am";
const CLOCK_FIVE_PM = "5:00pm";
const HTTP_CONFLICT = 409;
const NO_AVAILABLE_USERS = "no_available_users_found_error";

function isOverlapReject(error: unknown): error is BookingRejectedError {
  return (
    error instanceof BookingRejectedError &&
    error.status === HTTP_CONFLICT &&
    error.body.includes(NO_AVAILABLE_USERS)
  );
}

function slotsWithLabel(slots: readonly SlotView[], label: string): readonly SlotView[] {
  return slots
    .filter((slot) => normalizeSlotLabel(slot.label) === label)
    .slice()
    .sort((left, right) => left.iso.localeCompare(right.iso));
}

function nextUntriedSlot(
  slots: readonly SlotView[],
  attempted: ReadonlySet<string>,
): SlotView | undefined {
  const preferred = [
    ...slotsWithLabel(slots, "1:30am"),
    ...slotsWithLabel(slots, "3:30am"),
    ...slotsWithLabel(slots, "9:00am"),
  ];
  return preferred.find((slot) => !attempted.has(slot.iso));
}

async function bookFallBackOccurrence(options: {
  readonly booker: BookerPage;
  readonly slots: readonly SlotView[];
  readonly testInfo: TestInfo;
}): Promise<{ readonly uid: string; readonly iso: string }> {
  const attempted = new Set<string>();
  let currentSlots = options.slots;
  let lastReject: BookingRejectedError | undefined;

  while (attempted.size < 6) {
    const slot = nextUntriedSlot(currentSlots, attempted);
    if (slot === undefined) {
      break;
    }
    attempted.add(slot.iso);
    await options.booker.selectSlotByIso(slot.iso);
    try {
      const uid = await options.booker.book(qaAttendee());
      return { uid, iso: slot.iso };
    } catch (error) {
      if (!isOverlapReject(error)) {
        throw error;
      }
      lastReject = error;
      options.testInfo.annotations.push({
        type: "observation",
        description: `DST-002 slot ${slot.iso} label=${normalizeSlotLabel(slot.label)} rejected HTTP 409 ${NO_AVAILABLE_USERS}`,
      });
      await options.booker.backToSlots();
      currentSlots = await options.booker.readSlots();
    }
  }
  throw (
    lastReject ??
    new Error(
      `DST-002 booked none of the fall-back candidates. labels=${currentSlots.map((slot) => `${normalizeSlotLabel(slot.label)}=${slot.iso}`).join(",")}`,
    )
  );
}

async function provisionSundayEvent(
  organiser: DstOrganiser,
  options: {
    readonly scheduleTimeZone: string;
    readonly overnight: boolean;
  },
): Promise<{ readonly title: string; readonly slug: string; readonly scheduleName: string }> {
  const title = qaEventTitle();
  const scheduleName = qaScheduleName();
  await organiser.availability.createNamedSchedule(scheduleName);
  await organiser.availability.setTimezone(options.scheduleTimeZone);
  await organiser.availability.enableDay("Sunday");
  await organiser.availability.setDayHours(
    "Sunday",
    options.overnight ? CLOCK_MIDNIGHT : CLOCK_NINE_AM,
    CLOCK_FIVE_PM,
  );
  await organiser.availability.setAsDefault();
  await organiser.availability.save();
  await organiser.eventTypes.goto();
  await organiser.eventTypes.create(title, THIRTY_MINUTE_DURATION);
  const slug = await organiser.eventTypes.createdSlug(title);
  await organiser.eventTypes.expectAvailabilitySchedule(scheduleName);
  return { title, slug, scheduleName };
}

async function guestBooker(
  browser: Browser,
  timezoneId: string,
): Promise<{
  readonly booker: BookerPage;
  readonly page: Page;
  readonly close: () => Promise<void>;
}> {
  const context = await browser.newContext({
    timezoneId,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await installTimezoneHandler(page);
  return {
    booker: new BookerPage(page),
    page,
    close: async () => {
      await context.close();
    },
  };
}

async function teardownIsolated(
  organiser: DstOrganiser,
  provisioned: { readonly title: string; readonly scheduleName: string },
  guest: { readonly page: Page; readonly close: () => Promise<void> },
  uid?: string,
): Promise<void> {
  const failures: unknown[] = [];
  if (uid !== undefined) {
    try {
      await cancelBookingByUid(guest.page, uid);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await guest.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    await organiser.eventTypes.deleteByTitle(provisioned.title, { tolerateMissing: true });
  } catch (error) {
    failures.push(error);
  }
  try {
    await organiser.availability.deleteByName(provisioned.scheduleName, {
      tolerateMissing: true,
      tolerateDefault: true,
    });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "DST teardown failed");
  }
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
    async ({ dstOrganiser, browser }) => {
      test.setTimeout(timeouts().isolatedJourney);
      const date = nextUsSpringForward(civilDateFromInstant(new Date(), NY));
      const provisioned = await provisionSundayEvent(dstOrganiser, {
        scheduleTimeZone: NY,
        overnight: true,
      });
      const guest = await guestBooker(browser, NY);
      try {
        await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
          month: monthParam(date),
          date: civilDateToIso(date),
        });
        await guest.booker.expectLoaded();
        const slots = await guest.booker.readSlots();
        const labels = slots.map((slot) => normalizeSlotLabel(slot.label));
        expect(labels.some((label) => /^2:\d{2}am$/.test(label))).toBe(false);
        const expected = expectedSlotInstants({
          timeZone: NY,
          date,
          startMinutes: SUNDAY_START_MINUTES,
          endMinutes: SUNDAY_END_MINUTES,
          stepMinutes: THIRTY_MINUTE_DURATION,
        });
        expect(slots).toHaveLength(expected.length);
      } finally {
        await teardownIsolated(dstOrganiser, provisioned, guest);
      }
    },
  );

  test(
    "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous",
    {
      tag: ["@cal", "@dst"],
      annotation: [
        { type: "testId", description: "P1-CAL-DST-002" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ dstOrganiser, browser }, testInfo) => {
      test.setTimeout(timeouts().isolatedJourney);
      const date = nextUsFallBack(civilDateFromInstant(new Date(), NY));
      const provisioned = await provisionSundayEvent(dstOrganiser, {
        scheduleTimeZone: NY,
        overnight: true,
      });
      const guest = await guestBooker(browser, NY);
      let uid: string | undefined;
      try {
        await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
          month: monthParam(date),
          date: civilDateToIso(date),
        });
        await guest.booker.expectLoaded();
        const slots = await guest.booker.readSlots();
        const oneThirty = slots.filter((slot) => normalizeSlotLabel(slot.label) === "1:30am");
        expect(
          oneThirty,
          `expected 1:30am on fall-back Sunday, labels=${slots.map((slot) => normalizeSlotLabel(slot.label)).join(",")}`,
        ).not.toHaveLength(0);
        testInfo.annotations.push({
          type: "observation",
          description: `DST-002 1:30am instants=${oneThirty.map((slot) => slot.iso).join(",")}`,
        });
        const clicked = await bookFallBackOccurrence({
          booker: guest.booker,
          slots,
          testInfo,
        });
        uid = clicked.uid;
        const oracle = await readBookingOracle(guest.page, uid);
        const clickedIso = new Date(clicked.iso).toISOString();
        const confirmationIso = oracle.confirmationStartUtc?.toISOString();
        expect(oracle.dbStartUtc.toISOString()).toBe(clickedIso);
        expect([clickedIso, undefined]).toContain(confirmationIso);
        testInfo.annotations.push({
          type: "observation",
          description: `DST-002 booked=${clickedIso} confirmationStartUtc=${confirmationIso ?? "absent"}`,
        });
      } finally {
        await teardownIsolated(dstOrganiser, provisioned, guest, uid);
      }
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
    async ({ dstOrganiser, browser }) => {
      test.setTimeout(timeouts().isolatedJourney);
      const date = nextEuSpringForward(civilDateFromInstant(new Date(), LONDON));
      const provisioned = await provisionSundayEvent(dstOrganiser, {
        scheduleTimeZone: LONDON,
        overnight: false,
      });
      const guest = await guestBooker(browser, SYDNEY);
      try {
        await guest.booker.gotoUserEvent(dstOrganiser.username, provisioned.slug, {
          month: monthParam(date),
          date: civilDateToIso(date),
        });
        await guest.booker.expectLoaded();
        const slots = await guest.booker.readSlots();
        const first = required(slots[0], "No slots on EU spring-forward Sunday");
        const expected = toZonedLabel(new Date(first.iso), SYDNEY);
        expect(normalizeSlotLabel(first.label)).toBe(expected);
        const nineLondon = fromZonedCivil(LONDON, { ...date, hour: 9, minute: 0 });
        const nineLabel = toZonedLabel(nineLondon, SYDNEY);
        expect(slots.some((slot) => normalizeSlotLabel(slot.label) === nineLabel)).toBe(true);
      } finally {
        await teardownIsolated(dstOrganiser, provisioned, guest);
      }
    },
  );
});
