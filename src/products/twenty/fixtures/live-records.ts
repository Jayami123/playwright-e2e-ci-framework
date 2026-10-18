import { loadTwentyConfig, TWENTY_ROUTES } from "../env.js";
import { parseRestCreatePersonResponse } from "../live.js";
import type { TwentyPinnedApiSession } from "./auth.js";
import type { TwentyQaMember } from "./qa-member.js";

const G = TWENTY_ROUTES.graphql;
const M = TWENTY_ROUTES.metadata;

export type LiveObjectName = "opportunity" | "person";

export async function createCompanyWith(
  api: TwentyPinnedApiSession,
  input: { name: string; tagline?: string; employees?: number },
): Promise<{ id: string }> {
  const data = await api.query<{ createCompany?: { id: string } | null }>(
    G,
    `mutation LiveCreateCompany($input: CompanyCreateInput!) { createCompany(data: $input) { id } }`,
    { input },
  );
  if (data.createCompany === null || data.createCompany === undefined) {
    throw new Error("createCompany returned no record");
  }
  return { id: data.createCompany.id };
}

export async function readCompany(
  api: TwentyPinnedApiSession,
  id: string,
): Promise<{ name: string; tagline: string; employees: number | null }> {
  const data = await api.query<{
    company?: { name: string; tagline?: string | null; employees?: number | null } | null;
  }>(
    G,
    `query LiveCompany($filter: CompanyFilterInput!) { company(filter: $filter) { name tagline employees } }`,
    { filter: { id: { eq: id } } },
  );
  const row = data.company;
  if (row === null || row === undefined) throw new Error(`Twenty company missing id=${id}`);
  return { name: row.name, tagline: row.tagline ?? "", employees: row.employees ?? null };
}

export async function softDeleteCompany(api: TwentyPinnedApiSession, id: string): Promise<void> {
  const data = await api.query<{
    deleteCompany?: { id: string; deletedAt?: string | null } | null;
  }>(G, `mutation LiveDeleteCompany($id: UUID!) { deleteCompany(id: $id) { id deletedAt } }`, {
    id,
  });
  if (data.deleteCompany?.deletedAt === null || data.deleteCompany?.deletedAt === undefined) {
    throw new Error(`deleteCompany did not set deletedAt for id=${id}`);
  }
}

export async function readCompanyAnyState(
  api: TwentyPinnedApiSession,
  id: string,
): Promise<{ live: number; deleted: Array<{ tagline: string; deletedAt: string }> }> {
  // Twenty rejects two aliases of one root resolver ("Duplicate root resolver"), so two queries.
  const live = await api.query<{ companies?: { totalCount?: number } | null }>(
    G,
    `query LiveCompanyCount($filter: CompanyFilterInput!) { companies(filter: $filter) { totalCount } }`,
    { filter: { id: { eq: id } } },
  );
  const gone = await api.query<{
    companies?: {
      edges?: Array<{ node: { tagline?: string | null; deletedAt?: string | null } }>;
    } | null;
  }>(
    G,
    `query LiveCompanyDeleted($filter: CompanyFilterInput!) { companies(filter: $filter) { edges { node { tagline deletedAt } } } }`,
    { filter: { and: [{ id: { eq: id } }, { deletedAt: { is: "NOT_NULL" } }] } },
  );
  return {
    live: live.companies?.totalCount ?? 0,
    deleted: (gone.companies?.edges ?? []).map((e) => ({
      tagline: e.node.tagline ?? "",
      deletedAt: e.node.deletedAt ?? "",
    })),
  };
}

export async function createOpportunityInStage(
  api: TwentyPinnedApiSession,
  name: string,
  stage: "NEW",
): Promise<{ id: string }> {
  const data = await api.query<{ createOpportunity?: { id: string } | null }>(
    G,
    `mutation LiveCreateOpportunity($input: OpportunityCreateInput!) { createOpportunity(data: $input) { id } }`,
    { input: { name, stage } },
  );
  if (data.createOpportunity === null || data.createOpportunity === undefined) {
    throw new Error("createOpportunity returned no record");
  }
  return { id: data.createOpportunity.id };
}

export async function readOpportunity(
  api: TwentyPinnedApiSession,
  id: string,
): Promise<{ stage: string; amountMicros: number | null; currencyCode: string | null }> {
  const data = await api.query<{
    opportunity?: {
      stage?: string | null;
      amount?: { amountMicros?: number | string | null; currencyCode?: string | null } | null;
    } | null;
  }>(
    G,
    `query LiveOpportunity($filter: OpportunityFilterInput!) { opportunity(filter: $filter) { stage amount { amountMicros currencyCode } } }`,
    { filter: { id: { eq: id } } },
  );
  const row = data.opportunity;
  if (row === null || row === undefined) throw new Error(`Twenty opportunity missing id=${id}`);
  const micros = row.amount?.amountMicros;
  return {
    stage: row.stage ?? "",
    amountMicros: micros === null || micros === undefined ? null : Number(micros),
    currencyCode: row.amount?.currencyCode ?? null,
  };
}

export async function createPersonWithJob(
  api: TwentyPinnedApiSession,
  firstName: string,
  lastName: string,
  jobTitle: string,
): Promise<{ id: string }> {
  const data = await api.query<{ createPerson?: { id: string } | null }>(
    G,
    `mutation LiveCreatePerson($input: PersonCreateInput!) { createPerson(data: $input) { id } }`,
    { input: { name: { firstName, lastName }, jobTitle } },
  );
  if (data.createPerson === null || data.createPerson === undefined) {
    throw new Error("createPerson returned no record");
  }
  return { id: data.createPerson.id };
}

/** REST create as the member itself: the path the SSE list contract is about (RT-002). */
export async function createPersonViaRest(
  member: TwentyQaMember,
  firstName: string,
  lastName: string,
  jobTitle: string,
): Promise<{ id: string; status: number }> {
  const { baseUrl } = loadTwentyConfig();
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/people`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: member.authorization },
    body: JSON.stringify({ name: { firstName, lastName }, jobTitle }),
  });
  const { id } = parseRestCreatePersonResponse(response.status, await response.text());
  return { id, status: response.status };
}

export async function updatePersonJobTitle(
  api: TwentyPinnedApiSession,
  id: string,
  jobTitle: string,
): Promise<void> {
  const data = await api.query<{ updatePerson?: { id: string } | null }>(
    G,
    `mutation LiveUpdatePerson($id: UUID!, $input: PersonUpdateInput!) { updatePerson(id: $id, data: $input) { id } }`,
    { id, input: { jobTitle } },
  );
  if (data.updatePerson === null || data.updatePerson === undefined) {
    throw new Error(`updatePerson missing id=${id}`);
  }
}

export async function readPerson(
  api: TwentyPinnedApiSession,
  id: string,
): Promise<{ firstName: string; jobTitle: string }> {
  const data = await api.query<{
    person?: { name: { firstName: string }; jobTitle?: string | null } | null;
  }>(
    G,
    `query LivePerson($filter: PersonFilterInput!) { person(filter: $filter) { name { firstName } jobTitle } }`,
    { filter: { id: { eq: id } } },
  );
  const row = data.person;
  if (row === null || row === undefined) throw new Error(`Twenty person missing id=${id}`);
  return { firstName: row.name.firstName, jobTitle: row.jobTitle ?? "" };
}

export async function countPeopleMatching(
  api: TwentyPinnedApiSession,
  contains: string,
): Promise<number> {
  if (/[%_]/.test(contains)) throw new Error(`Filter has a LIKE wildcard: ${contains}`);
  const data = await api.query<{ people?: { totalCount?: number } | null }>(
    G,
    `query LivePeopleCount($filter: PersonFilterInput!) { people(filter: $filter) { totalCount } }`,
    { filter: { name: { firstName: { ilike: `%${contains}%` } } } },
  );
  return data.people?.totalCount ?? 0;
}

export async function objectFieldIds(
  api: TwentyPinnedApiSession,
  objectName: LiveObjectName,
  fields: readonly string[],
): Promise<{ objectId: string; fieldIds: Record<string, string> }> {
  const data = await api.query<{
    objects?: {
      edges: Array<{
        node: {
          id: string;
          nameSingular: string;
          fields: { edges: Array<{ node: { id: string; name: string } }> };
        };
      }>;
    };
  }>(
    M,
    `query LiveObjectFields { objects(paging: { first: 200 }) { edges { node { id nameSingular fields(paging: { first: 200 }) { edges { node { id name } } } } } } }`,
  );
  const object = data.objects?.edges.find((e) => e.node.nameSingular === objectName)?.node;
  if (object === undefined) throw new Error(`Twenty object ${objectName} not found`);
  const fieldIds: Record<string, string> = {};
  for (const name of fields) {
    const id = object.fields.edges.find((e) => e.node.name === name)?.node.id;
    if (id === undefined) throw new Error(`Twenty field ${objectName}.${name} not found`);
    fieldIds[name] = id;
  }
  return { objectId: object.id, fieldIds };
}

export async function createKanbanView(
  api: TwentyPinnedApiSession,
  input: { name: string; objectId: string; stageFieldId: string },
): Promise<{ id: string }> {
  const data = await api.query<{ createView?: { id: string } | null }>(
    M,
    `mutation LiveCreateView($input: CreateViewInput!) { createView(input: $input) { id } }`,
    {
      input: {
        name: input.name,
        objectMetadataId: input.objectId,
        type: "KANBAN",
        icon: "IconLayoutKanban",
        mainGroupByFieldMetadataId: input.stageFieldId,
        visibility: "WORKSPACE",
      },
    },
  );
  if (data.createView === null || data.createView === undefined) {
    throw new Error("createView returned no view");
  }
  return { id: data.createView.id };
}

export async function createNameContainsFilter(
  api: TwentyPinnedApiSession,
  viewId: string,
  nameFieldId: string,
  value: string,
): Promise<void> {
  const data = await api.query<{ createViewFilter?: { id: string } | null }>(
    M,
    `mutation LiveCreateViewFilter($input: CreateViewFilterInput!) { createViewFilter(input: $input) { id } }`,
    { input: { viewId, fieldMetadataId: nameFieldId, operand: "CONTAINS", value } },
  );
  if (data.createViewFilter === null || data.createViewFilter === undefined) {
    throw new Error("createViewFilter returned no filter");
  }
}

/** A table view of People filtered by first-name prefix, with the Name and Job Title columns. */
export async function createFilteredPeopleView(
  api: TwentyPinnedApiSession,
  name: string,
  namePrefix: string,
): Promise<{ id: string }> {
  const { objectId, fieldIds } = await objectFieldIds(api, "person", ["name", "jobTitle"]);
  const data = await api.query<{ createView?: { id: string } | null }>(
    M,
    `mutation LiveCreatePeopleView($input: CreateViewInput!) { createView(input: $input) { id } }`,
    {
      input: {
        name,
        objectMetadataId: objectId,
        type: "TABLE",
        icon: "IconUsers",
        visibility: "WORKSPACE",
      },
    },
  );
  const viewId = data.createView?.id;
  if (viewId === undefined) throw new Error("createView returned no view");
  try {
    await api.query(
      M,
      `mutation LiveCreatePeopleFilter($input: CreateViewFilterInput!) { createViewFilter(input: $input) { id } }`,
      {
        input: {
          viewId,
          fieldMetadataId: fieldIds.name,
          operand: "CONTAINS",
          value: namePrefix,
          subFieldName: "firstName",
        },
      },
    );
    // A view with no view fields shows no columns, so the rows would be empty.
    for (const [position, fieldMetadataId] of [fieldIds.name, fieldIds.jobTitle].entries()) {
      await api.query(
        M,
        `mutation LiveCreatePeopleField($input: CreateViewFieldInput!) { createViewField(input: $input) { id } }`,
        { input: { viewId, fieldMetadataId, position, isVisible: true, size: 200 } },
      );
    }
  } catch (error) {
    await api
      .query(M, `mutation LiveDropView($id: String!) { destroyView(id: $id) }`, { id: viewId })
      .catch(() => undefined);
    throw error;
  }
  return { id: viewId };
}
