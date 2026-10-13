import { expect, test } from "@playwright/test";
import { TOTP_STEP_MS } from "../../src/core/totp.js";
import {
  DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP,
  documensoTotpShouldWaitForNextStep,
} from "../../src/products/documenso/totp-mint.js";

test.describe("Documenso TOTP mint step guard", () => {
  test("waits when fewer than 5 s remain in the step", { tag: ["@unit"] }, () => {
    const fiftyMsLeft = TOTP_STEP_MS * 42 + (TOTP_STEP_MS - 50);
    expect(
      documensoTotpShouldWaitForNextStep(fiftyMsLeft, DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP),
    ).toBe(true);
  });

  test("does not wait when 20 s remain in the step", { tag: ["@unit"] }, () => {
    const twentySecondsLeft = TOTP_STEP_MS * 42 + (TOTP_STEP_MS - 20_000);
    expect(
      documensoTotpShouldWaitForNextStep(twentySecondsLeft, DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP),
    ).toBe(false);
  });
});
