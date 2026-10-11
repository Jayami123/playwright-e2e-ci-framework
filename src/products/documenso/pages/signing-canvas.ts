import { expect, type Locator, type Page } from "@playwright/test";
import { documensoTimeouts } from "../env.js";

export const SIGNING_CANVAS_CLICK_OFFSET = {
  x: 100,
  y: 100,
} as const;

export async function clickSigningCanvas(
  page: Page,
  canvas: Locator,
  position: { x: number; y: number },
): Promise<void> {
  await page.getByRole("heading", { name: "Sign Document" }).hover();
  await expect(page.getByRole("tooltip")).toBeHidden({
    timeout: documensoTimeouts().request,
  });
  await canvas.click({
    position,
    timeout: documensoTimeouts().journey,
  });
}
