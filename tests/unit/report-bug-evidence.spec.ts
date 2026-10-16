import { expect, test } from "@playwright/test";
import {
  assertEvidenceFile,
  collectEvidence,
  evidenceBaseName,
  pickRepresentative,
} from "../../src/support/report/bug-evidence.js";

const REPORT = {
  suites: [
    {
      suites: [
        {
          specs: [
            {
              title: "P1-DOC-VIS-X03 stalled",
              tests: [
                {
                  projectName: "visual-desktop",
                  annotations: [{ type: "testId", description: "P1-DOC-VIS-X03" }],
                  results: [
                    {
                      attachments: [
                        { name: "known-bug-screenshot", path: "/work/test-results/a.png" },
                        { name: "known-bug-evidence", body: "e30=" },
                      ],
                    },
                  ],
                },
                {
                  projectName: "visual-desktop",
                  annotations: [{ type: "testId", description: "P1-DOC-VIS-001" }],
                  results: [{ attachments: [{ name: "trace", path: "/work/t.zip" }] }],
                },
              ],
            },
            {
              title: "P1-DOC-VIS-004 contrast",
              tests: [
                {
                  projectName: "visual-mobile",
                  annotations: [],
                  results: [
                    {
                      attachments: [
                        { name: "axe-evidence-documents-dark.json", body: "e30=" },
                        { name: "axe-evidence-documents-dark.png", path: "/work/x.png" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test.describe("bug evidence", () => {
  test("evidenceBaseName strips the P1- and PRODUCT BUG prefixes", { tag: ["@unit"] }, () => {
    expect(evidenceBaseName("P1-DOC-VIS-X03")).toBe("DOC-VIS-X03");
    expect(evidenceBaseName("PRODUCT BUG TW-VIS-001-F3")).toBe("TW-VIS-001-F3");
  });

  test(
    "pickRepresentative prefers desktop over tablet over mobile, light over dark",
    { tag: ["@unit"] },
    () => {
      const items = [
        { project: "visual-mobile", scheme: "light" as const },
        { project: "visual-desktop", scheme: "dark" as const },
        { project: "visual-desktop", scheme: "light" as const },
        { project: "visual-tablet", scheme: "light" as const },
      ];
      expect(pickRepresentative(items)).toEqual({ project: "visual-desktop", scheme: "light" });
      expect(pickRepresentative(items.slice(0, 2)).project).toBe("visual-desktop");
      expect(() => pickRepresentative([])).toThrow();
    },
  );

  test(
    "collectEvidence picks known-bug and axe attachments and maps /work paths",
    { tag: ["@unit"] },
    () => {
      const items = collectEvidence(REPORT, "/repo");
      expect(items.map((i) => `${i.kind}:${i.id}:${i.project}`)).toEqual([
        "known-bug:DOC-VIS-X03:visual-desktop",
        "axe:documents-dark:visual-mobile",
      ]);
      expect(items[0]?.png?.path?.replaceAll("\\", "/")).toBe("/repo/test-results/a.png");
      expect(items[0]?.json?.bodyBase64).toBe("e30=");
      expect(items[1]?.scheme).toBe("dark");
    },
  );

  test("assertEvidenceFile rejects big PNGs and secret JSON", { tag: ["@unit"] }, () => {
    expect(() => {
      assertEvidenceFile("a.png", new Uint8Array(500 * 1024 + 1));
    }).toThrow(/exceeds/);
    expect(() => {
      assertEvidenceFile("a.png", new Uint8Array(10));
    }).not.toThrow();
    expect(() => {
      assertEvidenceFile("a.json", new Uint8Array(0), '{"x":"sessionId=abc"}');
    }).toThrow(/secret patterns/);
    expect(() => {
      assertEvidenceFile("a.json", new Uint8Array(0), '{"x":1}');
    }).not.toThrow();
  });
});
