import { expect, test } from "../../../src/products/documenso/fixtures.js";
import { loginViaApi, newDocumensoApiContext } from "../../../src/products/documenso/auth.js";
test(
  "P1-DOC-RL-001 login authorize returns 429 after IP bucket exhausted",
  {
    tag: ["@documenso", "@rate-limit"],
    annotation: [
      { type: "testId", description: "P1-DOC-RL-001" },
      { type: "priority", description: "P1" },
    ],
  },
  async () => {
    if (process.env.DANGEROUS_BYPASS_RATE_LIMITS === "true") {
      throw new Error(
        "P1-DOC-RL-001 requires DANGEROUS_BYPASS_RATE_LIMITS unset/false on the Documenso server",
      );
    }

    const http = await newDocumensoApiContext();
    try {
      const password = "wrong-password-for-rate-limit-test";
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const result = await loginViaApi(http, {
          email: `p1-doc-rl-001-${String(attempt)}@example.test`,
          password,
        });
        expect(result.status, result.authorizeDiagnostic).not.toBe(429);
      }
      const limited = await loginViaApi(http, {
        email: "p1-doc-rl-001-final@example.test",
        password,
      });
      expect(limited.status, limited.authorizeDiagnostic).toBe(429);
    } finally {
      await http.dispose();
    }
  },
);
