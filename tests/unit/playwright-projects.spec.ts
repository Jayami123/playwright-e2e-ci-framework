import { expect, test } from "@playwright/test";
import { selectedProjects } from "../../src/core/projects.js";

const ALL = ["cal-setup", "unit", "cal-chromium", "cal-firefox", "documenso-chromium"];

test.describe("Playwright --project argv selection", () => {
  test("no --project flag selects every product", { tag: ["@unit"] }, () => {
    expect(selectedProjects(["playwright", "test"], ALL)).toBe(true);
    expect(selectedProjects(["npx", "playwright", "test"], ["cal-chromium"])).toBe(true);
  });

  test("--project=documenso-chromium does not select Cal", { tag: ["@unit"] }, () => {
    const argv = ["playwright", "test", "--project=documenso-chromium"];
    expect(selectedProjects(argv, ["documenso-chromium"])).toBe(true);
    expect(selectedProjects(argv, ["cal-chromium", "cal-firefox", "cal-setup"])).toBe(false);
  });

  test("--project with multiple names", { tag: ["@unit"] }, () => {
    const argv = ["playwright", "test", "--project", "cal-chromium", "cal-firefox"];
    expect(selectedProjects(argv, ["cal-chromium"])).toBe(true);
    expect(selectedProjects(argv, ["cal-firefox"])).toBe(true);
    expect(selectedProjects(argv, ["documenso-chromium"])).toBe(false);
  });

  test("project names are case-insensitive", { tag: ["@unit"] }, () => {
    expect(selectedProjects(["test", "--project=CAL-CHROMIUM"], ["cal-chromium"])).toBe(true);
  });

  test("* wildcard matches chromium projects", { tag: ["@unit"] }, () => {
    const argv = ["test", "--project=*chromium"];
    expect(selectedProjects(argv, ["cal-chromium"])).toBe(true);
    expect(selectedProjects(argv, ["documenso-chromium"])).toBe(true);
    expect(selectedProjects(argv, ["cal-firefox"])).toBe(false);
  });

  test(
    "--project=unit does not select Cal or Documenso harness projects",
    { tag: ["@unit"] },
    () => {
      const argv = ["test", "--project=unit"];
      expect(selectedProjects(argv, ["unit"])).toBe(true);
      expect(selectedProjects(argv, ["cal-chromium", "documenso-chromium"])).toBe(false);
    },
  );
});
