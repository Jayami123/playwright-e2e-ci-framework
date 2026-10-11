import type { APIRequestContext } from "@playwright/test";
import { documensoTimeouts } from "./env.js";
import { parseDocumensoTrpcHttpBody } from "./trpc.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trpcTeamHeaders(teamId: number): Record<string, string> {
  return { "x-team-id": String(teamId) };
}

function trpcPostBody(input: Record<string, unknown>): { json: Record<string, unknown> } {
  return { json: input };
}

function readTrpcMutationResultStatus(bodyText: string): string | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(payload)) {
    return undefined;
  }
  const result = payload.result;
  if (!isRecord(result)) {
    return undefined;
  }
  const data = result.data;
  if (!isRecord(data)) {
    return undefined;
  }
  const json = data.json;
  if (!isRecord(json)) {
    return undefined;
  }
  const status = json.status;
  return typeof status === "string" ? status : undefined;
}

export interface DocumensoTrpcCallResult {
  readonly httpStatus: number;
  readonly bodyText: string;
  readonly procedurePath: string | undefined;
  readonly appErrorCode: string | undefined;
  readonly resultStatus: string | undefined;
}

async function postTrpc(
  http: APIRequestContext,
  procedure: string,
  input: Record<string, unknown>,
  teamId?: number,
): Promise<DocumensoTrpcCallResult> {
  const headers = teamId === undefined ? {} : trpcTeamHeaders(teamId);
  const response = await http.post(`/api/trpc/${procedure}`, {
    data: trpcPostBody(input),
    headers,
    timeout: documensoTimeouts().request,
  });
  const bodyText = await response.text();
  const parsed = parseDocumensoTrpcHttpBody(bodyText);
  return {
    httpStatus: response.status(),
    bodyText,
    procedurePath: parsed.procedurePath,
    appErrorCode: parsed.appErrorCode,
    resultStatus: readTrpcMutationResultStatus(bodyText),
  };
}

async function getTrpc(
  http: APIRequestContext,
  procedure: string,
  input: Record<string, unknown>,
  teamId?: number,
): Promise<DocumensoTrpcCallResult> {
  const encoded = encodeURIComponent(JSON.stringify(trpcPostBody(input)));
  const headers = teamId === undefined ? {} : trpcTeamHeaders(teamId);
  const response = await http.get(`/api/trpc/${procedure}?input=${encoded}`, {
    headers,
    timeout: documensoTimeouts().request,
  });
  const bodyText = await response.text();
  const parsed = parseDocumensoTrpcHttpBody(bodyText);
  return {
    httpStatus: response.status(),
    bodyText,
    procedurePath: parsed.procedurePath,
    appErrorCode: parsed.appErrorCode,
    resultStatus: readTrpcMutationResultStatus(bodyText),
  };
}

export async function getEnvelopeViaTrpc(
  http: APIRequestContext,
  teamId: number,
  envelopeId: string,
): Promise<DocumensoTrpcCallResult> {
  return getTrpc(http, "envelope.get", { envelopeId }, teamId);
}

export async function readEnvelopeStatusViaTrpc(
  http: APIRequestContext,
  teamId: number,
  envelopeId: string,
): Promise<string | undefined> {
  const result = await getEnvelopeViaTrpc(http, teamId, envelopeId);
  if (!result.httpStatus.toString().startsWith("2")) {
    return undefined;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(result.bodyText) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(payload)) {
    return undefined;
  }
  const resultNode = payload.result;
  if (!isRecord(resultNode)) {
    return undefined;
  }
  const data = resultNode.data;
  if (!isRecord(data)) {
    return undefined;
  }
  const json = data.json;
  if (!isRecord(json)) {
    return undefined;
  }
  const status = json.status;
  return typeof status === "string" ? status : undefined;
}

export async function completeDocumentWithTokenViaTrpc(
  http: APIRequestContext,
  input: { readonly token: string; readonly documentId: number },
): Promise<DocumensoTrpcCallResult> {
  return postTrpc(http, "recipient.completeDocumentWithToken", input);
}

export async function signEnvelopeFieldViaTrpc(
  http: APIRequestContext,
  input: {
    readonly token: string;
    readonly fieldId: number;
    readonly typedSignature: string;
  },
): Promise<DocumensoTrpcCallResult> {
  return postTrpc(http, "envelope.field.sign", {
    token: input.token,
    fieldId: input.fieldId,
    fieldValue: { type: "SIGNATURE", value: input.typedSignature },
  });
}

export async function deleteEnvelopeViaTrpc(
  http: APIRequestContext,
  teamId: number,
  envelopeId: string,
): Promise<DocumensoTrpcCallResult> {
  return postTrpc(http, "envelope.delete", { envelopeId }, teamId);
}

export async function cancelEnvelopeViaTrpc(
  http: APIRequestContext,
  teamId: number,
  envelopeId: string,
  reason: string,
): Promise<DocumensoTrpcCallResult> {
  return postTrpc(http, "envelope.cancel", { envelopeId, reason }, teamId);
}

export function parseEnvelopeIdFromEditorUrl(url: string): string {
  const match = /\/documents\/([^/]+)\/edit/.exec(url);
  const envelopeId = match?.[1];
  if (envelopeId === undefined || envelopeId.length === 0) {
    throw new Error(`Editor URL did not include envelope id: ${url}`);
  }
  return envelopeId;
}
