import { loginViaApi } from "../../../src/products/documenso/auth.js";
import { documensoTimeouts } from "../../../src/products/documenso/env.js";
import { expect, test } from "../../../src/products/documenso/fixtures.js";
import { PasskeysSettingsPage } from "../../../src/products/documenso/pages/passkeys.page.js";
import { countDocumensoPasskeysForUser } from "../../../src/products/documenso/qa-user.js";
import { SecuritySettingsPage } from "../../../src/products/documenso/pages/security.page.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };
const PASSKEY_NAME = "QA passkey";

test.use({ storageState: EMPTY_STORAGE });

test(
  "P1-DOC-PK-001 register passkey",
  {
    tag: ["@documenso", "@auth", "@passkey"],
    annotation: [
      { type: "testId", description: "P1-DOC-PK-001" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, documensoUser, virtualAuthenticator }) => {
    await test.step("Passkey origin is a secure context", async () => {
      await page.goto("/signin", { waitUntil: "domcontentloaded" });
      const isSecureContext = await page.evaluate("window.isSecureContext");
      expect(isSecureContext).toBe(true);
    });

    await test.step("API login with virtual authenticator attached", async () => {
      const login = await loginViaApi(page.request, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, "documensoUser password login").toBe(201);
    });

    const passkeys = new PasskeysSettingsPage(page);

    await test.step("Open passkeys from security settings", async () => {
      const security = new SecuritySettingsPage(page);
      await security.goto();
      await passkeys.openFromSecuritySettings();
    });

    await test.step("Create named passkey", async () => {
      await passkeys.createPasskey(PASSKEY_NAME);
      await expect(passkeys.createdPasskeyToast()).toBeVisible({
        timeout: documensoTimeouts().request,
      });
      await expect(passkeys.addPasskeyDialog()).toBeHidden({
        timeout: documensoTimeouts().request,
      });
    });

    await test.step("Passkey row visible after fresh navigation", async () => {
      await passkeys.gotoPasskeys();
      await expect(passkeys.passkeyNameCell(PASSKEY_NAME)).toBeVisible({
        timeout: documensoTimeouts().request,
      });
    });

    await test.step("Virtual authenticator holds one credential", async () => {
      const { credentials } = await virtualAuthenticator.cdp.send("WebAuthn.getCredentials", {
        authenticatorId: virtualAuthenticator.authenticatorId,
      });
      expect(credentials).toHaveLength(1);
    });

    await test.step("Database records one passkey for the user", async () => {
      const count = await countDocumensoPasskeysForUser(documensoUser.id);
      expect(count).toBe(1);
    });
  },
);
