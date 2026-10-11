import { fakePerson } from "qa-portfolio-harness";

export interface DocumensoQaUserIdentity {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export function runId(): string {
  return process.env.P1_RUN_ID ?? Date.now().toString(36);
}

export function qaDocumensoUser(parallelIndex: number): DocumensoQaUserIdentity {
  const person = fakePerson();
  const token = `${runId()}-w${String(parallelIndex)}-${person.firstName}${person.lastName}`
    .replace(/\s+/g, "")
    .toLowerCase();
  const email = `qa-${token}@qa.local`;
  const password = `Qa-${token}-9!`;
  return {
    email,
    name: person.fullName,
    password,
  };
}
