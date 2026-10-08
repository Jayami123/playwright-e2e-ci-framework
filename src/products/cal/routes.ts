export const CAL_ROUTES = {
  login: "/auth/login",
  csrf: "/api/auth/csrf",
  credentialsCallback: "/api/auth/callback/credentials",
  bookingsUpcoming: "/bookings/upcoming",
  eventTypes: "/event-types",
  eventTypeEditor: (id: string): string => `/event-types/${id}`,
  publicBooker: (user: string, event: string): string => `/${user}/${event}`,
} as const;

export const PRO_THIRTY_MIN_SLUG = {
  user: "pro",
  event: "30min",
} as const;

export function isEventTypeEditorPath(pathname: string): boolean {
  return /\/event-types\/\d+$/.test(pathname);
}
