const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const loadTestEnv = require("./loadTestEnv");
const {
  getTestDatabaseConfig,
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
} = require("../utils/testDbGuard");
const { runMigrations, INTEGRATION_TEST_BOOTSTRAP_USERNAME } = require("../utils/migrator");
const {
  createIntegrationTestBootstrapAdmin,
  assertIntegrationTestEnv,
} = require("./helpers/integrationBootstrap");

const SCHEMA_FILE = path.join(__dirname, "..", "ALL_IN_ONE (1).sql");

/*
 * Operator steps (Jest DB only — never Aarogya / Render / aarogya_defer003_test):
 * 1. Ensure local DB aarogya_test + restricted role; place ALL_IN_ONE (1).sql under backend/.
 * 2. Configure backend/.env.test from .env.test.example (including
 *    TEST_INTEGRATION_BOOTSTRAP_PASSWORD and TEST_DB_ALLOW_DESTRUCTIVE_RESET=true).
 * 3. npx jest --config jest.integration.config.js
 * 4. globalSetup: verify live identity → destructive reset → ALL_IN_ONE →
 *    defer-003 (001–002) → create zz_test_bootstrap_admin → isolated-test 003
 *    (execute+verify+record) → 004…043.
 * Migration rehearsal stays on aarogya_defer003_test via migrate.js dual-approve (no Jest).
 */

// Rebuilds the isolated test database only after explicit opt-in and identity checks.
module.exports = async function globalSetup() {
  loadTestEnv();
  assertIntegrationTestEnv();
  const testDatabase = getTestDatabaseConfig();
  assertDestructiveResetOptIn();

  if (!fs.existsSync(SCHEMA_FILE)) {
    throw new Error(
      `Missing base schema file: ${SCHEMA_FILE}. ` +
        "Place the approved ALL_IN_ONE (1).sql under backend/ before integration tests."
    );
  }

  const client = new Client({ connectionString: testDatabase.url });
  await client.connect();

  try {
    // Verify live database before any destructive reset.
    await assertConnectedToTestDatabase(client, testDatabase);

    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query(fs.readFileSync(SCHEMA_FILE, "utf8"));

    await runMigrations(client, {
      apply: true,
      defer003: true,
      context: { bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME },
      log: () => {},
    });

    await createIntegrationTestBootstrapAdmin(client);

    await runMigrations(client, {
      apply: true,
      apply003ForIsolatedTestDatabase: true,
      context: {
        bootstrapUsername: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
        env: process.env,
      },
      log: () => {},
    });
  } finally {
    await client.end();
  }
};
