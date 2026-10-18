import type { Browser, Page } from "@playwright/test";
import { loadTwentyConfig } from "../env.js";

export interface MemberPage {
  readonly page: Page;
  close(): Promise<void>;
}

/**
 * A page in its own browser context signed in as the member whose state file is given.
 * The path is required on purpose: a context without it would be signed out, and reusing the
 * default context's state would silently make two "users" the same user.
 */
export async function openMemberPage(
  browser: Browser,
  storageStatePath: string,
): Promise<MemberPage> {
  const context = await browser.newContext({
    baseURL: loadTwentyConfig().baseUrl,
    storageState: storageStatePath,
  });
  return { page: await context.newPage(), close: () => context.close() };
}
