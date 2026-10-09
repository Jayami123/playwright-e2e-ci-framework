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
