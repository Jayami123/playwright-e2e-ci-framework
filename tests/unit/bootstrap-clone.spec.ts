import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

// Stands in for git: init and remote add are real, fetch fails on demand, the rest succeed.
const FAKE_GIT = `#!/usr/bin/env bash
args=("$@")
i=0
while [ "$i" -lt "\${#args[@]}" ]; do
  case "\${args[$i]}" in -C | -c) i=$((i + 2)) ;; *) break ;; esac
done
case "\${args[$i]:-}" in
  init | remote) exec "$REAL_GIT" "$@" ;;
  fetch) [ "\${FAKE_GIT_FAIL_FETCH:-0}" = "1" ] && exit 1; exit 0 ;;
  rev-parse) echo ${COMMIT}; exit 0 ;;
  *) exit 0 ;;
esac
`;

test.describe("bootstrap.sh clone", { tag: ["@unit"] }, () => {
  test.skip(process.platform === "win32", "needs bash");

  test("a failed fetch leaves no .git and the rerun clones again", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "p1-bootstrap-"));
    try {
      fs.mkdirSync(path.join(sandbox, "scripts", "lib"), { recursive: true });
      for (const file of [
        "scripts/bootstrap.sh",
        "scripts/cloud-env.sh",
        "scripts/lib/products-root.sh",
      ]) {
        fs.copyFileSync(path.join(root, file), path.join(sandbox, file));
      }
      const bin = path.join(sandbox, "bin");
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, "git"), FAKE_GIT, { mode: 0o755 });
      const realGit = spawnSync("bash", ["-c", "command -v git"], {
        encoding: "utf8",
      }).stdout.trim();

      const productsRoot = path.join(sandbox, "products");
      const run = (failFetch: "0" | "1"): SpawnSyncReturns<string> =>
        spawnSync("bash", [path.join(sandbox, "scripts", "bootstrap.sh"), "medusa"], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
            REAL_GIT: realGit,
            FAKE_GIT_FAIL_FETCH: failFetch,
            PRODUCTS_ROOT: productsRoot,
            BOOTSTRAP_SKIP_INSTALL: "1",
          },
        });
      const dest = path.join(productsRoot, "medusa-dtc-starter");

      const failed = run("1");
      expect(failed.status, failed.stderr).toBe(1);
      expect(failed.stdout + failed.stderr).toContain("ERROR cloning");
      expect(fs.existsSync(path.join(dest, ".git")), ".git removed after the failure").toBe(false);

      const rerun = run("0");
      expect(rerun.status, rerun.stderr).toBe(0);
      expect(rerun.stdout).toContain(`cloned ${COMMIT}`);
      expect(fs.existsSync(path.join(dest, ".git"))).toBe(true);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
