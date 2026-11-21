jest.mock("../../utils/permissions", () => ({
  clearPermissionCache: jest.fn(),
}));

const fs = require("fs");
const path = require("path");
const {
  runMigrations,
  getStatus,
  listMigrationFiles,
  resolveTrustedProductionDatabaseName,
  is003DualApproved,
  is003OnlyPromoteApproved,
  isAfterBootstrapPromotion,
  assertExplicitTrustedDatabaseForOnly003,
  summarizeMigrationStatusForBootstrap,
  assertIsolatedTestDatabaseFor003,
  DEFAULT_PRODUCTION_DATABASE,
  BOOTSTRAP_PROMOTION_MIGRATION,
  CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM,
  APPROVE_003_ENV_VALUE,
  INTEGRATION_TEST_BOOTSTRAP_USERNAME,
  TEST_DATABASE,
} = require("../../utils/migrator");
const {
  migrationChecksum,
  migrationFileChecksum,
} = require("../../utils/migrationChecksum");

const RENDER_TRUSTED_DATABASE = "sudo_suspend_database_aarogya_db";

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

function sha256File(file) {
  return migrationFileChecksum(path.join(MIGRATIONS_DIR, file));
}

function appliedRows(overrides = {}) {
  return listMigrationFiles().map((filename) => ({
    filename,
    checksum: overrides[filename] || sha256File(filename),
    applied_by: "test",
    applied_at: new Date().toISOString(),
  }));
}

function createMockClient(options = {}) {
  const {
    databaseName = "Aarogya",
    rowsByFilename = null,
    verificationRows = [],
    baselineOkByFile = {},
    newerRegistrationWorkflow = false,
    superAdminRoleExists = true,
    bootstrapAccount = null,
    otherSuperAdminCount = 0,
    promoteToSuperAdmin = true,
  } = options;

  const applied = rowsByFilename || appliedRows();
  const queries = [];
  let bootstrapRole = bootstrapAccount ? bootstrapAccount.role_code : null;

  const client = {
    queries,
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });

      if (/pg_advisory_lock/i.test(text) || /pg_advisory_unlock/i.test(text)) {
        return { rows: [] };
      }
      if (/to_regclass\('public\.schema_migrations'\)/i.test(text)) {
        return { rows: [{ ok: true }] };
      }
      if (/FROM schema_migrations\b/i.test(text) && /filename,\s*checksum/i.test(text)) {
        return { rows: applied };
      }
      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(text)) {
        return { rows: [] };
      }
      if (/^BEGIN/i.test(text.trim()) || /^COMMIT/i.test(text.trim()) || /^ROLLBACK/i.test(text.trim())) {
        return { rows: [] };
      }
      if (/SELECT current_database\(\)/i.test(text)) {
        return { rows: [{ name: databaseName }] };
      }
      if (
        /SELECT checksum FROM schema_migrations WHERE filename/i.test(text) &&
        params[0] === BOOTSTRAP_PROMOTION_MIGRATION
      ) {
        const row = applied.find((r) => r.filename === BOOTSTRAP_PROMOTION_MIGRATION);
        return { rows: row ? [{ checksum: row.checksum }] : [] };
      }
      if (/EXISTS \(SELECT 1 FROM tbl_users LIMIT 1\)/i.test(text)) {
        return { rows: [{ has_users: false }] };
      }
      if (/ck_reg_reviewed/i.test(text) && /ck_facility_parent/i.test(text)) {
        return { rows: [{ ok: baselineOkByFile["001_schema_fixes.sql"] === true }] };
      }
      if (
        /previous_refresh_token_hash/i.test(text) &&
        /tbl_password_reset_tokens/i.test(text) &&
        /fn_validate_registration_reviewer/i.test(text) &&
        /AS ok/i.test(text)
      ) {
        return { rows: [{ ok: baselineOkByFile["002_security_core.sql"] === true }] };
      }
      if (
        /fn_validate_registration_reviewer/i.test(text) &&
        /trg_reg_reviewer_role/i.test(text) &&
        !/previous_refresh_token_hash/i.test(text)
      ) {
        return { rows: [{ ok: newerRegistrationWorkflow === true }] };
      }
      if (/tbl_specialist_consultation_decisions/i.test(text) && /AS ok/i.test(text)) {
        return {
          rows: [{ ok: baselineOkByFile["022_specialist_consultation_decisions.sql"] === true }],
        };
      }
      if (/FROM mst_roles WHERE code = 'SUPER_ADMIN'/i.test(text) && /EXISTS/i.test(text)) {
        return { rows: [{ ok: superAdminRoleExists }] };
      }
      if (
        /FROM tbl_users u/i.test(text) &&
        /JOIN mst_roles r/i.test(text) &&
        /lower\(u\.username\)/i.test(text) &&
        !/ROLE_CHANGED/i.test(text) &&
        !/count\(\)/i.test(text)
      ) {
        if (!bootstrapAccount) return { rows: [] };
        return {
          rows: [{ id: bootstrapAccount.id || "user-1", role_code: bootstrapRole }],
        };
      }
      if (/count\(\*\)::int AS n/i.test(text) && /SUPER_ADMIN/i.test(text)) {
        return { rows: [{ n: otherSuperAdminCount }] };
      }
      if (/r\.code = 'SUPER_ADMIN'/i.test(text) && /ROLE_CHANGED/i.test(text)) {
        if (promoteToSuperAdmin && bootstrapAccount) {
          bootstrapRole = "SUPER_ADMIN";
        }
        if (verificationRows === "dynamic") {
          if (bootstrapRole === "SUPER_ADMIN" && promoteToSuperAdmin) {
            return { rows: [{ id: bootstrapAccount.id || "user-1" }] };
          }
          return { rows: [] };
        }
        return { rows: verificationRows };
      }
      if (/INSERT INTO schema_migrations/i.test(text)) {
        return { rows: [] };
      }
      if (
        /UPDATE schema_migrations/i.test(text) &&
        /SET checksum/i.test(text) &&
        params[1] === BOOTSTRAP_PROMOTION_MIGRATION
      ) {
        const row = applied.find((r) => r.filename === BOOTSTRAP_PROMOTION_MIGRATION);
        if (!row || row.checksum !== params[2]) {
          return { rows: [], rowCount: 0 };
        }
        row.checksum = params[0];
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE tbl_users/i.test(text) && /SUPER_ADMIN/i.test(text)) {
        bootstrapRole = "SUPER_ADMIN";
        return { rows: [] };
      }
      if (/UPDATE tbl_user_sessions/i.test(text) || /INSERT INTO tbl_audit_logs/i.test(text)) {
        return { rows: [] };
      }

      throw new Error(`Unexpected query in migrator test: ${text.slice(0, 160)}`);
    },
  };

  return client;
}

describe("resolveTrustedProductionDatabaseName", () => {
  const previous = process.env.MIGRATION_TRUSTED_DATABASE_NAME;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.MIGRATION_TRUSTED_DATABASE_NAME;
    } else {
      process.env.MIGRATION_TRUSTED_DATABASE_NAME = previous;
    }
  });

  test("defaults to Aarogya when unset", () => {
    delete process.env.MIGRATION_TRUSTED_DATABASE_NAME;
    expect(resolveTrustedProductionDatabaseName({})).toBe(DEFAULT_PRODUCTION_DATABASE);
  });

  test("uses explicit MIGRATION_TRUSTED_DATABASE_NAME for Render-style names", () => {
    expect(
      resolveTrustedProductionDatabaseName({
        MIGRATION_TRUSTED_DATABASE_NAME: "aarogya_drishti_abc123",
      })
    ).toBe("aarogya_drishti_abc123");
  });

  test("refuses to trust the test database name", () => {
    expect(() =>
      resolveTrustedProductionDatabaseName({
        MIGRATION_TRUSTED_DATABASE_NAME: "aarogya_test",
      })
    ).toThrow(/must not target the test database/);
  });
});

describe("getStatus migration checksums", () => {
  test("accepts a Git-style LF checksum for a migration read with Windows line endings", async () => {
    const file = "001_schema_fixes.sql";
    const lfContent = fs
      .readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
      .replace(/\r\n?/g, "\n");
    const client = createMockClient({
      rowsByFilename: appliedRows({
        [file]: migrationChecksum(lfContent),
      }),
    });

    const status = await getStatus(client);

    expect(status.find((migration) => migration.file === file).state).toBe("applied");
  });

  test("accepts the existing legacy checksums for migrations 001 through 003", async () => {
    const legacyChecksums = {
      "001_schema_fixes.sql":
        "14c063647e00b4f88bf03fe6b22bc4248eb97c071496964dfcf286e7e6c91b8b",
      "002_security_core.sql":
        "5b2e1520fa360de0a61fef72ee7bd9f24857329129c5bd3c5e47d2f26d0501cd",
      [BOOTSTRAP_PROMOTION_MIGRATION]:
        "188deb30eb45efa53f679932d74c7f9af8466cdfc4c9e504bbecb0d9574bf389",
    };
    const client = createMockClient({ rowsByFilename: appliedRows(legacyChecksums) });

    const status = await getStatus(client);

    for (const file of Object.keys(legacyChecksums)) {
      expect(status.find((migration) => migration.file === file).state).toBe("applied");
    }
  });

  test("reports both stored and expected checksums for real content mismatches", async () => {
    const file = "001_schema_fixes.sql";
    const storedChecksum = "0".repeat(64);
    const client = createMockClient({
      rowsByFilename: appliedRows({ [file]: storedChecksum }),
    });

    const status = await getStatus(client);
    const migration = status.find((item) => item.file === file);

    expect(migration).toMatchObject({
      state: "modified",
      storedChecksum,
      checksum: sha256File(file),
    });
  });
});

describe("is003DualApproved", () => {
  test("requires both CLI flag and exact env value", () => {
    expect(is003DualApproved({ approve003PromoteBootstrap: true }, {})).toBe(false);
    expect(
      is003DualApproved({}, { MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE })
    ).toBe(false);
    expect(
      is003DualApproved(
        { approve003PromoteBootstrap: true },
        { MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE }
      )
    ).toBe(true);
    expect(
      is003DualApproved(
        { approve003PromoteBootstrap: true },
        { MIGRATE_APPROVE_003: "yes" }
      )
    ).toBe(false);
  });
});

describe("runMigrations safeguards", () => {
  const previousApprove = process.env.MIGRATE_APPROVE_003;

  afterEach(() => {
    if (previousApprove === undefined) {
      delete process.env.MIGRATE_APPROVE_003;
    } else {
      process.env.MIGRATE_APPROVE_003 = previousApprove;
    }
  });

  test("dry-run does not create the tracking table or apply SQL", async () => {
    const files = listMigrationFiles();
    const pendingFile = files[files.length - 1];
    const rows = appliedRows();
    const withoutPending = rows.filter((r) => r.filename !== pendingFile);
    const client = createMockClient({ rowsByFilename: withoutPending });

    const results = await runMigrations(client, {
      apply: false,
      log: () => {},
    });

    expect(results).toEqual([{ file: pendingFile, action: "would-apply" }]);
    expect(client.queries.some((q) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(q.sql))).toBe(
      false
    );
    expect(client.queries.some((q) => /^BEGIN/i.test(q.sql.trim()))).toBe(false);
    expect(client.queries.some((q) => /INSERT INTO schema_migrations/i.test(q.sql))).toBe(false);
  });

  test("rejects a modified applied migration checksum", async () => {
    const client = createMockClient({
      rowsByFilename: appliedRows({
        "001_schema_fixes.sql": "0".repeat(64),
      }),
    });

    await expect(
      runMigrations(client, { apply: true, log: () => {} })
    ).rejects.toThrow(/Applied migration file modified: 001_schema_fixes\.sql/);
  });

  test("baselines 002 when security-core catalog and newer registration workflow match", async () => {
    const rows = appliedRows().filter((r) => r.filename !== "002_security_core.sql");
    const client = createMockClient({
      rowsByFilename: rows,
      baselineOkByFile: {
        "001_schema_fixes.sql": true,
        "002_security_core.sql": true,
      },
    });

    const results = await runMigrations(client, {
      apply: true,
      defer003: true,
      log: () => {},
    });

    expect(results).toContainEqual({
      file: "002_security_core.sql",
      action: "baseline",
    });
    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          /'baseline'/i.test(q.sql) &&
          q.params &&
          q.params[0] === "002_security_core.sql"
      )
    ).toBe(true);
    expect(
      client.queries.some(
        (q) =>
          /DROP TRIGGER IF EXISTS trg_reg_reviewer_role/i.test(q.sql) ||
          (/fn_require_role\('reviewed_by'/i.test(q.sql) && /002_security/i.test(q.sql))
      )
    ).toBe(false);
  });

  test("blocks re-applying 002 when baseline fails but newer registration workflow exists", async () => {
    const rows = appliedRows().filter(
      (r) => r.filename !== "001_schema_fixes.sql" && r.filename !== "002_security_core.sql"
    );
    const client = createMockClient({
      rowsByFilename: rows,
      baselineOkByFile: {
        "001_schema_fixes.sql": true,
        "002_security_core.sql": false,
      },
      newerRegistrationWorkflow: true,
    });

    await expect(
      runMigrations(client, { apply: true, defer003: true, log: () => {} })
    ).rejects.toThrow(/fn_validate_registration_reviewer/);

    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          q.params[0] === "002_security_core.sql"
      )
    ).toBe(false);
    expect(
      client.queries.some((q) => /DROP TRIGGER IF EXISTS trg_reg_reviewer_role/i.test(q.sql))
    ).toBe(false);
  });

  test("still applies 002 on a legacy schema when baseline fails and newer workflow is absent", async () => {
    const rows = appliedRows().filter((r) => r.filename !== "002_security_core.sql");
    const client = createMockClient({
      rowsByFilename: rows,
      baselineOkByFile: {
        "001_schema_fixes.sql": true,
        "002_security_core.sql": false,
      },
      newerRegistrationWorkflow: false,
    });
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      const text = String(sql);
      if (/INSERT INTO mst_roles/i.test(text) && /SUPER_ADMIN/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/tbl_password_reset_tokens/i.test(text) && /CREATE TABLE/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/DROP TRIGGER IF EXISTS trg_reg_reviewer_role/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/fn_user_has_patient_access/i.test(text) && /CREATE OR REPLACE FUNCTION/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/previous_refresh_token_hash/i.test(text) && /ALTER TABLE/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/mfa_last_used_step/i.test(text) && /ALTER TABLE/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/INSERT INTO mst_permissions/i.test(text) || /INSERT INTO tbl_role_permissions/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/CREATE INDEX IF NOT EXISTS idx_sessions_previous_hash/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_open/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      if (/CREATE TRIGGER trg_reg_reviewer_role/i.test(text)) {
        client.queries.push({ sql: text, params });
        return { rows: [] };
      }
      return originalQuery(sql, params);
    };

    const results = await runMigrations(client, {
      apply: true,
      defer003: true,
      log: () => {},
    });

    expect(results).toContainEqual({
      file: "002_security_core.sql",
      action: "applied",
    });
  });

  test("baselines 022 when catalog check matches", async () => {
    const rows = appliedRows().filter(
      (r) => r.filename !== "022_specialist_consultation_decisions.sql"
    );
    const client = createMockClient({
      rowsByFilename: rows,
      baselineOkByFile: {
        "022_specialist_consultation_decisions.sql": true,
      },
    });

    const results = await runMigrations(client, {
      apply: true,
      defer003: true,
      log: () => {},
    });

    expect(results).toContainEqual({
      file: "022_specialist_consultation_decisions.sql",
      action: "baseline",
    });
    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          /'baseline'/i.test(q.sql) &&
          q.params &&
          q.params[0] === "022_specialist_consultation_decisions.sql"
      )
    ).toBe(true);
  });

  test("does not baseline 022 when catalog objects are missing", async () => {
    const rows = appliedRows().filter(
      (r) => r.filename !== "022_specialist_consultation_decisions.sql"
    );
    // Next migration after filtering may try to run SQL for 022; mock will throw on unexpected SQL body.
    // Expect failure when baseline is false and CREATE TABLE is attempted.
    const client = createMockClient({
      rowsByFilename: rows,
      baselineOkByFile: {
        "022_specialist_consultation_decisions.sql": false,
      },
    });

    // Override query to allow CREATE TABLE attempt to fail clearly
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      const text = String(sql);
      if (/CREATE TABLE tbl_specialist_consultation_decisions/i.test(text)) {
        client.queries.push({ sql: text, params });
        throw new Error("relation already exists");
      }
      return originalQuery(sql, params);
    };

    await expect(
      runMigrations(client, { apply: true, defer003: true, log: () => {} })
    ).rejects.toThrow(/022_specialist_consultation_decisions\.sql failed and was rolled back/);
  });

  test("pending 003 without defer or approval blocks apply including 004+", async () => {
    const rows = appliedRows().filter(
      (r) =>
        r.filename !== BOOTSTRAP_PROMOTION_MIGRATION &&
        r.filename !== "004_lgd_locations.sql"
    );
    const client = createMockClient({ rowsByFilename: rows });

    await expect(
      runMigrations(client, { apply: true, log: () => {} })
    ).rejects.toThrow(/later migrations will not run/);

    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          q.params[0] === "004_lgd_locations.sql"
      )
    ).toBe(false);
  });

  test("defer-003 baselines 001–002 when present and never executes 003 or 004", async () => {
    const rows = appliedRows().filter(
      (r) =>
        !r.filename.startsWith("001_") &&
        !r.filename.startsWith("002_") &&
        r.filename !== BOOTSTRAP_PROMOTION_MIGRATION &&
        r.filename !== "004_lgd_locations.sql"
    );
    const logs = [];
    const client = createMockClient({
      rowsByFilename: rows,
      baselineOkByFile: {
        "001_schema_fixes.sql": true,
        "002_security_core.sql": true,
      },
    });
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      const text = String(sql);
      if (
        text.length > 80 &&
        !/schema_migrations|pg_advisory|to_regclass|current_database|ck_reg_reviewed|previous_refresh_token_hash|fn_validate_registration_reviewer|BEGIN|COMMIT|ROLLBACK/i.test(
          text
        )
      ) {
        client.queries.push({ sql: text, params });
        if (/004_lgd|CREATE TABLE tbl_specialist|lgd/i.test(text)) {
          throw new Error("004+ must not run during defer-003");
        }
        return { rows: [] };
      }
      return originalQuery(sql, params);
    };

    const results = await runMigrations(client, {
      apply: true,
      defer003: true,
      log: (message) => logs.push(message),
    });

    expect(results.some((r) => r.file.startsWith("001_") && r.action === "baseline")).toBe(
      true
    );
    expect(results.some((r) => r.file.startsWith("002_") && r.action === "baseline")).toBe(
      true
    );
    expect(results).toContainEqual({
      file: BOOTSTRAP_PROMOTION_MIGRATION,
      action: "deferred",
    });
    expect(results).toContainEqual({
      file: "004_lgd_locations.sql",
      action: "held-back-until-003",
    });
    expect(results.some((r) => r.file === "004_lgd_locations.sql" && r.action === "applied")).toBe(
      false
    );
    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          (q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION ||
            q.params[0] === "004_lgd_locations.sql")
      )
    ).toBe(false);
    expect(logs.some((line) => /stops before 003/.test(line))).toBe(true);
  });

  test("summarizeMigrationStatusForBootstrap allows SYSTEM_ADMIN when 003 is next even if 004+ pending", () => {
    const withLater = summarizeMigrationStatusForBootstrap([
      { file: "001_schema_fixes.sql", state: "applied" },
      { file: "002_security_core.sql", state: "applied" },
      { file: BOOTSTRAP_PROMOTION_MIGRATION, state: "pending" },
      { file: "004_lgd_locations.sql", state: "pending" },
    ]);
    expect(withLater.nextIs003).toBe(true);
    expect(withLater.readyForSystemAdmin).toBe(true);
    expect(withLater.bootstrapAllowed).toBe(true);
    expect(withLater.bootstrapRoleCode).toBe("SYSTEM_ADMIN");
    expect(withLater.blocking).toEqual([]);

    const blocked = summarizeMigrationStatusForBootstrap([
      { file: "001_schema_fixes.sql", state: "applied" },
      { file: "002_security_core.sql", state: "pending" },
      { file: BOOTSTRAP_PROMOTION_MIGRATION, state: "pending" },
      { file: "004_lgd_locations.sql", state: "pending" },
    ]);
    expect(blocked.readyForSystemAdmin).toBe(false);
    expect(blocked.bootstrapAllowed).toBe(false);
    expect(blocked.blocking.map((m) => m.file)).toContain("002_security_core.sql");

    const after003 = summarizeMigrationStatusForBootstrap([
      { file: "001_schema_fixes.sql", state: "applied" },
      { file: "002_security_core.sql", state: "applied" },
      { file: BOOTSTRAP_PROMOTION_MIGRATION, state: "applied" },
      { file: "004_lgd_locations.sql", state: "pending" },
    ]);
    expect(after003.readyForSuperAdmin).toBe(true);
    expect(after003.bootstrapRoleCode).toBe("SUPER_ADMIN");
  });

  test("003 without dual approval cannot execute even if CLI flag alone is set", async () => {
    delete process.env.MIGRATE_APPROVE_003;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({ rowsByFilename: rows });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: { bootstrapUsername: "bootstrap_admin" },
        log: () => {},
      })
    ).rejects.toThrow(/later migrations will not run|dual approval/);
  });

  test("failed approved 003 leaves no history row and does not run 004+", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter(
      (r) =>
        r.filename !== BOOTSTRAP_PROMOTION_MIGRATION &&
        r.filename !== "004_lgd_locations.sql" &&
        r.filename !== "005_case_facts_village_mandal.js"
    );
    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: [],
      promoteToSuperAdmin: true,
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/post-condition failed|rolled back/);

    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          (q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION ||
            q.params[0] === "004_lgd_locations.sql" ||
            q.params[0] === "005_case_facts_village_mandal.js")
      )
    ).toBe(false);
  });

  test("Phase 2 dual-approve runs 003 then 004 then 005 in order after verification", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;

    const pendingPhase2 = new Set([
      BOOTSTRAP_PROMOTION_MIGRATION,
      "004_lgd_locations.sql",
      "005_case_facts_village_mandal.js",
    ]);
    const rows = appliedRows().filter((r) => !pendingPhase2.has(r.filename));

    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: "dynamic",
      promoteToSuperAdmin: true,
    });

    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      try {
        return await originalQuery(sql, params);
      } catch (error) {
        if (!/Unexpected query in migrator test/i.test(error.message)) {
          throw error;
        }
        const text = String(sql);
        // 005 reads the live view definition, then replaces one join.
        if (/pg_get_viewdef/i.test(text)) {
          return {
            rows: [
              {
                def:
                  "SELECT s.id FROM tbl_screenings s " +
                  "JOIN mst_villages v ON true " +
                  "JOIN mst_gram_panchayats gp ON gp.id = v.gram_panchayat_id " +
                  "JOIN mst_mandals m ON m.id = gp.mandal_id",
              },
            ],
          };
        }
        // 004 SQL body and 005 CREATE OR REPLACE VIEW
        return { rows: [] };
      }
    };

    const results = await runMigrations(client, {
      apply: true,
      approve003PromoteBootstrap: true,
      context: {
        bootstrapUsername: "bootstrap_admin",
        approve003PromoteBootstrap: true,
      },
      log: () => {},
    });

    const appliedOrder = results
      .filter((r) =>
        r.action === "applied-approved-003" || r.action === "applied"
      )
      .map((r) => r.file);

    expect(appliedOrder).toEqual([
      BOOTSTRAP_PROMOTION_MIGRATION,
      "004_lgd_locations.sql",
      "005_case_facts_village_mandal.js",
    ]);

    const historyOrder = client.queries
      .filter(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          Array.isArray(q.params) &&
          pendingPhase2.has(q.params[0])
      )
      .map((q) => q.params[0]);

    expect(historyOrder).toEqual([
      BOOTSTRAP_PROMOTION_MIGRATION,
      "004_lgd_locations.sql",
      "005_case_facts_village_mandal.js",
    ]);

    const verifyIdx = client.queries.findIndex(
      (q) => /ROLE_CHANGED/i.test(q.sql) && /SUPER_ADMIN/i.test(q.sql)
    );
    const history003Idx = client.queries.findIndex(
      (q) =>
        /INSERT INTO schema_migrations/i.test(q.sql) &&
        q.params &&
        q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION
    );
    const commit003Idx = client.queries.findIndex(
      (q, index) => index > history003Idx && /^COMMIT/i.test(q.sql.trim())
    );
    const history004Idx = client.queries.findIndex(
      (q) =>
        /INSERT INTO schema_migrations/i.test(q.sql) &&
        q.params &&
        q.params[0] === "004_lgd_locations.sql"
    );

    expect(verifyIdx).toBeGreaterThan(-1);
    expect(history003Idx).toBeGreaterThan(verifyIdx);
    expect(commit003Idx).toBeGreaterThan(history003Idx);
    expect(history004Idx).toBeGreaterThan(commit003Idx);
  });

  test("approved 003 rejects aarogya_test", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      databaseName: "aarogya_test",
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/not allowed on aarogya_test/);
  });

  test("approved 003 rejects untrusted database identity", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      databaseName: "random_db",
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/not allowed for database "random_db"/);
  });

  test("approved 003 refuses missing bootstrap account and does not mark applied", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: null,
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/bootstrap account does not exist; not marking applied/);

    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION
      )
    ).toBe(false);
  });

  test("approved 003 refuses when another SUPER_ADMIN exists", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 1,
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/another SUPER_ADMIN already exists;.*not marking applied/);
  });

  test("approved 003 requires SUPER_ADMIN role from migration 002", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      rowsByFilename: rows,
      superAdminRoleExists: false,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/requires migration 002 first/);
  });

  test("approved 003 promotes, verifies audit, then records history", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: "dynamic",
      promoteToSuperAdmin: true,
    });

    const results = await runMigrations(client, {
      apply: true,
      approve003PromoteBootstrap: true,
      context: {
        bootstrapUsername: "bootstrap_admin",
        approve003PromoteBootstrap: true,
      },
      log: () => {},
    });

    expect(results).toContainEqual({
      file: BOOTSTRAP_PROMOTION_MIGRATION,
      action: "applied-approved-003",
    });
    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION
      )
    ).toBe(true);
    expect(client.queries.some((q) => /^COMMIT/i.test(q.sql.trim()))).toBe(true);
  });

  test("approved 003 rolls back when audit verification fails", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    const rows = appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: [],
      promoteToSuperAdmin: true,
    });

    await expect(
      runMigrations(client, {
        apply: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
        },
        log: () => {},
      })
    ).rejects.toThrow(/post-condition failed|rolled back/);

    expect(client.queries.some((q) => /^ROLLBACK/i.test(q.sql.trim()))).toBe(true);
    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION
      )
    ).toBe(false);
  });

  test("003 checksum mismatches are reported without rewriting migration history", async () => {
    expect(sha256File(BOOTSTRAP_PROMOTION_MIGRATION)).toBe(
      CURRENT_BOOTSTRAP_PROMOTION_CHECKSUM
    );

    const client = createMockClient({
      rowsByFilename: appliedRows({
        [BOOTSTRAP_PROMOTION_MIGRATION]: "a".repeat(64),
      }),
    });

    await expect(
      runMigrations(client, {
        apply: false,
        log: () => {},
      })
    ).rejects.toThrow(/Applied migration file modified: 003_promote_bootstrap_admin\.js/);
    expect(
      client.queries.some((q) => /UPDATE\s+schema_migrations/i.test(q.sql))
    ).toBe(false);
  });

  describe("isolated-test 003 harness", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDestructive = process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET;

    beforeEach(() => {
      process.env.NODE_ENV = "test";
      process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET = "true";
      delete process.env.MIGRATE_APPROVE_003;
    });

    afterEach(() => {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDestructive === undefined) {
        delete process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET;
      } else {
        process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET = previousDestructive;
      }
    });

    function pending003Rows() {
      return appliedRows().filter((r) => r.filename !== BOOTSTRAP_PROMOTION_MIGRATION);
    }

    test("executes and records 003 on aarogya_test without dual-approve", async () => {
      const logs = [];
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
        verificationRows: "dynamic",
        promoteToSuperAdmin: true,
      });

      const results = await runMigrations(client, {
        apply: true,
        apply003ForIsolatedTestDatabase: true,
        context: {
          bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
          env: process.env,
        },
        log: (line) => logs.push(line),
      });

      expect(results.some((r) => r.action === "applied-isolated-test-003")).toBe(true);
      expect(logs.some((line) => /isolated-test harness/i.test(line))).toBe(true);

      const verifyIdx = client.queries.findIndex(
        (q) => /ROLE_CHANGED/i.test(q.sql) && /SUPER_ADMIN/i.test(q.sql)
      );
      const history003Idx = client.queries.findIndex(
        (q) =>
          /INSERT INTO schema_migrations/i.test(q.sql) &&
          q.params &&
          q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION
      );
      const commit003Idx = client.queries.findIndex(
        (q, index) => index > history003Idx && /^COMMIT/i.test(q.sql.trim())
      );
      expect(verifyIdx).toBeGreaterThan(-1);
      expect(history003Idx).toBeGreaterThan(verifyIdx);
      expect(commit003Idx).toBeGreaterThan(history003Idx);
    });

    test("refuses Aarogya", async () => {
      const client = createMockClient({
        databaseName: "Aarogya",
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/only aarogya_test is permitted/);
    });

    test("refuses aarogya_defer003_test", async () => {
      const client = createMockClient({
        databaseName: "aarogya_defer003_test",
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/only aarogya_test is permitted/);
    });

    test("refuses Render-style database names", async () => {
      const client = createMockClient({
        databaseName: "aarogya_drishti_abc123",
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/only aarogya_test is permitted/);
    });

    test("refuses missing bootstrap account and does not mark applied", async () => {
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: null,
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/bootstrap account does not exist; not marking applied/);

      expect(
        client.queries.some(
          (q) =>
            /INSERT INTO schema_migrations/i.test(q.sql) &&
            q.params &&
            q.params[0] === BOOTSTRAP_PROMOTION_MIGRATION
        )
      ).toBe(false);
    });

    test("refuses non-allowlisted bootstrap username", async () => {
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: "production_admin",
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/requires bootstrap username/);
    });

    test("refuses when dual-approve flags are also set", async () => {
      process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          approve003PromoteBootstrap: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            approve003PromoteBootstrap: true,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/cannot be combined with dual approval/);
    });

    test("refuses when combined with defer-003", async () => {
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          defer003: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/cannot be combined with dual approval or --defer-003/);
    });

    test("refuses without NODE_ENV=test", async () => {
      process.env.NODE_ENV = "development";
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/requires NODE_ENV=test/);
    });

    test("refuses without destructive reset opt-in", async () => {
      process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET = "false";
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          apply003ForIsolatedTestDatabase: true,
          context: {
            bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
            env: process.env,
          },
          log: () => {},
        })
      ).rejects.toThrow(/TEST_DB_ALLOW_DESTRUCTIVE_RESET=true/);
    });

    test("plain apply without approval or harness still refuses pending 003", async () => {
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
      });

      await expect(
        runMigrations(client, { apply: true, log: () => {} })
      ).rejects.toThrow(/not recorded as applied/);
    });

    test("assertIsolatedTestDatabaseFor003 rejects non-test databases", async () => {
      const client = createMockClient({ databaseName: "Aarogya" });
      await expect(
        assertIsolatedTestDatabaseFor003(client, process.env)
      ).rejects.toThrow(/only aarogya_test is permitted/);
    });

    test("dual-approve path still refuses aarogya_test", async () => {
      process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
      const client = createMockClient({
        databaseName: TEST_DATABASE,
        rowsByFilename: pending003Rows(),
        bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      });

      await expect(
        runMigrations(client, {
          apply: true,
          approve003PromoteBootstrap: true,
          context: {
            bootstrapUsername: "bootstrap_admin",
            approve003PromoteBootstrap: true,
          },
          log: () => {},
        })
      ).rejects.toThrow(/not allowed on aarogya_test/);
    });
  });
});

describe("only-003 promote bootstrap mode", () => {
  const previousApprove = process.env.MIGRATE_APPROVE_003;
  const previousTrusted = process.env.MIGRATION_TRUSTED_DATABASE_NAME;

  afterEach(() => {
    if (previousApprove === undefined) {
      delete process.env.MIGRATE_APPROVE_003;
    } else {
      process.env.MIGRATE_APPROVE_003 = previousApprove;
    }
    if (previousTrusted === undefined) {
      delete process.env.MIGRATION_TRUSTED_DATABASE_NAME;
    } else {
      process.env.MIGRATION_TRUSTED_DATABASE_NAME = previousTrusted;
    }
    jest.restoreAllMocks();
  });

  function pendingFrom003Rows() {
    return appliedRows().filter(
      (r) =>
        r.filename !== BOOTSTRAP_PROMOTION_MIGRATION &&
        !isAfterBootstrapPromotion(r.filename)
    );
  }

  function only003Context(overrides = {}) {
    return {
      bootstrapUsername: "bootstrap_admin",
      approve003PromoteBootstrap: true,
      only003PromoteBootstrap: true,
      env: {
        MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE,
        MIGRATION_TRUSTED_DATABASE_NAME: RENDER_TRUSTED_DATABASE,
        ...(overrides.env || {}),
      },
      ...overrides,
    };
  }

  test("is003OnlyPromoteApproved requires only-003 flag plus dual approval", () => {
    expect(
      is003OnlyPromoteApproved(
        { approve003PromoteBootstrap: true },
        { MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE }
      )
    ).toBe(false);
    expect(
      is003OnlyPromoteApproved(
        { only003PromoteBootstrap: true, approve003PromoteBootstrap: true },
        { MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE }
      )
    ).toBe(true);
  });

  test("assertExplicitTrustedDatabaseForOnly003 refuses unset and test DB", () => {
    expect(() => assertExplicitTrustedDatabaseForOnly003({})).toThrow(
      /MIGRATION_TRUSTED_DATABASE_NAME/
    );
    expect(() =>
      assertExplicitTrustedDatabaseForOnly003({
        MIGRATION_TRUSTED_DATABASE_NAME: TEST_DATABASE,
      })
    ).toThrow(/must not target the test database/);
  });

  test("only-003 executes 003 alone and never applies 004–043", async () => {
    const rows = pendingFrom003Rows();
    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: "dynamic",
      promoteToSuperAdmin: true,
    });

    const results = await runMigrations(client, {
      apply: true,
      only003PromoteBootstrap: true,
      approve003PromoteBootstrap: true,
      context: only003Context(),
      log: () => {},
    });

    const executed = results.filter(
      (r) =>
        r.action === "applied-approved-003" ||
        r.action === "applied" ||
        r.action === "baseline"
    );
    expect(executed).toEqual([
      { file: BOOTSTRAP_PROMOTION_MIGRATION, action: "applied-approved-003" },
    ]);

    const held = results.filter((r) => r.action === "held-back-only-003");
    expect(held.some((r) => r.file === "004_lgd_locations.sql")).toBe(true);
    expect(held.some((r) => r.file.startsWith("011_"))).toBe(true);
    expect(held.length).toBe(
      listMigrationFiles().filter((f) => isAfterBootstrapPromotion(f)).length
    );

    const historyInserts = client.queries
      .filter((q) => /INSERT INTO schema_migrations/i.test(q.sql))
      .map((q) => q.params && q.params[0]);
    expect(historyInserts).toEqual([BOOTSTRAP_PROMOTION_MIGRATION]);
    expect(
      historyInserts.some(
        (filename) =>
          typeof filename === "string" && isAfterBootstrapPromotion(filename)
      )
    ).toBe(false);
  });

  test("only-003 preserves two-stage registration reviewer function and trigger", async () => {
    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: pendingFrom003Rows(),
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: "dynamic",
      promoteToSuperAdmin: true,
      newerRegistrationWorkflow: true,
    });

    await runMigrations(client, {
      apply: true,
      only003PromoteBootstrap: true,
      approve003PromoteBootstrap: true,
      context: only003Context(),
      log: () => {},
    });

    const sqlAll = client.queries.map((q) => q.sql).join("\n");
    expect(sqlAll).not.toMatch(/DROP\s+TRIGGER\s+.*trg_reg_reviewer/i);
    expect(sqlAll).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]{0,80}fn_validate_registration_reviewer/i
    );
    expect(
      client.queries.some(
        (q) =>
          Array.isArray(q.params) &&
          typeof q.params[0] === "string" &&
          /^011_/.test(q.params[0])
      )
    ).toBe(false);
  });

  test("only-003 fails when approve CLI flag is missing", async () => {
    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: pendingFrom003Rows(),
    });

    await expect(
      runMigrations(client, {
        apply: true,
        only003PromoteBootstrap: true,
        approve003PromoteBootstrap: false,
        context: {
          bootstrapUsername: "bootstrap_admin",
          only003PromoteBootstrap: true,
          env: {
            MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE,
            MIGRATION_TRUSTED_DATABASE_NAME: RENDER_TRUSTED_DATABASE,
          },
        },
        log: () => {},
      })
    ).rejects.toThrow(/only-003 promote requires/);
  });

  test("only-003 fails when MIGRATE_APPROVE_003 is missing", async () => {
    delete process.env.MIGRATE_APPROVE_003;
    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: pendingFrom003Rows(),
    });

    await expect(
      runMigrations(client, {
        apply: true,
        only003PromoteBootstrap: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
          only003PromoteBootstrap: true,
          env: {
            MIGRATION_TRUSTED_DATABASE_NAME: RENDER_TRUSTED_DATABASE,
          },
        },
        log: () => {},
      })
    ).rejects.toThrow(/only-003 promote requires/);
  });

  test("only-003 fails on wrong database name", async () => {
    const client = createMockClient({
      databaseName: "unexpected_db",
      rowsByFilename: pendingFrom003Rows(),
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
    });

    await expect(
      runMigrations(client, {
        apply: true,
        only003PromoteBootstrap: true,
        approve003PromoteBootstrap: true,
        context: only003Context(),
        log: () => {},
      })
    ).rejects.toThrow(/not allowed for database "unexpected_db"/);
  });

  test("only-003 refuses aarogya_test", async () => {
    const client = createMockClient({
      databaseName: TEST_DATABASE,
      rowsByFilename: pendingFrom003Rows(),
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
    });

    await expect(
      runMigrations(client, {
        apply: true,
        only003PromoteBootstrap: true,
        approve003PromoteBootstrap: true,
        context: only003Context({
          env: {
            MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE,
            MIGRATION_TRUSTED_DATABASE_NAME: RENDER_TRUSTED_DATABASE,
          },
        }),
        log: () => {},
      })
    ).rejects.toThrow(/not allowed on aarogya_test/);
  });

  test("only-003 fails when trusted database env is unset", async () => {
    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: pendingFrom003Rows(),
    });

    await expect(
      runMigrations(client, {
        apply: true,
        only003PromoteBootstrap: true,
        approve003PromoteBootstrap: true,
        context: {
          bootstrapUsername: "bootstrap_admin",
          approve003PromoteBootstrap: true,
          only003PromoteBootstrap: true,
          env: { MIGRATE_APPROVE_003: APPROVE_003_ENV_VALUE },
        },
        log: () => {},
      })
    ).rejects.toThrow(/MIGRATION_TRUSTED_DATABASE_NAME/);
  });

  test("only-003 fails on wrong 003 checksum", async () => {
    const originalRead = fs.readFileSync.bind(fs);
    jest.spyOn(fs, "readFileSync").mockImplementation((filePath, encoding) => {
      const normalized = String(filePath).replace(/\\/g, "/");
      if (
        normalized.endsWith(`/${BOOTSTRAP_PROMOTION_MIGRATION}`) &&
        encoding === undefined
      ) {
        return Buffer.from("tampered-003-source-for-checksum-test");
      }
      return originalRead(filePath, encoding);
    });

    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: pendingFrom003Rows(),
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: "dynamic",
      promoteToSuperAdmin: true,
    });

    await expect(
      runMigrations(client, {
        apply: true,
        only003PromoteBootstrap: true,
        approve003PromoteBootstrap: true,
        context: only003Context(),
        log: () => {},
      })
    ).rejects.toThrow(/checksum mismatch is not the reviewed local source/);
  });

  test("only-003 stops safely when 003 is already applied", async () => {
    const rows = appliedRows().filter((r) => !isAfterBootstrapPromotion(r.filename));
    const client = createMockClient({
      databaseName: RENDER_TRUSTED_DATABASE,
      rowsByFilename: rows,
    });

    const results = await runMigrations(client, {
      apply: true,
      only003PromoteBootstrap: true,
      approve003PromoteBootstrap: true,
      context: only003Context(),
      log: () => {},
    });

    expect(results[0]).toEqual({
      file: BOOTSTRAP_PROMOTION_MIGRATION,
      action: "already-applied",
    });
    expect(results.some((r) => r.action === "held-back-only-003")).toBe(true);
    expect(
      client.queries.some((q) => /UPDATE tbl_users/i.test(q.sql) && /SUPER_ADMIN/i.test(q.sql))
    ).toBe(false);
    expect(
      client.queries.some((q) => /INSERT INTO schema_migrations/i.test(q.sql))
    ).toBe(false);
  });

  test("normal dual-approve mode still runs 003 then later migrations (unchanged)", async () => {
    process.env.MIGRATE_APPROVE_003 = APPROVE_003_ENV_VALUE;
    delete process.env.MIGRATION_TRUSTED_DATABASE_NAME;

    const pendingPhase2 = new Set([
      BOOTSTRAP_PROMOTION_MIGRATION,
      "004_lgd_locations.sql",
    ]);
    const rows = appliedRows().filter((r) => !pendingPhase2.has(r.filename));
    const client = createMockClient({
      rowsByFilename: rows,
      bootstrapAccount: { id: "u1", role_code: "SYSTEM_ADMIN" },
      otherSuperAdminCount: 0,
      verificationRows: "dynamic",
      promoteToSuperAdmin: true,
    });

    const originalQuery = client.query.bind(client);
    client.query = async (sql, params = []) => {
      try {
        return await originalQuery(sql, params);
      } catch (error) {
        if (!/Unexpected query in migrator test/i.test(error.message)) {
          throw error;
        }
        return { rows: [] };
      }
    };

    const results = await runMigrations(client, {
      apply: true,
      approve003PromoteBootstrap: true,
      context: {
        bootstrapUsername: "bootstrap_admin",
        approve003PromoteBootstrap: true,
      },
      log: () => {},
    });

    const appliedOrder = results
      .filter(
        (r) => r.action === "applied-approved-003" || r.action === "applied"
      )
      .map((r) => r.file);

    expect(appliedOrder.slice(0, 2)).toEqual([
      BOOTSTRAP_PROMOTION_MIGRATION,
      "004_lgd_locations.sql",
    ]);
    expect(results.some((r) => r.action === "held-back-only-003")).toBe(false);
  });
});
