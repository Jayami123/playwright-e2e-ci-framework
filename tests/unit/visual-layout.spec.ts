import { expect, test } from "@playwright/test";
import {
  frameBands,
  overflowingControls,
  overlappingNeighbours,
  rectInsideWidth,
  rectsOverlap,
  type TextSpan,
} from "../../src/support/visual/layout.js";
import {
  onlyOnProjectsSuite,
  projectSkipReason,
  projectsOnlyReason,
} from "../../src/support/visual/projects.js";

test.describe("focus frame bands", () => {
  test("frameBands returns the top and bottom bands of the clip", { tag: ["@unit"] }, () => {
    expect(frameBands({ x: 10, y: 20, width: 140, height: 52 }, 10)).toEqual([
      { x: 10, y: 20, width: 140, height: 10 },
      { x: 10, y: 62, width: 140, height: 10 },
    ]);
  });
  test("frameBands never overlaps on a short clip", { tag: ["@unit"] }, () => {
    expect(frameBands({ x: 0, y: 0, width: 50, height: 12 }, 10)).toEqual([
      { x: 0, y: 0, width: 50, height: 6 },
      { x: 0, y: 6, width: 50, height: 6 },
    ]);
  });
});

function span(
  label: string,
  cellLeft: number,
  cellRight: number,
  textLeft: number,
  textRight: number,
): TextSpan {
  return { label, cellLeft, cellRight, textLeft, textRight };
}

test.describe("visual projects", () => {
  test("an allowed project has no skip reason", { tag: ["@unit"] }, () => {
    expect(projectSkipReason("visual-mobile", ["visual-mobile"])).toBeUndefined();
  });

  test("a disallowed project names the allowed ones", { tag: ["@unit"] }, () => {
    expect(projectSkipReason("visual-tablet", ["visual-mobile"])).toContain("visual-mobile");
  });

  test("the suite skip reason lists every allowed project", { tag: ["@unit"] }, () => {
    expect(projectsOnlyReason(["visual-desktop", "visual-tablet"])).toBe(
      "runs only in visual-desktop, visual-tablet (case is viewport-specific)",
    );
  });
});

const fixtureGuard = test.extend<{ mustNotSetUp: undefined }>({
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  mustNotSetUp: async ({}, use) => {
    await use(undefined);
    throw new Error("a test-scoped fixture was set up before the suite skip");
  },
});

fixtureGuard.describe("onlyOnProjectsSuite", () => {
  // The unit project is not a visual project, so this group must be skipped before its fixture runs:
  // the test reports "skipped", never the fixture error.
  onlyOnProjectsSuite(["visual-desktop"]);

  fixtureGuard("skips before test-scoped fixtures", { tag: ["@unit"] }, ({ mustNotSetUp }) => {
    expect(mustNotSetUp).toBeUndefined();
    throw new Error("the suite skip did not apply");
  });
});

test.describe("visual layout geometry", () => {
  test(
    "rectsOverlap is true when intersecting and false when edges touch",
    { tag: ["@unit"] },
    () => {
      const a = { x: 0, y: 0, width: 10, height: 10 };
      expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
      expect(rectsOverlap(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
      expect(rectsOverlap(a, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
    },
  );

  test("rectInsideWidth allows 1px tolerance on each side", { tag: ["@unit"] }, () => {
    expect(rectInsideWidth({ x: -1, y: 0, width: 394, height: 5 }, 393)).toBe(true);
    expect(rectInsideWidth({ x: -2, y: 0, width: 100, height: 5 }, 393)).toBe(false);
    expect(rectInsideWidth({ x: 300, y: 0, width: 95, height: 5 }, 393)).toBe(false);
  });

  test(
    "overflowingControls drops tolerated boxes and keeps a height overflow",
    { tag: ["@unit"] },
    () => {
      const fits = { label: "fits", sw: 101, cw: 100, sh: 24, ch: 24 };
      const tall = { label: "tall", sw: 100, cw: 100, sh: 29, ch: 24 };
      expect(overflowingControls([fits, tall])).toEqual([tall]);
    },
  );

  test("overlappingNeighbours flags the Step 0 weekday overlap", { tag: ["@unit"] }, () => {
    expect(
      overlappingNeighbours([span("Sun", 20, 29, 20, 49), span("Mon", 45, 53, 45, 78)]),
    ).toEqual(["Sun/Mon"]);
  });

  test("overlappingNeighbours is empty for non-overlapping spans", { tag: ["@unit"] }, () => {
    expect(
      overlappingNeighbours([span("Sun", 0, 60, 10, 40), span("Mon", 60, 120, 70, 100)]),
    ).toEqual([]);
  });
});
