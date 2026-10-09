import { expect, test } from "@playwright/test";
import { generateTotpCode } from "../../src/core/totp.js";

const TEST_SECRET = "JBSWY3DPEHPK3PXP";
/** otplib 12.0.1 at epoch 1234567890000 ms (verified via node in this repo). */
const KNOWN_EPOCH_MS = 1_234_567_890_000;
const KNOWN_CODE = "742275";

test.describe("totp", () => {
  test("generateTotpCode matches a fixed epoch vector", { tag: ["@unit"] }, () => {
    expect(generateTotpCode(TEST_SECRET, KNOWN_EPOCH_MS)).toBe(KNOWN_CODE);
  });

  test("generateTotpCode returns a six-digit code", { tag: ["@unit"] }, () => {
    const code = generateTotpCode(TEST_SECRET, Date.now());
    expect(code).toMatch(/^\d{6}$/);
  });
});
