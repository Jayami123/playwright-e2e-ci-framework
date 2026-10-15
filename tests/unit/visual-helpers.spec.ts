import { expect, test } from "@playwright/test";
import {
  AXE_ALLOWLIST,
  allowlistForProject,
  partitionViolations,
} from "../../src/support/visual/axe.js";
import {
  buildAxeReport,
  filterBlockingViolations,
  formatAxeReport,
  type AxeImpact,
  type AxeViolationLike,
} from "../../src/support/visual/axe-format.js";
import { parseFrozenInstant, VISUAL_FROZEN_INSTANT } from "../../src/support/visual/clock.js";
import {
  buildDockerRunArgs,
  calPortFromBaseUrl,
  buildVisualDockerEnv,
  CONTAINER_PRODUCTS_ROOT,
  dbPortFromUrl,
  playwrightImage,
  redactDockerArgs,
  type DockerRunInput,
} from "../../src/support/visual/docker.js";
import { maskSpecs, type VisualProduct } from "../../src/support/visual/masks.js";
import { assertScreenshotName, visualSkipReason } from "../../src/support/visual/screenshot.js";

const NOW = Date.parse("2026-10-15T12:00:00.000Z");

function violation(
  id: string,
  impact: AxeImpact | null | undefined,
  target: readonly unknown[] = ["#a"],
): AxeViolationLike {
  return {
    id,
    ...(impact === undefined ? {} : { impact }),
    help: `help ${id}`,
    helpUrl: `https://example.test/${id}`,
    nodes: [{ target }],
  };
}

function dockerInput(overrides: Partial<DockerRunInput> = {}): DockerRunInput {
  return {
    mode: "test",
    image: "mcr.microsoft.com/playwright:v1.63.0-jammy",
    hostRoot: "/host/root",
    hostPlatform: "win32",
    calPort: 3000,
    dbPort: 5450,
    env: { P1_PLAYWRIGHT_HARNESS: "0" },
    extraArgs: [],
    ...overrides,
  };
}

test.describe("visual clock", () => {
  test("accepts a future UTC ISO instant", { tag: ["@unit"] }, () => {
    expect(parseFrozenInstant(VISUAL_FROZEN_INSTANT, NOW).toISOString()).toBe(
      VISUAL_FROZEN_INSTANT,
    );
  });

  test("rejects an offset or date-only string", { tag: ["@unit"] }, () => {
    expect(() => parseFrozenInstant("2030-01-14T10:00:00+05:30", NOW)).toThrow(/UTC ISO instant/);
    expect(() => parseFrozenInstant("2030-01-14", NOW)).toThrow(/UTC ISO instant/);
  });

  test("rejects an impossible date", { tag: ["@unit"] }, () => {
    expect(() => parseFrozenInstant("2030-02-30T00:00:00.000Z", NOW)).toThrow(/impossible/);
  });

  test("rejects a past instant", { tag: ["@unit"] }, () => {
    expect(() => parseFrozenInstant("2020-01-01T00:00:00.000Z", NOW)).toThrow(/not in the future/);
  });
});

test.describe("visual masks", () => {
  test("cal masks only the avatar", { tag: ["@unit"] }, () => {
    expect(maskSpecs("cal").map((s) => s.testId)).toEqual(["avatar"]);
  });

  test("documenso and twenty are empty until their probes", { tag: ["@unit"] }, () => {
    expect(maskSpecs("documenso")).toEqual([]);
    expect(maskSpecs("twenty")).toEqual([]);
  });

  test(
    "every spec has a non-empty testId and reason, unique per product",
    { tag: ["@unit"] },
    () => {
      for (const product of ["cal", "documenso", "twenty"] as const satisfies VisualProduct[]) {
        const specs = maskSpecs(product);
        for (const spec of specs) {
          expect(spec.testId).not.toBe("");
          expect(spec.reason).not.toBe("");
        }
        expect(new Set(specs.map((s) => s.testId)).size).toBe(specs.length);
      }
    },
  );
});

test.describe("visual skip policy", () => {
  test("linux never skips", { tag: ["@unit"] }, () => {
    expect(visualSkipReason("linux", {})).toBeUndefined();
  });

  test("win32 skips with guidance", { tag: ["@unit"] }, () => {
    const reason = visualSkipReason("win32", {});
    expect(reason).toContain("Linux-only");
    expect(reason).toContain("npm run visual:test");
    expect(reason).toContain("VISUAL_LOCAL=1");
  });

  test("only VISUAL_LOCAL=1 opts in", { tag: ["@unit"] }, () => {
    expect(visualSkipReason("win32", { VISUAL_LOCAL: "1" })).toBeUndefined();
    expect(visualSkipReason("win32", { VISUAL_LOCAL: "true" })).toEqual(expect.any(String));
    expect(visualSkipReason("win32", { VISUAL_LOCAL: "0" })).toEqual(expect.any(String));
  });
});

test.describe("screenshot name", () => {
  test("accepts kebab-case, rejects others", { tag: ["@unit"] }, () => {
    expect(() => {
      assertScreenshotName("booker-pro-30min");
    }).not.toThrow();
    for (const bad of ["Booker", "a b", "x.png", "-a"]) {
      expect(() => {
        assertScreenshotName(bad);
      }).toThrow(/kebab-case/);
    }
  });
});

test.describe("axe filter and report", () => {
  test("keeps serious and critical in order", { tag: ["@unit"] }, () => {
    const input = [
      violation("v1", "minor"),
      violation("v2", "critical"),
      violation("v3", "moderate"),
      violation("v4", "serious"),
      violation("v5", null),
      violation("v6", undefined),
    ];
    expect(filterBlockingViolations(input).map((v) => v.id)).toEqual(["v2", "v4"]);
  });

  test("counts per impact including unknown", { tag: ["@unit"] }, () => {
    const report = buildAxeReport(
      "http://x.test/",
      [
        violation("a", "minor"),
        violation("b", "moderate"),
        violation("c", "serious"),
        violation("d", "critical"),
        violation("e", null),
        violation("f", undefined),
      ],
      "2026-10-15T12:00:00.000Z",
    );
    expect(report.counts).toEqual({ minor: 1, moderate: 1, serious: 1, critical: 1, unknown: 2 });
  });

  test("flattens shadow-DOM targets", { tag: ["@unit"] }, () => {
    const report = buildAxeReport(
      "http://x.test/",
      [violation("a", "serious", [["#host", "button"]])],
      "2026-10-15T12:00:00.000Z",
    );
    expect(report.blocking[0]?.targets).toEqual(["#host >>> button"]);
  });

  test(
    "formatAxeReport is pretty JSON with a trailing newline and round-trips",
    { tag: ["@unit"] },
    () => {
      const report = buildAxeReport(
        "http://x.test/",
        [violation("a", "critical")],
        "2026-10-15T12:00:00.000Z",
      );
      const text = formatAxeReport(report);
      expect(JSON.parse(text)).toEqual(report);
      expect(text.endsWith("}\n")).toBe(true);
    },
  );
});

test.describe("visual docker argv", () => {
  test("image tag from an exact pin; a range throws", { tag: ["@unit"] }, () => {
    const pkg = (v: string): string =>
      JSON.stringify({ devDependencies: { "@playwright/test": v } });
    expect(playwrightImage(pkg("1.63.0"))).toBe("mcr.microsoft.com/playwright:v1.63.0-jammy");
    expect(() => playwrightImage(pkg("^1.63.0"))).toThrow(/exact version/);
  });

  test("calPortFromBaseUrl accepts only 127.0.0.1", { tag: ["@unit"] }, () => {
    expect(calPortFromBaseUrl("http://127.0.0.1:3000")).toBe(3000);
    expect(() => calPortFromBaseUrl("http://localhost:3000")).toThrow();
    expect(() => calPortFromBaseUrl("https://127.0.0.1:3000")).toThrow();
  });

  test("win32 uses the proxy and never --network host", { tag: ["@unit"] }, () => {
    const args = buildDockerRunArgs(dockerInput());
    expect(args).toContain("host.docker.internal:host-gateway");
    expect(args.at(-1)).toContain("visual-docker-proxy.mjs 3000 host.docker.internal 3000");
    expect(args.at(-1)).toContain("visual-docker-proxy.mjs 5450 host.docker.internal 5450");
    expect(args).not.toContain("--network");
  });

  test("dbPortFromUrl reads the explicit port", { tag: ["@unit"] }, () => {
    expect(dbPortFromUrl("postgresql://postgres:@localhost:5450/calendso")).toBe(5450);
    expect(() => dbPortFromUrl("postgresql://postgres:@localhost/calendso")).toThrow(
      /explicit port/,
    );
  });

  test("buildVisualDockerEnv points the container at IPv4 Cal and DB", { tag: ["@unit"] }, () => {
    const env = buildVisualDockerEnv(
      3000,
      "postgresql://postgres:@localhost:5450/calendso",
      "prod",
    );
    expect(env.PRODUCTS_ROOT).toBe("/tmp/p1-products");
    expect(env.CAL_DB_URL).toBe("postgresql://postgres@127.0.0.1:5450/calendso");
    expect(env.CAL_E2E_BASE_URL).toBe("http://127.0.0.1:3000");
    expect(env.P1_PLAYWRIGHT_HARNESS).toBe("0");
    expect(env.CAL_WEB_MODE).toBe("prod");
  });

  test(
    "buildVisualDockerEnv keeps custom DB credentials, database and query",
    { tag: ["@unit"] },
    () => {
      const env = buildVisualDockerEnv(
        3000,
        "postgresql://qa:p%40ss@localhost:6543/caldb?sslmode=disable",
        "prod",
      );
      expect(env.CAL_DB_URL).toBe("postgresql://qa:p%40ss@127.0.0.1:6543/caldb?sslmode=disable");
    },
  );

  test("both platforms stub the product roots before running", { tag: ["@unit"] }, () => {
    expect(CONTAINER_PRODUCTS_ROOT).toBe("/tmp/p1-products");
    for (const hostPlatform of ["win32", "linux"] as const) {
      const inner = buildDockerRunArgs(dockerInput({ hostPlatform })).at(-1) ?? "";
      expect(inner.startsWith("mkdir -p /tmp/p1-products/cal"), hostPlatform).toBe(true);
    }
  });

  test(
    "linux uses --network host and --user; update adds --update-snapshots=all",
    { tag: ["@unit"] },
    () => {
      const test_ = buildDockerRunArgs(dockerInput({ hostPlatform: "linux", uidGid: "1001:1001" }));
      expect(test_).toContain("--network");
      expect(test_[test_.indexOf("--network") + 1]).toBe("host");
      expect(test_[test_.indexOf("--user") + 1]).toBe("1001:1001");
      expect(test_.at(-1)).not.toContain("visual-docker-proxy");
      expect(test_.at(-1)).not.toContain("--update-snapshots");
      const update = buildDockerRunArgs(dockerInput({ mode: "update", hostPlatform: "linux" }));
      expect(update.at(-1)).toContain("--update-snapshots=all");
    },
  );
});

test.describe("axe allowlist partition", () => {
  const RESOLVED = new Map([['[data-testid="overlay-calendar-switch"]', ["#radix-_r_r_"]]]);
  const switchViolation: AxeViolationLike = {
    id: "button-name",
    impact: "critical",
    help: "Buttons must have discernible text",
    helpUrl: "https://example.test/button-name",
    nodes: [{ target: ["#radix-_r_r_"] }],
  };

  test("no violations: nothing blocking or allowed, allowlist is stale", { tag: ["@unit"] }, () => {
    const result = partitionViolations([], AXE_ALLOWLIST);
    expect(result.blocking).toEqual([]);
    expect(result.allowed).toEqual([]);
    expect(result.staleAllowlist).toEqual(AXE_ALLOWLIST);
  });

  test("an allowlisted violation only is allowed and not stale", { tag: ["@unit"] }, () => {
    const result = partitionViolations([switchViolation], AXE_ALLOWLIST, RESOLVED);
    expect(result.blocking).toEqual([]);
    expect(result.allowed.map((v) => v.id)).toEqual(["button-name"]);
    expect(result.staleAllowlist).toEqual([]);
  });

  test("a new critical violation is blocking", { tag: ["@unit"] }, () => {
    const fresh = violation("color-contrast", "critical", ["#new-thing"]);
    const result = partitionViolations([switchViolation, fresh], AXE_ALLOWLIST, RESOLVED);
    expect(result.blocking.map((v) => v.id)).toEqual(["color-contrast"]);
    expect(result.allowed.map((v) => v.id)).toEqual(["button-name"]);
    expect(result.staleAllowlist).toEqual([]);
  });

  test("the same rule on a different node stays blocking", { tag: ["@unit"] }, () => {
    const other = violation("button-name", "critical", ["#other-button"]);
    const result = partitionViolations([other], AXE_ALLOWLIST);
    expect(result.blocking.map((v) => v.id)).toEqual(["button-name"]);
    expect(result.staleAllowlist).toEqual(AXE_ALLOWLIST);
  });

  test("exact data-testid in the target is allowed", { tag: ["@unit"] }, () => {
    const exact = violation("button-name", "critical", ['[data-testid="overlay-calendar-switch"]']);
    const result = partitionViolations([exact], AXE_ALLOWLIST);
    expect(result.blocking).toEqual([]);
    expect(result.allowed).toHaveLength(1);
  });

  test("a test id sharing the prefix stays blocking", { tag: ["@unit"] }, () => {
    const secondary = violation("button-name", "critical", [
      '[data-testid="overlay-calendar-switch-secondary"]',
    ]);
    const result = partitionViolations([secondary], AXE_ALLOWLIST, RESOLVED);
    expect(result.blocking).toHaveLength(1);
    expect(result.allowed).toEqual([]);
    expect(result.staleAllowlist).toEqual(AXE_ALLOWLIST);
  });

  test("an ancestor test id with a descendant target stays blocking", { tag: ["@unit"] }, () => {
    for (const target of [
      '[data-testid="overlay-calendar-switch"] > button',
      '[data-testid="overlay-calendar-switch"] button',
      '[data-testid="overlay-calendar-switch"]+button',
    ]) {
      const descendant = violation("button-name", "critical", [target]);
      const result = partitionViolations([descendant], AXE_ALLOWLIST);
      expect(result.blocking, target).toHaveLength(1);
      expect(result.allowed, target).toEqual([]);
    }
  });

  test("the test id in the last compound is allowed", { tag: ["@unit"] }, () => {
    const nested = violation("button-name", "critical", [
      'main > div [data-testid="overlay-calendar-switch"]',
    ]);
    expect(partitionViolations([nested], AXE_ALLOWLIST).allowed).toHaveLength(1);
  });

  test("an escaped id selector matches its resolved target", { tag: ["@unit"] }, () => {
    const entry = { rule: "button-name", target: '[data-testid="item"]', finding: "f" };
    const escaped = violation("button-name", "critical", ["#item\\:42"]);
    const resolved = new Map([[entry.target, ["#item\\:42"]]]);
    const result = partitionViolations([escaped], [entry], resolved);
    expect(result.blocking).toEqual([]);
    expect(result.allowed).toHaveLength(1);
    expect(partitionViolations([escaped], [entry]).blocking).toHaveLength(1);
  });

  test("a truncated html snippet alone never allows", { tag: ["@unit"] }, () => {
    const htmlOnly: AxeViolationLike = {
      ...switchViolation,
      nodes: [
        {
          target: ["#some-other-id"],
          html: '<button role="switch" data-testid="overlay-calendar-swi..." id="some-other-id">',
        },
      ],
    };
    const result = partitionViolations([htmlOnly], AXE_ALLOWLIST, RESOLVED);
    expect(result.blocking).toHaveLength(1);
    expect(result.allowed).toEqual([]);
  });

  test("viewport-scoped entries apply only to their projects", { tag: ["@unit"] }, () => {
    expect(allowlistForProject(AXE_ALLOWLIST, "visual-desktop")).toEqual(AXE_ALLOWLIST);
    expect(allowlistForProject(AXE_ALLOWLIST, "visual-tablet")).toEqual(AXE_ALLOWLIST);
    expect(allowlistForProject(AXE_ALLOWLIST, "visual-mobile")).toEqual([]);
    expect(allowlistForProject(AXE_ALLOWLIST, undefined)).toEqual([]);
    const everywhere = { rule: "r", target: "#t", finding: "f" };
    expect(allowlistForProject([everywhere], "visual-mobile")).toEqual([everywhere]);
  });

  test("a moderate violation is not blocking", { tag: ["@unit"] }, () => {
    const result = partitionViolations([violation("region", "moderate", ["body"])], AXE_ALLOWLIST);
    expect(result.blocking).toEqual([]);
    expect(result.allowed).toEqual([]);
  });

  test("an allowlist entry that matches nothing is stale", { tag: ["@unit"] }, () => {
    const entry = { rule: "image-alt", target: "#gone", finding: "fixed upstream" };
    const result = partitionViolations([switchViolation], [...AXE_ALLOWLIST, entry], RESOLVED);
    expect(result.staleAllowlist).toEqual([entry]);
    expect(result.blocking).toEqual([]);
  });
});

test.describe("visual docker log redaction", () => {
  test(
    "redactDockerArgs masks DB passwords and leaves the real args untouched",
    { tag: ["@unit"] },
    () => {
      const args = [
        "run",
        "-e",
        "CAL_DB_URL=postgresql://u:s3cret@127.0.0.1:5450/calendso?x=1",
        "-e",
        "HOME=/tmp",
        "-e",
        "NO_PW_URL=postgresql://u@127.0.0.1:5450/db",
      ];
      const shown = redactDockerArgs(args);
      expect(shown[2]).toBe("CAL_DB_URL=postgresql://u:***@127.0.0.1:5450/calendso?x=1");
      expect(shown.join(" ")).not.toContain("s3cret");
      expect(shown[4]).toBe("HOME=/tmp");
      expect(shown[6]).toBe("NO_PW_URL=postgresql://u@127.0.0.1:5450/db");
      expect(args[2]).toContain("s3cret");
    },
  );
});
