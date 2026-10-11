import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  documensoHasSessionIdCookie,
  loginViaApi,
  readSession,
  sessionHasEmail,
} from "../../../src/products/documenso/auth.js";
import {
  documensoTeamDocumentsPath,
  documensoTimeouts,
} from "../../../src/products/documenso/env.js";
import { expect, test } from "../../../src/products/documenso/fixtures.js";
import { DocumentsPage } from "../../../src/products/documenso/pages/documents.page.js";

const EMPTY_STORAGE = { cookies: [] as [], origins: [] as [] };

test.use({ storageState: EMPTY_STORAGE });
test.setTimeout(documensoTimeouts().journey);

test(
  "P1-DOC-FW-001 API sign-in produces storageState",
  {
    tag: ["@documenso", "@fw"],
    annotation: [
      { type: "testId", description: "P1-DOC-FW-001" },
      { type: "priority", description: "P0" },
    ],
  },
  async ({ browser, page, documensoUser }) => {
    const login = await loginViaApi(page.request, {
      email: documensoUser.email,
      password: documensoUser.password,
    });
    expect(login.status, login.authorizeDiagnostic).toBe(201);
    expect(login.hasSessionCookie).toBe(true);

    const stateDir = await mkdtemp(path.join(os.tmpdir(), "p1-doc-fw001-storage-state-"));
    try {
      const statePath = path.join(stateDir, "storage-state.json");
      await page.context().storageState({ path: statePath });
      const reused = await browser.newContext({ storageState: statePath });
      const reusedPage = await reused.newPage();
      try {
        const documents = new DocumentsPage(reusedPage);
        await documents.goto(documensoUser.teamUrl);
        const session = await readSession(reusedPage.request);
        expect(sessionHasEmail(session, documensoUser.email)).toBe(true);
        const cookies = (await reused.storageState()).cookies;
        expect(documensoHasSessionIdCookie(cookies)).toBe(true);
        await expect(reusedPage).toHaveURL(
          new RegExp(`${documensoTeamDocumentsPath(documensoUser.teamUrl).replace(/\//g, "\\/")}$`),
        );
      } finally {
        await reused.close();
      }
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  },
);
