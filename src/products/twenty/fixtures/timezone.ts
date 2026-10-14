import { TWENTY_ROUTES } from "../env.js";
import type { TwentyPinnedApiSession } from "./auth.js";

const READ_MEMBER_TZ = `query WorkspaceMemberTimeZone($filter: WorkspaceMemberFilterInput!) {
  workspaceMember(filter: $filter) { id timeZone }
}`;

const UPDATE_MEMBER_TZ = `mutation UpdateWorkspaceMember($id: UUID!, $data: WorkspaceMemberUpdateInput!) {
  updateWorkspaceMember(id: $id, data: $data) { id timeZone }
}`;

export async function readMemberTimeZone(
  api: TwentyPinnedApiSession,
  memberId: string,
): Promise<string> {
  const data = await api.query<{
    workspaceMember?: { id: string; timeZone?: string | null } | null;
  }>(TWENTY_ROUTES.graphql, READ_MEMBER_TZ, {
    filter: { id: { eq: memberId } },
  });
  const row = data.workspaceMember;
  if (row === null || row === undefined) {
    throw new Error(`Twenty workspaceMember missing id=${memberId}`);
  }
  const timeZone = row.timeZone;
  if (timeZone === null || timeZone === undefined || timeZone.trim() === "") {
    throw new Error(`Twenty workspaceMember id=${memberId} has no timeZone`);
  }
  return timeZone;
}

export async function setMemberTimeZone(
  api: TwentyPinnedApiSession,
  memberId: string,
  timeZone: string,
): Promise<string> {
  const data = await api.query<{
    updateWorkspaceMember?: { id: string; timeZone?: string | null } | null;
  }>(TWENTY_ROUTES.graphql, UPDATE_MEMBER_TZ, {
    id: memberId,
    data: { timeZone },
  });
  const row = data.updateWorkspaceMember;
  if (row === null || row === undefined) {
    throw new Error(`Twenty updateWorkspaceMember missing id=${memberId}`);
  }
  const written = row.timeZone;
  if (written === null || written === undefined || written.trim() === "") {
    throw new Error(`Twenty updateWorkspaceMember id=${memberId} returned no timeZone`);
  }
  return written;
}
