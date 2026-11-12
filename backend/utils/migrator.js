const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.(sql|js)$/;
const ADVISORY_LOCK_KEY = 4821517;
const BOOTSTRAP_PROMOTION_MIGRATION = "003_promote_bootstrap_admin.js";
const ORIGINAL_BOOTSTRAP_PROMOTION_CHECKSUM =
  "22f31672205eed842abe7ecefb0ba4b0fc442c2fa403b8a27304874046cc1258";
const CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM =
  "188deb30eb45efa53f679932d74c7f9af8466cdfc4c9e504bbecb0d9574bf389";
const PRODUCTION_DATABASE = "Aarogya";
const TEST_DATABASE = "aarogya_test";

// Databases built from ALL_IN_ONE (1).sql already contain these changes,
// so they are recorded as a baseline instead of being re-applied.
const BASELINE_CHECKS = {
  "001_schema_fixes.sql": `
    SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reg_reviewed')
       AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_facility_parent')
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_slot_guard') AS ok`,
};

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename     TEXT PRIMARY KEY,
      checksum     CHAR(64) NOT NULL,
      applied_by   TEXT NOT NULL DEFAULT 'migrator',
      execution_ms INT,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

// Read-only: never creates the tracking table, so a dry run changes nothing.
async function getStatus(client) {
  const exists = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok");

  const appliedRows = exists.rows[0].ok
    ? await client.query("SELECT filename, checksum, applied_by, applied_at FROM schema_migrations")
    : { rows: [] };
  const applied = new Map(appliedRows.rows.map((row) => [row.filename, row]));

  return listMigrationFiles().map((file) => {
    const checksum = sha256(fs.readFileSync(path.join(MIGRATIONS_DIR, file)));
    const row = applied.get(file);

    if (!row) return { file, checksum, state: "pending" };
    if (row.checksum !== checksum) return { file, checksum, state: "modified", appliedAt: row.applied_at };
    return { file, checksum, state: "applied", appliedBy: row.applied_by, appliedAt: row.applied_at };
  });
}

// Migration files must not manage their own transaction; each runs inside one here.
function stripTransactionControl(sql) {
  return sql.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, "");
}

async function skipKnownBootstrapPromotion(client, migration, context, log) {
  if (migration.checksum !== CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM) {
    throw new Error(
      "003 checksum mismatch is not the reviewed local source; refusing to continue."
    );
  }

  const databaseResult = await client.query("SELECT current_database() AS name");
  const databaseName = databaseResult.rows[0]?.name;
  const recordedResult = await client.query(
    "SELECT checksum FROM schema_migrations WHERE filename = $1",
    [BOOTSTRAP_PROMOTION_MIGRATION]
  );
  const recordedChecksum = recordedResult.rows[0]?.checksum?.trim();

  if (recordedChecksum !== ORIGINAL_BOOTSTRAP_PROMOTION_CHECKSUM) {
    throw new Error(
      "003 recorded checksum does not match the known original; refusing to continue."
    );
  }

  if (databaseName === TEST_DATABASE) {
    const usersResult = await client.query(
      "SELECT EXISTS (SELECT 1 FROM tbl_users LIMIT 1) AS has_users"
    );
    if (usersResult.rows[0]?.has_users !== false) {
      throw new Error(
        "003 may be skipped on aarogya_test only when tbl_users is empty; refusing to continue."
      );
    }

    log(
      "  skipped   003_promote_bootstrap_admin.js (aarogya_test is empty and the known original checksum is recorded; migration was not executed)"
    );
    return;
  }

  if (databaseName !== PRODUCTION_DATABASE) {
    throw new Error(
      `003 checksum exception is not allowed for database "${databaseName || "unknown"}".`
    );
  }

  const bootstrapUsername = context.bootstrapUsername;
  if (typeof bootstrapUsername !== "string" || !bootstrapUsername.trim()) {
    throw new Error(
      "003 production verification requires the configured bootstrap username."
    );
  }

  const verification = await client.query(
    `SELECT u.id
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
      WHERE lower(u.username) = lower($1)
        AND u.deleted_at IS NULL
        AND r.code = 'SUPER_ADMIN'
        AND EXISTS (
          SELECT 1
            FROM tbl_audit_logs a
           WHERE a.resource_id = u.id::text
             AND a.resource_type = 'user'
             AND a.event = 'ROLE_CHANGED'
             AND a.actor_role = 'MIGRATION'
             AND a.actor_id IS NULL
             AND a.metadata->>'migration' = '003_promote_bootstrap_admin'
             AND a.metadata->>'from' = 'SYSTEM_ADMIN'
             AND a.metadata->>'to' = 'SUPER_ADMIN'
        )`,
    [bootstrapUsername.trim()]
  );

  if (verification.rows.length !== 1) {
    throw new Error(
      "003 production verification failed: the configured SUPER_ADMIN and matching ROLE_CHANGED audit record were not both confirmed."
    );
  }

  log(
    "  verified  003_promote_bootstrap_admin.js (Aarogya SUPER_ADMIN and matching ROLE_CHANGED audit record confirmed; migration was not executed)"
  );
}

async function runMigrations(client, { apply = false, context = {}, log = console.log } = {}) {
  await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

  try {
    if (apply) await ensureMigrationsTable(client);
    const status = await getStatus(client);

    const modified = status.filter((m) => m.state === "modified");
    for (const migration of modified) {
      if (migration.file !== BOOTSTRAP_PROMOTION_MIGRATION) {
        throw new Error(
          `Applied migration file modified: ${migration.file}`
        );
      }

      await skipKnownBootstrapPromotion(client, migration, context, log);
    }

    const pending = status.filter((m) => m.state === "pending");
    if (pending.some((m) => m.file === BOOTSTRAP_PROMOTION_MIGRATION)) {
      throw new Error(
        "003_promote_bootstrap_admin.js is not recorded as applied; it will never be executed automatically."
      );
    }

    const results = [];

    for (const migration of pending) {
      const fullPath = path.join(MIGRATIONS_DIR, migration.file);

      if (!apply) {
        results.push({ file: migration.file, action: "would-apply" });
        continue;
      }

      const baselineCheck = BASELINE_CHECKS[migration.file];
      if (baselineCheck) {
        const check = await client.query(baselineCheck);
        if (check.rows[0].ok) {
          await client.query(
            "INSERT INTO schema_migrations (filename, checksum, applied_by) VALUES ($1, $2, 'baseline')",
            [migration.file, migration.checksum]
          );
          log(`  baseline  ${migration.file} (already present in schema)`);
          results.push({ file: migration.file, action: "baseline" });
          continue;
        }
      }

      const started = Date.now();
      await client.query("BEGIN");

      try {
        if (migration.file.endsWith(".sql")) {
          const sql = stripTransactionControl(fs.readFileSync(fullPath, "utf8"));
          await client.query(sql);
        } else {
          const mod = require(fullPath);
          await mod.up(client, { ...context, log });
        }

        await client.query(
          "INSERT INTO schema_migrations (filename, checksum, execution_ms) VALUES ($1, $2, $3)",
          [migration.file, migration.checksum, Date.now() - started]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.file} failed and was rolled back: ${error.message}`);
      }

      log(`  applied   ${migration.file} (${Date.now() - started} ms)`);
      results.push({ file: migration.file, action: "applied" });
    }

    return results;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
  }
}

module.exports = { runMigrations, getStatus, listMigrationFiles };
