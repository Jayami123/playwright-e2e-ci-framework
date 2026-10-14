import { TWENTY_ROUTES } from "../env.js";
import { createPinnedTwentyApiSession, loadUiWorkspaceIds } from "./auth.js";
import { loadTwentyConfig } from "../env.js";
import { destroyCompany, destroyOpportunity, destroyPerson } from "./records.js";
import type { TwentyPinnedApiSession } from "./auth.js";

const LIST_COMPANIES = `query CompaniesByPrefix($filter: CompanyFilterInput!) {
  companies(filter: $filter) { edges { node { id name } } }
}`;

const LIST_OPPORTUNITIES = `query OpportunitiesByPrefix($filter: OpportunityFilterInput!) {
  opportunities(filter: $filter) { edges { node { id name } } }
}`;

const LIST_PEOPLE = `query PeopleByPrefix($filter: PersonFilterInput!) {
  people(filter: $filter) { edges { node { id name { firstName lastName } } } }
}`;

async function listCompanyIds(api: TwentyPinnedApiSession, prefix: string): Promise<string[]> {
  const data = await api.query<{
    companies?: { edges?: Array<{ node?: { id: string } | null } | null> | null } | null;
  }>(TWENTY_ROUTES.graphql, LIST_COMPANIES, {
    filter: { name: { ilike: `${prefix}%` } },
  });
  const edges = data.companies?.edges ?? [];
  const ids: string[] = [];
  for (const edge of edges) {
    const id = edge?.node?.id;
    if (typeof id === "string") {
      ids.push(id);
    }
  }
  return ids;
}

async function listOpportunityIds(api: TwentyPinnedApiSession, prefix: string): Promise<string[]> {
  const data = await api.query<{
    opportunities?: { edges?: Array<{ node?: { id: string } | null } | null> | null } | null;
  }>(TWENTY_ROUTES.graphql, LIST_OPPORTUNITIES, {
    filter: { name: { ilike: `${prefix}%` } },
  });
  const edges = data.opportunities?.edges ?? [];
  const ids: string[] = [];
  for (const edge of edges) {
    const id = edge?.node?.id;
    if (typeof id === "string") {
      ids.push(id);
    }
  }
  return ids;
}

async function listPersonIds(api: TwentyPinnedApiSession, prefix: string): Promise<string[]> {
  const data = await api.query<{
    people?: { edges?: Array<{ node?: { id: string } | null } | null> | null } | null;
  }>(TWENTY_ROUTES.graphql, LIST_PEOPLE, {
    filter: { name: { firstName: { ilike: `${prefix}%` } } },
  });
  const edges = data.people?.edges ?? [];
  const ids: string[] = [];
  for (const edge of edges) {
    const id = edge?.node?.id;
    if (typeof id === "string") {
      ids.push(id);
    }
  }
  return ids;
}

async function countQaRecords(api: TwentyPinnedApiSession, prefix: string): Promise<number> {
  const [companies, opportunities, people] = await Promise.all([
    listCompanyIds(api, prefix),
    listOpportunityIds(api, prefix),
    listPersonIds(api, prefix),
  ]);
  return companies.length + opportunities.length + people.length;
}

async function destroyListed(api: TwentyPinnedApiSession, prefix: string): Promise<number> {
  const [companyIds, opportunityIds, personIds] = await Promise.all([
    listCompanyIds(api, prefix),
    listOpportunityIds(api, prefix),
    listPersonIds(api, prefix),
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
  return deleted;
}

export async function sweepTwentyQaRecords(prefix: string): Promise<{
  readonly before: number;
  readonly deleted: number;
  readonly after: number;
}> {
  const { authStatePath } = loadTwentyConfig();
  const ui = loadUiWorkspaceIds(authStatePath);
  const api = await createPinnedTwentyApiSession(ui.workspaceId, ui.memberId);
  const before = await countQaRecords(api, prefix);
  const deleted = await destroyListed(api, prefix);
  const after = await countQaRecords(api, prefix);
  console.log(
    `Local Twenty qa-record sweep (before=${String(before)}, deleted=${String(deleted)}, after=${String(after)})`,
  );
  return { before, deleted, after };
}
