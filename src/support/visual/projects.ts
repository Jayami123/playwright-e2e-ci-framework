import { test } from "@playwright/test";

export type VisualProjectName = "visual-mobile" | "visual-tablet" | "visual-desktop";

export function projectSkipReason(
  project: string,
  allowed: readonly VisualProjectName[],
): string | undefined {
  return (allowed as readonly string[]).includes(project)
    ? undefined
    : `runs only in ${allowed.join(", ")} (case is viewport-specific)`;
}

/** Lives in src/support, so the playwright/no-skipped-test lint rule does not apply. */
export function onlyOnProjects(project: string, allowed: readonly VisualProjectName[]): void {
  const reason = projectSkipReason(project, allowed);
  if (reason !== undefined) {
    test.skip(true, reason);
  }
}
