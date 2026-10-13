import type { Page } from "@playwright/test";

let browserTrpcCallsThisTest = 0;
let browserTrpcCallsWorkerTotal = 0;

export function resetFwBrowserTrpcThisTest(): void {
  browserTrpcCallsThisTest = 0;
}

export function attachFwBrowserTrpcCounter(page: Page): void {
  page.on("response", (response) => {
    if (response.url().includes("/api/trpc")) {
      browserTrpcCallsThisTest += 1;
    }
  });
}

export function flushFwBrowserTrpcThisTest(): void {
  browserTrpcCallsWorkerTotal += browserTrpcCallsThisTest;
  browserTrpcCallsThisTest = 0;
}

export function logFwBrowserTrpcBudget(): void {
  console.log(`P1_DOC_FW_TRPC_BUDGET browser=${String(browserTrpcCallsWorkerTotal)}`);
}
