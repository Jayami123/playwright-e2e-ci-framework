import { test as setup } from "@playwright/test";
import { getAdapter } from "qa-portfolio-harness";

setup(
  "restart Documenso web with rate-limit bypass for functional tests",
  { tag: ["@documenso", "@setup"] },
  async () => {
    process.env.DANGEROUS_BYPASS_RATE_LIMITS = "true";
    process.env.DOCUMENSO_RESTART_WEB = "1";
    await getAdapter("documenso").up();
    delete process.env.DOCUMENSO_RESTART_WEB;
  },
);
