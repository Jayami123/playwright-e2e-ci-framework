import { fakePerson } from "qa-portfolio-harness";

export const DEFAULT_EVENT_DURATION_MINUTES = 10;
export const THIRTY_MINUTE_DURATION = 30;

const TITLE_MAX_LENGTH = 48;

export function runId(): string {
  return process.env.P1_RUN_ID ?? Date.now().toString(36);
}

export function qaEventTitle(): string {
  const { firstName } = fakePerson();
  return `qa-${runId()}-${firstName}`.replace(/\s+/g, "-").slice(0, TITLE_MAX_LENGTH);
}

export function qaScheduleName(): string {
  return `sch-${qaEventTitle()}`.slice(0, TITLE_MAX_LENGTH);
}

export interface QaAttendee {
  readonly name: string;
  readonly email: string;
}

export function qaAttendee(): QaAttendee {
  const person = fakePerson();
  const local = `${person.firstName}.${person.lastName}`.replace(/\s+/g, "").toLowerCase();
  return {
    name: person.fullName,
    email: `qa-${runId()}-${local}@qa.local`,
  };
}

export function eventSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TITLE_MAX_LENGTH);
}
