export const CAL_ROUTES = {
  login: "/auth/login",
  csrf: "/api/auth/csrf",
  session: "/api/auth/session",
  cancelCsrf: "/api/csrf?sameSite=none",
  cancelBooking: "/api/cancel",
  credentialsCallback: "/api/auth/callback/credentials",
  bookingsUpcoming: "/bookings/upcoming",
  eventTypes: "/event-types",
  eventTypeEditor: (id: string): string => `/event-types/${id}`,
  eventTypesHeavyCreate: "eventTypesHeavy/create",
  eventTypesHeavyUpdate: "eventTypesHeavy/update",
  availability: "/availability",
  scheduleUpdate: "availability/schedule.update",
  publicBooker: (user: string, event: string): string => `/${user}/${event}`,
  bookingSuccess: (uid: string): string => `/booking/${uid}`,
} as const;

export const PRO_THIRTY_MIN_SLUG = {
  user: "pro",
  event: "30min",
} as const;

export const DST_ORGANISER = {
  email: "trial@example.com",
  username: "trial",
} as const;

export function isEventTypeEditorPath(pathname: string): boolean {
  return /\/event-types\/\d+$/.test(pathname);
}
