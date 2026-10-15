import type { APIRequestContext, Browser } from "@playwright/test";
import { loginCalWithCredentials } from "./auth.js";
import { loadConfig, timeouts } from "./env.js";
import { qaCalUser } from "./factories.js";
import { createCalQaUser, readUserTheme, teardownCalQaUserById } from "./qa-user.js";
import { CAL_ROUTES } from "./routes.js";

export const QA_BOOKER_EVENT = {
  slug: "qa-booker-30",
  title: "QA booker 30min",
  length: 30,
} as const;
/** Step 0: shares pro's display-name prefix on purpose (username and name are separate fields). */
export const LONG_NAME =
  "Pro Example Longname-Truncation-Check Longname-Truncation-Check Longname-Truncat"; // 80 chars
/** Exactly 120 chars (118 + "xx", measured with node); unit test 6 asserts the length. */
export const LONG_TITLE =
  "Quarterly planning session with stakeholders across regions and time zones and a long agenda for the coming quarter okxx";
export const DARK_NAME = "QA Dark Theme";
export const BOOKING_NAME = "QA Booking";

export function trpcPath(procedure: string): string {
  return `/api/trpc/${procedure}?batch=1`;
}

export function trpcBatchBody(input: unknown): { readonly "0": { readonly json: unknown } } {
  return { "0": { json: input } };
}

/** Step 0 shape: [{ result: { data: { json: { eventType: { id, slug } } } } }]. */
export function parseTrpcEventType(payload: unknown): {
  readonly id: number;
  readonly slug: string;
} {
  const first = Array.isArray(payload)
    ? (payload[0] as Record<string, unknown> | undefined)
    : undefined;
  if (first?.error !== undefined) {
    throw new Error(
      `tRPC eventTypesHeavy/create error: ${JSON.stringify(first.error).slice(0, 300)}`,
    );
  }
  const result = first?.result as Record<string, unknown> | undefined;
  const data = result?.data as Record<string, unknown> | undefined;
  const json = data?.json as Record<string, unknown> | undefined;
  const eventType = json?.eventType as Record<string, unknown> | undefined;
  const id = eventType?.id;
  const slug = eventType?.slug;
  if (typeof id !== "number" || typeof slug !== "string") {
    throw new Error("tRPC eventTypesHeavy/create response has no eventType.id/slug");
  }
  return { id, slug };
}

async function postTrpc(
  http: APIRequestContext,
  procedure: string,
  input: unknown,
): Promise<unknown> {
  const response = await http.post(trpcPath(procedure), {
    data: trpcBatchBody(input),
    headers: { "Content-Type": "application/json" },
    timeout: timeouts().csrf,
  });
  const payload: unknown = await response.json();
  if (!response.ok()) {
    throw new Error(`tRPC ${procedure} HTTP ${String(response.status())}`, { cause: payload });
  }
  return payload;
}

export interface BookerQaUser {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly eventTitle: string;
  readonly bookerPath: string;
}

export interface BookerQaOptions {
  readonly name: string;
  readonly title: string;
  readonly theme?: "dark";
}

/** DB insert (existing helper), then API login, then tRPC theme and event. Never touches pro. */
export async function provisionBookerQaUser(
  browser: Browser,
  parallelIndex: number,
  opts: BookerQaOptions,
): Promise<BookerQaUser> {
  const identity = { ...qaCalUser(parallelIndex), name: opts.name };
  const created = await createCalQaUser(identity);
  try {
    const context = await browser.newContext({ baseURL: loadConfig().baseUrl });
    try {
      const page = await context.newPage();
      await loginCalWithCredentials(page, created.email, identity.password);
      if (opts.theme !== undefined) {
        await postTrpc(page.request, CAL_ROUTES.trpcUpdateProfile, { theme: opts.theme });
        const stored = await readUserTheme(created.id);
        if (stored !== opts.theme) {
          throw new Error(`theme not stored: expected ${opts.theme}, got ${String(stored)}`);
        }
      }
      const event = parseTrpcEventType(
        await postTrpc(page.request, CAL_ROUTES.eventTypesHeavyCreate, {
          title: opts.title,
          slug: QA_BOOKER_EVENT.slug,
          length: QA_BOOKER_EVENT.length,
          description: "",
        }),
      );
      return {
        id: created.id,
        username: created.username,
        name: opts.name,
        eventTitle: opts.title,
        bookerPath: CAL_ROUTES.publicBooker(created.username, event.slug),
      };
    } finally {
      await context.close();
    }
  } catch (error) {
    await teardownCalQaUserById(created.id);
    throw error;
  }
}
