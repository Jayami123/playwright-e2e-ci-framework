import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { setFactorySeed } from "qa-portfolio-harness";
import { attachConsoleGuard, type ConsoleGuard } from "../../core/fixtures.js";
import { parsePositiveInt } from "../../core/config.js";
import { installTimezoneHandler } from "./app-shell.js";
import { loadConfig } from "./env.js";
import {
  provisionIsolatedSundayEvent,
  teardownIsolatedSundayEvent,
  type IsolatedSundayEvent,
  type SundayOrganiser,
  type SundayProvisionOptions,
} from "./dst-provisioning.js";
import { qaEventTitle, qaScheduleName } from "./factories.js";
import { EventTypesPage } from "./pages/event-types.page.js";
import { BookingsPage } from "./pages/bookings.page.js";
import { BookerPage } from "./pages/booker.page.js";
import { AvailabilityPage } from "./pages/availability.page.js";
import { cancelBookingByUid } from "./oracle.js";
import { DST_ORGANISER } from "./routes.js";

const DOCUMENTED_CAL_CONSOLE = ["Accessing element.ref was removed in React 19"] as const;

export interface EventTypeCleanup {
  register(title: string): void;
}

export interface BookingCleanup {
  register(uid: string): void;
}

export interface DstOrganiser extends SundayOrganiser {
  readonly username: string;
}

export interface GuestBookerHandle {
  readonly booker: BookerPage;
  readonly page: Page;
}

export interface IsolatedSundayEventFixture {
  provision(
    options: Omit<SundayProvisionOptions, "title" | "scheduleName">,
  ): Promise<IsolatedSundayEvent>;
  trackGuest(): void;
  trackBooking(uid: string): void;
}

interface CalFixtures {
  timezoneHandler: undefined;
  consoleGuard: ConsoleGuard;
  eventTypes: EventTypesPage;
  bookings: BookingsPage;
  booker: BookerPage;
  availability: AvailabilityPage;
  eventTypeCleanup: EventTypeCleanup;
  bookingCleanup: BookingCleanup;
  dstOrganiser: DstOrganiser;
  guestBooker: (timezoneId: string) => Promise<GuestBookerHandle>;
  isolatedSundayEvent: IsolatedSundayEventFixture;
}

interface CalWorkerFixtures {
  factorySeed: number;
}

export const test = base.extend<CalFixtures, CalWorkerFixtures>({
  factorySeed: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixture declares no upstream dependencies
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
    const { trialAuthStatePath } = loadConfig();
    const context = await browser.newContext({ storageState: trialAuthStatePath });
    const page = await context.newPage();
    try {
      await installTimezoneHandler(page);
      await use({
        eventTypes: new EventTypesPage(page),
        availability: new AvailabilityPage(page),
        username: DST_ORGANISER.username,
        page,
      });
    } finally {
      await context.close();
    }
  },

  guestBooker: async ({ browser }, use) => {
    const openContexts: BrowserContext[] = [];
    await use(async (timezoneId: string): Promise<GuestBookerHandle> => {
      const context = await browser.newContext({
        timezoneId,
        storageState: { cookies: [], origins: [] },
      });
      openContexts.push(context);
      const page = await context.newPage();
      await installTimezoneHandler(page);
      return {
        booker: new BookerPage(page),
        page,
      };
    });
    const failures: unknown[] = [];
    for (const context of openContexts) {
      try {
        await context.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Guest booker context cleanup failed");
    }
  },

  isolatedSundayEvent: async ({ dstOrganiser }, use) => {
    let provisioned: IsolatedSundayEvent | undefined;
    let bookingUid: string | undefined;

    await use({
      async provision(
        options: Omit<SundayProvisionOptions, "title" | "scheduleName">,
      ): Promise<IsolatedSundayEvent> {
        const title = qaEventTitle();
        const scheduleName = qaScheduleName();
        provisioned = { title, slug: "", scheduleName };
        const created = await provisionIsolatedSundayEvent(dstOrganiser, {
          ...options,
          title,
          scheduleName,
        });
        provisioned = created;
        return created;
      },
      trackGuest(): void {
        // Guest context is not used for booking cancellation (organiser API only).
      },
      trackBooking(uid: string): void {
        bookingUid = uid;
      },
    });

    if (provisioned === undefined) {
      return;
    }
    await teardownIsolatedSundayEvent({
      organiser: dstOrganiser,
      provisioned,
      ...(bookingUid === undefined ? {} : { bookingUid }),
      cancelBooking: cancelBookingByUid,
    });
  },
});

export { expect } from "@playwright/test";
