import { TWENTY_ROUTES } from "../env.js";
import type { TwentyPinnedApiSession } from "./auth.js";
import { paginateConnectionIds, personPrefixFilter, type PersonFilter } from "./sweep.js";

export type { PersonFilter };

/** Server default MUTATION_MAXIMUM_AFFECTED_RECORDS is 100 (probe K-02). */
export const PEOPLE_DESTROY_CHUNK = 100;
const PAGE_SIZE = 100;

export interface TwentyImportedPerson {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly primaryEmail: string;
  readonly jobTitle: string;
  readonly intro: string;
}

const COUNT_PEOPLE = `query CountPeople($filter: PersonFilterInput!) {
  people(filter: $filter) { totalCount }
}`;

const LIST_PEOPLE_FULL = `query ListPeopleFull($filter: PersonFilterInput!, $first: Int!, $after: String) {
  people(filter: $filter, first: $first, after: $after) {
    edges { node { id name { firstName lastName } emails { primaryEmail } jobTitle intro } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const DESTROY_PEOPLE = `mutation DestroyPeople($filter: PersonFilterInput!) {
  destroyPeople(filter: $filter) { id }
}`;

/** Pure; throws on a LIKE wildcard. Matches people by first-name prefix or lowercase email prefix. */
export function qaPeopleFilter(prefix: string): PersonFilter {
  if (/[%_]/.test(prefix)) throw new Error(`QA people prefix has a LIKE wildcard: ${prefix}`);
  return personPrefixFilter(prefix);
}

/** Pure; matches one exact primary email. */
export function emailEqFilter(email: string): PersonFilter {
  return { emails: { primaryEmail: { eq: email } } };
}

export async function countPeople(
  api: TwentyPinnedApiSession,
  filter: PersonFilter,
): Promise<number> {
  const data = await api.query<{ people?: { totalCount?: number } | null }>(
    TWENTY_ROUTES.graphql,
    COUNT_PEOPLE,
    { filter },
  );
  return data.people?.totalCount ?? 0;
}

interface PersonNode {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  emails?: { primaryEmail?: string | null } | null;
  jobTitle?: string | null;
  intro?: string | null;
}

export async function listPeople(
  api: TwentyPinnedApiSession,
  filter: PersonFilter,
): Promise<readonly TwentyImportedPerson[]> {
  const people: TwentyImportedPerson[] = [];
  await paginateConnectionIds(async (after) => {
    const data = await api.query<{
      people?: {
        edges?: Array<{ node?: PersonNode | null } | null> | null;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
      } | null;
    }>(TWENTY_ROUTES.graphql, LIST_PEOPLE_FULL, { filter, first: PAGE_SIZE, after });
    const ids: string[] = [];
    for (const edge of data.people?.edges ?? []) {
      const node = edge?.node;
      if (node === null || node === undefined) continue;
      ids.push(node.id);
      people.push({
        id: node.id,
        firstName: node.name?.firstName ?? "",
        lastName: node.name?.lastName ?? "",
        primaryEmail: node.emails?.primaryEmail ?? "",
        jobTitle: node.jobTitle ?? "",
        intro: node.intro ?? "",
      });
    }
    const pageInfo = data.people?.pageInfo;
    return { ids, hasNextPage: pageInfo?.hasNextPage === true, endCursor: pageInfo?.endCursor };
  });
  return people;
}

/** Destroys in chunks of 100; throws when a chunk returns fewer ids than it was given. */
export async function destroyPeopleByIds(
  api: TwentyPinnedApiSession,
  ids: readonly string[],
): Promise<number> {
  let destroyed = 0;
  for (let start = 0; start < ids.length; start += PEOPLE_DESTROY_CHUNK) {
    const chunk = ids.slice(start, start + PEOPLE_DESTROY_CHUNK);
    const data = await api.query<{ destroyPeople?: Array<{ id: string } | null> | null }>(
      TWENTY_ROUTES.graphql,
      DESTROY_PEOPLE,
      { filter: { id: { in: chunk } } },
    );
    const returned = (data.destroyPeople ?? []).filter((row) => row !== null).length;
    if (returned !== chunk.length) {
      throw new Error(
        `destroyPeople returned ${String(returned)} ids for a chunk of ${String(chunk.length)}`,
      );
    }
    destroyed += returned;
  }
  return destroyed;
}
