import { expect, test } from "@playwright/test";
import { medusaQaTitleOfLength, medusaQaVisualEmail } from "../../src/products/medusa/names.js";

test.describe("Medusa QA names", { tag: ["@unit"] }, () => {
  for (const length of [254, 255, 256]) {
    test(`medusaQaTitleOfLength pads to the exact UTF-16 length ${String(length)}`, () => {
      const title = medusaQaTitleOfLength("P1-QA-1-0", length, "x");
      expect(title).toHaveLength(length);
      expect(title.startsWith("P1-QA-1-0-")).toBe(true);
    });
  }

  test("medusaQaTitleOfLength never splits a surrogate pair", () => {
    const titles = [255, 256].map((length) => medusaQaTitleOfLength("P1-QA-1-0", length, "😀"));
    for (const title of titles) {
      expect(/[�-�](?![�-�])/.test(title)).toBe(false);
      expect(/(?<![�-�])[�-�]/.test(title)).toBe(false);
    }
    expect(titles.map((title) => title.length)).toEqual([255, 256]);
    // One of the two lengths leaves an odd unit that is padded with an ASCII filler.
    expect(titles.filter((title) => title.endsWith("x"))).toHaveLength(1);
  });

  test("medusaQaTitleOfLength rejects an empty fill and an oversized prefix", () => {
    expect(() => medusaQaTitleOfLength("P1-QA-1-0", 255, "")).toThrow(/fill/);
    expect(() => medusaQaTitleOfLength("P1-QA-1-0", 5, "x")).toThrow(/longer/);
  });

  test("medusaQaVisualEmail is constant for a worker and leaf", () => {
    expect(medusaQaVisualEmail(0, "o1")).toBe("p1-qa-vis-0-o1@qa.local");
  });
});
