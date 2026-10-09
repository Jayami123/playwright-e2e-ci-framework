import type { Page, TestInfo } from "@playwright/test";

export const KNOWN_BUG_SCREENSHOT_ATTACHMENT = "known-bug-screenshot";
export const KNOWN_BUG_JSON_ATTACHMENT = "known-bug-evidence";

const SECRET_KEY = /password|secret|token|authorization|cookie|credential|api[_-]?key|backup|otp/i;
const REDACTED = "[redacted]";

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface KnownBugEvidence {
  readonly issue: string;
  readonly observed: Readonly<Record<string, JsonValue>>;
  readonly expected: Readonly<Record<string, JsonValue>>;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Known-bug evidence number is not finite: ${String(value)}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    const out: { [key: string]: JsonValue } = {};
    for (const [key, child] of entries) {
      out[key] = toJsonValue(child);
    }
    return out;
  }
  throw new Error(`Known-bug evidence value is not JSON-serializable: ${typeof value}`);
}

function redactJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }
  if (typeof value === "object" && value !== null) {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redactJsonValue(child);
    }
    return out;
  }
  return value;
}

export function serializeKnownBugEvidence(evidence: KnownBugEvidence): string {
  const payload = {
    issue: evidence.issue,
    observed: redactJsonValue(toJsonValue(evidence.observed)),
    expected: redactJsonValue(toJsonValue(evidence.expected)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export async function attachKnownBugEvidence(
  page: Page,
  testInfo: TestInfo,
  evidence: KnownBugEvidence,
): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(KNOWN_BUG_SCREENSHOT_ATTACHMENT, {
    body: screenshot,
    contentType: "image/png",
  });
  await testInfo.attach(KNOWN_BUG_JSON_ATTACHMENT, {
    body: serializeKnownBugEvidence(evidence),
    contentType: "application/json",
  });
}
