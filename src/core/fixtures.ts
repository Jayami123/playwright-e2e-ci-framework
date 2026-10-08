import { expect, type Page } from "@playwright/test";

export interface ConsoleGuard {
  readonly errors: readonly string[];
}

export async function attachConsoleGuard(
  page: Page,
  allowlist: readonly string[],
  use: (guard: ConsoleGuard) => Promise<void>,
): Promise<void> {
  const errors: string[] = [];
  const extra = (process.env.P1_CONSOLE_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = [...allowlist, ...extra];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    if (allowed.some((pattern) => text.includes(pattern))) {
      return;
    }
    errors.push(`console.error: ${text}`);
  });

  await use({ errors });
  expect(errors, errors.join("\n")).toEqual([]);
}
