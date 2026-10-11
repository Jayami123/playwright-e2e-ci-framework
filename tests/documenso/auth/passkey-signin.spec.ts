import type { Page } from "@playwright/test";
import {
  documensoHasSessionIdCookie,
  loginViaApi,
  readSession,
  sessionHasEmail,
} from "../../../src/products/documenso/auth.js";
import { documensoTimeouts } from "../../../src/products/documenso/env.js";
import {
  expect,
  test,
  type DocumensoQaUserFixture,
  type VirtualAuthenticatorFixture,
} from "../../../src/products/documenso/fixtures.js";
import { PasskeysSettingsPage } from "../../../src/products/documenso/pages/passkeys.page.js";
import { SecuritySettingsPage } from "../../../src/products/documenso/pages/security.page.js";
import { SignInPage } from "../../../src/products/documenso/pages/signin.page.js";
import {
  countDocumensoPasskeysForUser,
  readDocumensoPasskeyCounter,
} from "../../../src/products/documenso/qa-user.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };
const PASSKEY_NAME = "QA passkey";

test.use({ storageState: EMPTY_STORAGE });

async function readVirtualAuthenticatorSignCount(
  virtualAuthenticator: VirtualAuthenticatorFixture,
): Promise<number> {
  const { credentials } = await virtualAuthenticator.cdp.send("WebAuthn.getCredentials", {
    authenticatorId: virtualAuthenticator.authenticatorId,
  });
  expect(credentials).toHaveLength(1);
  const signCount = credentials[0]?.signCount;
  if (signCount === undefined) {
    throw new Error("WebAuthn.getCredentials returned a credential without signCount");
  }
  return signCount;
}

async function enrolPasskeyForSignIn(
  page: Page,
  documensoUser: DocumensoQaUserFixture,
): Promise<PasskeysSettingsPage> {
  const login = await loginViaApi(page.request, {
    email: documensoUser.email,
    password: documensoUser.password,
  });
  expect(login.status, "documensoUser password login").toBe(201);

  const security = new SecuritySettingsPage(page);
  await security.goto();
  const passkeys = new PasskeysSettingsPage(page);
  await passkeys.openFromSecuritySettings();
  await passkeys.createPasskey(PASSKEY_NAME);
  await expect(passkeys.createdPasskeyToast()).toBeVisible({
    timeout: documensoTimeouts().request,
  });
  await expect(passkeys.addPasskeyDialog()).toBeHidden({
    timeout: documensoTimeouts().request,
  });
  await passkeys.gotoPasskeys();
  await expect(passkeys.passkeyNameCell(PASSKEY_NAME)).toBeVisible({
    timeout: documensoTimeouts().request,
  });
  return passkeys;
}

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
      await passkeys.deletePasskey(PASSKEY_NAME);
      await expect(passkeys.removedPasskeyToast()).toBeVisible({
        timeout: documensoTimeouts().request,
      });
      await passkeys.gotoPasskeys();
      await expect(passkeys.passkeyNameCell(PASSKEY_NAME)).toBeHidden({
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
