/**
 * Mirrors Playwright's --project selection: case-insensitive names, * wildcards,
 * both --project=a and --project a b. With no --project flag, every name matches.
 */
export function selectedProjects(
  argv: readonly string[],
  projectNames: readonly string[],
): boolean {
  const names = projectNames.map((n) => n.toLocaleLowerCase());
  const selected = parseProjectFlags(argv);
  if (selected.length === 0) {
    return true;
  }
  for (const pattern of selected) {
    if (matchesProjectPattern(pattern, names)) {
      return true;
    }
  }
  return false;
}

export function parseProjectFlags(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--project" || arg === "-p") {
      for (let j = i + 1; j < argv.length; j++) {
        const next = argv[j];
        if (next === undefined || next.startsWith("-")) {
          break;
        }
        out.push(next.toLocaleLowerCase());
      }
      continue;
    }
    if (arg.startsWith("--project=")) {
      const value = arg.slice("--project=".length).trim();
      if (value !== "") {
        out.push(value.toLocaleLowerCase());
      }
    }
  }
  return out;
}

function matchesProjectPattern(pattern: string, projectNames: readonly string[]): boolean {
  if (pattern.includes("*")) {
    const regex = wildcardToRegExp(pattern);
    return projectNames.some((name) => {
      regex.lastIndex = 0;
      return regex.test(name);
    });
  }
  return projectNames.includes(pattern);
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}
