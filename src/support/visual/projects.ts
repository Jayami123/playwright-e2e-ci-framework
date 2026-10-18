import { test } from "@playwright/test";

export type VisualProjectName = "visual-mobile" | "visual-tablet" | "visual-desktop";

export function projectsOnlyReason(allowed: readonly VisualProjectName[]): string {
  return `runs only in ${allowed.join(", ")} (case is viewport-specific)`;
}

export function projectSkipReason(
  project: string,
  allowed: readonly VisualProjectName[],
): string | undefined {
  return (allowed as readonly string[]).includes(project) ? undefined : projectsOnlyReason(allowed);
}

/** Lives in src/support, so the playwright/no-skipped-test lint rule does not apply. */
export function onlyOnProjects(project: string, allowed: readonly VisualProjectName[]): void {
  const reason = projectSkipReason(project, allowed);
  if (reason !== undefined) {
    test.skip(true, reason);
  }
}

/**
 * Call inside a describe: skips the whole group outside `allowed`. The callback uses no fixtures, so
 * Playwright runs it like a beforeAll, before any beforeEach or test-scoped fixture (records, member
 * prefs) is set up. onlyOnProjects runs in the test body, after those fixtures.
 */
export function onlyOnProjectsSuite(allowed: readonly VisualProjectName[]): void {
  test.skip(
    () => projectSkipReason(test.info().project.name, allowed) !== undefined,
    projectsOnlyReason(allowed),
  );
}
