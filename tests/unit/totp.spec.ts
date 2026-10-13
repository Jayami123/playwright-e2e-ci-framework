import { expect, test } from "@playwright/test";
import { epochMsForStableTotpMint, generateTotpCode, TOTP_STEP_MS } from "../../src/core/totp.js";

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

test.describe("epochMsForStableTotpMint", () => {
  test("rejects thresholds outside one step", { tag: ["@unit"] }, async () => {
    for (const bad of [-1, TOTP_STEP_MS, TOTP_STEP_MS + 1, Number.NaN]) {
      await expect(epochMsForStableTotpMint(bad)).rejects.toThrow(RangeError);
    }
  });

  test("waits again when the timer wakes up early", { tag: ["@unit"] }, async () => {
    const step = TOTP_STEP_MS * 43;
    const clock = [step - 50, step - 1, step + 10];
    const realNow = Date.now;
    const realSetTimeout = globalThis.setTimeout;
    let waits = 0;
    Date.now = () => clock[Math.min(waits, clock.length - 1)] ?? step + 10;
    globalThis.setTimeout = ((fn: () => void) => {
      waits += 1;
      fn();
      return 0;
    }) as unknown as typeof setTimeout;
    try {
      expect(await epochMsForStableTotpMint(5_000)).toBe(step + 10);
      expect(waits).toBe(2);
    } finally {
      Date.now = realNow;
      globalThis.setTimeout = realSetTimeout;
    }
  });
});
