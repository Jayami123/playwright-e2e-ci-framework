import { fakePerson } from "qa-portfolio-harness";

const TITLE_MAX_LENGTH = 48;

export function runId(): string {
  return process.env.P1_RUN_ID ?? Date.now().toString(36);
}

export function qaEventTitle(): string {
  const { firstName } = fakePerson();
  return `qa-${runId()}-${firstName}`.replace(/\s+/g, "-").slice(0, TITLE_MAX_LENGTH);
}
