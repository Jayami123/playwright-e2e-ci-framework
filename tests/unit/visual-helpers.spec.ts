import { expect, test } from "@playwright/test";
import {
  AXE_ALLOWLIST,
  allowlistFor,
  allowlistForProject,
  partitionViolations,
} from "../../src/support/visual/axe.js";
import {
  axeRegressions,
  buildAxeReport,
  filterBlockingViolations,
  formatAxeReport,
  idCounts,
  type AxeImpact,
  type AxeViolationLike,
} from "../../src/support/visual/axe-format.js";
import { parseFrozenInstant, VISUAL_FROZEN_INSTANT } from "../../src/support/visual/clock.js";
import {
  buildDockerRunArgs,
  calPortFromBaseUrl,
  buildVisualDockerEnv,
  calCredentialsFromEnv,
  CONTAINER_PRODUCTS_ROOT,
  dbPortFromUrl,
  documensoPortFromUrls,
  parseVisualArgs,
  playwrightImage,
  portFromLoopbackUrl,
  productsFor,
  redactDockerArgs,
  type DockerRunInput,
} from "../../src/support/visual/docker.js";
import { maskSpecs, type MaskSet } from "../../src/support/visual/masks.js";
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
    forwardPorts: [3000, 5450],
    extraHosts: [],
    testPaths: [],
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
    expect(maskSpecs("cal").map((s) => ("testId" in s ? s.testId : ""))).toEqual(["avatar"]);
  });

  test(
    "documenso masks the PDF canvas and twenty masks three text patterns",
    { tag: ["@unit"] },
    () => {
      const doc = maskSpecs("documenso");
      expect(doc).toHaveLength(1);
      expect(doc.every((spec) => "selector" in spec)).toBe(true);
      const tw = maskSpecs("twenty");
      expect(tw).toHaveLength(3);
      expect(tw.every((spec) => "text" in spec)).toBe(true);
    },
  );

  test(
    "every spec has a non-empty target and reason, unique per product",
    { tag: ["@unit"] },
    () => {
      for (const product of [
        "cal",
        "documenso",
        "twenty",
        "medusa-orders-list",
        "medusa-order-detail",
      ] as const satisfies MaskSet[]) {
        const specs = maskSpecs(product);
        const keys = specs.map((spec) =>
          "testId" in spec ? spec.testId : "selector" in spec ? spec.selector : spec.text.source,
        );
        for (const spec of specs) {
          expect(spec.reason).not.toBe("");
        }
        for (const key of keys) {
          expect(key).not.toBe("");
        }
        expect(new Set(keys).size).toBe(specs.length);
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

  test(
    "buildVisualDockerEnv passes the Cal seed credentials into the container",
    { tag: ["@unit"] },
    () => {
      const credentials = calCredentialsFromEnv({
        CAL_E2E_EMAIL: "pro@example.com",
        CAL_E2E_PASSWORD: "pro",
        CAL_DST_EMAIL: "trial@example.com",
        CAL_DST_PASSWORD: "",
        UNRELATED: "x",
      });
      expect(credentials).toEqual({
        CAL_E2E_EMAIL: "pro@example.com",
        CAL_E2E_PASSWORD: "pro",
        CAL_DST_EMAIL: "trial@example.com",
      });
      const env = buildVisualDockerEnv({
        cal: {
          port: 3000,
          dbUrl: "postgresql://postgres:@localhost:5450/calendso",
          webMode: "prod",
          credentials,
        },
      });
      expect(env.CAL_E2E_EMAIL).toBe("pro@example.com");
      expect(env.CAL_E2E_PASSWORD).toBe("pro");
      expect(env.CAL_DST_PASSWORD).toBeUndefined();
    },
  );

  test("buildVisualDockerEnv points the container at IPv4 Cal and DB", { tag: ["@unit"] }, () => {
    const env = buildVisualDockerEnv({
      cal: { port: 3000, dbUrl: "postgresql://postgres:@localhost:5450/calendso", webMode: "prod" },
    });
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
      const env = buildVisualDockerEnv({
        cal: {
          port: 3000,
          dbUrl: "postgresql://qa:p%40ss@localhost:6543/caldb?sslmode=disable",
          webMode: "prod",
        },
      });
      expect(env.CAL_DB_URL).toBe("postgresql://qa:p%40ss@127.0.0.1:6543/caldb?sslmode=disable");
    },
  );

  test("parseVisualArgs reads mode, product and passthrough args", { tag: ["@unit"] }, () => {
    expect(parseVisualArgs(["test"])).toEqual({ mode: "test", target: "all", extraArgs: [] });
    expect(parseVisualArgs(["update", "--product=twenty", "--grep", "X"])).toEqual({
      mode: "update",
      target: "twenty",
      extraArgs: ["--grep", "X"],
    });
    expect(() => parseVisualArgs(["test", "--product=nope"])).toThrow(/unknown --product/);
    expect(() => parseVisualArgs(["bogus"])).toThrow(/usage/);
  });

  test("parseVisualArgs accepts --product=medusa", { tag: ["@unit"] }, () => {
    expect(parseVisualArgs(["test", "--product=medusa", "--grep", "VIS"])).toEqual({
      mode: "test",
      target: "medusa",
      extraArgs: ["--grep", "VIS"],
    });
  });

  test("productsFor(all) includes medusa", { tag: ["@unit"] }, () => {
    expect(productsFor("all")).toEqual(["cal", "documenso", "twenty", "medusa"]);
    expect(productsFor("medusa")).toEqual(["medusa"]);
  });

  test(
    "buildVisualDockerEnv passes the Medusa URL and admin credentials",
    { tag: ["@unit"] },
    () => {
      const env = buildVisualDockerEnv({
        medusa: { baseUrl: "http://127.0.0.1:9000", email: "admin@test.com", password: "pw" },
      });
      expect(env.MEDUSA_BASE_URL).toBe("http://127.0.0.1:9000");
      expect(env.MEDUSA_ADMIN_EMAIL).toBe("admin@test.com");
      expect(env.MEDUSA_ADMIN_PASSWORD).toBe("pw");
      const bare = buildVisualDockerEnv({
        medusa: { baseUrl: "http://127.0.0.1:9000", email: "" },
      });
      expect(bare.MEDUSA_ADMIN_EMAIL).toBeUndefined();
      expect(bare.MEDUSA_ADMIN_PASSWORD).toBeUndefined();
    },
  );

  test("portFromLoopbackUrl accepts only http 127.0.0.1 with a port", { tag: ["@unit"] }, () => {
    expect(portFromLoopbackUrl("X", "http://127.0.0.1:3002")).toBe(3002);
    expect(() => portFromLoopbackUrl("X", "http://localhost:3002")).toThrow();
    expect(() => portFromLoopbackUrl("X", "https://127.0.0.1:3002")).toThrow();
    expect(() => portFromLoopbackUrl("X", "http://127.0.0.1")).toThrow();
  });

  test(
    "documensoPortFromUrls needs the p1.lvh.me host on the same port",
    { tag: ["@unit"] },
    () => {
      expect(documensoPortFromUrls("http://127.0.0.1:3001", "http://p1.lvh.me:3001")).toBe(3001);
      expect(() =>
        documensoPortFromUrls("http://127.0.0.1:3001", "http://p1.lvh.me:3002"),
      ).toThrow();
      expect(() =>
        documensoPortFromUrls("http://127.0.0.1:3001", "http://other.test:3001"),
      ).toThrow();
    },
  );

  test(
    "buildVisualDockerEnv covers documenso and twenty and passes CI through",
    { tag: ["@unit"] },
    () => {
      const env = buildVisualDockerEnv({
        documenso: {
          listenUrl: "http://127.0.0.1:3001",
          publicUrl: "http://p1.lvh.me:3001",
          dbUrl: "postgres://documenso:password@localhost:5451/documenso",
          inbucketOrigin: "http://127.0.0.1:9003",
        },
        twenty: { baseUrl: "http://127.0.0.1:3002", password: "tim@apple.dev", email: "" },
        ci: "true",
        reportId: "visual-twenty",
      });
      expect(env.DOCUMENSO_BASE_URL).toBe("http://127.0.0.1:3001");
      expect(env.DOCUMENSO_PUBLIC_URL).toBe("http://p1.lvh.me:3001");
      expect(env.DOCUMENSO_DB_URL).toBe("postgres://documenso:password@127.0.0.1:5451/documenso");
      expect(env.DOCUMENSO_INBUCKET_ORIGIN).toBe("http://127.0.0.1:9003");
      expect(env.TWENTY_PASSWORD).toBe("tim@apple.dev");
      expect(env.TWENTY_EMAIL).toBeUndefined();
      expect(env.CI).toBe("true");
      expect(env.P1_PW_REPORT_ID).toBe("visual-twenty");
      expect(buildVisualDockerEnv({ ci: "", reportId: "" }).CI).toBeUndefined();
    },
  );

  test(
    "forwardPorts are deduped; extraHosts and testPaths reach the command",
    { tag: ["@unit"] },
    () => {
      const win = buildDockerRunArgs(
        dockerInput({
          forwardPorts: [3001, 5451, 9003, 3001],
          extraHosts: ["p1.lvh.me:127.0.0.1"],
          testPaths: ["tests/documenso"],
        }),
      );
      const inner = win.at(-1) ?? "";
      expect(inner.match(/visual-docker-proxy\.mjs/g)).toHaveLength(3);
      expect(win).toContain("p1.lvh.me:127.0.0.1");
      expect(inner).toContain("--project=visual-desktop 'tests/documenso'");
      const linux = buildDockerRunArgs(
        dockerInput({
          hostPlatform: "linux",
          forwardPorts: [3001, 5451],
          extraHosts: ["p1.lvh.me:127.0.0.1"],
        }),
      );
      expect(linux.at(-1)).not.toContain("visual-docker-proxy");
      expect(linux).toContain("p1.lvh.me:127.0.0.1");
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

  test("redactDockerArgs masks PASSWORD, SECRET and TOKEN env values", { tag: ["@unit"] }, () => {
    const shown = redactDockerArgs([
      "TWENTY_PASSWORD=tim@apple.dev",
      "TWENTY_BASE_URL=http://127.0.0.1:3002",
      "API_TOKEN=abc",
      "CLIENT_SECRET=xyz",
    ]);
    expect(shown).toEqual([
      "TWENTY_PASSWORD=***",
      "TWENTY_BASE_URL=http://127.0.0.1:3002",
      "API_TOKEN=***",
      "CLIENT_SECRET=***",
    ]);
  });
});

test.describe("axe allowlist contexts and findings", () => {
  const light = {
    rule: "color-contrast",
    target: ".a",
    finding: "PRODUCT BUG X-F1: a",
    contexts: ["light"],
  };
  const any = { rule: "color-contrast", target: ".b", finding: "PRODUCT BUG X-F2: b" };

  test("allowlistFor filters by context", { tag: ["@unit"] }, () => {
    expect(allowlistFor([light, any], "visual-desktop", "dark")).toEqual([any]);
    expect(allowlistFor([light, any], "visual-desktop", "light")).toEqual([light, any]);
    expect(allowlistFor([light, any], "visual-desktop")).toEqual([any]);
  });

  test(
    "a resolved extra node target allows the node, an unresolved one blocks",
    { tag: ["@unit"] },
    () => {
      const entry = { rule: "color-contrast", target: ".a", finding: "PRODUCT BUG X-F1: a" };
      const positional = violation("color-contrast", "serious", ["div:nth-child(3) > span"]);
      const resolved = new Map([[entry.target, ["div:nth-child(3) > span"]]]);
      expect(partitionViolations([positional], [entry], resolved).blocking).toEqual([]);
      expect(partitionViolations([positional], [entry]).blocking).toHaveLength(1);
    },
  );

  test("allowedByFinding maps finding ids to covered targets", { tag: ["@unit"] }, () => {
    const entry = {
      rule: "color-contrast",
      target: ".a",
      finding: "PRODUCT BUG DOC-VIS-004-F1: initials",
    };
    const unused = {
      rule: "color-contrast",
      target: ".z",
      finding: "PRODUCT BUG DOC-VIS-004-F2: x",
    };
    const result = partitionViolations(
      [violation("color-contrast", "serious", [".a"])],
      [entry, unused],
    );
    expect(result.allowedByFinding).toEqual({ "PRODUCT BUG DOC-VIS-004-F1": [".a"] });
  });
});

test.describe("axe arabic regressions", () => {
  test("idCounts sums nodes per rule id", { tag: ["@unit"] }, () => {
    const twoNodes: AxeViolationLike = {
      ...violation("a", "serious"),
      nodes: [{ target: ["#x"] }, { target: ["#y"] }],
    };
    const report = buildAxeReport(
      "http://x.test/",
      [twoNodes, violation("b", "minor"), violation("a", "critical")],
      "2026-10-15T12:00:00.000Z",
    );
    expect(idCounts(report)).toEqual({ a: 3 });
  });

  test("idCounts counts a multi-selector frame target as one node", { tag: ["@unit"] }, () => {
    const report = buildAxeReport(
      "http://x.test/",
      [violation("a", "serious", ["iframe#f", "button"])],
      "2026-10-15T12:00:00.000Z",
    );
    expect(report.blocking[0]?.targets).toHaveLength(2);
    expect(idCounts(report)).toEqual({ a: 1 });
  });

  test("equal counts are not regressions", { tag: ["@unit"] }, () => {
    expect(axeRegressions({ a: 2, b: 1 }, { a: 2, b: 1 })).toEqual([]);
  });

  test("Arabic with fewer violations is not a regression", { tag: ["@unit"] }, () => {
    expect(axeRegressions({ a: 3, b: 1 }, { a: 1 })).toEqual([]);
  });

  test("Arabic with more nodes for an id is listed", { tag: ["@unit"] }, () => {
    expect(axeRegressions({ a: 1, b: 2 }, { a: 3, b: 2 })).toEqual(["a: ar 3 > en 1"]);
  });

  test("an id new in Arabic is listed against English 0", { tag: ["@unit"] }, () => {
    expect(axeRegressions({ a: 1 }, { a: 1, c: 2 })).toEqual(["c: ar 2 > en 0"]);
  });
});
