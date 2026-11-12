require("dotenv").config({ quiet: true });

const pool = require("./db");
const bcrypt = require("bcryptjs");
const config = require("./config/config");
const { runMigrations } = require("./utils/migrator");

async function assertMigrationsApplied() {
  const client = await pool.connect();
  let outstanding;

  try {
    const results = await runMigrations(client, {
      apply: false,
      context: { bootstrapUsername: config.systemAdmin.username },
    });
    outstanding = results.filter((migration) => migration.action === "would-apply");
  } finally {
    client.release();
  }

  if (outstanding.length > 0) {
    throw new Error(
      `Database is missing ${outstanding.length} migration(s): ` +
      `${outstanding.map((migration) => migration.file).join(", ")}. ` +
      "Review with `npm run migrate` and apply only after approval with `npm run migrate:apply`."
    );
  }
}

// Ensures one bootstrap administrator exists. An existing account is never
// modified (credentials, role and id are left as they are).
async function bootstrap() {
  await assertMigrationsApplied();

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
      console.log(`Bootstrap account "${username}" exists (role ${existing.rows[0].role_code}); left unchanged.`);
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

    await client.query(
      `INSERT INTO tbl_users (username, password_hash, full_name, role_id, status, is_synthetic)
       SELECT $1, $2, $3, id, 'ACTIVE', FALSE FROM mst_roles WHERE code = 'SUPER_ADMIN'`,
      [username, await bcrypt.hash(config.systemAdmin.password, 12), config.systemAdmin.fullName]
    );

    await client.query("COMMIT");
    console.log(`Bootstrap SUPER_ADMIN account "${username}" created.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = bootstrap;
