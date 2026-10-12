import { type Locator } from "@playwright/test";
import { documensoTimeouts } from "../env.js";

export const SIGNING_CANVAS_CLICK_OFFSET = {
  x: 100,
  y: 100,
} as const;

export async function clickSigningCanvas(
  canvas: Locator,
  position: { x: number; y: number },
): Promise<void> {
  // Recipient tooltip (DocumentReadOnlyFields showRecipientTooltip) anchors on the
  // field overlay, not the Sign Document heading — click the canvas field directly.
  await canvas.click({
    position,
    timeout: documensoTimeouts().journey,
  });
}
