import { expect, test } from "@playwright/test";
import {
  evaluateAudit,
  findingsFromAuditReport,
  parseAllowlist,
  type AllowlistEntry,
} from "../../src/support/audit/audit-gate.js";

const ZOD_GHSA = "GHSA-mrhx-c7xc-m3w5";
const TODAY = "2026-11-02";

function advisory(name: string, id: string, severity: string): Record<string, string | number> {
  return {
    source: 1,
    name,
    dependency: name,
    title: `${name} advisory`,
    url: `https://github.com/advisories/${id}`,
    severity,
    range: "<4.6.6",
  };
}

const report: {
  auditReportVersion: number;
  vulnerabilities: Record<string, { name: string; severity: string; via: unknown[] }>;
} = {
  auditReportVersion: 2,
  vulnerabilities: {
    zod: {
      name: "zod",
      severity: "high",
      via: [advisory("zod", ZOD_GHSA, "high")],
    },
    "qa-portfolio-harness": {
      name: "qa-portfolio-harness",
      severity: "high",
      via: ["zod"],
    },
    minimatch: {
      name: "minimatch",
      severity: "moderate",
      via: [advisory("minimatch", "GHSA-g3hv-75wg-m249", "moderate")],
    },
  },
};

const allowlist: AllowlistEntry[] = parseAllowlist([
  { id: ZOD_GHSA, package: "zod", reason: "test", expires: "2026-12-02" },
]);

test.describe("findingsFromAuditReport", () => {
  test(
    "keeps only high and critical advisories and skips string via entries",
    { tag: ["@unit"] },
    () => {
      const findings = findingsFromAuditReport(report);
      expect(findings).toEqual([
        {
          id: ZOD_GHSA.toUpperCase(),
          package: "zod",
          severity: "high",
          title: "zod advisory",
          url: `https://github.com/advisories/${ZOD_GHSA}`,
        },
      ]);
    },
  );

  test("de-duplicates the same advisory reported under two packages", { tag: ["@unit"] }, () => {
    const dup = structuredClone(report);
    dup.vulnerabilities["zod-copy"] = {
      name: "zod-copy",
      severity: "high",
      via: [advisory("zod", ZOD_GHSA, "high")],
    };
    expect(findingsFromAuditReport(dup)).toHaveLength(1);
  });

  test("fails loudly when an advisory has no GHSA id", { tag: ["@unit"] }, () => {
    const bad = {
      vulnerabilities: {
        x: { via: [{ name: "x", severity: "high", url: "https://example.com/no-id" }] },
      },
    };
    expect(() => findingsFromAuditReport(bad)).toThrow(/no GHSA id/);
  });

  test("an empty report has no findings", { tag: ["@unit"] }, () => {
    expect(findingsFromAuditReport({ vulnerabilities: {} })).toEqual([]);
  });
});

test.describe("evaluateAudit", () => {
  test("passes when the only high advisory is allowlisted and in date", { tag: ["@unit"] }, () => {
    const result = evaluateAudit(findingsFromAuditReport(report), allowlist, TODAY);
    expect(result.ok).toBe(true);
    expect(result.allowed).toHaveLength(1);
    expect(result.blocking).toEqual([]);
  });

  test("fails on a high advisory that is not allowlisted", { tag: ["@unit"] }, () => {
    const result = evaluateAudit(findingsFromAuditReport(report), [], TODAY);
    expect(result.ok).toBe(false);
    expect(result.blocking).toHaveLength(1);
  });

  test(
    "fails on a critical advisory even with an unrelated allowlist entry",
    { tag: ["@unit"] },
    () => {
      const critical = {
        ...report,
        vulnerabilities: {
          zod: {
            name: "zod",
            severity: "critical",
            via: [advisory("zod", "GHSA-aaaa-bbbb-cccc", "critical")],
          },
        },
      };
      const result = evaluateAudit(findingsFromAuditReport(critical), allowlist, TODAY);
      expect(result.ok).toBe(false);
      expect(result.blocking[0]?.severity).toBe("critical");
      expect(result.stale.map((e) => e.id)).toEqual([ZOD_GHSA.toUpperCase()]);
    },
  );

  test(
    "an expired exception fails even while the advisory is still reported",
    { tag: ["@unit"] },
    () => {
      const expired = parseAllowlist([
        { id: ZOD_GHSA, package: "zod", reason: "test", expires: "2026-11-01" },
      ]);
      const result = evaluateAudit(findingsFromAuditReport(report), expired, TODAY);
      expect(result.ok).toBe(false);
      expect(result.blocking).toHaveLength(1);
      expect(result.expired).toHaveLength(1);
    },
  );

  test(
    "an allowlist entry for an advisory that is gone fails, so it gets removed",
    { tag: ["@unit"] },
    () => {
      const result = evaluateAudit([], allowlist, TODAY);
      expect(result.ok).toBe(false);
      expect(result.stale).toHaveLength(1);
    },
  );

  test("an exception that expires today is still valid", { tag: ["@unit"] }, () => {
    const sameDay = parseAllowlist([
      { id: ZOD_GHSA, package: "zod", reason: "test", expires: TODAY },
    ]);
    expect(evaluateAudit(findingsFromAuditReport(report), sameDay, TODAY).ok).toBe(true);
  });
});

test.describe("parseAllowlist", () => {
  test("rejects a non-array file", { tag: ["@unit"] }, () => {
    expect(() => parseAllowlist({})).toThrow(/must be a JSON array/);
  });

  test("rejects an entry without a reason", { tag: ["@unit"] }, () => {
    expect(() => parseAllowlist([{ id: ZOD_GHSA, package: "zod", expires: "2026-12-02" }])).toThrow(
      /"reason"/,
    );
  });

  test("rejects a date that is not YYYY-MM-DD", { tag: ["@unit"] }, () => {
    expect(() =>
      parseAllowlist([{ id: ZOD_GHSA, package: "zod", reason: "x", expires: "12/02/2026" }]),
    ).toThrow(/invalid calendar "expires"/);
  });

  test(
    "rejects impossible calendar dates, including ones JavaScript would roll over",
    { tag: ["@unit"] },
    () => {
      for (const expires of ["9999-99-99", "2026-02-30", "2026-13-01"]) {
        expect(() =>
          parseAllowlist([{ id: ZOD_GHSA, package: "zod", reason: "x", expires }]),
        ).toThrow(/invalid calendar "expires"/);
      }
    },
  );

  test("accepts a real leap day", { tag: ["@unit"] }, () => {
    const [entry] = parseAllowlist([
      { id: ZOD_GHSA, package: "zod", reason: "x", expires: "2028-02-29" },
    ]);
    expect(entry?.expires).toBe("2028-02-29");
  });
});
