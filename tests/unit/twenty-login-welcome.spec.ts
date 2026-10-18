import { expect, test } from "@playwright/test";
import {
  WELCOME_MAX_RELOADS,
  welcomeLoadVerdict,
} from "../../src/products/twenty/pages/login.page.js";

const stuck = { textboxEditable: false, headingVisible: true, reloadsUsed: 0 } as const;

// Pure logic only: the unit project runs in the lint job without browsers.
// The goto() recovery path is tested in tests/twenty/fixture/login-recovery.spec.ts.
test.describe("Twenty /welcome load verdict", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("an editable textbox is ready, even after a reload", () => {
    expect(welcomeLoadVerdict({ ...stuck, textboxEditable: true })).toBe("ready");
    expect(
      welcomeLoadVerdict({ ...stuck, textboxEditable: true, reloadsUsed: WELCOME_MAX_RELOADS }),
    ).toBe("ready");
  });

  test("title shown and no form after the grace: reload once", () => {
    expect(welcomeLoadVerdict(stuck)).toBe("reload");
  });

  test("the same signature after the reload budget is spent fails", () => {
    expect(welcomeLoadVerdict({ ...stuck, reloadsUsed: WELCOME_MAX_RELOADS })).toBe("fail");
  });

  test("a page with no title yet is slow, never reloaded", () => {
    expect(welcomeLoadVerdict({ ...stuck, headingVisible: false })).toBe("fail");
  });
});
