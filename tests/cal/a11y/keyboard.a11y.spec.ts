import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { timeouts } from "../../../src/products/cal/env.js";
import { qaAttendee } from "../../../src/products/cal/factories.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import {
  A11Y001_FOCUS_LOST_ISSUE,
  A11Y002_TIMEZONE_FOCUS_ISSUE,
  CAL_FROZEN_SLOT_COUNT,
} from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

const MAX_TABS = 60;

function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate<string | null>(
    "document.activeElement && document.activeElement.getAttribute('data-testid')",
  );
}

function focusedElementName(page: Page): Promise<string> {
  return page.evaluate<string>(
    "document.activeElement === document.body ? 'BODY' : document.activeElement.tagName",
  );
}

/** True when the active element is a calendar day whose text starts with the given day number. */
function isFocusedDay(page: Page, day: string): Promise<boolean> {
  return page.evaluate<boolean>(
    `(() => { const e = document.activeElement; return !!e && e.getAttribute('data-testid') === 'day' && e.innerText.trim().startsWith('${day}'); })()`,
  );
}

interface ActiveDoc {
  document: { activeElement: unknown };
}

function isActive(locator: Locator): Promise<boolean> {
  return locator.evaluate(
    (el: unknown) => (globalThis as unknown as ActiveDoc).document.activeElement === el,
  );
}

/** Tab (from wherever focus is) until the locator holds focus, so :focus-visible applies. */
async function tabTo(
  page: Page,
  locator: Locator,
  label: string,
  key: "Tab" | "Shift+Tab" = "Tab",
): Promise<void> {
  for (let i = 0; i < MAX_TABS; i += 1) {
    if (await isActive(locator)) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(`${label} was not reached by keyboard within ${String(MAX_TABS)} presses`);
}

/** Screenshots of a control (box plus 8 px) while it holds keyboard focus and after it is blurred. */
async function focusedAndIdle(
  page: Page,
  focus: Locator,
  clipTarget: Locator,
  label: string,
): Promise<{ focused: Buffer; idle: Buffer }> {
  const box = await clipTarget.boundingBox();
  if (box === null) {
    throw new Error(`${label} has no bounding box`);
  }
  const clip = {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 8),
    width: box.width + 16,
    height: box.height + 16,
  };
  await expect(focus, `${label} holds focus`).toBeFocused();
  const focused = await page.screenshot({ clip, animations: "disabled" });
  await page.evaluate("document.activeElement.blur()");
  const idle = await page.screenshot({ clip, animations: "disabled" });
  return { focused, idle };
}

test.describe("Cal keyboard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "P1-CAL-A11Y-001 a booking can be completed with the keyboard alone",
    { tag: ["@cal", "@a11y"], annotation: { type: "testId", description: "P1-CAL-A11Y-001" } },
    async ({ page, booker, bookingQaUser }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await page.goto(bookingQaUser.bookerPath, { waitUntil: "domcontentloaded" });
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      // Tue 15: a 14th 09:00 booking shows "The event is in the past" under the frozen clock (Step 0)
      for (let i = 0; i < 40 && !(await isFocusedDay(page, "15")); i += 1) {
        await page.keyboard.press("Tab");
      }
      expect(await isFocusedDay(page, "15"), "day 15 reached by keyboard").toBe(true);
      await page.keyboard.press("Enter");
      for (let i = 0; i < 30 && (await focusedTestId(page)) !== CAL_TEST_IDS.timeSlot; i += 1) {
        await page.keyboard.press("Tab");
      }
      expect(await focusedTestId(page), "slot reached by keyboard").toBe(CAL_TEST_IDS.timeSlot);
      await page.keyboard.press("Space");
      await expect(page.getByTestId(CAL_TEST_IDS.confirmBook)).toBeVisible();
      // Recorded once the form is visible; asserted at the very end so the keyboard flow is still proven.
      const focusAfterSelect = await focusedElementName(page);
      // Evidence now, while the form is still on screen: the screenshot must show the bug state, not the success page.
      await attachKnownBugEvidence(page, testInfo, {
        issue: A11Y001_FOCUS_LOST_ISSUE,
        observed: { focusAfterSelect },
        expected: { focusAfterSelect: "an element inside the booking form, not BODY" },
      });
      await page.keyboard.press("Tab");
      await page.keyboard.type("QA Keyboard");
      await page.keyboard.press("Tab");
      await page.keyboard.type(qaAttendee().email);
      for (let i = 0; i < 15 && (await focusedTestId(page)) !== CAL_TEST_IDS.confirmBook; i += 1) {
        await page.keyboard.press("Tab");
      }
      expect(await focusedTestId(page)).toBe(CAL_TEST_IDS.confirmBook);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/booking\//, { timeout: timeouts().page });
      await expect(page.getByTestId(CAL_TEST_IDS.successPage)).toBeVisible();
      // Known bug last: every hard assert above has already passed (repo pattern, 2fa.spec.ts:120).
      test.fail(true, A11Y001_FOCUS_LOST_ISSUE);
      expect(focusAfterSelect, "choosing a slot must move focus into the booking form").not.toBe(
        "BODY",
      );
    },
  );

  test(
    "P1-CAL-A11Y-002 focus rings are visible, there is no keyboard trap and Escape keeps focus",
    { tag: ["@cal", "@a11y"], annotation: { type: "testId", description: "P1-CAL-A11Y-002" } },
    async ({ page, booker }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);

      // Focus ring: every control looks different when focused by keyboard than when blurred.
      const controls: { label: string; focus: Locator; clip: Locator }[] = [
        {
          label: "overlay-calendar-switch",
          focus: page.getByTestId(CAL_TEST_IDS.overlayCalendarSwitch),
          clip: page.getByTestId(CAL_TEST_IDS.overlayCalendarSwitch),
        },
        {
          label: "toggle-group-item-month_view",
          focus: page.getByTestId("toggle-group-item-month_view"),
          clip: page.getByTestId("toggle-group-item-month_view"),
        },
        {
          label: "incrementMonth",
          focus: page.getByTestId(CAL_TEST_IDS.incrementMonth),
          clip: page.getByTestId(CAL_TEST_IDS.incrementMonth),
        },
        {
          label: "day 14",
          focus: page.getByTestId(CAL_TEST_IDS.day).filter({ hasText: /^14/ }),
          clip: page.getByTestId(CAL_TEST_IDS.day).filter({ hasText: /^14/ }),
        },
        {
          label: "first slot",
          focus: booker.firstSlot(),
          clip: booker.firstSlot(),
        },
      ];
      for (const control of controls) {
        await tabTo(page, control.focus, control.label);
        const { focused, idle } = await focusedAndIdle(
          page,
          control.focus,
          control.clip,
          control.label,
        );
        expect(focused.equals(idle), `${control.label} must show a focus ring`).toBe(false);
      }

      // Timezone combobox: Escape keeps focus there, Tab moves on to the next-month button.
      await booker.timezoneSelect.focus();
      await page.keyboard.press("Escape");
      await expect(booker.timezoneSelect).toBeFocused();
      await page.keyboard.press("Tab");
      expect(await focusedTestId(page)).toBe(CAL_TEST_IDS.incrementMonth);

      // No trap: Tab through the page (never activating a slot); focus passes the slots and leaves them.
      await page.evaluate("document.activeElement.blur()");
      await page.reload({ waitUntil: "domcontentloaded" });
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      const visited: string[] = [];
      for (let i = 0; i < MAX_TABS; i += 1) {
        await page.keyboard.press("Tab");
        visited.push((await focusedTestId(page)) ?? (await focusedElementName(page)));
      }
      // First pass through the slot list: the entry after the last slot of that run must be the page
      // boundary (BODY) or the first control again, never another slot.
      const firstSlot = visited.indexOf(CAL_TEST_IDS.timeSlot);
      expect(firstSlot, `Tab order never reached a slot: ${visited.join(" > ")}`).toBeGreaterThan(
        -1,
      );
      const afterRun = visited.slice(firstSlot).find((id) => id !== CAL_TEST_IDS.timeSlot);
      expect(
        afterRun === "BODY" || afterRun === visited[0],
        `focus must leave the slot list (no trap): ${visited.join(" > ")}`,
      ).toBe(true);

      // Timezone select last: known product bug (no visible focus indicator), after every hard check above.
      await page.reload({ waitUntil: "domcontentloaded" });
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await tabTo(page, booker.timezoneSelect, "timezone-select");
      const focusTarget = await page.evaluate<{
        tag: string;
        role: string | null;
        testId: string | null;
        ariaLabel: string | null;
        insideTimezoneSelect: boolean;
      }>(
        `(() => { const e = document.activeElement; const w = document.querySelector('[data-testid="timezone-select"]'); return { tag: e.tagName, role: e.getAttribute('role'), testId: e.getAttribute('data-testid'), ariaLabel: e.getAttribute('aria-label'), insideTimezoneSelect: !!w && w.contains(e) }; })()`,
      );
      expect(
        focusTarget.insideTimezoneSelect,
        "focus is on the combobox inside timezone-select",
      ).toBe(true);
      expect(focusTarget.tag).toBe("INPUT");
      const boxShadows = await page.evaluate<string[]>(
        `(() => { let e = document.activeElement; const out = []; for (let i = 0; i < 4; i += 1) { e = e.parentElement; out.push(getComputedStyle(e).boxShadow); } return out; })()`,
      );
      const tz = await focusedAndIdle(
        page,
        booker.timezoneSelect,
        booker.timezoneSelectRoot,
        "timezone-select",
      );
      await testInfo.attach("timezone-focused", { body: tz.focused, contentType: "image/png" });
      await testInfo.attach("timezone-idle", { body: tz.idle, contentType: "image/png" });
      await attachKnownBugEvidence(page, testInfo, {
        issue: A11Y002_TIMEZONE_FOCUS_ISSUE,
        observed: { focusTarget, boxShadows, focusedEqualsIdle: tz.focused.equals(tz.idle) },
        expected: { focusedEqualsIdle: false },
      });
      test.fail(true, A11Y002_TIMEZONE_FOCUS_ISSUE);
      expect(
        tz.focused.equals(tz.idle),
        "timezone select must show a visible focus indicator",
      ).toBe(false);
    },
  );
});
