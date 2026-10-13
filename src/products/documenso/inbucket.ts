import { expect, request, type APIRequestContext } from "@playwright/test";
import { documensoTimeouts, loadDocumensoConfig } from "./env.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mailboxLocalPart(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    throw new Error(`Invalid mailbox email: ${email}`);
  }
  return email.slice(0, at);
}

function extractSigningUrl(body: string, baseUrl: string): string | undefined {
  const pattern = new RegExp(
    `${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sign/[A-Za-z0-9_-]+`,
  );
  const match = pattern.exec(body);
  return match?.[0];
}

function readMessageBodies(payload: Record<string, unknown>): string {
  const body = payload.body;
  if (!isRecord(body)) {
    return "";
  }
  const text = typeof body.text === "string" ? body.text : "";
  const html = typeof body.html === "string" ? body.html : "";
  return `${html}\n${text}`;
}

export async function newInbucketApiContext(): Promise<APIRequestContext> {
  const { inbucketOrigin } = loadDocumensoConfig();
  return request.newContext({ baseURL: inbucketOrigin });
}

export async function deleteInbucketMailbox(recipientEmail: string): Promise<void> {
  const localPart = mailboxLocalPart(recipientEmail);
  const http = await newInbucketApiContext();
  try {
    await http.delete(`/api/v1/mailbox/${encodeURIComponent(localPart)}`);
  } finally {
    await http.dispose();
  }
}

export async function pollSigningUrlFromInbucket(recipientEmail: string): Promise<string> {
  const { baseUrl } = loadDocumensoConfig();
  const localPart = mailboxLocalPart(recipientEmail);
  const http = await newInbucketApiContext();
  let signingUrl: string | undefined;
  try {
    await expect
      .poll(
        async () => {
          const listResponse = await http.get(`/api/v1/mailbox/${encodeURIComponent(localPart)}`);
          if (!listResponse.ok()) {
            return false;
          }
          const listPayload: unknown = await listResponse.json();
          let messagesRaw: unknown = [];
          if (isRecord(listPayload) && Array.isArray(listPayload.messages)) {
            messagesRaw = listPayload.messages;
          } else if (Array.isArray(listPayload)) {
            messagesRaw = listPayload;
          }
          if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
            return false;
          }
          const firstUnknown: unknown = messagesRaw.at(0);
          if (!isRecord(firstUnknown)) {
            return false;
          }
          const messageId = firstUnknown.id;
          if (typeof messageId !== "string" || messageId.length === 0) {
            return false;
          }
          const messageResponse = await http.get(
            `/api/v1/mailbox/${encodeURIComponent(localPart)}/${encodeURIComponent(messageId)}`,
          );
          if (!messageResponse.ok()) {
            return false;
          }
          const messagePayload: unknown = await messageResponse.json();
          if (!isRecord(messagePayload)) {
            return false;
          }
          const body = readMessageBodies(messagePayload);
          signingUrl = extractSigningUrl(body, baseUrl);
          return signingUrl !== undefined;
        },
        { timeout: documensoTimeouts().journey },
      )
      .toBe(true);
    if (signingUrl === undefined) {
      throw new Error("pollSigningUrlFromInbucket did not capture signing URL");
    }
    return signingUrl;
  } finally {
    await http.dispose();
  }
}
