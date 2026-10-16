import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request, type Page } from "@playwright/test";
import { loginViaApi, newDocumensoApiContext } from "./auth.js";
import {
  createAndDistributePendingEnvelopeViaTrpc,
  signEnvelopeFieldViaTrpc,
} from "./envelope-api.js";
import { documensoPublicUrlFromEnv, documensoSignPath } from "./env.js";
import { qaDocumensoSigningRecipient } from "./factories.js";
import { expect, test as base } from "./fixtures.js";
import { deleteInbucketMailbox } from "./inbucket.js";
import { readSentEnvelopeByRecipientEmail, type DocumensoSentEnvelopeRecord } from "./qa-user.js";
import { DOC_VISUAL_RECIPIENT_NAME, DOC_VISUAL_TITLE } from "./visual.js";

const EXAMPLE_PDF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets/example.pdf",
);

export interface PendingEnvelope {
  readonly title: string;
  readonly recipientName: string;
  readonly sent: DocumensoSentEnvelopeRecord;
  readonly signPath: string;
  /** Sign the only field through the token API (setup only; the UI asserts the result). */
  signField(): Promise<void>;
}

interface DocumensoVisualFixtures {
  envelopeText: { readonly title: string; readonly recipientName: string };
  pendingEnvelope: PendingEnvelope;
  /** Page signed in as the envelope owner (cookies from the API login). */
  ownerPage: Page;
}

export const test = base.extend<DocumensoVisualFixtures>({
  envelopeText: [
    { title: DOC_VISUAL_TITLE, recipientName: DOC_VISUAL_RECIPIENT_NAME },
    { option: true },
  ],
  // eslint-disable-next-line no-empty-pattern -- fixture declares no upstream dependencies
  baseURL: async ({}, use) => use(documensoPublicUrlFromEnv()),

  pendingEnvelope: async ({ documensoUser, envelopeText }, use, testInfo) => {
    const recipient = {
      ...qaDocumensoSigningRecipient(testInfo.parallelIndex),
      name: envelopeText.recipientName,
    };
    const http = await newDocumensoApiContext();
    try {
      const login = await loginViaApi(http, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, login.authorizeDiagnostic).toBe(201);
      await createAndDistributePendingEnvelopeViaTrpc(
        http,
        documensoUser.teamId,
        recipient,
        EXAMPLE_PDF,
        envelopeText.title,
      );
      const sent = await readSentEnvelopeByRecipientEmail(recipient.email);
      const token = await request.newContext({ baseURL: documensoPublicUrlFromEnv() });
      try {
        await use({
          title: envelopeText.title,
          recipientName: envelopeText.recipientName,
          sent,
          signPath: documensoSignPath(sent.recipientToken),
          signField: async () => {
            const r = await signEnvelopeFieldViaTrpc(token, {
              token: sent.recipientToken,
              fieldId: sent.signatureFieldId,
              typedSignature: "QA Signer",
            });
            expect(r.httpStatus, r.bodyText).toBe(200);
          },
        });
      } finally {
        await token.dispose();
      }
    } finally {
      await http.dispose();
      await deleteInbucketMailbox(recipient.email);
      // documensoUser teardown deletes the owner, team and envelopes (FW precedent: qaEnvelopes 0 after).
    }
  },

  ownerPage: async ({ browser, documensoUser, pendingEnvelope, viewport, colorScheme }, use) => {
    // The owner list needs the envelope to exist first.
    expect(pendingEnvelope.sent.envelopeId).not.toBe("");
    // Same pattern as tests/documenso/fw/fixtures.ts: API login -> storageState -> new context.
    const http = await newDocumensoApiContext();
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "p1-doc-visual-owner-"));
    try {
      const login = await loginViaApi(http, {
        email: documensoUser.email,
        password: documensoUser.password,
      });
      expect(login.status, login.authorizeDiagnostic).toBe(201);
      const statePath = path.join(stateDir, "storage-state.json");
      await http.storageState({ path: statePath }); // Step 0: cookies csrfToken, sessionId only (no lang/theme)
      const context = await browser.newContext({
        baseURL: documensoPublicUrlFromEnv(),
        storageState: statePath,
        ...(viewport === null ? {} : { viewport }),
        ...(colorScheme === null ? {} : { colorScheme }),
        locale: "en-US",
        timezoneId: "Europe/London",
        deviceScaleFactor: 1,
      });
      try {
        await use(await context.newPage());
      } finally {
        await context.close();
      }
    } finally {
      await http.dispose();
      await rm(stateDir, { recursive: true, force: true });
    }
  },
});
export { expect };
