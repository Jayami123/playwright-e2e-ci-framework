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
export const THIRTY_MINUTES_MS = SLOT_STEP_MINUTES * 60 * 1000;
