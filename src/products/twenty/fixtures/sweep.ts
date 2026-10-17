import { TWENTY_ROUTES } from "../env.js";
import { createPinnedTwentyApiSession, loadUiWorkspaceIds } from "./auth.js";
import { loadTwentyConfig } from "../env.js";
import { destroyCompany, destroyOpportunity, destroyPerson, destroyPet } from "./records.js";
import { destroyListedViews, listViewIdsByNamePrefix } from "./views.js";
import type { TwentyPinnedApiSession } from "./auth.js";

export type PersonFilter = Record<string, unknown>;

/** Pure. People created by P1 carry the prefix in the first name or (CSV imports) the lowercase email. */
export function personPrefixFilter(prefix: string): PersonFilter {
  return {
    or: [
      { name: { firstName: { ilike: `${prefix}%` } } },
      { emails: { primaryEmail: { ilike: `${prefix.toLowerCase()}%` } } },
    ],
  };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

const LIST_COMPANIES = `query CompaniesByPrefix($filter: CompanyFilterInput!, $first: Int!, $after: String) {
  companies(filter: $filter, first: $first, after: $after) {
    edges { node { id name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const LIST_OPPORTUNITIES = `query OpportunitiesByPrefix($filter: OpportunityFilterInput!, $first: Int!, $after: String) {
  opportunities(filter: $filter, first: $first, after: $after) {
    edges { node { id name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const LIST_PEOPLE = `query PeopleByPrefix($filter: PersonFilterInput!, $first: Int!, $after: String) {
  people(filter: $filter, first: $first, after: $after) {
    edges { node { id name { firstName lastName } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const LIST_PETS = `query PetsByPrefix($filter: PetFilterInput!, $first: Int!, $after: String) {
  pets(filter: $filter, first: $first, after: $after) {
    edges { node { id name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

interface ConnectionPage {
  readonly ids: string[];
  readonly hasNextPage: boolean;
  readonly endCursor: string | null | undefined;
}

export async function paginateConnectionIds(
  fetchPage: (after: string | null) => Promise<ConnectionPage>,
): Promise<string[]> {
  const all: string[] = [];
  let after: string | null = null;
  let pages = 0;
  for (;;) {
    pages += 1;
    if (pages > MAX_PAGES) {
      throw new Error(`Twenty sweep pagination exceeded ${String(MAX_PAGES)} pages`);
    }
    const page = await fetchPage(after);
    all.push(...page.ids);
    if (!page.hasNextPage) {
      break;
    }
    const cursor = page.endCursor;
    if (cursor === null || cursor === undefined || cursor === "") {
      throw new Error("Twenty sweep pagination: hasNextPage true but endCursor missing");
    }
    if (cursor === after) {
      throw new Error("Twenty sweep pagination: endCursor did not advance");
    }
    after = cursor;
  }
  return all;
}

function idsFromCompanyPage(data: {
  companies?: {
    edges?: Array<{ node?: { id: string } | null } | null> | null;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
  } | null;
}): ConnectionPage {
  const edges = data.companies?.edges ?? [];
  const ids: string[] = [];
  for (const edge of edges) {
    const id = edge?.node?.id;
    if (typeof id === "string") {
      ids.push(id);
    }
  }
  const pageInfo = data.companies?.pageInfo;
  return {
    ids,
    hasNextPage: pageInfo?.hasNextPage === true,
    endCursor: pageInfo?.endCursor,
  };
}

export async function listCompanyIds(
  api: TwentyPinnedApiSession,
  prefix: string,
): Promise<string[]> {
  return paginateConnectionIds(async (after) => {
    const data = await api.query<{
      companies?: {
        edges?: Array<{ node?: { id: string } | null } | null> | null;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      } | null;
    }>(TWENTY_ROUTES.graphql, LIST_COMPANIES, {
      filter: { name: { ilike: `${prefix}%` } },
      first: PAGE_SIZE,
      after,
    });
    return idsFromCompanyPage(data);
  });
}

async function listOpportunityIds(api: TwentyPinnedApiSession, prefix: string): Promise<string[]> {
  return paginateConnectionIds(async (after) => {
    const data = await api.query<{
      opportunities?: {
        edges?: Array<{ node?: { id: string } | null } | null> | null;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      } | null;
    }>(TWENTY_ROUTES.graphql, LIST_OPPORTUNITIES, {
      filter: { name: { ilike: `${prefix}%` } },
      first: PAGE_SIZE,
      after,
    });
    const edges = data.opportunities?.edges ?? [];
    const ids: string[] = [];
    for (const edge of edges) {
      const id = edge?.node?.id;
      if (typeof id === "string") {
        ids.push(id);
      }
    }
    const pageInfo = data.opportunities?.pageInfo;
    return {
      ids,
      hasNextPage: pageInfo?.hasNextPage === true,
      endCursor: pageInfo?.endCursor,
    };
  });
}

async function listPetIds(api: TwentyPinnedApiSession, prefix: string): Promise<string[]> {
  return paginateConnectionIds(async (after) => {
    const data = await api.query<{
      pets?: {
        edges?: Array<{ node?: { id: string } | null } | null> | null;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      } | null;
    }>(TWENTY_ROUTES.graphql, LIST_PETS, {
      filter: { name: { ilike: `${prefix}%` } },
      first: PAGE_SIZE,
      after,
    });
    const edges = data.pets?.edges ?? [];
    const ids: string[] = [];
    for (const edge of edges) {
      const id = edge?.node?.id;
      if (typeof id === "string") {
        ids.push(id);
      }
    }
    const pageInfo = data.pets?.pageInfo;
    return {
      ids,
      hasNextPage: pageInfo?.hasNextPage === true,
      endCursor: pageInfo?.endCursor,
    };
  });
}

/** @internal Used by unit tests to verify pets list-then-destroy ordering. */
export async function listPetIdsForSweep(
  api: TwentyPinnedApiSession,
  prefix: string,
): Promise<string[]> {
  return listPetIds(api, prefix);
}

async function listPersonIds(api: TwentyPinnedApiSession, prefix: string): Promise<string[]> {
  return paginateConnectionIds(async (after) => {
    const data = await api.query<{
      people?: {
        edges?: Array<{ node?: { id: string } | null } | null> | null;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      } | null;
    }>(TWENTY_ROUTES.graphql, LIST_PEOPLE, {
      filter: personPrefixFilter(prefix),
      first: PAGE_SIZE,
      after,
    });
    const edges = data.people?.edges ?? [];
    const ids: string[] = [];
    for (const edge of edges) {
      const id = edge?.node?.id;
      if (typeof id === "string") {
        ids.push(id);
      }
    }
    const pageInfo = data.people?.pageInfo;
    return {
      ids,
      hasNextPage: pageInfo?.hasNextPage === true,
      endCursor: pageInfo?.endCursor,
    };
  });
}

async function countQaRecords(api: TwentyPinnedApiSession, prefix: string): Promise<number> {
  const [companies, opportunities, people, pets] = await Promise.all([
    listCompanyIds(api, prefix),
    listOpportunityIds(api, prefix),
    listPersonIds(api, prefix),
    listPetIds(api, prefix),
  ]);
  return companies.length + opportunities.length + people.length + pets.length;
}

async function countPetRecords(api: TwentyPinnedApiSession, prefix: string): Promise<number> {
  const pets = await listPetIds(api, prefix);
  return pets.length;
}

/** @internal Used by unit tests to verify list-then-destroy ordering. */
export async function destroyListedCompanies(
  api: TwentyPinnedApiSession,
  prefix: string,
): Promise<number> {
  const companyIds = await listCompanyIds(api, prefix);
  for (const id of companyIds) {
    await destroyCompany(api, id);
  }
  return companyIds.length;
}

/** @internal Used by unit tests to verify pets list-then-destroy ordering. */
export async function destroyListedPets(
  api: TwentyPinnedApiSession,
  prefix: string,
): Promise<number> {
  const petIds = await listPetIds(api, prefix);
  for (const id of petIds) {
    await destroyPet(api, id);
  }
  return petIds.length;
}

async function destroyListed(api: TwentyPinnedApiSession, prefix: string): Promise<number> {
  const [companyIds, opportunityIds, personIds, petIds] = await Promise.all([
    listCompanyIds(api, prefix),
    listOpportunityIds(api, prefix),
    listPersonIds(api, prefix),
    listPetIds(api, prefix),
  ]);
  let deleted = 0;
  for (const id of companyIds) {
    await destroyCompany(api, id);
    deleted += 1;
  }
  for (const id of opportunityIds) {
    await destroyOpportunity(api, id);
    deleted += 1;
  }
  for (const id of personIds) {
    await destroyPerson(api, id);
    deleted += 1;
  }
  for (const id of petIds) {
    await destroyPet(api, id);
    deleted += 1;
  }
  return deleted;
}

export async function sweepTwentyQaRecords(prefix: string): Promise<{
  readonly before: number;
  readonly deleted: number;
  readonly after: number;
  readonly viewsBefore: number;
  readonly viewsDeleted: number;
  readonly viewsAfter: number;
}> {
  const { authStatePath } = loadTwentyConfig();
  const ui = loadUiWorkspaceIds(authStatePath);
  const api = await createPinnedTwentyApiSession(ui.workspaceId, ui.memberId);
  const before = await countQaRecords(api, prefix);
  const petsBefore = await countPetRecords(api, prefix);
  const viewsBefore = (await listViewIdsByNamePrefix(api, prefix)).length;
  const deleted = await destroyListed(api, prefix);
  const viewsDeleted = await destroyListedViews(api, prefix);
  const after = await countQaRecords(api, prefix);
  const viewsAfter = (await listViewIdsByNamePrefix(api, prefix)).length;
  console.log(
    `Local Twenty qa-record sweep (before=${String(before)}, deleted=${String(deleted)}, after=${String(after)}, pets=${String(petsBefore)}, viewsBefore=${String(viewsBefore)}, viewsDeleted=${String(viewsDeleted)}, viewsAfter=${String(viewsAfter)})`,
  );
  return { before, deleted, after, viewsBefore, viewsDeleted, viewsAfter };
}
