import { authenticator } from "otplib";

/** RFC 6238 step length; matches Cal `packages/lib/totp.ts` default window partner. */
export const TOTP_STEP_MS = 30_000 as const;

/** Past and future steps Cal accepts: `[1, 0]`. */
export const TOTP_WINDOW = [1, 0] as const satisfies readonly [number, number];

const TOTP_STEP_SECONDS = TOTP_STEP_MS / 1_000;

export function totpStepIndex(epochMs: number): number {
  return Math.floor(epochMs / TOTP_STEP_MS);
}

/**
 * Milliseconds until a code minted at `epochMs` is no longer accepted under window `[1, 0]`
 * (valid through the end of step T+1 when minted in step T).
 */
export function totpCodeValidForMs(epochMs: number): number {
  const mintStep = totpStepIndex(epochMs);
  const expiresAtMs = (mintStep + 2) * TOTP_STEP_MS;
  return expiresAtMs - epochMs;
}

/** Milliseconds left in the current 30-second TOTP step (for step-edge budgeting). */
export function totpMsRemainingInCurrentStep(epochMs: number): number {
  const stepEndMs = (totpStepIndex(epochMs) + 1) * TOTP_STEP_MS;
  return stepEndMs - epochMs;
}

export function assertTotpBudget(options: {
  readonly epochMs: number;
  readonly neededMs: number;
}): void {
  const remainingMs = totpCodeValidForMs(options.epochMs);
  if (remainingMs < options.neededMs) {
    throw new Error(
      `TOTP step budget too small: ${String(remainingMs)}ms remaining in window, need ${String(options.neededMs)}ms`,
    );
  }
}

function authenticatorAtEpoch(epochMs: number): ReturnType<typeof authenticator.clone> {
  return authenticator.clone({
    epoch: epochMs,
    step: TOTP_STEP_SECONDS,
    window: [...TOTP_WINDOW],
  });
}

export function generateTotpCode(secret: string, epochMs: number): string {
  return authenticatorAtEpoch(epochMs).generate(secret);
}
