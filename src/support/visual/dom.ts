import type { Locator, Page } from "@playwright/test";
import type { ScrollBox } from "./layout.js";

/**
 * tsconfig has no DOM lib, so element functions take a minimal local interface (repo precedent:
 * Cal i18n specs). Strings passed to page.evaluate are expressions; Locator.evaluate needs a function.
 */
interface ScrollEl {
  getAttribute(name: string): string | null;
  innerText: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

export async function documentScroll(
  page: Page,
): Promise<{ readonly scrollWidth: number; readonly clientWidth: number }> {
  return {
    scrollWidth: await page.evaluate<number>("document.documentElement.scrollWidth"),
    clientWidth: await page.evaluate<number>("document.documentElement.clientWidth"),
  };
}

export async function computedStyleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((el: unknown, prop: string) => {
    const g = globalThis as unknown as {
      getComputedStyle(e: unknown): Record<string, string | undefined>;
    };
    return g.getComputedStyle(el)[prop] ?? "";
  }, property);
}

export async function scrollSizeOf(
  locator: Locator,
): Promise<{ readonly scrollWidth: number; readonly clientWidth: number }> {
  return locator.evaluate((el: ScrollEl) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
}

/** Scroll sizes of every matched element, for overflowingControls(). */
export async function measureScroll(controls: Locator): Promise<ScrollBox[]> {
  return controls.evaluateAll((els: readonly ScrollEl[]) =>
    els.map((el) => ({
      label: el.getAttribute("aria-label") ?? el.innerText,
      sw: el.scrollWidth,
      cw: el.clientWidth,
      sh: el.scrollHeight,
      ch: el.clientHeight,
    })),
  );
}

/** True when the document's active element is the locator's element or inside it. */
export async function containsActiveElement(locator: Locator): Promise<boolean> {
  return locator.evaluate((el: { contains(other: unknown): boolean }) => {
    const doc = (globalThis as unknown as { document: { activeElement: unknown } }).document;
    return el.contains(doc.activeElement);
  });
}

export async function boundingBoxOf(
  label: string,
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${label} has no bounding box`);
  }
  return box;
}
