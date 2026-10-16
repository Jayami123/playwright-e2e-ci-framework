import { expect, type Browser } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadTwentyConfig, TWENTY_ROUTES, twentyTimeouts } from "../env.js";
import { TwentyLoginPage } from "../pages/login.page.js";
import { exchangeWorkspaceAccess, type TwentyPinnedApiSession } from "./auth.js";
import { twentyGraphql, type TwentyGraphqlPath } from "./graphql.js";

export interface TwentyQaMember {
  readonly email: string;
  readonly memberId: string;
  readonly workspaceId: string;
  readonly storageStatePath: string;
  /** Bearer session of the QA member itself (settings, own records, self-delete). */
  readonly authorization: string;
}

export interface MemberPrefs {
  readonly colorScheme?: "Light" | "Dark" | "System";
  readonly locale?: string;
}

/** Pure; unit-tested. Email prefix "p1-qa-" is what the leak check counts. */
export function qaMemberEmail(seed: number, worker: number): string {
  return `p1-qa-${String(seed)}-${String(worker)}@example.test`;
}

/** Pure; fixed so screenshots never show a seed. */
export const QA_MEMBER_NAME = { firstName: "P1-QA Visual", lastName: "Member" } as const;

/** Pure; unit-tested: exactly 150 chars, starts with the P1-QA prefix (sweep-safe). */
export function longCompanyName(prefix: string): string {
  return `${prefix}-${"Longcompany-Truncation-Check ".repeat(8)}`.slice(0, 150);
}

const INVITE_QUERY = `query QaInvite {
  currentWorkspace { id inviteHash isPublicInviteLinkEnabled }
}`;

const SIGN_UP_IN_WORKSPACE = `mutation QaSignUp($email: String!, $password: String!, $workspaceId: UUID!, $workspaceInviteHash: String!) {
  signUpInWorkspace(email: $email, password: $password, workspaceId: $workspaceId, workspaceInviteHash: $workspaceInviteHash) {
    loginToken { token }
  }
}`;

const MEMBER_QUERY = `query QaMember {
  currentUser { id workspaceMember { id colorScheme locale } }
}`;

const UPDATE_SETTINGS = `mutation QaPrefs($input: UpdateWorkspaceMemberSettingsInput!) {
  updateWorkspaceMemberSettings(input: $input)
}`;

const DELETE_USER = `mutation QaDeleteUser { deleteUser { id } }`;

const COUNT_MEMBERS = `query QaMembers($filter: WorkspaceMemberFilterInput) {
  workspaceMembers(filter: $filter) { totalCount }
}`;

export async function provisionQaMember(
  admin: TwentyPinnedApiSession,
  browser: Browser,
  email: string,
  password: string,
): Promise<TwentyQaMember> {
  const { baseUrl } = loadTwentyConfig();
  const invite = await admin.query<{
    currentWorkspace?: {
      id: string;
      inviteHash?: string | null;
      isPublicInviteLinkEnabled?: boolean | null;
    } | null;
  }>(TWENTY_ROUTES.metadata, INVITE_QUERY);
  const workspace = invite.currentWorkspace;
  if (
    workspace?.isPublicInviteLinkEnabled !== true ||
    workspace.inviteHash === undefined ||
    workspace.inviteHash === null
  ) {
    // Fallback (Jane plus a restore guard) needs approval; never switch silently.
    throw new Error("Twenty public invite link is disabled; QA member cannot be provisioned");
  }
  const signUp = await twentyGraphql<{
    signUpInWorkspace?: { loginToken?: { token?: string | null } | null } | null;
  }>(TWENTY_ROUTES.metadata, {
    query: SIGN_UP_IN_WORKSPACE,
    variables: {
      email,
      password,
      workspaceId: workspace.id,
      workspaceInviteHash: workspace.inviteHash,
    },
  });
  const loginToken = signUp.signUpInWorkspace?.loginToken?.token;
  if (loginToken === undefined || loginToken === null || loginToken === "") {
    throw new Error("Twenty signUpInWorkspace returned no loginToken");
  }
  const accessToken = await exchangeWorkspaceAccess(loginToken, baseUrl);
  const authorization = `Bearer ${accessToken}`;

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "p1-tw-qa-"));
  const storageStatePath = path.join(stateDir, "state.json");
  // The /welcome textbox occasionally did not render on the first load; one retry in a fresh context.
  for (let attempt = 1; ; attempt += 1) {
    const context = await browser.newContext({ baseURL: baseUrl });
    try {
      const page = await context.newPage();
      const login = new TwentyLoginPage(page);
      await login.goto();
      await login.signIn(email, password);
      await expect(page).toHaveURL(/\/create\/profile/, { timeout: twentyTimeouts().navigation });
      await page.getByPlaceholder("Tim").fill(QA_MEMBER_NAME.firstName);
      await page.getByPlaceholder("Apple").fill(QA_MEMBER_NAME.lastName);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page).toHaveURL(/\/objects\//, { timeout: twentyTimeouts().navigation });
      await context.storageState({ path: storageStatePath });
      break;
    } catch (error) {
      if (attempt >= 2) {
        // signUpInWorkspace already created the user; the fixture teardown never sees it.
        await twentyGraphql(TWENTY_ROUTES.metadata, { authorization, query: DELETE_USER }).catch(
          () => undefined,
        );
        await rm(stateDir, { recursive: true, force: true });
        throw error;
      }
    } finally {
      await context.close();
    }
  }

  const me = await twentyGraphql<{
    currentUser?: { workspaceMember?: { id: string } | null } | null;
  }>(TWENTY_ROUTES.metadata, { authorization, query: MEMBER_QUERY });
  const memberId = me.currentUser?.workspaceMember?.id;
  if (memberId === undefined) {
    await twentyGraphql(TWENTY_ROUTES.metadata, { authorization, query: DELETE_USER }).catch(
      () => undefined,
    );
    await rm(stateDir, { recursive: true, force: true });
    throw new Error("QA member has no workspace member after onboarding");
  }
  return { email, memberId, workspaceId: workspace.id, storageStatePath, authorization };
}

export async function setQaMemberPrefs(member: TwentyQaMember, prefs: MemberPrefs): Promise<void> {
  const update: Record<string, string> = {};
  if (prefs.colorScheme !== undefined) update.colorScheme = prefs.colorScheme;
  if (prefs.locale !== undefined) update.locale = prefs.locale;
  if (Object.keys(update).length === 0) return;
  const result = await twentyGraphql<{ updateWorkspaceMemberSettings?: boolean | null }>(
    TWENTY_ROUTES.metadata,
    {
      authorization: member.authorization,
      query: UPDATE_SETTINGS,
      variables: { input: { workspaceMemberId: member.memberId, update } },
    },
  );
  if (result.updateWorkspaceMemberSettings !== true) {
    throw new Error("updateWorkspaceMemberSettings did not return true");
  }
  const back = await twentyGraphql<{
    currentUser?: { workspaceMember?: { colorScheme?: string; locale?: string } | null } | null;
  }>(TWENTY_ROUTES.metadata, { authorization: member.authorization, query: MEMBER_QUERY });
  const stored = back.currentUser?.workspaceMember;
  for (const [key, value] of Object.entries(update)) {
    const actual = stored?.[key as "colorScheme" | "locale"];
    if (actual !== value) {
      throw new Error(`QA member ${key} read back "${String(actual)}", expected "${value}"`);
    }
  }
}

export async function deleteQaMember(member: TwentyQaMember): Promise<void> {
  try {
    await twentyGraphql(TWENTY_ROUTES.metadata, {
      authorization: member.authorization,
      query: DELETE_USER,
    });
  } finally {
    // The state holds a live session cookie and must not leak into artifacts.
    await rm(path.dirname(member.storageStatePath), { recursive: true, force: true });
  }
}

export async function countQaMembers(admin: TwentyPinnedApiSession): Promise<number> {
  const data = await admin.query<{ workspaceMembers?: { totalCount?: number } | null }>(
    TWENTY_ROUTES.graphql,
    COUNT_MEMBERS,
    { filter: { userEmail: { like: "p1-qa-%" } } },
  );
  return data.workspaceMembers?.totalCount ?? 0;
}

/** Adapter so the existing record helpers (createCompany, createPerson, destroy*) run as the QA member. */
export function memberApi(member: TwentyQaMember): TwentyPinnedApiSession {
  return {
    workspaceId: member.workspaceId,
    memberId: member.memberId,
    authorizationHeader: member.authorization,
    query: <T>(
      path: TwentyGraphqlPath,
      document: string,
      variables?: Record<string, unknown>,
    ): Promise<T> =>
      twentyGraphql<T>(path, {
        authorization: member.authorization,
        query: document,
        ...(variables === undefined ? {} : { variables }),
      }),
  };
}
