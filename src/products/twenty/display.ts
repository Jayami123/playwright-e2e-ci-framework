const CIVIL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const CIVIL_DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** DATE field oracle (`YYYY-MM-DD`). Uses UTC noon so the calendar day cannot shift in Node. */
export function formatTwentyDate(birthdayYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdayYmd);
  if (match === null) {
    throw new Error(`formatTwentyDate expected YYYY-MM-DD, got ${birthdayYmd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", { ...CIVIL_DATE_FORMAT, timeZone: "UTC" }).format(
    instant,
  );
}

/** DATE_TIME civil string in member IANA TZ (12-hour, MONTH_FIRST). No TZ abbrev. */
export function formatTwentyDateTime(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`formatTwentyDateTime invalid ISO: ${iso}`);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    ...CIVIL_DATE_TIME_FORMAT,
    timeZone,
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type);
    if (part === undefined) {
      throw new Error(`formatTwentyDateTime missing part ${type}`);
    }
    return part.value;
  };
  return `${pick("month")} ${pick("day")}, ${pick("year")} ${pick("hour")}:${pick("minute")} ${pick("dayPeriod")}`;
}
