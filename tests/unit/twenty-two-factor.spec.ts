import { expect, test } from "@playwright/test";
import { qaFreshMemberEmail } from "../../src/products/twenty/fixtures/qa-member.js";
import { totpSecretFromUri } from "../../src/products/twenty/fixtures/two-factor.js";

test.describe("Twenty two-factor helpers", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("reads the secret from an otpauth uri", () => {
    const uri = "otpauth://totp/Twenty:a@example.test?secret=JBSWY3DPEHPK3PXP&issuer=Twenty";
    expect(totpSecretFromUri(uri)).toBe("JBSWY3DPEHPK3PXP");
  });

  test("a secret that is not 16 base32 characters throws without echoing it", () => {
    expect(() => totpSecretFromUri("otpauth://totp/x?secret=abc")).toThrow(/16 base32/);
    expect(() => totpSecretFromUri("otpauth://totp/x?secret=abc")).not.toThrow(/abc/);
    expect(() => totpSecretFromUri("otpauth://totp/x")).toThrow(/16 base32/);
  });

  test("fresh member email stays under the p1-qa- prefix", () => {
    const email = qaFreshMemberEmail(42, 1, 3);
    expect(email).toBe("p1-qa-42-1-f3@example.test");
    expect(email.startsWith("p1-qa-")).toBe(true);
  });
});
