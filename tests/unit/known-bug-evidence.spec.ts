import { expect, test } from "@playwright/test";
import { serializeKnownBugEvidence } from "../../src/core/known-bug-evidence.js";

test.describe("known-bug evidence", () => {
  test("serializes observed vs expected without secrets", { tag: ["@unit"] }, () => {
    const json = serializeKnownBugEvidence({
      issue: "P7-OBS-CAL-DST-003: early slots",
      observed: {
        slotIsos: ["2027-03-27T23:00:00.000Z", "2027-03-27T23:30:00.000Z"],
        slotLabels: ["10:00am", "10:30am"],
        httpStatus: 409,
        bodyCode: "no_available_users_found_error",
      },
      expected: {
        slotLabels: ["11:00am"],
        httpStatus: 200,
      },
    });
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toEqual({
      issue: "P7-OBS-CAL-DST-003: early slots",
      observed: {
        slotIsos: ["2027-03-27T23:00:00.000Z", "2027-03-27T23:30:00.000Z"],
        slotLabels: ["10:00am", "10:30am"],
        httpStatus: 409,
        bodyCode: "no_available_users_found_error",
      },
      expected: {
        slotLabels: ["11:00am"],
        httpStatus: 200,
      },
    });
  });

  test("redacts secret-looking keys in the JSON body", { tag: ["@unit"] }, () => {
    const json = serializeKnownBugEvidence({
      issue: "P7-OBS-example",
      observed: {
        password: "pro",
        nested: { token: "abc", slotIso: "2026-11-01T05:30:00.000Z" },
      },
      expected: {
        authorization: "Bearer x",
        httpStatus: 200,
      },
    });
    expect(json).not.toContain("pro");
    expect(json).not.toContain("abc");
    expect(json).not.toContain("Bearer");
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toEqual({
      issue: "P7-OBS-example",
      observed: {
        password: "[redacted]",
        nested: { token: "[redacted]", slotIso: "2026-11-01T05:30:00.000Z" },
      },
      expected: {
        authorization: "[redacted]",
        httpStatus: 200,
      },
    });
  });
});
