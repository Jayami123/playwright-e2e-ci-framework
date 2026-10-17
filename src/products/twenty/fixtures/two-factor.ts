import { TWENTY_ROUTES } from "../env.js";
import { generateTotpCode } from "../../../core/totp.js";
import { twentyGraphql } from "./graphql.js";
import type { TwentyQaMember } from "./qa-member.js";

const SECRET_SHAPE = /^[A-Z2-7]{16}$/;

const INITIATE = `mutation QaInitiateOtp {
  initiateOTPProvisioningForAuthenticatedUser { uri }
}`;

const VERIFY = `mutation QaVerifyOtp($otp: String!) {
  verifyTwoFactorAuthenticationMethodForAuthenticatedUser(otp: $otp) { success }
}`;

const SUMMARY = `query QaTwoFactorSummary {
  currentUser { currentUserWorkspace { twoFactorAuthenticationMethodSummary { status } } }
}`;

/** Pure; unit-tested. Never echoes the value. */
export function assertTotpSecretShape(secret: string): string {
  if (!SECRET_SHAPE.test(secret)) throw new Error("TOTP secret is not 16 base32 characters");
  return secret;
}

/** Pure; unit-tested. The base32 secret of an otpauth URI; throws unless it is 16 base32 chars. */
export function totpSecretFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
  return assertTotpSecretShape(secret ?? "");
}

/** Fixture enrolment (probe A-07): initiate, then verify with a code minted at now. */
export async function enrolTotpViaApi(
  member: TwentyQaMember,
): Promise<{ readonly secret: string }> {
  const initiated = await twentyGraphql<{
    initiateOTPProvisioningForAuthenticatedUser?: { uri?: string | null } | null;
  }>(TWENTY_ROUTES.metadata, { authorization: member.authorization, query: INITIATE });
  const uri = initiated.initiateOTPProvisioningForAuthenticatedUser?.uri;
  if (uri === undefined || uri === null) throw new Error("Twenty returned no OTP provisioning uri");
  const secret = totpSecretFromUri(uri);
  const verified = await twentyGraphql<{
    verifyTwoFactorAuthenticationMethodForAuthenticatedUser?: { success?: boolean | null } | null;
  }>(TWENTY_ROUTES.metadata, {
    authorization: member.authorization,
    query: VERIFY,
    variables: { otp: generateTotpCode(secret, Date.now()) },
  });
  if (verified.verifyTwoFactorAuthenticationMethodForAuthenticatedUser?.success !== true) {
    throw new Error("Twenty did not verify the enrolment code");
  }
  return { secret };
}

export async function twoFactorStatuses(member: TwentyQaMember): Promise<readonly string[]> {
  const data = await twentyGraphql<{
    currentUser?: {
      currentUserWorkspace?: {
        twoFactorAuthenticationMethodSummary?: Array<{ status?: string | null } | null> | null;
      } | null;
    } | null;
  }>(TWENTY_ROUTES.metadata, { authorization: member.authorization, query: SUMMARY });
  const summary =
    data.currentUser?.currentUserWorkspace?.twoFactorAuthenticationMethodSummary ?? [];
  return summary.flatMap((entry) => (typeof entry?.status === "string" ? [entry.status] : []));
}
