import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import type { DocumensoQaUser } from "./factories.js";
import { withDocumensoPool } from "./db.js";

const BCRYPT_ROUNDS = 12 as const;
const QA_EMAIL_LIKE = "qa-%@qa.local" as const;
const EXPECTED_MIGRATION_HEAD = "20260818081941_add_api_token_last_used_property" as const;

const DEFAULT_EMAIL_DOCUMENT_SETTINGS = {
  recipientSigningRequest: true,
  recipientRemoved: true,
  recipientSigned: true,
  documentPending: true,
  documentCompleted: true,
  documentDeleted: true,
  ownerDocumentCompleted: true,
  ownerRecipientExpired: true,
  ownerDocumentCreated: true,
} as const;

const DEFAULT_ENVELOPE_EXPIRATION_PERIOD = { unit: "month", amount: 3 } as const;
const DEFAULT_REMINDER_SETTINGS = {
  sendAfter: { unit: "day", amount: 5 },
  repeatEvery: { unit: "day", amount: 2 },
} as const;

export type DocumensoQaUserRecord = DocumensoQaUser & { readonly id: number };

export interface DocumensoQaOrphanCounts {
  readonly orphanOrganisationGlobalSettings: number;
  readonly orphanOrganisationClaim: number;
  readonly orphanOrganisationAuthenticationPortal: number;
  readonly orphanTeamGlobalSettings: number;
}

function prefixedId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

async function rollbackTransaction(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => {});
}

async function assertDocumensoMigrationHead(client: PoolClient): Promise<void> {
  const result = await client.query<{ migration_name: string }>(
    `SELECT migration_name
     FROM _prisma_migrations
     WHERE finished_at IS NOT NULL
     ORDER BY migration_name DESC
     LIMIT 1`,
  );
  const found = result.rows[0]?.migration_name;
  if (found === undefined) {
    throw new Error(
      `Documenso schema changed, the QA user insert needs review (expected migration ${EXPECTED_MIGRATION_HEAD}, found none)`,
    );
  }
  if (found !== EXPECTED_MIGRATION_HEAD) {
    throw new Error(
      `Documenso schema changed, the QA user insert needs review (expected migration ${EXPECTED_MIGRATION_HEAD}, found ${found})`,
    );
  }
}

async function insertDocumensoQaUser(
  client: PoolClient,
  input: DocumensoQaUser,
  passwordHash: string,
): Promise<DocumensoQaUserRecord> {
  await assertDocumensoMigrationHead(client);

  const email = input.email.toLowerCase();

  const orgSettingsId = prefixedId("org_setting");
  const orgClaimId = prefixedId("org_claim");
  const orgPortalId = prefixedId("org_sso");
  const orgId = prefixedId("org");
  const memberId = prefixedId("member");
  const teamSettingsId = prefixedId("team_setting");
  const teamUrl = prefixedId("personal");

  const adminGroupId = prefixedId("org_group");
  const managerGroupId = prefixedId("org_group");
  const memberGroupId = prefixedId("org_group");
  const groupMemberId = prefixedId("group_member");

  const userResult = await client.query<{ id: number }>(
    `INSERT INTO "User" (name, email, password, "emailVerified")
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [input.name, email, passwordHash],
  );
  const userId = userResult.rows[0]?.id;
  if (userId === undefined) {
    throw new Error("createDocumensoQaUser INSERT User returned no id");
  }

  await client.query(
    `INSERT INTO "OrganisationGlobalSettings" (
       id, "emailDocumentSettings", "envelopeExpirationPeriod", "reminderSettings"
     ) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)`,
    [
      orgSettingsId,
      JSON.stringify(DEFAULT_EMAIL_DOCUMENT_SETTINGS),
      JSON.stringify(DEFAULT_ENVELOPE_EXPIRATION_PERIOD),
      JSON.stringify(DEFAULT_REMINDER_SETTINGS),
    ],
  );

  await client.query(
    `INSERT INTO "OrganisationClaim" (
       id, "createdAt", "updatedAt", "originalSubscriptionClaimId", "teamCount", "memberCount",
       "envelopeItemCount", "recipientCount", flags, "documentRateLimits", "documentQuota",
       "emailRateLimits", "emailQuota", "apiRateLimits", "apiQuota", "emailTransportId"
     )
     SELECT
       $1, NOW(), NOW(), 'free', "teamCount", "memberCount", "envelopeItemCount", "recipientCount",
       flags, "documentRateLimits", "documentQuota", "emailRateLimits", "emailQuota",
       "apiRateLimits", "apiQuota", "emailTransportId"
     FROM "SubscriptionClaim"
     WHERE id = 'free'`,
    [orgClaimId],
  );

  await client.query(`INSERT INTO "OrganisationAuthenticationPortal" (id) VALUES ($1)`, [
    orgPortalId,
  ]);

  await client.query(
    `INSERT INTO "Organisation" (
       id, "createdAt", "updatedAt", type, name, url, "ownerUserId", "organisationGlobalSettingsId",
       "organisationClaimId", "organisationAuthenticationPortalId"
     ) VALUES ($1, NOW(), NOW(), 'PERSONAL', 'Personal Organisation', $2, $3, $4, $5, $6)`,
    [orgId, orgId, userId, orgSettingsId, orgClaimId, orgPortalId],
  );

  const orgGroups: { id: string; role: "ADMIN" | "MANAGER" | "MEMBER" }[] = [
    { id: adminGroupId, role: "ADMIN" },
    { id: managerGroupId, role: "MANAGER" },
    { id: memberGroupId, role: "MEMBER" },
  ];
  for (const group of orgGroups) {
    await client.query(
      `INSERT INTO "OrganisationGroup" (id, type, "organisationRole", "organisationId")
       VALUES ($1, 'INTERNAL_ORGANISATION', $2::"OrganisationMemberRole", $3)`,
      [group.id, group.role, orgId],
    );
  }

  await client.query(
    `INSERT INTO "OrganisationMember" (id, "createdAt", "updatedAt", "userId", "organisationId")
     VALUES ($1, NOW(), NOW(), $2, $3)`,
    [memberId, userId, orgId],
  );

  await client.query(
    `INSERT INTO "OrganisationGroupMember" (id, "groupId", "organisationMemberId")
     VALUES ($1, $2, $3)`,
    [groupMemberId, adminGroupId, memberId],
  );

  await client.query(`INSERT INTO "TeamGlobalSettings" (id) VALUES ($1)`, [teamSettingsId]);

  const teamResult = await client.query<{ id: number }>(
    `INSERT INTO "Team" (name, url, "organisationId", "teamGlobalSettingsId")
     VALUES ('Personal Team', $1, $2, $3)
     RETURNING id`,
    [teamUrl, orgId, teamSettingsId],
  );
  const teamId = teamResult.rows[0]?.id;
  if (teamId === undefined) {
    throw new Error("createDocumensoQaUser INSERT Team returned no id");
  }

  const teamGroupMappings: { groupId: string; teamRole: "ADMIN" | "MEMBER" }[] = [
    { groupId: adminGroupId, teamRole: "ADMIN" },
    { groupId: managerGroupId, teamRole: "ADMIN" },
    { groupId: memberGroupId, teamRole: "MEMBER" },
  ];
  for (const mapping of teamGroupMappings) {
    await client.query(
      `INSERT INTO "TeamGroup" (id, "organisationGroupId", "teamRole", "teamId")
       VALUES ($1, $2, $3::"TeamMemberRole", $4)`,
      [prefixedId("team_group"), mapping.groupId, mapping.teamRole, teamId],
    );
  }

  const internalTeamRoles: ("ADMIN" | "MANAGER" | "MEMBER")[] = ["ADMIN", "MANAGER", "MEMBER"];
  for (const teamRole of internalTeamRoles) {
    const internalGroupId = prefixedId("org_group");
    await client.query(
      `INSERT INTO "OrganisationGroup" (id, type, "organisationRole", "organisationId")
       VALUES ($1, 'INTERNAL_TEAM', 'MEMBER'::"OrganisationMemberRole", $2)`,
      [internalGroupId, orgId],
    );
    await client.query(
      `INSERT INTO "TeamGroup" (id, "organisationGroupId", "teamRole", "teamId")
       VALUES ($1, $2, $3::"TeamMemberRole", $4)`,
      [prefixedId("team_group"), internalGroupId, teamRole, teamId],
    );
  }

  return { id: userId, email, name: input.name, password: input.password };
}

export async function createDocumensoQaUser(
  input: DocumensoQaUser,
): Promise<DocumensoQaUserRecord> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  return withDocumensoPool(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const record = await insertDocumensoQaUser(client, input, passwordHash);
      await client.query("COMMIT");
      return record;
    } catch (error) {
      await rollbackTransaction(client);
      throw error;
    } finally {
      client.release();
    }
  });
}

interface OwnedOrganisationRow {
  readonly id: string;
  readonly organisationGlobalSettingsId: string;
  readonly organisationClaimId: string;
  readonly organisationAuthenticationPortalId: string;
}

async function deleteDocumensoQaUserInTransaction(
  client: PoolClient,
  userId: number,
): Promise<void> {
  const orgResult = await client.query<OwnedOrganisationRow>(
    `SELECT id, "organisationGlobalSettingsId", "organisationClaimId", "organisationAuthenticationPortalId"
     FROM "Organisation"
     WHERE "ownerUserId" = $1`,
    [userId],
  );
  if (orgResult.rows.length !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 Organisation row, found ${String(orgResult.rows.length)}`,
    );
  }
  const org = orgResult.rows[0];
  if (org === undefined) {
    throw new Error("teardownDocumensoQaUserById Organisation row missing after length check");
  }

  const teamResult = await client.query<{ id: number; teamGlobalSettingsId: string }>(
    `SELECT id, "teamGlobalSettingsId" FROM "Team" WHERE "organisationId" = $1`,
    [org.id],
  );
  if (teamResult.rows.length !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 Team row, found ${String(teamResult.rows.length)}`,
    );
  }
  const team = teamResult.rows[0];
  if (team === undefined) {
    throw new Error("teardownDocumensoQaUserById Team row missing after length check");
  }

  const deletedOrg = await client.query(`DELETE FROM "Organisation" WHERE id = $1 RETURNING id`, [
    org.id,
  ]);
  if ((deletedOrg.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 Organisation delete, got ${String(deletedOrg.rowCount ?? 0)}`,
    );
  }

  const deletedOrgSettings = await client.query(
    `DELETE FROM "OrganisationGlobalSettings" WHERE id = $1`,
    [org.organisationGlobalSettingsId],
  );
  if ((deletedOrgSettings.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 OrganisationGlobalSettings delete, got ${String(deletedOrgSettings.rowCount ?? 0)}`,
    );
  }

  const deletedOrgClaim = await client.query(`DELETE FROM "OrganisationClaim" WHERE id = $1`, [
    org.organisationClaimId,
  ]);
  if ((deletedOrgClaim.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 OrganisationClaim delete, got ${String(deletedOrgClaim.rowCount ?? 0)}`,
    );
  }

  const deletedOrgPortal = await client.query(
    `DELETE FROM "OrganisationAuthenticationPortal" WHERE id = $1`,
    [org.organisationAuthenticationPortalId],
  );
  if ((deletedOrgPortal.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 OrganisationAuthenticationPortal delete, got ${String(deletedOrgPortal.rowCount ?? 0)}`,
    );
  }

  const deletedTeamSettings = await client.query(`DELETE FROM "TeamGlobalSettings" WHERE id = $1`, [
    team.teamGlobalSettingsId,
  ]);
  if ((deletedTeamSettings.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 TeamGlobalSettings delete, got ${String(deletedTeamSettings.rowCount ?? 0)}`,
    );
  }

  const deletedUser = await client.query(`DELETE FROM "User" WHERE id = $1 RETURNING id`, [userId]);
  if ((deletedUser.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownDocumensoQaUserById expected 1 User delete, got ${String(deletedUser.rowCount ?? 0)}`,
    );
  }
}

export async function teardownDocumensoQaUserById(userId: number): Promise<void> {
  await withDocumensoPool(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await deleteDocumensoQaUserInTransaction(client, userId);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackTransaction(client);
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function countDocumensoQaPasskeys(): Promise<number> {
  return withDocumensoPool(async (pool) => {
    const result = await pool.query<{ leftover: number }>(
      `SELECT count(*)::int AS leftover
       FROM "Passkey" p
       JOIN "User" u ON u.id = p."userId"
       WHERE u.email LIKE $1`,
      [QA_EMAIL_LIKE],
    );
    const count = result.rows[0]?.leftover;
    if (count === undefined) {
      throw new Error("countDocumensoQaPasskeys query returned no row");
    }
    return count;
  });
}

export async function countDocumensoPasskeysForUser(userId: number): Promise<number> {
  return withDocumensoPool(async (pool) => {
    const result = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "Passkey" WHERE "userId" = $1`,
      [userId],
    );
    const count = result.rows[0]?.count;
    if (count === undefined) {
      throw new Error("countDocumensoPasskeysForUser query returned no row");
    }
    return count;
  });
}

export async function countDocumensoQaRateLimitRows(): Promise<number> {
  return withDocumensoPool(async (pool) => {
    const result = await pool.query<{ leftover: number }>(
      `SELECT count(*)::int AS leftover FROM "RateLimit" WHERE key LIKE 'id:qa-%'`,
    );
    const count = result.rows[0]?.leftover;
    if (count === undefined) {
      throw new Error("countDocumensoQaRateLimitRows query returned no row");
    }
    return count;
  });
}

export async function countDocumensoQaUsers(): Promise<number> {
  return withDocumensoPool(async (pool) => {
    const result = await pool.query<{ leftover: number }>(
      `SELECT count(*)::int AS leftover FROM "User" WHERE email LIKE $1`,
      [QA_EMAIL_LIKE],
    );
    const count = result.rows[0]?.leftover;
    if (count === undefined) {
      throw new Error("countDocumensoQaUsers query returned no row");
    }
    return count;
  });
}

export async function countDocumensoQaOrphans(): Promise<DocumensoQaOrphanCounts> {
  return withDocumensoPool(async (pool) => {
    const result = await pool.query<{
      orphan_organisation_global_settings: number;
      orphan_organisation_claim: number;
      orphan_organisation_authentication_portal: number;
      orphan_team_global_settings: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM "OrganisationGlobalSettings" s
          WHERE NOT EXISTS (
            SELECT 1 FROM "Organisation" o WHERE o."organisationGlobalSettingsId" = s.id
          )) AS orphan_organisation_global_settings,
         (SELECT count(*)::int FROM "OrganisationClaim" c
          WHERE NOT EXISTS (
            SELECT 1 FROM "Organisation" o WHERE o."organisationClaimId" = c.id
          )) AS orphan_organisation_claim,
         (SELECT count(*)::int FROM "OrganisationAuthenticationPortal" p
          WHERE NOT EXISTS (
            SELECT 1 FROM "Organisation" o WHERE o."organisationAuthenticationPortalId" = p.id
          )) AS orphan_organisation_authentication_portal,
         (SELECT count(*)::int FROM "TeamGlobalSettings" s
          WHERE NOT EXISTS (
            SELECT 1 FROM "Team" t WHERE t."teamGlobalSettingsId" = s.id
          )) AS orphan_team_global_settings`,
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("countDocumensoQaOrphans query returned no row");
    }
    return {
      orphanOrganisationGlobalSettings: row.orphan_organisation_global_settings,
      orphanOrganisationClaim: row.orphan_organisation_claim,
      orphanOrganisationAuthenticationPortal: row.orphan_organisation_authentication_portal,
      orphanTeamGlobalSettings: row.orphan_team_global_settings,
    };
  });
}

export async function readDocumensoTwoFactorEnabled(userId: number): Promise<boolean> {
  return withDocumensoPool(async (pool) => {
    const result = await pool.query<{ two_factor_enabled: boolean }>(
      `SELECT "twoFactorEnabled" AS two_factor_enabled FROM "User" WHERE id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Documenso QA user id=${String(userId)} was not found`);
    }
    return row.two_factor_enabled;
  });
}

export async function sweepDocumensoQaUsers(): Promise<number> {
  return withDocumensoPool(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const listed = await client.query<{ id: number }>(
        `SELECT id FROM "User" WHERE email LIKE $1 ORDER BY id ASC`,
        [QA_EMAIL_LIKE],
      );
      for (const row of listed.rows) {
        await deleteDocumensoQaUserInTransaction(client, row.id);
      }
      await client.query("COMMIT");
      return listed.rows.length;
    } catch (error) {
      await rollbackTransaction(client);
      throw error;
    } finally {
      client.release();
    }
  });
}
