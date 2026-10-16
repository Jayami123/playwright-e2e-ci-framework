import type { Locator, Page } from "@playwright/test";
import { CAL_TEST_IDS } from "../../products/cal/testIds.js";

export type VisualProduct = "cal" | "documenso" | "twenty" | "medusa";

/** A named set of masks: one per product, or per Medusa page where the variable content differs. */
export type MaskSet =
  Exclude<VisualProduct, "medusa"> | "medusa-orders-list" | "medusa-order-detail";

export type MaskSpec =
  | { readonly testId: string; readonly reason: string }
  | { readonly selector: string; readonly reason: string }
  | { readonly text: RegExp; readonly reason: string };

/** Step 0 probes: frozen clock gives 0 px diff; mask only user-supplied or data-dependent content. */
const MASKS: Readonly<Record<MaskSet, readonly MaskSpec[]>> = {
  cal: [
    {
      testId: CAL_TEST_IDS.avatar,
      reason: "profile image; default /avatar.svg today, uploads/gravatar differ per environment",
    },
  ],
  documenso: [
    {
      selector: ".konva-container canvas",
      reason:
        "PDF raster drawn by pdf.js/Konva; master plan masks the PDF canvas (Step 0: no date text on the signing page)",
    },
  ],
  twenty: [
    { text: /\bago$/, reason: "relative createdAt/updatedAt; seed time differs per CI run" },
    {
      text: /^\(\d+\/[\d,]+\)$/,
      reason: "record position depends on the workspace row count",
    },
    { text: /^· [\d,]+$/, reason: "view row count depends on the workspace row count" },
  ],
  "medusa-orders-list": [
    {
      selector: "main tbody td:nth-child(1)",
      reason: "display id is a server sequence",
    },
    {
      selector: "main tbody td:nth-child(2)",
      reason: "created_at is server time; page.clock does not reach it",
    },
    {
      selector: "main input[type=search]",
      reason: "search value is the per-test token",
    },
  ],
  "medusa-order-detail": [
    { text: /^#\d+$/, reason: "breadcrumb shows the display id" },
    {
      selector: "main div:has(> h1)",
      reason: "heading row holds display id and creation date",
    },
  ],
};

export function maskSpecs(product: MaskSet): readonly MaskSpec[] {
  return MASKS[product];
}

export function maskLocators(page: Page, set: MaskSet): Locator[] {
  return maskSpecs(set).map((spec) =>
    "testId" in spec
      ? page.getByTestId(spec.testId)
      : "selector" in spec
        ? page.locator(spec.selector)
        : page.getByText(spec.text),
  );
}
