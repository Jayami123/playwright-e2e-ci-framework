import { expect, test } from "@playwright/test";
import { ALLOWED_DB_URLS, findSecretHits } from "../../src/support/report/secret-scan.js";

test.describe("report secret scan", () => {
  test(
    "cookie, session, bearer and password-field patterns each produce a hit",
    { tag: ["@unit"] },
    () => {
      for (const text of [
        "set-cookie: a=b",
        "sessionId=abc123",
        "Authorization: Bearer abcdefgh123",
        '{"password":"x"}',
      ]) {
        const hits = findSecretHits("f.json", text);
        expect(hits, text).toHaveLength(1);
        expect(hits[0]?.count).toBe(1);
      }
    },
  );

  test("the public CI database URLs are allowed; others are not", { tag: ["@unit"] }, () => {
    for (const url of ALLOWED_DB_URLS) {
      expect(findSecretHits("f.json", `url ${url}/db`), url).toEqual([]);
    }
    const hits = findSecretHits("f.json", "postgres://u:secret@db:5432/x");
    expect(hits.map((h) => h.pattern)).toEqual(["db url with credentials"]);
  });

  test("the word password in plain text is not a hit", { tag: ["@unit"] }, () => {
    expect(findSecretHits("f.html", "P1-DOC-AUTH-002 wrong password is rejected")).toEqual([]);
  });

  test("a hit never carries the matched value", { tag: ["@unit"] }, () => {
    const hits = findSecretHits("f.json", "sessionId=supersecretvalue");
    expect(JSON.stringify(hits)).not.toContain("supersecretvalue");
  });
  test(
    "a Cookie header is a hit; an identifier ending in Cookie is not",
    { tag: ["@unit"] },
    () => {
      for (const text of ["Cookie: a=b", '{"cookie": "a=b"}', "Set-Cookie: a=b"]) {
        expect(
          findSecretHits("f.md", text).map((h) => h.pattern),
          text,
        ).toContain(text.startsWith("Set-") ? "set-cookie header" : "cookie header");
      }
      expect(findSecretHits("f.md", "secondHasSessionCookie: second.hasSessionCookie,")).toEqual(
        [],
      );
      expect(findSecretHits("f.md", "hasSessionCookie: false")).toEqual([]);
    },
  );
});
