import path from "node:path";
import type { Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { DocumensoSigningRecipient } from "../../../src/products/documenso/factories.js";
import type { DocumensoQaUserFixture } from "../../../src/products/documenso/fixtures.js";
import { parseEnvelopeIdFromEditorUrl } from "../../../src/products/documenso/envelope-api.js";
import { deleteInbucketMailbox } from "../../../src/products/documenso/inbucket.js";
import { DocumentsPage } from "../../../src/products/documenso/pages/documents.page.js";
import { EditorPage } from "../../../src/products/documenso/pages/editor.page.js";
import {
  readSentEnvelopeByRecipientEmail,
  type DocumensoSentEnvelopeRecord,
} from "../../../src/products/documenso/qa-user.js";

const EXAMPLE_PDF_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../assets/example.pdf",
);

export interface SentExamplePdfContext {
  readonly envelopeId: string;
  readonly sent: DocumensoSentEnvelopeRecord;
  readonly recipient: DocumensoSigningRecipient;
}

export async function sendExamplePdfToRecipient(
  page: Page,
  owner: DocumensoQaUserFixture,
  recipient: DocumensoSigningRecipient,
): Promise<SentExamplePdfContext> {
  const documents = new DocumentsPage(page);
  const editor = new EditorPage(page);
  await documents.goto(owner.teamUrl);
  await documents.upload(EXAMPLE_PDF_PATH);
  const envelopeId = parseEnvelopeIdFromEditorUrl(page.url());
  await editor.addSigner(recipient.email, recipient.name);
  await editor.addSignatureField(`${recipient.name} (${recipient.email})`);
  await editor.send();
  const sent = await readSentEnvelopeByRecipientEmail(recipient.email);
  return { envelopeId, sent, recipient };
}

export async function teardownRecipientMailbox(recipientEmail: string): Promise<void> {
  await deleteInbucketMailbox(recipientEmail);
}
