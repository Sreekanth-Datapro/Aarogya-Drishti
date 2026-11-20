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
const APPROVE_003_ENV_VALUE = "PROMOTE_BOOTSTRAP";
// Legacy local/production database name. Render Postgres uses a different
// generated name; set MIGRATION_TRUSTED_DATABASE_NAME to that exact name.
const DEFAULT_PRODUCTION_DATABASE = "Aarogya";
const TEST_DATABASE = "aarogya_test";
// Fixed allowlisted username for Jest integration harness only (never production).
const INTEGRATION_TEST_BOOTSTRAP_USERNAME = "zz_test_bootstrap_admin";

/**
 * Exact database name allowed for the 003 production verification path.
 * - Unset → defaults to "Aarogya" (existing production identity).
 * - Set → must equal current_database() exactly (e.g. Render DB name).
 * Never treats the test database as trusted production.
 */
function resolveTrustedProductionDatabaseName(env = process.env) {
  const configured = String(env.MIGRATION_TRUSTED_DATABASE_NAME || "").trim();
  if (!configured) {
    return DEFAULT_PRODUCTION_DATABASE;
  }
  if (configured === TEST_DATABASE) {
    throw new Error(
      "MIGRATION_TRUSTED_DATABASE_NAME must not target the test database."
    );
  }
  return configured;
}

function is003DualApproved(context = {}, env = process.env) {
  const cliApproved = context.approve003PromoteBootstrap === true;
  const envApproved = String(env.MIGRATE_APPROVE_003 || "").trim() === APPROVE_003_ENV_VALUE;
  return cliApproved && envApproved;
}

/**
 * 003-only promote: dual approval plus explicit --only-003-promote-bootstrap.
 * Never implies that later migrations (004+) should run.
 */
function is003OnlyPromoteApproved(context = {}, env = process.env) {
  return context.only003PromoteBootstrap === true && is003DualApproved(context, env);
}

function assertExplicitTrustedDatabaseForOnly003(env = process.env) {
  const configured = String(env.MIGRATION_TRUSTED_DATABASE_NAME || "").trim();
  if (!configured) {
    throw new Error(
      "only-003 promote requires MIGRATION_TRUSTED_DATABASE_NAME to be set explicitly " +
        "to the target database name (must match current_database())."
    );
  }
  if (configured === TEST_DATABASE) {
    throw new Error(
      "MIGRATION_TRUSTED_DATABASE_NAME must not target the test database."
    );
  }
}

function migrationSortKey(file) {
  return String(file);
}

function isBeforeBootstrapPromotion(file) {
  return migrationSortKey(file) < migrationSortKey(BOOTSTRAP_PROMOTION_MIGRATION);
}

function isAfterBootstrapPromotion(file) {
  return migrationSortKey(file) > migrationSortKey(BOOTSTRAP_PROMOTION_MIGRATION);
}

/**
 * Bootstrap may create SYSTEM_ADMIN when 001+002 are settled and 003 is the
 * next pending migration (004+ may still be pending). After 003 is applied,
 * bootstrap may create SUPER_ADMIN if the account is still missing.
 */
function summarizeMigrationStatusForBootstrap(status) {
  const pending = status
    .filter((migration) => migration.state === "pending")
    .sort((a, b) => migrationSortKey(a.file).localeCompare(migrationSortKey(b.file)));
  const modified = status.filter((migration) => migration.state === "modified");
  const criticalModified = modified.filter(
    (migration) => !isAfterBootstrapPromotion(migration.file)
  );

  const file001 = status.find((migration) => migration.file.startsWith("001_"));
  const file002 = status.find((migration) => migration.file.startsWith("002_"));
  const file003 = status.find(
    (migration) => migration.file === BOOTSTRAP_PROMOTION_MIGRATION
  );

  const pendingBefore003 = pending.filter((migration) =>
    isBeforeBootstrapPromotion(migration.file)
  );
  const nextPending = pending[0] || null;
  const nextIs003 =
    !!nextPending && nextPending.file === BOOTSTRAP_PROMOTION_MIGRATION;

  const earlySettled =
    file001?.state === "applied" && file002?.state === "applied";

  const readyForSystemAdmin =
    earlySettled &&
    nextIs003 &&
    criticalModified.length === 0;

  const readyForSuperAdmin =
    earlySettled &&
    file003?.state === "applied" &&
    pendingBefore003.length === 0 &&
    criticalModified.length === 0;

  return {
    pending,
    modified,
    criticalModified,
    pendingBefore003,
    blocking: pendingBefore003,
    nextIs003,
    only003Pending: nextIs003,
    readyForSystemAdmin,
    readyForSuperAdmin,
    bootstrapAllowed: readyForSystemAdmin || readyForSuperAdmin,
    bootstrapRoleCode: readyForSystemAdmin ? "SYSTEM_ADMIN" : "SUPER_ADMIN",
  };
}

// Databases built from ALL_IN_ONE / AAROGYA_BOOTSTRAP_FINAL already contain these
// changes, so they are recorded as a baseline instead of being re-applied.
const BASELINE_CHECKS = {
  "001_schema_fixes.sql": `
    SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reg_reviewed')
       AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_facility_parent')
       AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_slot_guard') AS ok`,

  // 002_security_core.sql: verify every important schema/data effect.
  // Accept either the original trg_reg_reviewer_role → fn_require_role path
  // or the newer two-stage fn_validate_registration_reviewer workflow shipped in
  // bootstrap (intentional replacement — never re-apply 002 over it).
  "002_security_core.sql": `
    SELECT
      EXISTS (SELECT 1 FROM mst_roles WHERE code = 'SUPER_ADMIN')
      AND (
            SELECT count(*) FROM mst_permissions
             WHERE code IN (
               'master.view', 'master.manage', 'user.create_staff',
               'user.create_admin', 'registration.verify', 'settings.manage'
             )
          ) = 6
      AND EXISTS (
            SELECT 1
              FROM tbl_role_permissions rp
              JOIN mst_roles r ON r.id = rp.role_id
              JOIN mst_permissions p ON p.id = rp.permission_id
             WHERE r.code = 'SUPER_ADMIN' AND p.code = 'user.create_admin'
          )
      AND EXISTS (
            SELECT 1
              FROM tbl_role_permissions rp
              JOIN mst_roles r ON r.id = rp.role_id
              JOIN mst_permissions p ON p.id = rp.permission_id
             WHERE r.code = 'SYSTEM_ADMIN' AND p.code = 'user.create_staff'
          )
      AND EXISTS (
            SELECT 1
              FROM tbl_role_permissions rp
              JOIN mst_roles r ON r.id = rp.role_id
              JOIN mst_permissions p ON p.id = rp.permission_id
             WHERE r.code = 'MEDICAL_OFFICER' AND p.code = 'registration.verify'
          )
      AND EXISTS (
            SELECT 1
              FROM tbl_role_permissions rp
              JOIN mst_roles r ON r.id = rp.role_id
              JOIN mst_permissions p ON p.id = rp.permission_id
             WHERE r.code = 'MEDICAL_OFFICER' AND p.code = 'patient.register'
          )
      AND EXISTS (
            SELECT 1
              FROM pg_trigger t
              JOIN pg_class c ON c.oid = t.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN pg_proc p ON p.oid = t.tgfoid
             WHERE n.nspname = 'public'
               AND c.relname = 'tbl_user_registration_requests'
               AND t.tgname = 'trg_reg_reviewer_role'
               AND NOT t.tgisinternal
               AND (
                    p.proname = 'fn_validate_registration_reviewer'
                 OR (
                      p.proname = 'fn_require_role'
                      AND pg_get_triggerdef(t.oid) ILIKE '%SYSTEM_ADMIN%SUPER_ADMIN%'
                    )
               )
          )
      AND to_regprocedure('public.fn_user_has_patient_access(uuid,uuid)') IS NOT NULL
      AND EXISTS (
            SELECT 1 FROM pg_proc
             WHERE proname = 'fn_user_has_patient_access'
               AND prosrc ILIKE '%SUPER_ADMIN%'
          )
      AND EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'tbl_user_sessions'
               AND column_name = 'previous_refresh_token_hash'
          )
      AND EXISTS (
            SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public'
               AND tablename = 'tbl_user_sessions'
               AND indexname = 'idx_sessions_previous_hash'
          )
      AND EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'tbl_users'
               AND column_name = 'mfa_last_used_step'
          )
      AND EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'tbl_users'
               AND column_name = 'mfa_enrolled_at'
          )
      AND to_regclass('public.tbl_password_reset_tokens') IS NOT NULL
      AND (
            SELECT count(*) FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'tbl_password_reset_tokens'
               AND column_name IN (
                 'id', 'user_id', 'token_hash', 'requested_ip',
                 'created_at', 'expires_at', 'used_at'
               )
          ) = 7
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_reset_token_lifetime')
      AND EXISTS (
            SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public'
               AND tablename = 'tbl_password_reset_tokens'
               AND indexname = 'idx_reset_tokens_user_open'
          )
      AS ok`,

  // Strict catalog match for objects also shipped in ALL_IN_ONE (1).sql.
  // Do not baseline unless every important object is present.
  "022_specialist_consultation_decisions.sql": `
    SELECT
      to_regclass('public.tbl_specialist_consultation_decisions') IS NOT NULL
      AND to_regprocedure('public.fn_protect_signed_specialist_decision()') IS NOT NULL
      AND EXISTS (
            SELECT 1 FROM pg_proc
             WHERE proname = 'fn_protect_signed_specialist_decision'
               AND prosrc ILIKE '%Signed Specialist consultation decisions are immutable%'
          )
      AND (
            SELECT count(*) FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'tbl_specialist_consultation_decisions'
               AND column_name IN (
                 'id','referral_id','patient_id','specialist_id','decision_type','status',
                 'clinical_reason','clinical_recommendation','instructions','additional_notes',
                 'priority_id','follow_up_date','hospital_id','investigation_type_id',
                 'consultation_id','investigation_order_id','signed_by','signed_at',
                 'created_at','updated_at'
               )
          ) = 20
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_specialist_decision_signoff')
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_specialist_decision_self_signoff')
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_specialist_decision_video_consultation')
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_specialist_decision_investigation_type')
      AND EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.tbl_specialist_consultation_decisions'::regclass
               AND contype = 'u'
               AND pg_get_constraintdef(oid) ILIKE '%(referral_id)%'
          )
      AND EXISTS (
            SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public'
               AND tablename = 'tbl_specialist_consultation_decisions'
               AND indexname = 'idx_specialist_decisions_patient'
          )
      AND EXISTS (
            SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public'
               AND tablename = 'tbl_specialist_consultation_decisions'
               AND indexname = 'idx_specialist_decisions_navigator'
          )
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_specialist_decision_specialist_role' AND NOT tgisinternal)
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_specialist_decision_signer_role' AND NOT tgisinternal)
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_specialist_decision_updated_at' AND NOT tgisinternal)
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_specialist_decision_signed_immutable' AND NOT tgisinternal)
      AS ok`,
};

/**
 * True when the DB already has the newer two-stage registration reviewer
 * workflow. Re-applying 002_security_core.sql would DROP/CREATE
 * trg_reg_reviewer_role with the older fn_require_role path and must be blocked.
 */
async function hasNewerRegistrationReviewerWorkflow(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public'
         AND c.relname = 'tbl_user_registration_requests'
         AND t.tgname = 'trg_reg_reviewer_role'
         AND NOT t.tgisinternal
         AND p.proname = 'fn_validate_registration_reviewer'
    ) AS ok`);
  return Boolean(result.rows[0]?.ok);
}

async function assertSafeToApplyMigration(client, file) {
  if (file !== "002_security_core.sql") return;

  if (await hasNewerRegistrationReviewerWorkflow(client)) {
    throw new Error(
      "002_security_core.sql baseline verification failed, but this database already has " +
        "trg_reg_reviewer_role → fn_validate_registration_reviewer (two-stage Medical Officer / " +
        "District Admin registration workflow). Re-applying 002 would replace that newer " +
        "workflow with the older fn_require_role('reviewed_by', 'SYSTEM_ADMIN,SUPER_ADMIN') " +
        "path and is blocked. Ensure every 002 security-core object is present so baseline " +
        "can succeed (SUPER_ADMIN role, 002 permissions and role grants, session rotation " +
        "column, MFA columns, password-reset table), then re-run migrate. " +
        "Do not insert schema_migrations rows manually."
    );
  }
}

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

async function assertTrustedDatabaseFor003(client, context) {
  const databaseResult = await client.query("SELECT current_database() AS name");
  const databaseName = databaseResult.rows[0]?.name;

  if (databaseName === TEST_DATABASE) {
    throw new Error(
      "003 approval is not allowed on aarogya_test; refusing to continue."
    );
  }

  const trustedDatabaseName = resolveTrustedProductionDatabaseName(
    context.env || process.env
  );
  if (databaseName !== trustedDatabaseName) {
    throw new Error(
      `003 checksum exception is not allowed for database "${databaseName || "unknown"}".`
    );
  }

  return { databaseName, trustedDatabaseName };
}

async function verifyBootstrapPromotionOutcome(client, bootstrapUsername) {
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
      "003 post-condition failed: the configured SUPER_ADMIN and matching ROLE_CHANGED audit record were not both confirmed; not marking applied."
    );
  }
}

async function rewriteKnownBootstrapPromotionChecksum(client) {
  const updated = await client.query(
    `UPDATE schema_migrations
        SET checksum = $1
      WHERE filename = $2
        AND checksum = $3`,
    [
      CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM,
      BOOTSTRAP_PROMOTION_MIGRATION,
      ORIGINAL_BOOTSTRAP_PROMOTION_CHECKSUM,
    ]
  );

  if (updated.rowCount !== 1) {
    throw new Error(
      "003 known checksum rewrite failed; refusing to continue."
    );
  }
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

    await rewriteKnownBootstrapPromotionChecksum(client);
    log(
      "  skipped   003_promote_bootstrap_admin.js (aarogya_test is empty and the known original checksum is recorded; migration was not executed; checksum updated to current)"
    );
    return;
  }

  const trustedDatabaseName = resolveTrustedProductionDatabaseName(
    context.env || process.env
  );
  if (databaseName !== trustedDatabaseName) {
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

  await verifyBootstrapPromotionOutcome(client, bootstrapUsername);
  await rewriteKnownBootstrapPromotionChecksum(client);

  log(
    `  verified  003_promote_bootstrap_admin.js (${trustedDatabaseName} SUPER_ADMIN and matching ROLE_CHANGED audit record confirmed; checksum updated to current; migration was not executed)`
  );
}

/**
 * Bootstrap/startup helper: if the only critical checksum mismatch is the known
 * 003 ORIGINAL→CURRENT exception, verify evidence and rewrite the recorded hash.
 * Does not apply pending migrations.
 */
async function resolveKnownBootstrapPromotionChecksum(
  client,
  context = {},
  log = console.log
) {
  const status = await getStatus(client);
  const criticalModified = status.filter(
    (migration) =>
      migration.state === "modified" &&
      !isAfterBootstrapPromotion(migration.file)
  );

  if (criticalModified.length === 0) {
    return { resolved: false };
  }

  if (
    criticalModified.length !== 1 ||
    criticalModified[0].file !== BOOTSTRAP_PROMOTION_MIGRATION
  ) {
    throw new Error(
      `Database has modified migration checksum(s): ` +
        `${criticalModified.map((migration) => migration.file).join(", ")}. ` +
        "Resolve checksum issues before bootstrap."
    );
  }

  await skipKnownBootstrapPromotion(
    client,
    criticalModified[0],
    context,
    log
  );
  return { resolved: true };
}

/**
 * Shared pre-checks and execution for 003 (promote + verify). Caller must gate
 * the database identity. History INSERT stays in the migrator transaction.
 */
async function executeBootstrapPromotionBody(client, migration, context, log, modeLabel) {
  if (migration.checksum !== CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM) {
    throw new Error(
      "003 checksum mismatch is not the reviewed local source; refusing to continue."
    );
  }

  const bootstrapUsername = context.bootstrapUsername;
  if (typeof bootstrapUsername !== "string" || !bootstrapUsername.trim()) {
    throw new Error(
      "003 approved execution requires the configured bootstrap username."
    );
  }

  const roleReady = await client.query(
    `SELECT EXISTS (
        SELECT 1 FROM mst_roles WHERE code = 'SUPER_ADMIN'
      ) AS ok`
  );
  if (roleReady.rows[0]?.ok !== true) {
    throw new Error(
      "003 requires migration 002 first: SUPER_ADMIN role is missing."
    );
  }

  const account = await client.query(
    `SELECT u.id, r.code AS role_code
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
      WHERE lower(u.username) = lower($1)
        AND u.deleted_at IS NULL`,
    [bootstrapUsername.trim()]
  );

  if (!account.rows.length) {
    throw new Error(
      "003 refused: configured bootstrap account does not exist; not marking applied."
    );
  }

  const roleCode = account.rows[0].role_code;
  if (roleCode !== "SYSTEM_ADMIN" && roleCode !== "SUPER_ADMIN") {
    throw new Error(
      `003 refused: bootstrap account has role ${roleCode}; refusing to change it.`
    );
  }

  if (roleCode === "SYSTEM_ADMIN") {
    const supers = await client.query(
      `SELECT count(*)::int AS n
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id
        WHERE r.code = 'SUPER_ADMIN'
          AND u.deleted_at IS NULL`
    );
    if (supers.rows[0].n > 0) {
      throw new Error(
        "003 refused: another SUPER_ADMIN already exists; bootstrap left unchanged; not marking applied."
      );
    }
  }

  const mod = require(path.join(MIGRATIONS_DIR, migration.file));
  await mod.up(client, { ...context, log });
  await verifyBootstrapPromotionOutcome(client, bootstrapUsername);

  log(`  applied   ${migration.file} (${modeLabel})`);
}

/**
 * Explicitly approved execution of 003. Dual approval is required by the caller.
 * Never records history unless SUPER_ADMIN + matching audit evidence exist afterward.
 */
async function executeApprovedBootstrapPromotion(client, migration, context, log) {
  await assertTrustedDatabaseFor003(client, context);
  await executeBootstrapPromotionBody(
    client,
    migration,
    context,
    log,
    "approved bootstrap promotion verified"
  );
}

/**
 * Jest-only harness: execute and verify 003 on aarogya_test.
 * Does not use dual-approve or trusted production names.
 * assertTrustedDatabaseFor003 is intentionally not called (and still refuses aarogya_test).
 */
async function assertIsolatedTestDatabaseFor003(client, env = process.env) {
  if (String(env.NODE_ENV || "").trim() !== "test") {
    throw new Error("Isolated-test 003 harness requires NODE_ENV=test.");
  }
  if (env.TEST_DB_ALLOW_DESTRUCTIVE_RESET !== "true") {
    throw new Error(
      "Isolated-test 003 harness requires TEST_DB_ALLOW_DESTRUCTIVE_RESET=true."
    );
  }

  const databaseResult = await client.query("SELECT current_database() AS name");
  const databaseName = databaseResult.rows[0]?.name;
  if (databaseName !== TEST_DATABASE) {
    throw new Error(
      `Isolated-test 003 harness is not allowed for database "${databaseName || "unknown"}"; ` +
        `only ${TEST_DATABASE} is permitted.`
    );
  }
  return databaseName;
}

async function executeIsolatedTestBootstrapPromotion(client, migration, context, log) {
  const env = context.env || process.env;
  await assertIsolatedTestDatabaseFor003(client, env);

  const bootstrapUsername = String(context.bootstrapUsername || "").trim();
  if (
    bootstrapUsername.toLowerCase() !== INTEGRATION_TEST_BOOTSTRAP_USERNAME.toLowerCase()
  ) {
    throw new Error(
      `Isolated-test 003 harness requires bootstrap username "${INTEGRATION_TEST_BOOTSTRAP_USERNAME}".`
    );
  }

  await executeBootstrapPromotionBody(
    client,
    migration,
    context,
    log,
    "isolated-test harness bootstrap promotion verified; not dual-approve"
  );
}

async function runMigrations(
  client,
  {
    apply = false,
    defer003 = false,
    approve003PromoteBootstrap = false,
    only003PromoteBootstrap = false,
    apply003ForIsolatedTestDatabase = false,
    context = {},
    log = console.log,
  } = {}
) {
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

    const allPending = status
      .filter((m) => m.state === "pending")
      .sort((a, b) => migrationSortKey(a.file).localeCompare(migrationSortKey(b.file)));
    const pending003 = allPending.find(
      (m) => m.file === BOOTSTRAP_PROMOTION_MIGRATION
    );
    const env = context.env || process.env;
    const mergedContext = {
      ...context,
      approve003PromoteBootstrap,
      only003PromoteBootstrap:
        only003PromoteBootstrap === true || context.only003PromoteBootstrap === true,
    };
    const dualApproved = is003DualApproved(mergedContext, env);
    const only003Approved = is003OnlyPromoteApproved(mergedContext, env);
    const only003Requested = mergedContext.only003PromoteBootstrap === true;

    let pending = allPending;
    const isolatedTest003 = apply003ForIsolatedTestDatabase === true;

    if (apply && only003Requested) {
      if (defer003) {
        throw new Error(
          "Use either --defer-003 or --only-003-promote-bootstrap, not both."
        );
      }
      if (isolatedTest003) {
        throw new Error(
          "Isolated-test 003 harness cannot be combined with --only-003-promote-bootstrap."
        );
      }
      if (!dualApproved) {
        throw new Error(
          "only-003 promote requires --only-003-promote-bootstrap, " +
            "--approve-003-promote-bootstrap, and MIGRATE_APPROVE_003=PROMOTE_BOOTSTRAP."
        );
      }

      assertExplicitTrustedDatabaseForOnly003(env);
      // Trusted identity check before any promotion work (also re-checked inside 003).
      await assertTrustedDatabaseFor003(client, { ...mergedContext, env });

      const pendingBefore003 = allPending.filter((m) =>
        isBeforeBootstrapPromotion(m.file)
      );
      if (pendingBefore003.length > 0) {
      throw new Error(
          "only-003 promote requires migrations before 003 to be applied first: " +
            pendingBefore003.map((m) => m.file).join(", ")
        );
      }

      if (!pending003) {
        log(
          "  skipped   003_promote_bootstrap_admin.js (already applied; only-003 mode makes no changes)"
        );
        const alreadyResults = [
          {
            file: BOOTSTRAP_PROMOTION_MIGRATION,
            action: "already-applied",
          },
        ];
        for (const migration of allPending) {
          if (isAfterBootstrapPromotion(migration.file)) {
            alreadyResults.push({
              file: migration.file,
              action: "held-back-only-003",
            });
          }
        }
        return alreadyResults;
      }

      pending = [pending003];
      log(
        "  approval  003_promote_bootstrap_admin.js only-003 dual approval accepted " +
          "(CLI --only-003-promote-bootstrap + --approve-003-promote-bootstrap + MIGRATE_APPROVE_003); " +
          "004+ will not run"
      );
    } else if (pending003 && apply) {
      if (isolatedTest003 && (dualApproved || defer003)) {
        throw new Error(
          "Isolated-test 003 harness cannot be combined with dual approval or --defer-003."
        );
      }
      if (dualApproved) {
        // Keep full ordered pending list: 001/002, then 003, then 004+.
        log(
          "  approval  003_promote_bootstrap_admin.js dual approval accepted (CLI + MIGRATE_APPROVE_003)"
        );
      } else if (isolatedTest003) {
        // Jest aarogya_test only: execute 003 (not skip) then 004+.
        log(
          "  harness   003_promote_bootstrap_admin.js isolated-test path (execute + verify; not dual-approve)"
        );
      } else if (defer003) {
        // Phase 1: only migrations strictly before 003 (001, 002). Never 003 or 004+.
        pending = allPending.filter((m) => isBeforeBootstrapPromotion(m.file));
        log(
          "  deferred  003_promote_bootstrap_admin.js (phase 1 stops before 003; not marked applied)"
        );
      } else {
        throw new Error(
          "003_promote_bootstrap_admin.js is not recorded as applied; later migrations will not run. " +
            "Use --defer-003 to apply/baseline only 001–002, dual approval " +
            "(--approve-003-promote-bootstrap and MIGRATE_APPROVE_003=PROMOTE_BOOTSTRAP) to execute 003 then 004+, " +
            "or --only-003-promote-bootstrap with the same dual approval to execute 003 alone."
        );
      }
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
        if (check.rows[0]?.ok) {
          await client.query(
            "INSERT INTO schema_migrations (filename, checksum, applied_by) VALUES ($1, $2, 'baseline')",
            [migration.file, migration.checksum]
          );
          log(`  baseline  ${migration.file} (already present in schema)`);
          results.push({ file: migration.file, action: "baseline" });
          continue;
        }

        // Baseline incomplete: refuse unsafe re-apply of known incompatible migrations.
        await assertSafeToApplyMigration(client, migration.file);
      }

      const started = Date.now();
      await client.query("BEGIN");

      try {
        if (migration.file === BOOTSTRAP_PROMOTION_MIGRATION) {
          if (isolatedTest003) {
            await executeIsolatedTestBootstrapPromotion(
              client,
              migration,
              mergedContext,
              log
            );
          } else {
            await executeApprovedBootstrapPromotion(
              client,
              migration,
              mergedContext,
              log
            );
          }
        } else if (migration.file.endsWith(".sql")) {
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

      if (migration.file !== BOOTSTRAP_PROMOTION_MIGRATION) {
      log(`  applied   ${migration.file} (${Date.now() - started} ms)`);
      }
      results.push({
        file: migration.file,
        action:
          migration.file === BOOTSTRAP_PROMOTION_MIGRATION
            ? isolatedTest003
              ? "applied-isolated-test-003"
              : "applied-approved-003"
            : "applied",
      });
    }

    // Phase 1 reporting: 003 stays pending; anything after 003 is held back.
    if (apply && defer003 && pending003 && !dualApproved && !isolatedTest003) {
      results.push({ file: BOOTSTRAP_PROMOTION_MIGRATION, action: "deferred" });
      for (const migration of allPending) {
        if (isAfterBootstrapPromotion(migration.file)) {
          results.push({ file: migration.file, action: "held-back-until-003" });
        }
      }
    }

    // only-003: explicitly record that later pending files were not executed.
    if (apply && only003Approved) {
      for (const migration of allPending) {
        if (isAfterBootstrapPromotion(migration.file)) {
          results.push({ file: migration.file, action: "held-back-only-003" });
        }
      }
    }

    return results;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
  }
}

module.exports = {
  runMigrations,
  getStatus,
  listMigrationFiles,
  resolveTrustedProductionDatabaseName,
  is003DualApproved,
  is003OnlyPromoteApproved,
  summarizeMigrationStatusForBootstrap,
  resolveKnownBootstrapPromotionChecksum,
  BASELINE_CHECKS,
  hasNewerRegistrationReviewerWorkflow,
  assertSafeToApplyMigration,
  isBeforeBootstrapPromotion,
  isAfterBootstrapPromotion,
  assertIsolatedTestDatabaseFor003,
  assertExplicitTrustedDatabaseForOnly003,
  DEFAULT_PRODUCTION_DATABASE,
  BOOTSTRAP_PROMOTION_MIGRATION,
  ORIGINAL_BOOTSTRAP_PROMOTION_CHECKSUM,
  CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM,
  APPROVE_003_ENV_VALUE,
  TEST_DATABASE,
  INTEGRATION_TEST_BOOTSTRAP_USERNAME,
};
