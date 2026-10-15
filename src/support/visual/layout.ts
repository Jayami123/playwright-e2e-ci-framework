export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface ScrollBox {
  readonly label: string;
  readonly sw: number;
  readonly cw: number;
  readonly sh: number;
  readonly ch: number;
}
export interface TextSpan {
  readonly label: string;
  readonly cellLeft: number;
  readonly cellRight: number;
  readonly textLeft: number;
  readonly textRight: number;
}

/** Touching edges do not count as overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function rectInsideWidth(r: Rect, viewportWidth: number, tolerancePx = 1): boolean {
  return r.x >= -tolerancePx && r.x + r.width <= viewportWidth + tolerancePx;
}

export function overflowingControls(boxes: readonly ScrollBox[], tolerancePx = 1): ScrollBox[] {
  return boxes.filter((b) => b.sw > b.cw + tolerancePx || b.sh > b.ch + tolerancePx);
}

/** Pairs where a label's text runs past the next cell's left edge (LTR order). */
export function overlappingNeighbours(spans: readonly TextSpan[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < spans.length; i += 1) {
    const a = spans[i];
    const b = spans[i + 1];
    if (a !== undefined && b !== undefined && a.textRight > b.cellLeft) {
      out.push(`${a.label}/${b.label}`);
    }
  }
  return out;
}
