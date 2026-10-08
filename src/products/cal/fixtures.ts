import { test as base } from "@playwright/test";
import { setFactorySeed } from "qa-portfolio-harness";
import { attachConsoleGuard, type ConsoleGuard } from "../../core/fixtures.js";
import { parsePositiveInt } from "../../core/config.js";
import { installTimezoneHandler } from "./app-shell.js";
import { loginCalWithCredentials } from "./auth.js";
import { EventTypesPage } from "./pages/event-types.page.js";
import { BookingsPage } from "./pages/bookings.page.js";
import { BookerPage } from "./pages/booker.page.js";
import { AvailabilityPage } from "./pages/availability.page.js";
import { BookingSuccessPage } from "./pages/booking-success.page.js";
import { cancelBookingByUid } from "./oracle.js";
import { DST_ORGANISER } from "./routes.js";

const DOCUMENTED_CAL_CONSOLE = ["Accessing element.ref was removed in React 19"] as const;

export interface EventTypeCleanup {
  register(title: string): void;
}

export interface ScheduleCleanup {
  register(name: string): void;
}

export interface BookingCleanup {
  register(uid: string): void;
}

export interface DstOrganiser {
  readonly eventTypes: EventTypesPage;
  readonly availability: AvailabilityPage;
  readonly username: string;
}

interface CalFixtures {
  timezoneHandler: undefined;
  consoleGuard: ConsoleGuard;
  eventTypes: EventTypesPage;
  bookings: BookingsPage;
  booker: BookerPage;
  availability: AvailabilityPage;
  bookingSuccess: BookingSuccessPage;
  eventTypeCleanup: EventTypeCleanup;
  scheduleCleanup: ScheduleCleanup;
  bookingCleanup: BookingCleanup;
  dstOrganiser: DstOrganiser;
}

interface CalWorkerFixtures {
  factorySeed: number;
}

export const test = base.extend<CalFixtures, CalWorkerFixtures>({
  factorySeed: [
    async ({}, use, workerInfo) => {
      const baseSeed = parsePositiveInt(process.env.P1_SEED, Date.now());
      const seed = baseSeed + workerInfo.parallelIndex;
      setFactorySeed(seed);
      console.log(
        `P1_SEED=${String(baseSeed)} worker=${String(workerInfo.parallelIndex)} seed=${String(seed)}`,
      );
      await use(seed);
    },
    { scope: "worker", auto: true },
  ],

  timezoneHandler: [
    async ({ page }, use) => {
      await installTimezoneHandler(page);
      await use(undefined);
    },
    { auto: true },
  ],

  consoleGuard: async ({ page }, use) => {
    await attachConsoleGuard(page, DOCUMENTED_CAL_CONSOLE, use);
  },

  eventTypes: async ({ page }, use) => {
    await use(new EventTypesPage(page));
  },

  bookings: async ({ page }, use) => {
    await use(new BookingsPage(page));
  },

  booker: async ({ page }, use) => {
    await use(new BookerPage(page));
  },

  availability: async ({ page }, use) => {
    await use(new AvailabilityPage(page));
  },

  bookingSuccess: async ({ page }, use) => {
    await use(new BookingSuccessPage(page));
  },

  eventTypeCleanup: async ({ eventTypes }, use, testInfo) => {
    const titles: string[] = [];
    await use({
      register(title: string): void {
        titles.push(title);
      },
    });
    const failures: unknown[] = [];
    for (const title of titles) {
      try {
        await eventTypes.deleteByTitle(title, { tolerateMissing: true });
      } catch (error) {
        testInfo.annotations.push({ type: "cleanup-failed", description: title });
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Event type cleanup failed");
    }
  },

  scheduleCleanup: async ({ availability }, use, testInfo) => {
    const names: string[] = [];
    await use({
      register(name: string): void {
        names.push(name);
      },
    });
    const failures: unknown[] = [];
    for (const name of names) {
      try {
        await availability.deleteByName(name, { tolerateMissing: true });
      } catch (error) {
        testInfo.annotations.push({ type: "cleanup-failed", description: name });
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Schedule cleanup failed");
    }
  },

  bookingCleanup: async ({ page }, use, testInfo) => {
    const uids: string[] = [];
    await use({
      register(uid: string): void {
        uids.push(uid);
      },
    });
    const failures: unknown[] = [];
    for (const uid of uids) {
      try {
        await cancelBookingByUid(page, uid);
      } catch (error) {
        testInfo.annotations.push({ type: "cleanup-failed", description: uid });
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Booking cleanup failed");
    }
  },

  dstOrganiser: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      await installTimezoneHandler(page);
      await loginCalWithCredentials(page, DST_ORGANISER.email, DST_ORGANISER.password);
      await use({
        eventTypes: new EventTypesPage(page),
        availability: new AvailabilityPage(page),
        username: DST_ORGANISER.username,
      });
    } finally {
      await context.close();
    }
  },
});

export { expect } from "@playwright/test";
