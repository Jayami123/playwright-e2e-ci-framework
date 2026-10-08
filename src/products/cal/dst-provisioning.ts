import type { Page } from "@playwright/test";
import { THIRTY_MINUTE_DURATION, qaEventTitle, qaScheduleName } from "./factories.js";
import type { AvailabilityPage } from "./pages/availability.page.js";
import type { EventTypesPage } from "./pages/event-types.page.js";
import {
  CLOCK_FIVE_PM_LABEL,
  CLOCK_MIDNIGHT_LABEL,
  CLOCK_NINE_AM_LABEL,
  SUNDAY_DAY_NAME,
} from "./schedules.js";

export interface IsolatedSundayEvent {
  readonly title: string;
  readonly slug: string;
  readonly scheduleName: string;
}

export interface SundayProvisionOptions {
  readonly scheduleTimeZone: string;
  readonly overnight: boolean;
}

export interface SundayOrganiser {
  readonly eventTypes: EventTypesPage;
  readonly availability: AvailabilityPage;
}

export async function provisionIsolatedSundayEvent(
  organiser: SundayOrganiser,
  options: SundayProvisionOptions,
): Promise<IsolatedSundayEvent> {
  const title = qaEventTitle();
  const scheduleName = qaScheduleName();
  await organiser.availability.createNamedSchedule(scheduleName);
  await organiser.availability.setTimezone(options.scheduleTimeZone);
  await organiser.availability.enableDay(SUNDAY_DAY_NAME);
  await organiser.availability.setDayHours(
    SUNDAY_DAY_NAME,
    options.overnight ? CLOCK_MIDNIGHT_LABEL : CLOCK_NINE_AM_LABEL,
    CLOCK_FIVE_PM_LABEL,
  );
  await organiser.availability.save();
  await organiser.eventTypes.goto();
  await organiser.eventTypes.create(title, THIRTY_MINUTE_DURATION);
  const slug = await organiser.eventTypes.createdSlug();
  await organiser.eventTypes.assignAvailabilitySchedule(scheduleName);
  await organiser.eventTypes.expectSundayAvailabilityRow();
  return { title, slug, scheduleName };
}

export async function teardownIsolatedSundayEvent(options: {
  readonly organiser: SundayOrganiser;
  readonly provisioned: IsolatedSundayEvent;
  readonly guestPage?: Page;
  readonly bookingUid?: string;
  readonly cancelBooking: (page: Page, uid: string) => Promise<void>;
}): Promise<void> {
  const failures: unknown[] = [];
  if (options.bookingUid !== undefined && options.guestPage !== undefined) {
    try {
      await options.cancelBooking(options.guestPage, options.bookingUid);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await options.organiser.eventTypes.deleteByTitle(options.provisioned.title, {
      tolerateMissing: true,
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    await options.organiser.availability.deleteByName(options.provisioned.scheduleName, {
      tolerateMissing: true,
    });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Isolated Sunday event teardown failed");
  }
}
