require("dotenv").config({ quiet: true });

const pool = require("./db");
const bcrypt = require("bcryptjs");
const config = require("./config/config");
const {
  getStatus,
  summarizeMigrationStatusForBootstrap,
  resolveKnownBootstrapPromotionChecksum,
  BOOTSTRAP_PROMOTION_MIGRATION,
} = require("./utils/migrator");

async function assertMigrationsReadyForBootstrap() {
  const client = await pool.connect();

  try {
    let summary = summarizeMigrationStatusForBootstrap(await getStatus(client));

    // Known reviewed 003 file revision: verify SUPER_ADMIN + audit, then rewrite
    // the recorded checksum so startup is not permanently blocked.
    if (
      !summary.bootstrapAllowed &&
      summary.criticalModified.length === 1 &&
      summary.criticalModified[0].file === BOOTSTRAP_PROMOTION_MIGRATION
    ) {
      await resolveKnownBootstrapPromotionChecksum(client, {
        bootstrapUsername: config.systemAdmin.username,
      });
      summary = summarizeMigrationStatusForBootstrap(await getStatus(client));
    }

    if (!summary.bootstrapAllowed) {
      if (summary.criticalModified.length > 0) {
        throw new Error(
          `Database has modified migration checksum(s): ` +
            `${summary.criticalModified.map((migration) => migration.file).join(", ")}. ` +
            "Resolve checksum issues before bootstrap."
        );
      }
      if (summary.blocking.length > 0) {
        throw new Error(
          `Database is missing ${summary.blocking.length} migration(s) before 003: ` +
            `${summary.blocking.map((migration) => migration.file).join(", ")}. ` +
            "Apply phase 1 with --defer-003 (001–002 only) first."
        );
      }
      throw new Error(
        "Bootstrap requires 001–002 applied and 003 as the next pending migration " +
          "(or 003 already applied). Use --defer-003, then create SYSTEM_ADMIN, " +
          "then dual-approve 003 before running 004+."
      );
    }

    return {
      only003Pending: summary.nextIs003,
      bootstrapRoleCode: summary.bootstrapRoleCode,
    };
  } finally {
    client.release();
  }
}

// Ensures one bootstrap administrator exists. An existing account is never
// modified (credentials, role and id are left as they are).
async function bootstrap() {
  const { only003Pending, bootstrapRoleCode } =
    await assertMigrationsReadyForBootstrap();

  if (!config.getMfaEncryptionKey()) {
    console.warn(
      "WARNING: MFA_ENCRYPTION_KEY is not set (expected 32 bytes, base64). " +
        "Users in MFA-required roles cannot sign in until it is configured."
    );
  }

  const username = String(config.systemAdmin.username || "").toLowerCase();
  if (!username) {
    console.warn("SYSTEM_ADMIN_USERNAME is not set; skipping bootstrap account check.");
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT r.code AS role_code
         FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE lower(u.username) = $1 AND u.deleted_at IS NULL`,
      [username]
    );

    if (existing.rows.length) {
      console.log(
        `Bootstrap account "${username}" exists (role ${existing.rows[0].role_code}); left unchanged.`
      );
      await client.query("COMMIT");
      return;
    }

    const supers = await client.query(
      `SELECT count(*)::int AS n FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id
        WHERE r.code = 'SUPER_ADMIN' AND u.deleted_at IS NULL`
    );

    if (supers.rows[0].n > 0) {
      console.log("A SUPER_ADMIN account already exists; bootstrap account not created.");
      await client.query("COMMIT");
      return;
    }

    if (!config.systemAdmin.password) {
      throw new Error("SYSTEM_ADMIN_PASSWORD is required to create the bootstrap account.");
    }

    const role = await client.query(
      `SELECT id FROM mst_roles WHERE code = $1`,
      [bootstrapRoleCode]
    );
    if (!role.rows.length) {
      throw new Error(
        `Required role ${bootstrapRoleCode} is missing; apply migrations before bootstrap.`
      );
    }

    await client.query(
      `INSERT INTO tbl_users (username, password_hash, full_name, role_id, status, is_synthetic)
       VALUES ($1, $2, $3, $4, 'ACTIVE', FALSE)`,
      [
        username,
        await bcrypt.hash(config.systemAdmin.password, 12),
        config.systemAdmin.fullName,
        role.rows[0].id,
      ]
    );

    await client.query("COMMIT");
    console.log(
      `Bootstrap ${bootstrapRoleCode} account "${username}" created` +
        (only003Pending
          ? " (003 still pending; run approved promote next)."
          : ".")
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = bootstrap;
