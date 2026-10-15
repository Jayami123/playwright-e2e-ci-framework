import { expect, test } from "@playwright/test";
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
  playwrightImage,
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
    expect(args).not.toContain("--network");
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
