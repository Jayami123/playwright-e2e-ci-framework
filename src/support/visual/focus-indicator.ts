/** Computed focus styles of one element in the chain: the focused control, then its ancestors. */
export type FocusStyle = {
  readonly tag: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
  readonly borderColor: string;
  /** Four sides, space separated, as read by the test (top right bottom left). */
  readonly borderStyle: string;
  readonly borderWidth: string;
};

function outlinePaints(s: FocusStyle): boolean {
  return (
    !["none", "hidden"].includes(s.outlineStyle) &&
    parseFloat(s.outlineWidth) > 0 &&
    colorAlpha(s.outlineColor) > 0
  );
}

/** Pure. True when at least one border side has a visible style and a non-zero width. */
export function borderPaints(s: FocusStyle): boolean {
  const styles = s.borderStyle.split(/\s+/);
  const widths = s.borderWidth.split(/\s+/).map(parseFloat);
  return styles.some((st, i) => !["none", "hidden"].includes(st) && (widths[i] ?? 0) > 0);
}

/** Pure. Alpha of a computed CSS colour: rgb() is 1, rgba() its 4th value, transparent 0. */
export function colorAlpha(color: string): number {
  if (color.trim() === "transparent") return 0;
  const m = /^rgba?\(([^)]*)\)$/.exec(color.trim());
  if (m === null) return 1;
  const parts = (m[1] ?? "").split(/[\s,/]+/).filter((p) => p !== "");
  return parts.length >= 4 ? Number(parts[3]) : 1;
}

/** Pure. Box-shadow layers that paint something: a non-transparent colour and a non-zero length. */
export function visibleShadowLayers(boxShadow: string): string[] {
  if (boxShadow.trim() === "none") return [];
  return boxShadow
    .split(/,(?![^(]*\))/)
    .map((layer) => layer.trim())
    .filter((layer) => {
      const color = /rgba?\([^)]*\)|transparent/.exec(layer)?.[0] ?? "rgb(0, 0, 0)";
      const lengths = (layer.replace(color, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
      return colorAlpha(color) > 0 && lengths.some((n) => n !== 0);
    });
}

/**
 * Pure. Visible focus indicators (WCAG 2.4.7): an outline, a box-shadow layer that is absent when
 * idle, or a border colour change on the focused control or an ancestor. Empty means none.
 */
export function focusIndicators(
  focused: readonly FocusStyle[],
  idle: readonly FocusStyle[],
): string[] {
  const found: string[] = [];
  focused.forEach((f, i) => {
    const before = idle[i];
    const where = `${String(i)}:${f.tag}`;
    const sameOutline =
      before !== undefined &&
      outlinePaints(before) &&
      before.outlineStyle === f.outlineStyle &&
      before.outlineWidth === f.outlineWidth &&
      before.outlineColor === f.outlineColor;
    if (outlinePaints(f) && !sameOutline) {
      found.push(`${where} outline`);
    }
    const idleLayers = before === undefined ? [] : visibleShadowLayers(before.boxShadow);
    if (visibleShadowLayers(f.boxShadow).some((l) => !idleLayers.includes(l))) {
      found.push(`${where} box-shadow`);
    }
    if (before !== undefined && before.borderColor !== f.borderColor && borderPaints(f)) {
      found.push(`${where} border-color`);
    }
  });
  return found;
}
