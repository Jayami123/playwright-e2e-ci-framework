/** Step 0 probe 2026-10-15: /pro/30min frozen at Mon 14 Jan 2030 shows 9:00am–4:30pm Europe/London. */
export const CAL_FROZEN_SLOT_COUNT = 16;

export const VIS004_SLOTS_500_ISSUE =
  "PRODUCT BUG: slots getSchedule HTTP 500 shows a skeleton, then silently jumps to an empty next month; no user-facing error (Phase 3 probe 2026-10-15)";
export const A11Y003_WEEKDAY_OVERLAP_ISSUE =
  "PRODUCT BUG: at 200% zoom (197 CSS px) weekday labels overflow their 9px cells and overlap (WCAG 1.4.10)";
export const A11Y001_FOCUS_LOST_ISSUE =
  "PRODUCT BUG: choosing a slot by keyboard moves focus to <body> instead of the booking form (WCAG 2.4.3, Phase 3 probe 2026-10-15)";
export const A11Y006_DOLLAR_NAME_ISSUE =
  'PRODUCT BUG: booker view-toggle radios expose accessible names with a literal "$" prefix, e.g. "$Switch to monthly view" (Phase 3 probe 2026-10-15)';
export const A11Y002_TIMEZONE_FOCUS_ISSUE =
  "PRODUCT BUG: the timezone select shows no visible focus indicator when focused by keyboard; the combobox and its wrappers gain no outline, no visible box-shadow and no border-colour change (WCAG 2.4.7 Focus Visible, Phase 3 probe 2026-10-15)";
