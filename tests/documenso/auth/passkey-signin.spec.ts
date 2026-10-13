import {
  documensoHasSessionIdCookie,
  readSession,
  sessionHasEmail,
} from "../../../src/products/documenso/auth.js";
import { documensoTimeouts } from "../../../src/products/documenso/env.js";
import { expect, test } from "../../../src/products/documenso/fixtures.js";
import {
  DOCUMENSO_PASSKEY_NAME,
  enrolPasskeyForSignIn,
  readVirtualAuthenticatorSignCount,
} from "../../../src/products/documenso/passkey-enrol.js";
import { SignInPage } from "../../../src/products/documenso/pages/signin.page.js";
import {
  countDocumensoPasskeysForUser,
  readDocumensoPasskeyCounter,
} from "../../../src/products/documenso/qa-user.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };

test.use({ storageState: EMPTY_STORAGE });

test(
  "P1-DOC-PK-002 passkey sign-in",
  {
    tag: ["@documenso", "@auth", "@passkey"],
    annotation: [
      { type: "testId", description: "P1-DOC-PK-002" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, documensoUser, virtualAuthenticator }) => {
    await enrolPasskeyForSignIn(page, documensoUser);

    const signCountAfterRegister = await test.step("Record signCount after register", async () => {
      return await readVirtualAuthenticatorSignCount(virtualAuthenticator);
    });

    const dbCounterAfterRegister =
      await test.step("Record DB passkey counter after register", async () => {
        return await readDocumensoPasskeyCounter(documensoUser.id);
      });

    const signIn = new SignInPage(page);

    await test.step("Sign out in the same browser context", async () => {
      await signIn.signOut();
    });

    await test.step("Open sign-in and authenticate with passkey", async () => {
      await signIn.goto();
      const authorize = await signIn.clickPasskeySignIn();
      expect(authorize.status(), "Documenso passkey authorize").toBe(200);
      const session = await readSession(page.request);
      expect(session.isAuthenticated).toBe(true);
      expect(sessionHasEmail(session, documensoUser.email)).toBe(true);
    });

    await test.step("Authenticator signCount increased after sign-in", async () => {
      const signCountAfterSignIn = await readVirtualAuthenticatorSignCount(virtualAuthenticator);
      expect(signCountAfterSignIn).toBeGreaterThan(signCountAfterRegister);
      const dbCounterAfterSignIn = await readDocumensoPasskeyCounter(documensoUser.id);
      expect(dbCounterAfterSignIn).toBe(signCountAfterSignIn);
      expect(dbCounterAfterSignIn).toBeGreaterThan(dbCounterAfterRegister);
    });
  },
);

test(
  "P1-DOC-PK-003 deleted passkey rejected at sign-in",
  {
    tag: ["@documenso", "@auth", "@passkey"],
    annotation: [
      { type: "testId", description: "P1-DOC-PK-003" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, documensoUser, virtualAuthenticator }) => {
    const passkeys = await enrolPasskeyForSignIn(page, documensoUser);

    await test.step("Delete passkey in settings", async () => {
      await passkeys.deletePasskey(DOCUMENSO_PASSKEY_NAME);
      await expect(passkeys.removedPasskeyToast()).toBeVisible({
        timeout: documensoTimeouts().request,
      });
      await passkeys.gotoPasskeys();
      await expect(passkeys.passkeyNameCell(DOCUMENSO_PASSKEY_NAME)).toBeHidden({
        timeout: documensoTimeouts().request,
      });
      const count = await countDocumensoPasskeysForUser(documensoUser.id);
      expect(count).toBe(0);
    });

    const signIn = new SignInPage(page);

    await test.step("Sign out in the same browser context", async () => {
      await signIn.signOut();
    });

    await test.step("Passkey sign-in returns NOT_SETUP and does not create a session", async () => {
      await signIn.goto();
      const authorize = await signIn.clickPasskeySignIn();
      console.log(
        `P7-OBS-DOC-PK-001 passkey authorize HTTP status after NOT_SETUP: ${String(authorize.status())}`,
      );
      const body: unknown = await authorize.json();
      expect(body).toMatchObject({ code: "NOT_SETUP" });
      await expect(signIn.passkeyNotSetupToast()).toBeVisible({
        timeout: documensoTimeouts().request,
      });
      await expect(page).toHaveURL(/\/signin$/);
      const session = await readSession(page.request);
      expect(session.isAuthenticated).toBe(false);
      const cookies = (await page.context().storageState()).cookies;
      expect(documensoHasSessionIdCookie(cookies)).toBe(false);
    });

    await test.step("Virtual authenticator still holds the credential", async () => {
      const { credentials } = await virtualAuthenticator.cdp.send("WebAuthn.getCredentials", {
        authenticatorId: virtualAuthenticator.authenticatorId,
      });
      expect(credentials).toHaveLength(1);
    });
  },
);
