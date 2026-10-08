import {
  civilDateFromInstant,
  civilDateToIso,
  fromZonedCivil,
  monthParam,
  nextWeekdayAfter,
  normalizeSlotLabel,
  parseClockToMinutes,
  toZonedLabel,
  type CivilDate,
} from "../../core/timezone.js";
import { required } from "../../core/required.js";
import type { OrganiserAvailability } from "./db.js";
import type { BookerPage, SlotView } from "./pages/booker.page.js";

export interface AvailabilityStartSlot {
  readonly date: CivilDate;
  readonly expectedLabel: string;
  readonly slots: readonly SlotView[];
  readonly first: SlotView;
}

export function assertThirtyMinuteSpacing(slots: readonly SlotView[], stepMs: number): void {
  const isos = slots.map((slot) => Date.parse(slot.iso));
  for (let i = 1; i < isos.length; i += 1) {
    const prev = required(isos[i - 1], "previous slot ISO missing");
    const curr = required(isos[i], "slot ISO missing");
    if (curr - prev !== stepMs) {
      throw new Error(`Slot spacing ${String(curr - prev)}ms !== ${String(stepMs)}ms`);
    }
  }
}

export function availabilityStartCivil(organiser: OrganiserAvailability): {
  readonly hour: number;
  readonly minute: number;
} {
  const minutes = parseClockToMinutes(organiser.startClock);
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

export async function openWeekdaySlots(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
}): Promise<AvailabilityStartSlot> {
  const today = civilDateFromInstant(new Date(), options.viewerTimeZone);
  const date = nextWeekdayAfter(today, options.organiser.timeZone, true);
  const start = availabilityStartCivil(options.organiser);
  await options.booker.gotoUserEvent(options.user, options.event, {
    month: monthParam(date),
    date: civilDateToIso(date),
  });
  await options.booker.expectLoaded();
  const slots = await options.booker.readSlots();
  const first = required(slots[0], "Booker rendered no slots on the next weekday");
  const expectedLabel = toZonedLabel(
    fromZonedCivil(options.organiser.timeZone, { ...date, ...start }),
    options.viewerTimeZone,
  );
  return { date, expectedLabel, slots, first };
}

export async function openFirstAvailabilitySlot(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
}): Promise<AvailabilityStartSlot> {
  const today = civilDateFromInstant(new Date(), options.viewerTimeZone);
  let date = nextWeekdayAfter(today, options.organiser.timeZone, true);
  const start = availabilityStartCivil(options.organiser);
  let lastLabels = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await options.booker.gotoUserEvent(options.user, options.event, {
      month: monthParam(date),
      date: civilDateToIso(date),
    });
    await options.booker.expectLoaded();
    const slots = await options.booker.readSlots();
    const expectedLabel = toZonedLabel(
      fromZonedCivil(options.organiser.timeZone, { ...date, ...start }),
      options.viewerTimeZone,
    );
    const first = slots[0];
    if (first !== undefined && normalizeSlotLabel(first.label) === expectedLabel) {
      return { date, expectedLabel, slots, first };
    }
    lastLabels = slots.map((slot) => slot.label).join(", ");
    date = nextWeekdayAfter(date, options.organiser.timeZone, true);
  }
  throw new Error(
    `No weekday whose first slot was ${options.organiser.startClock} ${options.organiser.timeZone} in ${options.viewerTimeZone}. Last labels: ${lastLabels}`,
  );
}
