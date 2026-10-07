import { expect, test as base } from "@playwright/test";

export interface ConsoleGuard {
  errors: string[];
}

/**
 * Opt-in: add `{ consoleGuard }` to a test's args.
 * Extra patterns: `P1_CONSOLE_ALLOWLIST` (comma-separated).
 * React 19 `element.ref` is a documented Cal.diy / React 19 console.error, not a page crash.
 */
const DOCUMENTED_CAL_CONSOLE = ["Accessing element.ref was removed in React 19"];

export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: async ({ page }, use) => {
    const errors: string[] = [];
    const allowlist = [
      ...DOCUMENTED_CAL_CONSOLE,
      ...(process.env.P1_CONSOLE_ALLOWLIST ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ];

    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${error.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (allowlist.some((allowed) => text.includes(allowed))) return;
      errors.push(`console.error: ${text}`);
    });

    await use({ errors });
    expect(errors, errors.join("\n")).toEqual([]);
  },
});

export { expect };
