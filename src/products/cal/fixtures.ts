import { test as base } from "@playwright/test";
import { setFactorySeed } from "qa-portfolio-harness";
import { attachConsoleGuard, type ConsoleGuard } from "../../core/fixtures.js";
import { parsePositiveInt } from "../../core/config.js";
import { installTimezoneHandler } from "./app-shell.js";
import { EventTypesPage } from "./pages/event-types.page.js";
import { BookingsPage } from "./pages/bookings.page.js";
import { BookerPage } from "./pages/booker.page.js";

const DOCUMENTED_CAL_CONSOLE = ["Accessing element.ref was removed in React 19"] as const;

export interface EventTypeCleanup {
  register(title: string): void;
}

interface CalFixtures {
  timezoneHandler: undefined;
  consoleGuard: ConsoleGuard;
  eventTypes: EventTypesPage;
  bookings: BookingsPage;
  booker: BookerPage;
  eventTypeCleanup: EventTypeCleanup;
}

interface CalWorkerFixtures {
  factorySeed: number;
}

export const test = base.extend<CalFixtures, CalWorkerFixtures>({
  factorySeed: [
    // eslint-disable-next-line no-empty-pattern -- worker fixture has no test-scoped dependencies
    async ({}, use) => {
      const seed = parsePositiveInt(process.env.P1_SEED, Date.now());
      setFactorySeed(seed);
      console.log(`P1_SEED=${String(seed)}`);
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

  eventTypeCleanup: async ({ eventTypes }, use) => {
    const titles: string[] = [];
    await use({
      register(title: string): void {
        titles.push(title);
      },
    });
    for (const title of titles) {
      await eventTypes.deleteByTitle(title, { tolerateMissing: true });
    }
  },
});

export { expect } from "@playwright/test";
