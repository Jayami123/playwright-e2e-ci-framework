import type { Locator, Page } from "@playwright/test";
import { CAL_TEST_IDS } from "../../products/cal/testIds.js";

export type VisualProduct = "cal" | "documenso" | "twenty";

export interface MaskSpec {
  readonly testId: string;
  readonly reason: string;
}

/** Step 0 probe 2026-10-15: frozen clock gives 0 px diff; mask only user-supplied imagery. */
const MASKS: Readonly<Record<VisualProduct, readonly MaskSpec[]>> = {
  cal: [
    {
      testId: CAL_TEST_IDS.avatar,
      reason: "profile image; default /avatar.svg today, uploads/gravatar differ per environment",
    },
  ],
  // Filled by the Documenso and Twenty VIS tasks after their own probes.
  documenso: [],
  twenty: [],
};

export function maskSpecs(product: VisualProduct): readonly MaskSpec[] {
  return MASKS[product];
}

export function maskLocators(page: Page, product: VisualProduct): Locator[] {
  return maskSpecs(product).map((spec) => page.getByTestId(spec.testId));
}
