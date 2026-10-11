import { expect, type Page } from "@playwright/test";
import { loginViaApi } from "./auth.js";
import { documensoTimeouts } from "./env.js";
import { readDocumensoPasskeyChallengeToken, type DocumensoQaUserRecord } from "./qa-user.js";
import type { VirtualAuthenticatorFixture } from "./fixtures.js";
import { PasskeysSettingsPage } from "./pages/passkeys.page.js";
import { SecuritySettingsPage } from "./pages/security.page.js";

export const DOCUMENSO_PASSKEY_NAME = "QA passkey" as const;

const PASSKEY_CREATE_TRPC_PATH = "/api/trpc/auth.passkey.create";
const PASSKEY_REGISTRATION_OPTIONS_TRPC_PATH = "/api/trpc/auth.passkey.createRegistrationOptions";

export async function readVirtualAuthenticatorSignCount(
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

export async function enrolPasskeyForSignIn(
  page: Page,
  documensoUser: DocumensoQaUserRecord,
): Promise<PasskeysSettingsPage> {
  const login = await loginViaApi(page.request, {
    email: documensoUser.email,
    password: documensoUser.password,
  });
  expect(login.status, "documensoUser password login").toBe(201);

  const security = new SecuritySettingsPage(page);
  await security.goto();
  const passkeys = new PasskeysSettingsPage(page);
  await passkeys.gotoPasskeys();
  await passkeys.createPasskey(DOCUMENSO_PASSKEY_NAME);
  await expect(passkeys.createdPasskeyToast()).toBeVisible({
    timeout: documensoTimeouts().request,
  });
  await expect(passkeys.addPasskeyDialog()).toBeHidden({
    timeout: documensoTimeouts().request,
  });
  await passkeys.gotoPasskeys();
  await expect(passkeys.passkeyNameCell(DOCUMENSO_PASSKEY_NAME)).toBeVisible({
    timeout: documensoTimeouts().request,
  });
  return passkeys;
}

export interface CapturedPasskeyCreateRequest {
  readonly createUrl: string;
  readonly createPostData: string;
  readonly challenge: string;
}

export async function enrolPasskeyCapturingCreateRequest(
  page: Page,
  documensoUser: DocumensoQaUserRecord,
): Promise<CapturedPasskeyCreateRequest & { passkeys: PasskeysSettingsPage }> {
  const login = await loginViaApi(page.request, {
    email: documensoUser.email,
    password: documensoUser.password,
  });
  expect(login.status, "documensoUser password login").toBe(201);

  const security = new SecuritySettingsPage(page);
  await security.goto();
  const passkeys = new PasskeysSettingsPage(page);
  await passkeys.gotoPasskeys();

  const createRequestDone = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes(PASSKEY_CREATE_TRPC_PATH),
    { timeout: documensoTimeouts().request },
  );
  const registrationOptionsDone = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(PASSKEY_REGISTRATION_OPTIONS_TRPC_PATH) &&
      response.ok(),
    { timeout: documensoTimeouts().request },
  );

  await passkeys.addPasskeyButton().click();
  const dialog = passkeys.addPasskeyDialog();
  await expect(dialog).toBeVisible({ timeout: documensoTimeouts().request });
  await dialog.getByLabel("Passkey name").fill(DOCUMENSO_PASSKEY_NAME);
  await dialog.getByRole("button", { name: "Continue" }).click();

  await registrationOptionsDone;
  const challenge = await readDocumensoPasskeyChallengeToken(documensoUser.id);
  const createRequest = await createRequestDone;
  const createPostData = createRequest.postData();
  if (createPostData === null || createPostData.length === 0) {
    throw new Error("auth.passkey.create request had no POST body");
  }

  await expect(passkeys.createdPasskeyToast()).toBeVisible({
    timeout: documensoTimeouts().request,
  });
  await expect(passkeys.addPasskeyDialog()).toBeHidden({
    timeout: documensoTimeouts().request,
  });
  await passkeys.gotoPasskeys();
  await expect(passkeys.passkeyNameCell(DOCUMENSO_PASSKEY_NAME)).toBeVisible({
    timeout: documensoTimeouts().request,
  });

  return {
    passkeys,
    createUrl: createRequest.url(),
    createPostData,
    challenge,
  };
}
