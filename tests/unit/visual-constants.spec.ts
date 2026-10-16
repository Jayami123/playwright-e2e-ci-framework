import { expect, test } from "@playwright/test";
import {
  DOC_LONG_RECIPIENT_NAME,
  DOC_LONG_TITLE,
  DOC_PDF_ROUTE,
  DOCUMENSO_AXE_ALLOWLIST,
} from "../../src/products/documenso/visual.js";
import { longCompanyName, qaMemberEmail } from "../../src/products/twenty/fixtures/qa-member.js";
import { TWENTY_AXE_ALLOWLIST } from "../../src/products/twenty/visual.js";

test.describe("visual constants", () => {
  test("Documenso long text has the planned lengths", { tag: ["@unit"] }, () => {
    expect(DOC_LONG_TITLE).toHaveLength(200);
    expect(DOC_LONG_RECIPIENT_NAME).toHaveLength(80);
  });

  test("the PDF route matches the Step 0 URL and not the upload route", { tag: ["@unit"] }, () => {
    const url =
      "http://p1.lvh.me:3001/api/files/token/tok/envelope/env/envelopeItem/item/dataId/data/current/item.pdf";
    expect(DOC_PDF_ROUTE.test(url)).toBe(true);
    expect(DOC_PDF_ROUTE.test(`${url}?x=1`)).toBe(true);
    expect(DOC_PDF_ROUTE.test("http://p1.lvh.me:3001/api/files/upload-pdf")).toBe(false);
  });

  test("longCompanyName is 150 chars and sweep-safe", { tag: ["@unit"] }, () => {
    const name = longCompanyName("P1-QA-1-0");
    expect(name).toHaveLength(150);
    expect(name.startsWith("P1-QA-1-0-")).toBe(true);
  });

  test("qaMemberEmail uses the p1-qa- prefix the leak check counts", { tag: ["@unit"] }, () => {
    expect(qaMemberEmail(5, 1)).toBe("p1-qa-5-1@example.test");
  });

  test("every allowlist finding names a PRODUCT BUG id", { tag: ["@unit"] }, () => {
    for (const entry of [...DOCUMENSO_AXE_ALLOWLIST, ...TWENTY_AXE_ALLOWLIST]) {
      expect(entry.finding).toMatch(/^PRODUCT BUG [A-Z]+-[A-Z0-9-]+: /);
    }
  });
});
