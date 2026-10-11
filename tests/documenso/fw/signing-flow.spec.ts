import { documensoTimeouts, loadDocumensoConfig } from "../../../src/products/documenso/env.js";
import { qaDocumensoSigningRecipient } from "../../../src/products/documenso/factories.js";
import { pollSigningUrlFromInbucket } from "../../../src/products/documenso/inbucket.js";
import { DocumentsPage } from "../../../src/products/documenso/pages/documents.page.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import { readEnvelopeStatusByDocumentId } from "../../../src/products/documenso/qa-user.js";
import { readEnvelopeStatusViaTrpc } from "../../../src/products/documenso/envelope-api.js";
import { expect, test } from "./fixtures.js";
import { sendExamplePdfToRecipient, teardownRecipientMailbox } from "./send-example-pdf.js";
test.setTimeout(documensoTimeouts().journey);

test(
  "P1-DOC-FW-002 upload, add recipient, send",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-002" },
      { type: "priority", description: "P0" },
    ],
  },
  async ({ page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    const { baseUrl } = loadDocumensoConfig();
    try {
      const { sent } = await sendExamplePdfToRecipient(page, signedInDocumensoUser, recipient);
      const documents = new DocumentsPage(page);
      await documents.goto(signedInDocumensoUser.teamUrl);
      await expect(documents.statusBadge("Pending")).toBeVisible({
        timeout: documensoTimeouts().journey,
      });
      expect(await readEnvelopeStatusByDocumentId(sent.documentId)).toBe("PENDING");
      const signingUrl = await pollSigningUrlFromInbucket(recipient.email);
      expect(signingUrl.startsWith(`${baseUrl}/sign/`)).toBe(true);
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-003 recipient signs from the email link",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-003" },
      { type: "priority", description: "P0" },
    ],
  },
  async ({ browser, page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { envelopeId, sent } = await sendExamplePdfToRecipient(
        page,
        signedInDocumensoUser,
        recipient,
      );
      const signingUrl = await pollSigningUrlFromInbucket(recipient.email);
      const recipientContext = await browser.newContext();
      const recipientPage = await recipientContext.newPage();
      try {
        await recipientPage.goto(signingUrl, { waitUntil: "domcontentloaded" });
        const signing = new SigningPage(recipientPage);
        await signing.signTypedSignature("QA Signer");
        await signing.completeSigning();
      } finally {
        await recipientContext.close();
      }

      await expect
        .poll(async () =>
          readEnvelopeStatusViaTrpc(page.request, signedInDocumensoUser.teamId, envelopeId),
        )
        .toBe("COMPLETED");

      const documents = new DocumentsPage(page);
      await documents.goto(signedInDocumensoUser.teamUrl);
      await expect(documents.statusBadge("Completed")).toBeVisible({
        timeout: documensoTimeouts().journey,
      });
      expect(sent.documentId).toBeGreaterThan(0);
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);
