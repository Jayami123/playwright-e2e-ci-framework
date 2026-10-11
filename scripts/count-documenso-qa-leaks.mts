import "dotenv/config";
import {
  countDocumensoQaOrphans,
  countDocumensoQaPasskeys,
  countDocumensoQaRateLimitRows,
  countDocumensoQaUsers,
} from "../src/products/documenso/qa-user.js";

const users = await countDocumensoQaUsers();
const orphans = await countDocumensoQaOrphans();
const passkeys = await countDocumensoQaPasskeys();
const rateLimitRows = await countDocumensoQaRateLimitRows();
console.log(JSON.stringify({ users, orphans, passkeys, rateLimitRows }, null, 2));

const orphanTotal =
  orphans.orphanOrganisationGlobalSettings +
  orphans.orphanOrganisationClaim +
  orphans.orphanOrganisationAuthenticationPortal +
  orphans.orphanTeamGlobalSettings;

if (users > 0 || orphanTotal > 0 || passkeys > 0) {
  process.exitCode = 1;
}
