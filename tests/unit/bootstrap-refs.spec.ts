import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REF_KEYS = ["CAL_REF", "DOCUMENSO_REF", "MEDUSA_REF", "TWENTY_REF"] as const;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

/** Top-level `env:` block of the workflow (two-space indent, ends at the next top-level key). */
function workflowEnv(): Map<string, string> {
  const block = /^env:\n((?: {2}.*\n|\s*\n)+)/m.exec(read(".github/workflows/e2e.yml"));
  const values = new Map<string, string>();
  for (const line of (block?.[1] ?? "").split("\n")) {
    const match = /^ {2}([A-Z0-9_]+): "?([^"#\s]+)"?/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2]);
    }
  }
  return values;
}

function assignments(script: string, pattern: RegExp): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of script.matchAll(pattern)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2]);
    }
  }
  return values;
}

test.describe("cloud bootstrap drift guard", { tag: ["@unit"] }, () => {
  test("bootstrap.sh refs equal the e2e.yml env refs", () => {
    const ci = workflowEnv();
    const bootstrap = assignments(read("scripts/bootstrap.sh"), /^([A-Z0-9_]+_REF)="([^"]+)"$/gm);
    for (const key of REF_KEYS) {
      expect(ci.get(key), `${key} in .github/workflows/e2e.yml`).toBeDefined();
      expect(bootstrap.get(key), `${key} in scripts/bootstrap.sh`).toBe(ci.get(key));
    }
  });

  test("cloud-env.sh Twenty image tag equals the e2e.yml env tag", () => {
    const ci = workflowEnv().get("TWENTY_IMAGE_TAG");
    const written = /"TWENTY_IMAGE_TAG=([^"]+)"/.exec(read("scripts/cloud-env.sh"))?.[1];
    expect(ci, "TWENTY_IMAGE_TAG in .github/workflows/e2e.yml").toBeDefined();
    expect(written, "TWENTY_IMAGE_TAG in scripts/cloud-env.sh").toBe(ci);
  });

  test("cloud-env.sh never writes passwords the cloud owner or harness supplies", () => {
    const script = read("scripts/cloud-env.sh");
    for (const key of ["CAL_E2E_PASSWORD", "CAL_DST_PASSWORD", "TWENTY_PASSWORD"]) {
      expect(script, key).not.toMatch(new RegExp(`"${key}=`));
    }
    expect(script).not.toMatch(/DANGEROUS_BYPASS_RATE_LIMITS=/);
  });
});
