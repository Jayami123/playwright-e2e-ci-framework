import {
  documensoHasSessionIdCookie,
  newDocumensoApiContext,
  postPasskeyAuthorize,
  readSession,
  type DocumensoPasskeyAuthorizeBody,
} from "../../../src/products/documenso/auth.js";
import { DOCUMENSO_ROUTES, documensoTimeouts } from "../../../src/products/documenso/env.js";
import { expect, test } from "../../../src/products/documenso/fixtures.js";
import {
  enrolPasskeyCapturingCreateRequest,
  enrolPasskeyForSignIn,
} from "../../../src/products/documenso/passkey-enrol.js";
import { SignInPage } from "../../../src/products/documenso/pages/signin.page.js";
import {
  countDocumensoPasskeysForUser,
  insertPasskeyChallenge,
} from "../../../src/products/documenso/qa-user.js";
import { serializeKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };
const DUPLICATE_CREDENTIAL_OBSERVATION =
  "P7-OBS-DOC-PK-002: Passkey.credentialId has no unique index (defence-in-depth)";

test.use({ storageState: EMPTY_STORAGE });

function readPasskeyAuthorizeBody(response: {
  request: () => { postDataJSON: () => unknown };
}): DocumensoPasskeyAuthorizeBody {
  const raw = response.request().postDataJSON();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Passkey authorize POST body is not a JSON object");
  }
  const record = raw as Record<string, unknown>;
  const csrfToken = record.csrfToken;
  const credential = record.credential;
  if (typeof csrfToken !== "string" || csrfToken.length === 0) {
    throw new Error("Passkey authorize POST body missing csrfToken");
  }
  if (typeof credential !== "string" || credential.length === 0) {
    throw new Error("Passkey authorize POST body missing credential");
  }
  return { csrfToken, credential };
}

test(
  "P1-DOC-PK-004 passkey authorize challenge is single-use",
  {
    tag: ["@documenso", "@auth", "@passkey"],
    annotation: [
      { type: "testId", description: "P1-DOC-PK-004" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, documensoUser, virtualAuthenticator }) => {
    await test.step("Virtual authenticator is attached", () => {
      expect(virtualAuthenticator.authenticatorId.length).toBeGreaterThan(0);
    });
    await enrolPasskeyForSignIn(page, documensoUser);
    const signIn = new SignInPage(page);
    await signIn.signOut();

    await test.step("First passkey authorize succeeds in the browser", async () => {
      await signIn.goto();
      const authorizeDone = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes(DOCUMENSO_ROUTES.passkeyAuthorize),
        { timeout: documensoTimeouts().request },
      );
      await signIn.passkeyButton().click();
      const firstAuthorize = await authorizeDone;
      expect(firstAuthorize.status(), "first passkey authorize").toBe(200);
      const authorizeBody = readPasskeyAuthorizeBody(firstAuthorize);
      const session = await readSession(page.request);
      expect(session.isAuthenticated).toBe(true);

      const isolated = await newDocumensoApiContext();
      try {
        const replay = await postPasskeyAuthorize(isolated, authorizeBody);
        console.log(
          `P7-OBS-DOC-PK-001 passkey authorize HTTP status after INVALID_REQUEST replay: ${String(replay.status)}`,
        );
        expect(replay.code).toBe("INVALID_REQUEST");
        expect(replay.hasSessionCookie).toBe(false);
        const replaySession = await readSession(isolated);
        expect(replaySession.isAuthenticated).toBe(false);
      } finally {
        await isolated.dispose();
      }
    });
  },
);

test(
  "P1-DOC-PK-005 passkey clone detection rejects rewound signCount",
  {
    tag: ["@documenso", "@auth", "@passkey"],
    annotation: [
      { type: "testId", description: "P1-DOC-PK-005" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, documensoUser, virtualAuthenticator }) => {
    await enrolPasskeyForSignIn(page, documensoUser);
    const signIn = new SignInPage(page);

    await test.step("Successful passkey sign-in increments counter", async () => {
      await signIn.signOut();
      await signIn.goto();
      const authorize = await signIn.clickPasskeySignIn();
      expect(authorize.status(), "passkey sign-in before clone").toBe(200);
      await signIn.signOut();
    });

    await test.step("Rewind virtual authenticator signCount to simulate clone", async () => {
      const { credentials } = await virtualAuthenticator.cdp.send("WebAuthn.getCredentials", {
        authenticatorId: virtualAuthenticator.authenticatorId,
      });
      expect(credentials).toHaveLength(1);
      const stored = credentials[0];
      if (stored === undefined) {
        throw new Error("WebAuthn.getCredentials returned an empty credential list");
      }
      const privateKey = stored.privateKey;
      expect(privateKey.length, "WebAuthn credential privateKey").toBeGreaterThan(0);
      const rpId = stored.rpId;
      if (rpId === undefined || rpId.length === 0) {
        throw new Error("WebAuthn.getCredentials did not include rpId");
      }
      const userHandle = stored.userHandle;
      await virtualAuthenticator.cdp.send("WebAuthn.removeCredential", {
        authenticatorId: virtualAuthenticator.authenticatorId,
        credentialId: stored.credentialId,
      });
      await virtualAuthenticator.cdp.send("WebAuthn.addCredential", {
        authenticatorId: virtualAuthenticator.authenticatorId,
        credential: {
          credentialId: stored.credentialId,
          isResidentCredential: true,
          privateKey,
          rpId,
          signCount: 0,
          ...(userHandle !== undefined && userHandle.length > 0 ? { userHandle } : {}),
        },
      });
    });

    await test.step("Passkey sign-in after clone returns INVALID_REQUEST", async () => {
      await signIn.goto();
      const authorize = await signIn.clickPasskeySignIn();
      console.log(
        `P7-OBS-DOC-PK-001 passkey authorize HTTP status after clone: ${String(authorize.status())}`,
      );
      const body: unknown = await authorize.json();
      expect(body).toMatchObject({ code: "INVALID_REQUEST" });
      await expect(page).toHaveURL(/\/signin$/);
      const session = await readSession(page.request);
      expect(session.isAuthenticated).toBe(false);
      const cookies = (await page.context().storageState()).cookies;
      expect(documensoHasSessionIdCookie(cookies)).toBe(false);
    });
  },
);

test(
  "P1-DOC-PK-006 duplicate credentialId insert is rejected",
  {
    tag: ["@documenso", "@auth", "@passkey"],
    annotation: [
      { type: "testId", description: "P1-DOC-PK-006" },
      { type: "priority", description: "P2" },
      { type: "observation", description: DUPLICATE_CREDENTIAL_OBSERVATION },
    ],
  },
  async ({ page, documensoUser, virtualAuthenticator }, testInfo) => {
    await test.step("Virtual authenticator is attached", () => {
      expect(virtualAuthenticator.authenticatorId.length).toBeGreaterThan(0);
    });
    const captured = await enrolPasskeyCapturingCreateRequest(page, documensoUser);

    await test.step("Replay passkey create with restored PASSKEY_CHALLENGE", async () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
      await insertPasskeyChallenge(documensoUser.id, captured.challenge, expiresAt);
      const replayResponse = await page.request.post(captured.createUrl, {
        data: captured.createPostData,
        timeout: documensoTimeouts().request,
      });
      const passkeyCount = await countDocumensoPasskeysForUser(documensoUser.id);
      await testInfo.attach("duplicate-credential-evidence", {
        body: serializeKnownBugEvidence({
          issue: DUPLICATE_CREDENTIAL_OBSERVATION,
          observed: {
            secondHttpStatus: replayResponse.status(),
            passkeyCount,
          },
          expected: {
            passkeyCount: 1,
          },
        }),
        contentType: "application/json",
      });
      expect(passkeyCount).toBe(1);
    });
  },
);
