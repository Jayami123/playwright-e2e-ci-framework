import { addDays, fromZonedCivil, type CivilDate } from "../../core/timezone.js";
import { MINUTES_TO_MS } from "./schedules.js";

const ORGANISER_MIDNIGHT_EARLY_OFFSETS_MINUTES = [60, 30] as const;

/** Instants one hour and 30 minutes before organiser local midnight on `organiserDate`. */
export function organiserMidnightEarlySlotIsos(
  organiserDate: CivilDate,
  organiserTimeZone: string,
): readonly [string, string] {
  const midnightUtc = fromZonedCivil(organiserTimeZone, { ...organiserDate, hour: 0, minute: 0 });
  const [sixtyMinutes, thirtyMinutes] = ORGANISER_MIDNIGHT_EARLY_OFFSETS_MINUTES;
  return [
    new Date(midnightUtc.getTime() - sixtyMinutes * MINUTES_TO_MS).toISOString(),
    new Date(midnightUtc.getTime() - thirtyMinutes * MINUTES_TO_MS).toISOString(),
  ];
}

/** Sunday one week before the EU spring-forward Sunday (same year as `euSpringForwardSunday`). */
export function euSpringForwardControlSunday(euSpringForwardSunday: CivilDate): CivilDate {
  return addDays(euSpringForwardSunday, -7);
}
