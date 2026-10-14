import fs from "node:fs";
import { loadTwentyConfig, TWENTY_ROUTES } from "../env.js";
import { TwentyGraphqlError, twentyGraphql, type TwentyGraphqlPath } from "./graphql.js";

const SIGN_IN_MUTATION = `mutation SignIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    tokens {
      accessOrWorkspaceAgnosticToken { token expiresAt }
      refreshToken { token expiresAt }
    }
    availableWorkspaces {
      availableWorkspacesForSignIn { id displayName loginToken workspaceUrls { subdomainUrl customUrl } }
    }
  }
}`;

const EXCHANGE_LOGIN_TOKEN_MUTATION = `mutation GetAuthTokensFromLoginToken($loginToken: String!, $origin: String!) {
  getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
    tokens {
      accessOrWorkspaceAgnosticToken { token expiresAt }
      refreshToken { token expiresAt }
    }
  }
}`;

const CURRENT_USER_QUERY = `query CurrentUser {
  currentUser {
    id
    email
    currentWorkspace { id displayName }
    currentUserWorkspace { id userId }
    workspaceMember { id timeZone }
  }
}`;

export interface UiWorkspaceIds {
  readonly workspaceId: string;
  readonly memberId: string;
}

export interface TwentyWorkspaceForSignIn {
  readonly id: string;
  readonly displayName?: string | null;
  readonly loginToken?: string | null;
  readonly workspaceUrls?: {
    readonly subdomainUrl?: string | null;
    readonly customUrl?: string | null;
  } | null;
}

export interface SignInJaneResult {
  readonly workspaces: readonly TwentyWorkspaceForSignIn[];
}

export interface CurrentUserSnapshot {
  readonly id: string;
  readonly email: string;
  readonly currentWorkspace: { readonly id: string; readonly displayName?: string | null } | null;
  readonly workspaceMember: { readonly id: string; readonly timeZone?: string | null } | null;
}

export interface TwentyPinnedApiSession {
  readonly workspaceId: string;
  readonly memberId: string;
  readonly authorizationHeader: string;
  query<T>(
    path: TwentyGraphqlPath,
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readJsonStorageValue(raw: string, key: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`localStorage ${key} was not a JSON object`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse localStorage ${key}`, { cause: error });
  }
}

export function loadUiWorkspaceIds(authStatePath: string): UiWorkspaceIds {
  const raw = fs.readFileSync(authStatePath, "utf8");
  const state = JSON.parse(raw) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  const entries = state.origins?.flatMap((origin) => origin.localStorage ?? []) ?? [];
  const workspaceEntry = entries.find((entry) => entry.name === "currentWorkspaceState");
  const memberEntry = entries.find((entry) => entry.name === "currentWorkspaceMemberState");
  if (workspaceEntry === undefined) {
    throw new Error("Twenty storageState missing localStorage key currentWorkspaceState");
  }
  if (memberEntry === undefined) {
    throw new Error("Twenty storageState missing localStorage key currentWorkspaceMemberState");
  }
  const workspace = readJsonStorageValue(workspaceEntry.value, "currentWorkspaceState");
  const member = readJsonStorageValue(memberEntry.value, "currentWorkspaceMemberState");
  const workspaceId = workspace.id;
  const memberId = member.id;
  if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
    throw new Error("Twenty storageState currentWorkspaceState.id is missing");
  }
  if (typeof memberId !== "string" || memberId.trim() === "") {
    throw new Error("Twenty storageState currentWorkspaceMemberState.id is missing");
  }
  return { workspaceId, memberId };
}

function selectWorkspaceOrigin(workspace: TwentyWorkspaceForSignIn, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const subdomain = workspace.workspaceUrls?.subdomainUrl?.trim();
  if (subdomain) {
    return subdomain.replace(/\/$/, "");
  }
  const custom = workspace.workspaceUrls?.customUrl?.trim();
  if (custom) {
    return custom.replace(/\/$/, "");
  }
  return base;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Twenty access token is not a JWT");
  }
  const segment = parts[1];
  if (segment === undefined) {
    throw new Error("Twenty access token JWT payload segment missing");
  }
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const json = Buffer.from(padded, "base64").toString("utf8");
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Twenty JWT payload was not an object");
  }
  return parsed;
}

export function assertPinnedWorkspaceAccess(params: {
  readonly accessToken: string;
  readonly uiWorkspaceId: string;
  readonly uiMemberId: string;
  readonly currentUser: CurrentUserSnapshot;
}): void {
  const payload = decodeJwtPayload(params.accessToken);
  const type = payload.type;
  const jwtWorkspaceId = payload.workspaceId;
  const jwtMemberId = payload.workspaceMemberId;
  const apiWorkspaceId = params.currentUser.currentWorkspace?.id ?? null;
  const apiMemberId = params.currentUser.workspaceMember?.id ?? null;

  if (type !== "ACCESS") {
    throw new Error(
      `Twenty ACCESS token guard failed: jwt.type=${String(type)} uiWorkspaceId=${params.uiWorkspaceId} uiMemberId=${params.uiMemberId}`,
    );
  }
  if (typeof jwtWorkspaceId !== "string" || jwtWorkspaceId !== params.uiWorkspaceId) {
    throw new Error(
      `Twenty workspace pin failed: uiWorkspaceId=${params.uiWorkspaceId} jwtWorkspaceId=${String(jwtWorkspaceId)} apiWorkspaceId=${String(apiWorkspaceId)}`,
    );
  }
  if (apiWorkspaceId !== params.uiWorkspaceId) {
    throw new Error(
      `Twenty workspace pin failed: uiWorkspaceId=${params.uiWorkspaceId} jwtWorkspaceId=${jwtWorkspaceId} apiWorkspaceId=${String(apiWorkspaceId)}`,
    );
  }
  if (typeof jwtMemberId !== "string" || jwtMemberId !== params.uiMemberId) {
    throw new Error(
      `Twenty member pin failed: uiMemberId=${params.uiMemberId} jwtMemberId=${String(jwtMemberId)} apiMemberId=${String(apiMemberId)}`,
    );
  }
  if (apiMemberId !== params.uiMemberId) {
    throw new Error(
      `Twenty member pin failed: uiMemberId=${params.uiMemberId} jwtMemberId=${jwtMemberId} apiMemberId=${String(apiMemberId)}`,
    );
  }
}

export async function signInJane(): Promise<SignInJaneResult> {
  const { email, password } = loadTwentyConfig();
  const data = await twentyGraphql<{
    signIn?: {
      availableWorkspaces?: {
        availableWorkspacesForSignIn?: Array<TwentyWorkspaceForSignIn | null> | null;
      } | null;
    } | null;
  }>(TWENTY_ROUTES.metadata, {
    query: SIGN_IN_MUTATION,
    variables: { email, password },
  });
  const workspaces = data.signIn?.availableWorkspaces?.availableWorkspacesForSignIn ?? [];
  const normalized: TwentyWorkspaceForSignIn[] = [];
  for (const workspace of workspaces) {
    if (workspace === null) {
      continue;
    }
    if (typeof workspace.id !== "string") {
      continue;
    }
    normalized.push(workspace);
  }
  return { workspaces: normalized };
}

export async function exchangeWorkspaceAccess(loginToken: string, origin: string): Promise<string> {
  const data = await twentyGraphql<{
    getAuthTokensFromLoginToken?: {
      tokens?: { accessOrWorkspaceAgnosticToken?: { token?: string | null } | null } | null;
    } | null;
  }>(TWENTY_ROUTES.metadata, {
    query: EXCHANGE_LOGIN_TOKEN_MUTATION,
    variables: { loginToken, origin },
  });
  const token =
    data.getAuthTokensFromLoginToken?.tokens?.accessOrWorkspaceAgnosticToken?.token?.trim();
  if (token === undefined || token === "") {
    throw new Error("Twenty getAuthTokensFromLoginToken returned no access token");
  }
  return token;
}

function findPinnedWorkspace(
  workspaces: readonly TwentyWorkspaceForSignIn[],
  uiWorkspaceId: string,
): TwentyWorkspaceForSignIn {
  const match = workspaces.find((workspace) => workspace.id === uiWorkspaceId);
  if (match === undefined) {
    const available = workspaces.map((workspace) => workspace.id).join(", ");
    throw new Error(
      `Twenty signIn has no workspace for uiWorkspaceId=${uiWorkspaceId}; available ids: ${available === "" ? "(none)" : available}`,
    );
  }
  const loginToken = match.loginToken?.trim();
  if (loginToken === undefined || loginToken === "") {
    throw new Error(
      `Twenty workspace uiWorkspaceId=${uiWorkspaceId} has no loginToken for exchange`,
    );
  }
  return match;
}

async function fetchCurrentUser(authorizationHeader: string): Promise<CurrentUserSnapshot> {
  const data = await twentyGraphql<{ currentUser?: CurrentUserSnapshot | null }>(
    TWENTY_ROUTES.metadata,
    {
      authorization: authorizationHeader,
      query: CURRENT_USER_QUERY,
    },
  );
  const user = data.currentUser;
  if (user === null || user === undefined) {
    throw new Error("Twenty currentUser query returned no user");
  }
  return user;
}

async function mintPinnedAccessToken(
  uiWorkspaceId: string,
  uiMemberId: string,
): Promise<{ accessToken: string; currentUser: CurrentUserSnapshot }> {
  const { baseUrl } = loadTwentyConfig();
  const signIn = await signInJane();
  const pinned = findPinnedWorkspace(signIn.workspaces, uiWorkspaceId);
  const origin = selectWorkspaceOrigin(pinned, baseUrl);
  const accessToken = await exchangeWorkspaceAccess(pinned.loginToken ?? "", origin);
  const authorizationHeader = `Bearer ${accessToken}`;
  const currentUser = await fetchCurrentUser(authorizationHeader);
  assertPinnedWorkspaceAccess({
    accessToken,
    uiWorkspaceId,
    uiMemberId,
    currentUser,
  });
  return { accessToken, currentUser };
}

export async function createPinnedTwentyApiSession(
  uiWorkspaceId: string,
  uiMemberId: string,
): Promise<TwentyPinnedApiSession> {
  let accessToken = "";
  let hasReExchanged = false;

  const refreshAccess = async (): Promise<void> => {
    const minted = await mintPinnedAccessToken(uiWorkspaceId, uiMemberId);
    accessToken = minted.accessToken;
  };

  await refreshAccess();

  const query = async <T>(
    path: TwentyGraphqlPath,
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<T> => {
    const run = async (): Promise<T> => {
      const options =
        variables === undefined
          ? { authorization: `Bearer ${accessToken}`, query: document }
          : { authorization: `Bearer ${accessToken}`, query: document, variables };
      return twentyGraphql<T>(path, options);
    };
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof TwentyGraphqlError) || !error.hasCode("UNAUTHENTICATED")) {
        throw error;
      }
      if (hasReExchanged) {
        throw error;
      }
      hasReExchanged = true;
      await refreshAccess();
      return await run();
    }
  };

  return {
    workspaceId: uiWorkspaceId,
    memberId: uiMemberId,
    get authorizationHeader(): string {
      return `Bearer ${accessToken}`;
    },
    query,
  };
}
