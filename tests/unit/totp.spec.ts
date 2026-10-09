import { expect, test } from "@playwright/test";
import {
  assertTotpBudget,
  generateTotpCode,
  totpCodeValidForMs,
  totpMsRemainingInCurrentStep,
  TOTP_STEP_MS,
} from "../../src/core/totp.js";

const TEST_SECRET = "JBSWY3DPEHPK3PXP";
/** otplib 12.0.1 at epoch 1234567890000 ms (verified via node in this repo). */
const KNOWN_EPOCH_MS = 1_234_567_890_000;
const KNOWN_CODE = "742275";

test.describe("totp step budget", () => {
  test("full validity at the start of a step", { tag: ["@unit"] }, () => {
    const step = 1_000_000;
    const epochMs = step * TOTP_STEP_MS;
    expect(totpCodeValidForMs(epochMs)).toBe(2 * TOTP_STEP_MS);
    expect(totpMsRemainingInCurrentStep(epochMs)).toBe(TOTP_STEP_MS);
    assertTotpBudget({ epochMs, neededMs: 25_000 });
  });

  test("minimum mint budget is one step plus one millisecond", { tag: ["@unit"] }, () => {
    const step = 2_000_000;
    const lastMsOfStep = (step + 1) * TOTP_STEP_MS - 1;
    expect(totpCodeValidForMs(lastMsOfStep)).toBe(TOTP_STEP_MS + 1);
    expect(() => {
      assertTotpBudget({ epochMs: lastMsOfStep, neededMs: 31_000 });
    }).toThrow(/TOTP step budget too small/);
  });

  test("generateTotpCode matches a fixed epoch vector", { tag: ["@unit"] }, () => {
    expect(generateTotpCode(TEST_SECRET, KNOWN_EPOCH_MS)).toBe(KNOWN_CODE);
  });

  test("generateTotpCode returns a six-digit code", { tag: ["@unit"] }, () => {
    const code = generateTotpCode(TEST_SECRET, Date.now());
    expect(code).toMatch(/^\d{6}$/);
  });
});
