import { expect, test } from "@playwright/test";
import {
  LONG_NAME,
  LONG_TITLE,
  parseTrpcEventType,
  trpcBatchBody,
  trpcPath,
} from "../../src/products/cal/booker-qa.js";
import { CAL_SLOTS_ROUTE } from "../../src/products/cal/routes.js";

test.describe("cal booker QA helpers", () => {
  test("trpcPath builds a batch URL", { tag: ["@unit"] }, () => {
    expect(trpcPath("me/updateProfile")).toBe("/api/trpc/me/updateProfile?batch=1");
  });

  test("trpcBatchBody wraps the input as batch item 0", { tag: ["@unit"] }, () => {
    expect(trpcBatchBody({ theme: "dark" })).toEqual({ "0": { json: { theme: "dark" } } });
  });

  test("parseTrpcEventType reads the Step 0 payload", { tag: ["@unit"] }, () => {
    const payload = [{ result: { data: { json: { eventType: { id: 1534, slug: "probe-30" } } } } }];
    expect(parseTrpcEventType(payload)).toEqual({ id: 1534, slug: "probe-30" });
  });

  test("parseTrpcEventType throws on a tRPC error", { tag: ["@unit"] }, () => {
    expect(() => parseTrpcEventType([{ error: { json: { message: "x" } } }])).toThrow(/error/);
  });

  test("parseTrpcEventType throws when the id is missing", { tag: ["@unit"] }, () => {
    const payload = [{ result: { data: { json: { eventType: { slug: "probe-30" } } } } }];
    expect(() => parseTrpcEventType(payload)).toThrow(/no eventType/);
  });

  test("long name and title have the probed lengths", { tag: ["@unit"] }, () => {
    expect(LONG_NAME).toHaveLength(80);
    expect(LONG_TITLE).toHaveLength(120);
    expect(LONG_NAME.startsWith("Pro Example")).toBe(true);
  });

  test("CAL_SLOTS_ROUTE matches getSchedule and not reserveSlot", { tag: ["@unit"] }, () => {
    expect(
      CAL_SLOTS_ROUTE.test("/api/trpc/slots/getSchedule?input=%7B%22json%22%3A%7B%7D%7D"),
    ).toBe(true);
    expect(CAL_SLOTS_ROUTE.test("/api/trpc/slots/reserveSlot?batch=1")).toBe(false);
  });
});
