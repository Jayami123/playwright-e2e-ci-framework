import { readFileSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";
import type { DocumensoSigningRecipient } from "./factories.js";
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

const FW_EXAMPLE_SIGNATURE_FIELD = {
  type: "SIGNATURE",
  page: 1,
  positionX: 20,
  positionY: 20,
  width: 25,
  height: 5,
  fieldMeta: { type: "signature" },
} as const;

function readTrpcJsonId(bodyText: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error("tRPC response was not JSON");
  }
  if (!isRecord(payload)) {
    throw new Error("tRPC response JSON was not an object");
  }
  const result = payload.result;
  if (!isRecord(result)) {
    throw new Error("tRPC response missing result");
  }
  const data = result.data;
  if (!isRecord(data)) {
    throw new Error("tRPC response missing result.data");
  }
  const json = data.json;
  if (!isRecord(json)) {
    throw new Error("tRPC response missing result.data.json");
  }
  const id = json.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`tRPC response missing envelope id: ${bodyText}`);
  }
  return id;
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

export async function createAndDistributePendingEnvelopeViaTrpc(
  http: APIRequestContext,
  teamId: number,
  recipient: DocumensoSigningRecipient,
  pdfPath: string,
): Promise<{ readonly envelopeId: string }> {
  const pdf = readFileSync(pdfPath);
  const payload = {
    title: "example.pdf",
    type: "DOCUMENT",
    recipients: [
      {
        email: recipient.email,
        name: recipient.name,
        role: "SIGNER",
        fields: [FW_EXAMPLE_SIGNATURE_FIELD],
      },
    ],
  };
  const createResponse = await http.post("/api/trpc/envelope.create", {
    headers: trpcTeamHeaders(teamId),
    multipart: {
      payload: JSON.stringify(payload),
      files: {
        name: "files",
        mimeType: "application/pdf",
        buffer: pdf,
      },
    },
    timeout: documensoTimeouts().request,
  });
  const createBody = await createResponse.text();
  if (!createResponse.ok()) {
    throw new Error(`envelope.create HTTP ${String(createResponse.status())}: ${createBody}`);
  }
  const envelopeId = readTrpcJsonId(createBody);
  const distribute = await postTrpc(http, "envelope.distribute", { envelopeId }, teamId);
  if (!distribute.httpStatus.toString().startsWith("2")) {
    throw new Error(
      `envelope.distribute HTTP ${String(distribute.httpStatus)}: ${distribute.bodyText}`,
    );
  }
  return { envelopeId };
}

export function parseEnvelopeIdFromEditorUrl(url: string): string {
  const match = /\/documents\/([^/]+)\/edit/.exec(url);
  const envelopeId = match?.[1];
  if (envelopeId === undefined || envelopeId.length === 0) {
    throw new Error(`Editor URL did not include envelope id: ${url}`);
  }
  return envelopeId;
}
