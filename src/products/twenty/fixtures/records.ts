import { TWENTY_ROUTES } from "../env.js";
import type { TwentyPinnedApiSession } from "./auth.js";

const CREATE_COMPANY = `mutation CreateCompany($input: CompanyCreateInput!) {
  createCompany(data: $input) { id name }
}`;

const CREATE_PERSON = `mutation CreatePerson($input: PersonCreateInput!) {
  createPerson(data: $input) { id name { firstName lastName } }
}`;

const CREATE_OPPORTUNITY = `mutation CreateOpportunity($input: OpportunityCreateInput!) {
  createOpportunity(data: $input) { id name closeDate createdAt }
}`;

const CREATE_PET = `mutation CreatePet($input: PetCreateInput!) {
  createPet(data: $input) { id name birthday }
}`;

const READ_OPPORTUNITY_CLOSE = `query OpportunityCloseDate($filter: OpportunityFilterInput!) {
  opportunity(filter: $filter) { id closeDate }
}`;

const DESTROY_COMPANY = `mutation DestroyCompany($companyId: UUID!) {
  destroyCompany(id: $companyId) { id }
}`;

const DESTROY_PERSON = `mutation DestroyPerson($personId: UUID!) {
  destroyPerson(id: $personId) { id }
}`;

const DESTROY_OPPORTUNITY = `mutation DestroyOpportunity($opportunityId: UUID!) {
  destroyOpportunity(id: $opportunityId) { id }
}`;

const DESTROY_PET = `mutation DestroyPet($petId: UUID!) {
  destroyPet(id: $petId) { id }
}`;

export interface TwentyCompanyRecord {
  readonly id: string;
  readonly name: string;
}

export interface TwentyPersonRecord {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface TwentyOpportunityRecord {
  readonly id: string;
  readonly name: string;
  readonly closeDate: string;
}

export interface TwentyPetRecord {
  readonly id: string;
  readonly name: string;
  readonly birthday: string;
}

export async function createCompany(
  api: TwentyPinnedApiSession,
  name: string,
): Promise<TwentyCompanyRecord> {
  const data = await api.query<{ createCompany?: { id: string; name: string } | null }>(
    TWENTY_ROUTES.graphql,
    CREATE_COMPANY,
    { input: { name } },
  );
  const row = data.createCompany;
  if (row === null || row === undefined) {
    throw new Error("Twenty createCompany returned no record");
  }
  return { id: row.id, name: row.name };
}

export async function createPerson(
  api: TwentyPinnedApiSession,
  firstName: string,
  lastName: string,
  companyId?: string,
): Promise<TwentyPersonRecord> {
  const data = await api.query<{
    createPerson?: { id: string; name: { firstName: string; lastName: string } } | null;
  }>(TWENTY_ROUTES.graphql, CREATE_PERSON, {
    input: {
      name: { firstName, lastName },
      ...(companyId === undefined ? {} : { companyId }),
    },
  });
  const row = data.createPerson;
  if (row === null || row === undefined) {
    throw new Error("Twenty createPerson returned no record");
  }
  return { id: row.id, firstName: row.name.firstName, lastName: row.name.lastName };
}

export async function createOpportunity(
  api: TwentyPinnedApiSession,
  name: string,
  closeDateIso: string,
): Promise<TwentyOpportunityRecord> {
  const data = await api.query<{
    createOpportunity?: { id: string; name: string; closeDate: string; createdAt?: string } | null;
  }>(TWENTY_ROUTES.graphql, CREATE_OPPORTUNITY, {
    input: { name, closeDate: closeDateIso },
  });
  const row = data.createOpportunity;
  if (row === null || row === undefined) {
    throw new Error("Twenty createOpportunity returned no record");
  }
  return { id: row.id, name: row.name, closeDate: row.closeDate };
}

export async function destroyCompany(
  api: TwentyPinnedApiSession,
  companyId: string,
): Promise<void> {
  const data = await api.query<{ destroyCompany?: { id: string } | null }>(
    TWENTY_ROUTES.graphql,
    DESTROY_COMPANY,
    { companyId },
  );
  if (data.destroyCompany === null || data.destroyCompany === undefined) {
    throw new Error(`destroyCompany missing id=${companyId} (RECORD_NOT_FOUND)`);
  }
}

export async function destroyPerson(api: TwentyPinnedApiSession, personId: string): Promise<void> {
  const data = await api.query<{ destroyPerson?: { id: string } | null }>(
    TWENTY_ROUTES.graphql,
    DESTROY_PERSON,
    { personId },
  );
  if (data.destroyPerson === null || data.destroyPerson === undefined) {
    throw new Error(`destroyPerson missing id=${personId} (RECORD_NOT_FOUND)`);
  }
}

export async function createPet(
  api: TwentyPinnedApiSession,
  name: string,
  birthday = "2027-01-01",
): Promise<TwentyPetRecord> {
  const data = await api.query<{
    createPet?: { id: string; name: string; birthday?: string | null } | null;
  }>(TWENTY_ROUTES.graphql, CREATE_PET, {
    input: { name, birthday },
  });
  const row = data.createPet;
  if (row === null || row === undefined) {
    throw new Error("Twenty createPet returned no record");
  }
  const birthdayValue = row.birthday;
  if (birthdayValue === null || birthdayValue === undefined || birthdayValue.trim() === "") {
    throw new Error("Twenty createPet returned no birthday");
  }
  return { id: row.id, name: row.name, birthday: birthdayValue };
}

export async function destroyPet(api: TwentyPinnedApiSession, petId: string): Promise<void> {
  const data = await api.query<{ destroyPet?: { id: string } | null }>(
    TWENTY_ROUTES.graphql,
    DESTROY_PET,
    { petId },
  );
  if (data.destroyPet === null || data.destroyPet === undefined) {
    throw new Error(`destroyPet missing id=${petId} (RECORD_NOT_FOUND)`);
  }
}

export async function readOpportunityCloseDate(
  api: TwentyPinnedApiSession,
  opportunityId: string,
): Promise<string> {
  const data = await api.query<{
    opportunity?: { id: string; closeDate?: string | null } | null;
  }>(TWENTY_ROUTES.graphql, READ_OPPORTUNITY_CLOSE, {
    filter: { id: { eq: opportunityId } },
  });
  const row = data.opportunity;
  if (row === null || row === undefined) {
    throw new Error(`Twenty opportunity missing id=${opportunityId}`);
  }
  const closeDate = row.closeDate;
  if (closeDate === null || closeDate === undefined || closeDate.trim() === "") {
    throw new Error(`Twenty opportunity id=${opportunityId} has no closeDate`);
  }
  return closeDate;
}

export async function destroyOpportunity(
  api: TwentyPinnedApiSession,
  opportunityId: string,
): Promise<void> {
  const data = await api.query<{ destroyOpportunity?: { id: string } | null }>(
    TWENTY_ROUTES.graphql,
    DESTROY_OPPORTUNITY,
    { opportunityId },
  );
  if (data.destroyOpportunity === null || data.destroyOpportunity === undefined) {
    throw new Error(`destroyOpportunity missing id=${opportunityId} (RECORD_NOT_FOUND)`);
  }
}
