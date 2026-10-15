import { expect, test } from "@playwright/test";
import { p1QaPrefix, p1QaViewName } from "../../src/products/twenty/fixtures/names.js";

test.describe("Twenty P1-QA prefix", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("uses String(seed) and String(worker)", () => {
    expect(p1QaPrefix(42, 0)).toBe("P1-QA-42-0");
    expect(p1QaPrefix("99", "1")).toBe("P1-QA-99-1");
  });

  test("worker 0 and worker 1 differ", () => {
    const seed = 1_234_567;
    expect(p1QaPrefix(seed, 0)).not.toBe(p1QaPrefix(seed, 1));
  });

  test("view names stay under the P1-QA- sweep prefix", () => {
    const prefix = p1QaPrefix(1, 0);
    expect(p1QaViewName(prefix, "cal")).toBe("P1-QA-1-0-cal");
    expect(p1QaViewName(prefix, "cal").startsWith("P1-QA-")).toBe(true);
  });
});
