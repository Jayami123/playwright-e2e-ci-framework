import "dotenv/config";
import fs from "node:fs";
import {
  countDocumensoEnvelopeLeakRows,
  countDocumensoQaOrphans,
  countDocumensoQaPasskeys,
  countDocumensoQaRateLimitRows,
  countDocumensoQaUsers,
} from "../src/products/documenso/qa-user.js";

/** Documenso may leave DocumentMeta/Data after envelope delete (P7-OBS-DOC-FW-005); only fail above this per-table count. */
const DOCUMENSO_ORPHAN_DOCUMENT_STORAGE_CEILING = 100;

const P7_OBS_DOC_FW_005 = "P7-OBS-DOC-FW-005";

async function main(): Promise<void> {
  const users = await countDocumensoQaUsers();
  const orphans = await countDocumensoQaOrphans();
  const passkeys = await countDocumensoQaPasskeys();
  const rateLimitRows = await countDocumensoQaRateLimitRows();
  const envelopeLeaks = await countDocumensoEnvelopeLeakRows();

  console.log(JSON.stringify({ users, orphans, passkeys, rateLimitRows, envelopeLeaks }, null, 2));

  const orphanOrganisationTotal =
    orphans.orphanOrganisationGlobalSettings +
    orphans.orphanOrganisationClaim +
    orphans.orphanOrganisationAuthenticationPortal +
    orphans.orphanTeamGlobalSettings;

  const { orphanDocumentMeta, orphanDocumentData } = envelopeLeaks;

  console.log(`\nknown product leftovers (${P7_OBS_DOC_FW_005})`);
  console.log(`  orphanDocumentMeta: ${String(orphanDocumentMeta)}`);
  console.log(`  orphanDocumentData: ${String(orphanDocumentData)}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const block = [
      "",
      `### known product leftovers (${P7_OBS_DOC_FW_005})`,
      "",
      `- orphanDocumentMeta: ${String(orphanDocumentMeta)}`,
      `- orphanDocumentData: ${String(orphanDocumentData)}`,
      "",
    ].join("\n");
    fs.appendFileSync(summaryPath, block, "utf8");
  }

  const harnessLeak =
    users > 0 ||
    orphanOrganisationTotal > 0 ||
    passkeys > 0 ||
    envelopeLeaks.qaEnvelopes > 0 ||
    envelopeLeaks.qaRecipients > 0;

  const runawayDocumentStorage =
    orphanDocumentMeta > DOCUMENSO_ORPHAN_DOCUMENT_STORAGE_CEILING ||
    orphanDocumentData > DOCUMENSO_ORPHAN_DOCUMENT_STORAGE_CEILING;

  if (harnessLeak || runawayDocumentStorage) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
