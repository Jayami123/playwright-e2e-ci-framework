import { expect, test } from "@playwright/test";
import {
  assertCalCredentialsCallbackSucceeded,
  credentialsCallbackFailed,
  csrfTokenFromCookies,
  parseCalCredentialsCallback,
  sessionHasUser,
} from "../../src/products/cal/auth.js";

test.describe("Cal credentials callback parsing", () => {
  test("treats NextAuth CSRF bounce URL as a failed login", { tag: ["@unit"] }, () => {
    const body = parseCalCredentialsCallback({
      url: "http://127.0.0.1:3000/api/auth/signin?csrf=true",
    });
    expect(credentialsCallbackFailed(body)).toBe(true);
    expect(() => {
      assertCalCredentialsCallbackSucceeded(body, 200);
    }).toThrow(/HTTP 200.*signin\?csrf=true/);
  });

  test("treats a callbackURL origin as success", { tag: ["@unit"] }, () => {
    const body = parseCalCredentialsCallback({ url: "http://127.0.0.1:3000" });
    expect(credentialsCallbackFailed(body)).toBe(false);
    assertCalCredentialsCallbackSucceeded(body, 200);
  });

  test("treats an error field as failure", { tag: ["@unit"] }, () => {
    const body = parseCalCredentialsCallback({ error: "CredentialsSignin" });
    expect(credentialsCallbackFailed(body)).toBe(true);
  });
});

test.describe("Cal session payload", () => {
  test("empty JSON is unauthenticated", { tag: ["@unit"] }, () => {
    expect(sessionHasUser({})).toBe(false);
    expect(sessionHasUser(null)).toBe(false);
  });

  test("user email means authenticated", { tag: ["@unit"] }, () => {
    expect(sessionHasUser({ user: { email: "pro@example.com" } })).toBe(true);
  });
});

test.describe("CSRF cookie token", () => {
  test("reads the token before the hash from next-auth.csrf-token", { tag: ["@unit"] }, () => {
    const token = csrfTokenFromCookies([
      {
        name: "next-auth.csrf-token",
        value: "7400d3d6aa5662dc37d3803781dbcdec5b602babe47b7dc42b4100ba25ce018b%7Chash",
      },
    ]);
    expect(token).toBe("7400d3d6aa5662dc37d3803781dbcdec5b602babe47b7dc42b4100ba25ce018b");
  });
});
