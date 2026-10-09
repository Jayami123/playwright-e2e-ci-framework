import { expect, test } from "@playwright/test";
import {
  assertTotpBudget,
  generateTotpCode,
  totpCodeValidForMs,
  TOTP_STEP_MS,
} from "../../src/core/totp.js";

const TEST_SECRET = "JBSWY3DPEHPK3PXP";

test.describe("totp step budget", () => {
  test("full validity at the start of a step", { tag: ["@unit"] }, () => {
    const step = 1_000_000;
    const epochMs = step * TOTP_STEP_MS;
    expect(totpCodeValidForMs(epochMs)).toBe(2 * TOTP_STEP_MS);
    assertTotpBudget({ epochMs, neededMs: 25_000 });
  });

  test("one millisecond before the window ends", { tag: ["@unit"] }, () => {
    const step = 2_000_000;
    const epochMs = (step + 2) * TOTP_STEP_MS - 1;
    expect(totpCodeValidForMs(epochMs)).toBe(1);
    expect(() => {
      assertTotpBudget({ epochMs, neededMs: 25_000 });
    }).toThrow(/TOTP step budget too small/);
  });

  test("generateTotpCode is stable for a fixed epoch", { tag: ["@unit"] }, () => {
    const epochMs = 1_700_000_000_000;
    const first = generateTotpCode(TEST_SECRET, epochMs);
    const second = generateTotpCode(TEST_SECRET, epochMs);
    expect(first).toBe(second);
    expect(first).toMatch(/^\d{6}$/);
  });
});
