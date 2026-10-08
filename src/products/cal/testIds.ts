export const CAL_TEST_IDS = {
  newEventType: "new-event-type",
  eventTypeQuickChat: "event-type-quick-chat",
  eventTypeOptions: (id: string): string => `event-type-options-${id}`,
  dialogConfirmation: "dialog-confirmation",
  bookerContainer: "booker-container",
} as const;

export const DEFAULT_EVENT_DURATION_MINUTES = 10;
