import { serializeKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import {
  cancelEnvelopeViaTrpc,
  completeDocumentWithTokenViaTrpc,
  deleteEnvelopeViaTrpc,
  getEnvelopeViaTrpc,
  signEnvelopeFieldViaTrpc,
} from "../../../src/products/documenso/envelope-api.js";
import { newDocumensoApiContext } from "../../../src/products/documenso/auth.js";
import { documensoSignPath, documensoTimeouts } from "../../../src/products/documenso/env.js";
import { qaDocumensoSigningRecipient } from "../../../src/products/documenso/factories.js";
import { pollSigningUrlFromInbucket } from "../../../src/products/documenso/inbucket.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import {
  countSignedRecipientsByDocumentId,
  readEnvelopeStatusByDocumentId,
  setRecipientExpiresAtInPast,
} from "../../../src/products/documenso/qa-user.js";
import { expect, test } from "./fixtures.js";
import { sendPendingExamplePdfViaTrpc, teardownRecipientMailbox } from "./send-example-pdf.js";

test.setTimeout(documensoTimeouts().journey);

const EXPIRED_TOKEN_DB_SEAM =
  "P7-OBS-DOC-FW-008: Recipient.expiresAt set in the past via test-only SQL seam";

async function signEnvelopeInFreshContext(
  browser: import("@playwright/test").Browser,
  signingUrl: string,
  sent: import("../../../src/products/documenso/qa-user.js").DocumensoSentEnvelopeRecord,
): Promise<void> {
  const recipientContext = await browser.newContext();
  const recipientPage = await recipientContext.newPage();
  try {
    await recipientPage.goto(signingUrl, { waitUntil: "domcontentloaded" });
    const signing = new SigningPage(recipientPage);
    await signing.signTypedSignature("QA Signer", sent);
    await signing.completeSigning();
  } finally {
    await recipientContext.close();
  }
}

test(
  "P1-DOC-FW-004 reuse link after complete",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-004" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ browser, page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { sent } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      const signingUrl = await pollSigningUrlFromInbucket(recipient.email);
      await signEnvelopeInFreshContext(browser, signingUrl, sent);

      const revisit = await browser.newContext();
      const revisitPage = await revisit.newPage();
      try {
        await revisitPage.goto(signingUrl, { waitUntil: "domcontentloaded" });
        await expect(revisitPage).toHaveURL(/\/complete/);
        await expect(revisitPage.getByRole("heading", { name: "Document Signed" })).toBeVisible({
          timeout: documensoTimeouts().request,
        });
      } finally {
        await revisit.close();
      }

      const second = await completeDocumentWithTokenViaTrpc(page.request, {
        token: sent.recipientToken,
        documentId: sent.documentId,
      });
      expect(second.resultStatus).toBe("ALREADY_SIGNED");
      expect(await readEnvelopeStatusByDocumentId(sent.documentId)).toBe("COMPLETED");
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-005 token from envelope A used on envelope B",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-005" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, signedInDocumensoUser }, testInfo) => {
    const recipientA = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    const recipientB = qaDocumensoSigningRecipient(testInfo.parallelIndex + 10_000);
    try {
      const envelopeA = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipientA,
      );
      const envelopeB = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipientB,
      );
      const cross = await completeDocumentWithTokenViaTrpc(page.request, {
        token: envelopeA.sent.recipientToken,
        documentId: envelopeB.sent.documentId,
      });
      expect(cross.appErrorCode ?? cross.resultStatus).toBe("NOT_FOUND");
    } finally {
      await teardownRecipientMailbox(recipientA.email);
      await teardownRecipientMailbox(recipientB.email);
    }
  },
);

test(
  "P1-DOC-FW-006 parallel completeDocumentWithToken race",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-006" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { sent } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      const signed = await signEnvelopeFieldViaTrpc(page.request, {
        token: sent.recipientToken,
        fieldId: sent.signatureFieldId,
        typedSignature: "QA Signer",
      });
      expect(signed.httpStatus.toString().startsWith("2")).toBe(true);

      const isolatedA = await newDocumensoApiContext();
      const isolatedB = await newDocumensoApiContext();
      try {
        const [first, second] = await Promise.all([
          completeDocumentWithTokenViaTrpc(isolatedA, {
            token: sent.recipientToken,
            documentId: sent.documentId,
          }),
          completeDocumentWithTokenViaTrpc(isolatedB, {
            token: sent.recipientToken,
            documentId: sent.documentId,
          }),
        ]);
        await testInfo.attach("fw-006-race-evidence", {
          body: serializeKnownBugEvidence({
            issue: "P1-DOC-FW-006 parallel complete",
            observed: {
              firstHttpStatus: first.httpStatus,
              firstStatus: first.resultStatus ?? first.appErrorCode ?? null,
              secondHttpStatus: second.httpStatus,
              secondStatus: second.resultStatus ?? second.appErrorCode ?? null,
            },
            expected: { oneSigned: true, oneAlreadySigned: true },
          }),
        });
        const statuses = [first.resultStatus, second.resultStatus];
        const signedCount = statuses.filter((value) => value === "SIGNED").length;
        const alreadyCount = statuses.filter((value) => value === "ALREADY_SIGNED").length;
        expect(signedCount).toBe(1);
        expect(alreadyCount).toBe(1);
        expect(await countSignedRecipientsByDocumentId(sent.documentId)).toBe(1);
      } finally {
        await isolatedA.dispose();
        await isolatedB.dispose();
      }
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-007 tampered signing token returns 404",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-007" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ browser, page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { sent } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      const tampered = documensoSignPath(`${sent.recipientToken}x`);
      const context = await browser.newContext();
      const tamperedPage = await context.newPage();
      try {
        const response = await tamperedPage.goto(tampered, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(404);
      } finally {
        await context.close();
      }
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-008 expired recipient token",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-008" },
      { type: "priority", description: "P1" },
      { type: "observation", description: EXPIRED_TOKEN_DB_SEAM },
    ],
  },
  async ({ browser, page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { sent } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      await setRecipientExpiresAtInPast(sent.recipientToken);
      const signingUrl = await pollSigningUrlFromInbucket(recipient.email);
      const context = await browser.newContext();
      const expiredPage = await context.newPage();
      try {
        const response = await expiredPage.goto(signingUrl, { waitUntil: "domcontentloaded" });
        const expiredUrl = expiredPage.url();
        expect(response?.status() === 404 || expiredUrl.includes("/expired")).toBe(true);
      } finally {
        await context.close();
      }
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-009 owner deletes pending envelope",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-009" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ browser, page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { envelopeId, sent } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      const signingUrl = await pollSigningUrlFromInbucket(recipient.email);
      const deleted = await deleteEnvelopeViaTrpc(
        page.request,
        signedInDocumensoUser.teamId,
        envelopeId,
      );
      expect(deleted.httpStatus.toString().startsWith("2")).toBe(true);
      const context = await browser.newContext();
      const deletedPage = await context.newPage();
      try {
        const response = await deletedPage.goto(signingUrl, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(404);
      } finally {
        await context.close();
      }
      expect(sent.documentId).toBeGreaterThan(0);
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-010 owner cancels pending envelope",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-010" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { envelopeId, sent } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      await pollSigningUrlFromInbucket(recipient.email);
      const cancelled = await cancelEnvelopeViaTrpc(
        page.request,
        signedInDocumensoUser.teamId,
        envelopeId,
        "QA cancel",
      );
      await testInfo.attach("fw-010-cancel-trpc", {
        body: serializeKnownBugEvidence({
          issue: "P1-DOC-FW-010 envelope.cancel before complete",
          observed: {
            httpStatus: cancelled.httpStatus,
            bodyText: cancelled.bodyText,
            appErrorCode: cancelled.appErrorCode ?? null,
            resultStatus: cancelled.resultStatus ?? null,
            procedurePath: cancelled.procedurePath ?? null,
          },
          expected: { httpStatus2xx: true },
        }),
      });
      expect(
        cancelled.httpStatus.toString().startsWith("2"),
        `envelope.cancel HTTP ${String(cancelled.httpStatus)} body: ${cancelled.bodyText}`,
      ).toBe(true);
      expect(await readEnvelopeStatusByDocumentId(sent.documentId)).toBe("CANCELLED");
      const complete = await completeDocumentWithTokenViaTrpc(page.request, {
        token: sent.recipientToken,
        documentId: sent.documentId,
      });
      await testInfo.attach("fw-010-complete-trpc", {
        body: serializeKnownBugEvidence({
          issue: "P1-DOC-FW-010 recipient.completeDocumentWithToken after cancel",
          observed: {
            httpStatus: complete.httpStatus,
            bodyText: complete.bodyText,
            appErrorCode: complete.appErrorCode ?? null,
            resultStatus: complete.resultStatus ?? null,
            procedurePath: complete.procedurePath ?? null,
          },
          expected: { appErrorCode: "ENVELOPE_CANCELLED" },
        }),
      });
      expect(
        complete.appErrorCode,
        `completeDocumentWithToken HTTP ${String(complete.httpStatus)} body: ${complete.bodyText}`,
      ).toBe("ENVELOPE_CANCELLED");
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);

test(
  "P1-DOC-FW-011 owner envelope.get requires session",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-011" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, signedInDocumensoUser }, testInfo) => {
    const recipient = qaDocumensoSigningRecipient(testInfo.parallelIndex);
    try {
      const { envelopeId } = await sendPendingExamplePdfViaTrpc(
        page.request,
        signedInDocumensoUser,
        recipient,
      );
      const isolated = await newDocumensoApiContext();
      try {
        const unauth = await getEnvelopeViaTrpc(isolated, signedInDocumensoUser.teamId, envelopeId);
        expect(unauth.httpStatus).toBe(401);
      } finally {
        await isolated.dispose();
      }
    } finally {
      await teardownRecipientMailbox(recipient.email);
    }
  },
);
