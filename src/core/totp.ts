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

/** Minimum ms left in the current step before typing a TOTP code in Cal E2E flows. */
export const TOTP_TYPING_BUDGET_MS = 25_000 as const;

/**
 * Epoch to mint a TOTP code when the test needs `neededMs` of typing time in the current step.
 * If the current step is too short, uses the start of the next step (no sleep, no regenerate loop).
 */
export function resolveTotpTypingEpochMs(options: {
  readonly epochMs: number;
  readonly neededMs: number;
}): number {
  if (totpMsRemainingInCurrentStep(options.epochMs) >= options.neededMs) {
    return options.epochMs;
  }
  return (totpStepIndex(options.epochMs) + 1) * TOTP_STEP_MS;
}

export function assertTotpBudget(options: {
  readonly epochMs: number;
  readonly neededMs: number;
}): void {
  const remainingMs = totpMsRemainingInCurrentStep(options.epochMs);
  if (remainingMs < options.neededMs) {
    throw new Error(
      `TOTP step budget too small: ${String(remainingMs)}ms remaining in current step, need ${String(options.neededMs)}ms`,
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

export function generateTotpCodeForTyping(
  secret: string,
  epochMs: number,
  neededMs: number = TOTP_TYPING_BUDGET_MS,
): string {
  const mintEpochMs = resolveTotpTypingEpochMs({ epochMs, neededMs });
  return generateTotpCode(secret, mintEpochMs);
}
