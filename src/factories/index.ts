import { fakeEmail, fakeOrg, fakePerson, setFactorySeed } from "qa-portfolio-harness";

export { fakeEmail, fakeOrg, fakePerson, setFactorySeed };

export function runId(): string {
  return process.env.P1_RUN_ID ?? `qa-${Date.now().toString(36)}`;
}

/** Event type title: qa-<run>-... as required by P1-CAL-FW-003. */
export function qaEventTitle(): string {
  setFactorySeed(Date.now());
  const { firstName } = fakePerson();
  return `qa-${runId()}-${firstName}`.replace(/\s+/g, "-").slice(0, 48);
}
