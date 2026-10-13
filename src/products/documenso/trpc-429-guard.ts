import type { Page } from "@playwright/test";

/**
 * Fail the test immediately when Documenso returns HTTP 429 on any browser tRPC call.
 */
export function attachDocumensoTrpc429Guard(page: Page): void {
  page.on("response", (response) => {
    if (response.status() !== 429) {
      return;
    }
    const url = response.url();
    if (!url.includes("/api/trpc/")) {
      return;
    }
    throw new Error(`Documenso tRPC rate limited (429): ${url}`);
  });
}
