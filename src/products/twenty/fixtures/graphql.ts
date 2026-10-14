import { loadTwentyConfig, TWENTY_ROUTES } from "../env.js";

export type TwentyGraphqlPath = typeof TWENTY_ROUTES.graphql | typeof TWENTY_ROUTES.metadata;

export interface TwentyGraphqlErrorDetail {
  readonly message: string;
  readonly code?: string;
  readonly subCode?: string;
}

export class TwentyGraphqlError extends Error {
  readonly httpStatus: number;
  readonly details: readonly TwentyGraphqlErrorDetail[];

  constructor(
    message: string,
    httpStatus: number,
    details: readonly TwentyGraphqlErrorDetail[] = [],
  ) {
    super(message);
    this.name = "TwentyGraphqlError";
    this.httpStatus = httpStatus;
    this.details = details;
  }

  hasCode(code: string): boolean {
    return this.details.some((detail) => detail.code === code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readGraphqlErrors(body: Record<string, unknown>): TwentyGraphqlErrorDetail[] {
  const raw = body.errors;
  if (!Array.isArray(raw)) {
    return [];
  }
  const details: TwentyGraphqlErrorDetail[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.message !== "string") {
      continue;
    }
    const extensions = isRecord(entry.extensions) ? entry.extensions : undefined;
    const code = typeof extensions?.code === "string" ? extensions.code : undefined;
    const subCode = typeof extensions?.subCode === "string" ? extensions.subCode : undefined;
    details.push({
      message: entry.message,
      ...(code === undefined ? {} : { code }),
      ...(subCode === undefined ? {} : { subCode }),
    });
  }
  return details;
}

function topLevelGraphqlFailure(body: Record<string, unknown>): string | undefined {
  if (body.data !== undefined) {
    return undefined;
  }
  if (typeof body.message === "string" && body.message.trim() !== "") {
    return body.message;
  }
  return undefined;
}

export interface TwentyGraphqlOptions {
  readonly authorization?: string;
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

export async function twentyGraphql<T>(
  path: TwentyGraphqlPath,
  options: TwentyGraphqlOptions,
): Promise<T> {
  const { baseUrl } = loadTwentyConfig();
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.authorization !== undefined) {
    headers.Authorization = options.authorization;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: options.query, variables: options.variables ?? {} }),
  });

  const bodyUnknown: unknown = await response.json();
  if (!isRecord(bodyUnknown)) {
    throw new TwentyGraphqlError(
      `Twenty GraphQL response was not an object (HTTP ${String(response.status)})`,
      response.status,
    );
  }

  const topLevelMessage = topLevelGraphqlFailure(bodyUnknown);
  if (topLevelMessage !== undefined) {
    throw new TwentyGraphqlError(
      `Twenty GraphQL failed (HTTP ${String(response.status)}): ${topLevelMessage}`,
      response.status,
    );
  }

  const errors = readGraphqlErrors(bodyUnknown);
  if (errors.length > 0) {
    const summary = errors
      .map((error) => {
        const parts = [error.message];
        if (error.code !== undefined) {
          parts.push(`code=${error.code}`);
        }
        if (error.subCode !== undefined) {
          parts.push(`subCode=${error.subCode}`);
        }
        return parts.join(" ");
      })
      .join("; ");
    throw new TwentyGraphqlError(
      `Twenty GraphQL errors (HTTP ${String(response.status)}): ${summary}`,
      response.status,
      errors,
    );
  }

  if (!("data" in bodyUnknown)) {
    throw new TwentyGraphqlError(
      `Twenty GraphQL response missing data (HTTP ${String(response.status)})`,
      response.status,
    );
  }

  return bodyUnknown.data as T;
}
