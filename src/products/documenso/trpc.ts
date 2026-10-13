export const DOCUMENSO_TRPC_PASSKEY_CREATE_PROCEDURE = "auth.passkey.create" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the URL targets the `auth.passkey.create` procedure (not createRegistrationOptions). */
export function isDocumensoPasskeyCreateTrpcUrl(url: string): boolean {
  const parsed = new URL(url);
  const procedureSegment = parsed.pathname.split("/").pop() ?? "";
  return procedureSegment
    .split(",")
    .some((part) => part === DOCUMENSO_TRPC_PASSKEY_CREATE_PROCEDURE);
}

function findTrpcProcedurePath(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const data = payload.data;
  if (isRecord(data) && typeof data.path === "string") {
    return data.path;
  }
  if (typeof payload.path === "string") {
    return payload.path;
  }
  const json = payload.json;
  if (json !== undefined) {
    const fromJson = findTrpcProcedurePath(json);
    if (fromJson !== undefined) {
      return fromJson;
    }
  }
  for (const value of Object.values(payload)) {
    const nested = findTrpcProcedurePath(value);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function findTrpcAppErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const data = payload.data;
  if (isRecord(data) && typeof data.code === "string") {
    return data.code;
  }
  const json = payload.json;
  if (json !== undefined) {
    const fromJson = findTrpcAppErrorCode(json);
    if (fromJson !== undefined) {
      return fromJson;
    }
  }
  for (const value of Object.values(payload)) {
    const nested = findTrpcAppErrorCode(value);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

export interface DocumensoTrpcHttpParseResult {
  readonly procedurePath: string | undefined;
  readonly appErrorCode: string | undefined;
}

export function parseDocumensoTrpcHttpBody(bodyText: string): DocumensoTrpcHttpParseResult {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    return { procedurePath: undefined, appErrorCode: undefined };
  }
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const path = findTrpcProcedurePath(entry);
      const code = findTrpcAppErrorCode(entry);
      if (path !== undefined || code !== undefined) {
        return { procedurePath: path, appErrorCode: code };
      }
    }
    return { procedurePath: undefined, appErrorCode: undefined };
  }
  return {
    procedurePath: findTrpcProcedurePath(payload),
    appErrorCode: findTrpcAppErrorCode(payload),
  };
}
