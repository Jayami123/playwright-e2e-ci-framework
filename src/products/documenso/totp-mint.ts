import { epochMsForStableTotpMint, generateTotpCode, totpMsLeftInStep } from "../../core/totp.js";

/** Documenso accepts only the current 30 s TOTP step; mint with runway before UI/API submit. */
export const DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP = 5_000;

/** True when minting at `epochMs` should wait for the next RFC 6238 step boundary first. */
export function documensoTotpShouldWaitForNextStep(
  epochMs: number,
  minMsLeftInStep: number = DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP,
): boolean {
  return totpMsLeftInStep(epochMs) < minMsLeftInStep;
}

export async function epochMsForDocumensoTotpMint(
  minMsLeftInStep: number = DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP,
): Promise<number> {
  return epochMsForStableTotpMint(minMsLeftInStep);
}

export async function mintDocumensoTotpCode(
  secret: string,
  minMsLeftInStep: number = DOCUMENSO_TOTP_MIN_MS_LEFT_IN_STEP,
): Promise<{ code: string; mintedAtMs: number }> {
  const mintedAtMs = await epochMsForDocumensoTotpMint(minMsLeftInStep);
  return { code: generateTotpCode(secret, mintedAtMs), mintedAtMs };
}
