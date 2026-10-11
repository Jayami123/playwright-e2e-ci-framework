import { authenticator } from "otplib";

/** RFC 6238 step length; matches Cal `packages/lib/totp.ts` default window partner. */
export const TOTP_STEP_MS = 30_000 as const;

/** Cal accepts the current step and one previous step: `[1, 0]`. */
export const TOTP_WINDOW = [1, 0] as const satisfies readonly [number, number];

const TOTP_STEP_SECONDS = TOTP_STEP_MS / 1_000;

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

/** Milliseconds remaining in the RFC 6238 step that contains `epochMs` (Documenso uses a 30 s step). */
export function totpMsLeftInStep(epochMs: number): number {
  return TOTP_STEP_MS - (epochMs % TOTP_STEP_MS);
}

/** Zero-based TOTP step index for `epochMs` (Documenso verifies only the current step). */
export function totpStepNumber(epochMs: number): number {
  return Math.floor(epochMs / TOTP_STEP_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Returns an epoch suitable for minting a code when two authorize POSTs must share one step.
 * Waits once until the next step boundary when fewer than `minMsLeftInStep` ms remain.
 */
export async function epochMsForStableTotpMint(minMsLeftInStep: number): Promise<number> {
  const now = Date.now();
  const msLeft = totpMsLeftInStep(now);
  if (msLeft >= minMsLeftInStep) {
    return now;
  }
  const nextBoundary = (totpStepNumber(now) + 1) * TOTP_STEP_MS;
  await delay(nextBoundary - now);
  return Date.now();
}
