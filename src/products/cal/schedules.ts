export const WORKING_HOURS_SCHEDULE_NAME = "Working Hours" as const;

export const CLOCK_MIDNIGHT_LABEL = "12:00am" as const;
export const CLOCK_NINE_AM_LABEL = "9:00am" as const;
export const CLOCK_FIVE_PM_LABEL = "5:00pm" as const;

export const SUNDAY_DAY_NAME = "Sunday" as const;

export const SUNDAY_AVAILABILITY_START_MINUTES = 0 as const;
export const SUNDAY_AVAILABILITY_END_MINUTES = 17 * 60;

export const MIN_LEAD_DAYS = 2 as const;
export const BOOKING_DATE_WINDOW_BASE_DAYS = 90 as const;
export const WEEKDAY_SEARCH_ATTEMPTS = 14 as const;
export const SLOT_STEP_MINUTES = 30 as const;
export const MINUTES_TO_MS = 60 * 1000;
export const THIRTY_MINUTES_MS = SLOT_STEP_MINUTES * MINUTES_TO_MS;

/** Lower bound for label lists that include every bookable slot regardless of notice. */
export const BOOKING_NOTICE_EPOCH = new Date(0);

/** US spring-forward: no booker slot label in the 02:00 hour (America/New_York). */
export const US_SPRING_FORWARD_PHANTOM_HOUR_LABEL = /^2:\d{2}am$/;

/** Fall-back duplicated hour label (America/New_York 12-hour booker). */
export const FALL_BACK_ONE_THIRTY_AM_LABEL = "1:30am" as const;

/** Playwright project name → extra days added to the parallel booking window offset. */
export const BOOKING_WINDOW_OFFSET_BY_PROJECT: Readonly<Record<string, number>> = {
  "cal-chromium": 0,
  "cal-firefox": 7,
  "cal-setup": 0,
  unit: 0,
};
