import { expect, test } from "../../../src/products/documenso/fixtures.js";
import { documensoTimeouts } from "../../../src/products/documenso/env.js";
import { SignInPage } from "../../../src/products/documenso/pages/signin.page.js";

test(
  "P1-DOC-AUTH-000 QA user can sign in",
  { tag: ["@documenso", "@auth"] },
  async ({ page, documensoUser }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.signIn(documensoUser.email, documensoUser.password);
    await expect(page).toHaveURL(/\/t\/[^/]+\/documents$/, {
      timeout: documensoTimeouts().request,
    });
  },
);
