import { expect, test } from "@playwright/test";
import {
  colorAlpha,
  focusIndicators,
  visibleShadowLayers,
  type FocusStyle,
} from "../../src/support/visual/focus-indicator.js";

const plain = (tag: string, boxShadow = "none"): FocusStyle => ({
  tag,
  outlineStyle: "none",
  outlineWidth: "0px",
  outlineColor: "rgb(0, 0, 0)",
  boxShadow,
  borderColor: "rgb(229, 231, 235) rgb(229, 231, 235)",
});

// CI run 38909004523, timezone-select wrapper: a Tailwind ring layer with 0px spread paints nothing.
const CAL_ZERO_RING =
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(59, 130, 246, 0.29) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px";

test.describe("focus indicator styles", () => {
  test("colorAlpha reads rgb, rgba and transparent", { tag: ["@unit"] }, () => {
    expect(colorAlpha("rgb(1, 2, 3)")).toBe(1);
    expect(colorAlpha("rgba(59, 130, 246, 0.29)")).toBe(0.29);
    expect(colorAlpha("rgba(0, 0, 0, 0)")).toBe(0);
    expect(colorAlpha("transparent")).toBe(0);
  });

  test("zero-length and transparent shadow layers are not visible", { tag: ["@unit"] }, () => {
    expect(visibleShadowLayers(CAL_ZERO_RING)).toEqual([]);
    expect(visibleShadowLayers("none")).toEqual([]);
    expect(visibleShadowLayers("rgb(59, 130, 246) 0px 0px 0px 2px")).toHaveLength(1);
  });

  test("the CI timezone-select chain has no focus indicator", { tag: ["@unit"] }, () => {
    const chain = [
      plain("INPUT"),
      plain("DIV"),
      plain("DIV"),
      plain("DIV", CAL_ZERO_RING),
      plain("DIV"),
    ];
    expect(focusIndicators(chain, chain)).toEqual([]);
  });

  test("a ring, an outline or a border change counts as an indicator", { tag: ["@unit"] }, () => {
    const idle = [plain("INPUT"), plain("DIV")];
    expect(
      focusIndicators([plain("INPUT"), plain("DIV", "rgb(17, 24, 39) 0px 0px 0px 2px")], idle),
    ).toEqual(["1:DIV box-shadow"]);
    expect(
      focusIndicators(
        [{ ...plain("INPUT"), outlineStyle: "auto", outlineWidth: "1px" }, plain("DIV")],
        idle,
      ),
    ).toEqual(["0:INPUT outline"]);
    expect(
      focusIndicators(
        [plain("INPUT"), { ...plain("DIV"), borderColor: "rgb(0, 0, 0) rgb(0, 0, 0)" }],
        idle,
      ),
    ).toEqual(["1:DIV border-color"]);
  });

  test("a shadow already there when idle is not a focus indicator", { tag: ["@unit"] }, () => {
    const card = [plain("DIV", "rgba(0, 0, 0, 0.1) 0px 1px 3px 0px")];
    expect(focusIndicators(card, card)).toEqual([]);
  });
});
