import { fakeOrg, fakePerson } from "qa-portfolio-harness";

export function p1QaPrefix(seed: number | string, worker: number | string): string {
  return `P1-QA-${String(seed)}-${String(worker)}`;
}

export function p1QaCompanyName(prefix: string, leaf?: string): string {
  const suffix = leaf ?? fakeOrg().name;
  return `${prefix}-${suffix}`;
}

export function p1QaPersonName(
  prefix: string,
  leaf?: string,
): { readonly firstName: string; readonly lastName: string } {
  const person = fakePerson();
  const firstName = leaf === undefined ? `${prefix}-${person.firstName}` : `${prefix}-${leaf}`;
  return { firstName, lastName: person.lastName };
}

export function p1QaOpportunityName(prefix: string, leaf?: string): string {
  const suffix = leaf ?? fakeOrg().name;
  return `${prefix}-${suffix}`;
}
