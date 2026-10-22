import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { expect, test } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Runs a copy of cloud-env.sh in a throwaway repo layout so the real `.env` is never touched. */
function runCloudEnv(initialEnv: string): { envFile: string; stdout: string } {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "p1-cloud-env-"));
  try {
    fs.mkdirSync(path.join(sandbox, "scripts", "lib"), { recursive: true });
    for (const file of ["scripts/cloud-env.sh", "scripts/lib/products-root.sh"]) {
      fs.copyFileSync(path.join(root, file), path.join(sandbox, file));
    }
    fs.writeFileSync(path.join(sandbox, ".env"), initialEnv);
    const stdout = execFileSync("bash", [path.join(sandbox, "scripts", "cloud-env.sh")], {
      encoding: "utf8",
      env: { ...process.env, PRODUCTS_ROOT: path.join(sandbox, "products") },
    });
    return { envFile: fs.readFileSync(path.join(sandbox, ".env"), "utf8"), stdout };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

test.describe("cloud-env.sh", { tag: ["@unit"] }, () => {
  test.skip(process.platform === "win32", "needs bash and openssl");

  test("appends a generated value for an empty MEDUSA_ADMIN_PASSWORD line", () => {
    const initial =
      "CAL_BASE_URL=http://cal.example\nMEDUSA_ADMIN_PASSWORD=\nMEDUSA_ADMIN_EMAIL=me@qa.local\n";
    const { envFile, stdout } = runCloudEnv(initial);

    expect(envFile.startsWith(initial), "existing lines are not edited").toBe(true);
    const parsed = dotenv.parse(envFile);
    expect(parsed.MEDUSA_ADMIN_PASSWORD).toMatch(/^[0-9a-f]{32}$/);
    expect(parsed.MEDUSA_ADMIN_EMAIL).toBe("me@qa.local");
    expect(parsed.CAL_BASE_URL).toBe("http://cal.example");
    expect(stdout).toContain("MEDUSA_ADMIN_PASSWORD");
    expect(stdout).not.toContain(parsed.MEDUSA_ADMIN_PASSWORD ?? "unreachable");
  });

  test("keeps a non-empty MEDUSA_ADMIN_PASSWORD and never writes owner-supplied passwords", () => {
    const { envFile } = runCloudEnv("MEDUSA_ADMIN_PASSWORD=kept-value\n");
    const parsed = dotenv.parse(envFile);
    expect(parsed.MEDUSA_ADMIN_PASSWORD).toBe("kept-value");
    expect(envFile.match(/^MEDUSA_ADMIN_PASSWORD=/gm)).toHaveLength(1);
    for (const key of ["CAL_E2E_PASSWORD", "CAL_DST_PASSWORD", "TWENTY_PASSWORD"]) {
      expect(parsed[key], key).toBeUndefined();
    }
  });

  for (const [label, line] of [
    ["double-quoted and empty", 'MEDUSA_ADMIN_PASSWORD=""'],
    ["single-quoted and empty", "MEDUSA_ADMIN_PASSWORD=''"],
    ["quoted whitespace only", 'MEDUSA_ADMIN_PASSWORD="  "'],
    ["exported and empty", "export MEDUSA_ADMIN_PASSWORD="],
    ["empty with a CRLF ending", "MEDUSA_ADMIN_PASSWORD=\r"],
  ] as const) {
    test(`treats MEDUSA_ADMIN_PASSWORD as missing when ${label}`, () => {
      const { envFile, stdout } = runCloudEnv(`${line}\n`);
      expect(envFile.startsWith(`${line}\n`), "existing line is not edited").toBe(true);
      const password = dotenv.parse(envFile).MEDUSA_ADMIN_PASSWORD;
      expect(password).toMatch(/^[0-9a-f]{32}$/);
      expect(stdout).not.toContain(password ?? "unreachable");
    });
  }

  test("keeps quoted non-empty values and the last duplicate line", () => {
    const { envFile } = runCloudEnv('MEDUSA_ADMIN_PASSWORD="kept value"\n');
    expect(dotenv.parse(envFile).MEDUSA_ADMIN_PASSWORD).toBe("kept value");
    expect(envFile.match(/^MEDUSA_ADMIN_PASSWORD=/gm)).toHaveLength(1);

    const later = runCloudEnv("MEDUSA_ADMIN_PASSWORD=\nMEDUSA_ADMIN_PASSWORD=second\n");
    expect(dotenv.parse(later.envFile).MEDUSA_ADMIN_PASSWORD).toBe("second");
    expect(later.envFile.match(/^MEDUSA_ADMIN_PASSWORD=/gm)).toHaveLength(2);
  });
});
