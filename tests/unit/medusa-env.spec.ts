import { expect, test } from "@playwright/test";
import {
  assertMedusaBaseUrl,
  assertMedusaDbUrl,
  loadMedusaConfig,
  resetMedusaConfigCache,
} from "../../src/products/medusa/env.js";

test.describe("Medusa env guards", { tag: ["@unit"] }, () => {
  test("rejects localhost base url", () => {
    expect(() => assertMedusaBaseUrl("http://localhost:9000")).toThrow(/127\.0\.0\.1/);
    expect(assertMedusaBaseUrl("http://127.0.0.1:9000")).toBe("http://127.0.0.1:9000");
  });

  test("rejects non-127.0.0.1 db url", () => {
    expect(() => assertMedusaDbUrl("postgres://medusa:medusa@db.example.com:5433/medusa")).toThrow(
      /127\.0\.0\.1/,
    );
    expect(() => assertMedusaDbUrl("mysql://medusa@127.0.0.1:3306/medusa")).toThrow(/postgres/);
  });

  test("fails when admin email or password is missing", () => {
    const prior = {
      email: process.env.MEDUSA_ADMIN_EMAIL,
      password: process.env.MEDUSA_ADMIN_PASSWORD,
    };
    process.env.MEDUSA_ADMIN_EMAIL = "";
    process.env.MEDUSA_ADMIN_PASSWORD = "";
    resetMedusaConfigCache();
    try {
      expect(() => loadMedusaConfig()).toThrow(/MEDUSA_ADMIN_EMAIL, MEDUSA_ADMIN_PASSWORD/);
    } finally {
      process.env.MEDUSA_ADMIN_EMAIL = prior.email ?? "";
      process.env.MEDUSA_ADMIN_PASSWORD = prior.password ?? "";
      resetMedusaConfigCache();
    }
  });
});
