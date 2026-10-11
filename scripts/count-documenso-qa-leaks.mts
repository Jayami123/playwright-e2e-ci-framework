import "dotenv/config";
import {
  countDocumensoQaOrphans,
  countDocumensoQaRateLimitRows,
  countDocumensoQaUsers,
} from "../src/products/documenso/qa-user.js";

const users = await countDocumensoQaUsers();
const orphans = await countDocumensoQaOrphans();
const rateLimitRows = await countDocumensoQaRateLimitRows();
console.log(JSON.stringify({ users, orphans, rateLimitRows }, null, 2));

const orphanTotal =
  orphans.orphanOrganisationGlobalSettings +
  orphans.orphanOrganisationClaim +
  orphans.orphanOrganisationAuthenticationPortal +
  orphans.orphanTeamGlobalSettings;

if (users > 0 || orphanTotal > 0) {
  process.exitCode = 1;
}
