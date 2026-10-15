import { TWENTY_ROUTES } from "../env.js";
import type { TwentyPinnedApiSession } from "./auth.js";

const GET_VIEWS = `query GetViews {
  getViews { id name }
}`;

const DESTROY_VIEW = `mutation DestroyView($id: String!) {
  destroyView(id: $id)
}`;

export interface TwentyViewRecord {
  readonly id: string;
  readonly name: string;
}

export async function listViews(api: TwentyPinnedApiSession): Promise<TwentyViewRecord[]> {
  const data = await api.query<{
    getViews?: Array<{ id?: string | null; name?: string | null } | null> | null;
  }>(TWENTY_ROUTES.metadata, GET_VIEWS);
  const rows = data.getViews ?? [];
  const views: TwentyViewRecord[] = [];
  for (const row of rows) {
    if (row === null) {
      continue;
    }
    if (typeof row.id !== "string" || row.id.trim() === "") {
      throw new Error("Twenty getViews returned a view with no id");
    }
    if (typeof row.name !== "string" || row.name.trim() === "") {
      throw new Error(`Twenty getViews returned view id=${row.id} with no name`);
    }
    views.push({ id: row.id, name: row.name });
  }
  return views;
}

export async function listViewIdsByNamePrefix(
  api: TwentyPinnedApiSession,
  prefix: string,
): Promise<string[]> {
  const views = await listViews(api);
  return views.filter((view) => view.name.startsWith(prefix)).map((view) => view.id);
}

export async function destroyView(api: TwentyPinnedApiSession, viewId: string): Promise<void> {
  const data = await api.query<{ destroyView?: boolean | null }>(
    TWENTY_ROUTES.metadata,
    DESTROY_VIEW,
    {
      id: viewId,
    },
  );
  if (data.destroyView !== true) {
    throw new Error(`destroyView missing id=${viewId}`);
  }
}

export async function destroyListedViews(
  api: TwentyPinnedApiSession,
  prefix: string,
): Promise<number> {
  const viewIds = await listViewIdsByNamePrefix(api, prefix);
  for (const id of viewIds) {
    await destroyView(api, id);
  }
  return viewIds.length;
}
