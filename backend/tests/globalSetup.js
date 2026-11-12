const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const loadTestEnv = require("./loadTestEnv");
const {
  getTestDatabaseConfig,
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
} = require("../utils/testDbGuard");
const { runMigrations } = require("../utils/migrator");

const SCHEMA_FILE = path.join(__dirname, "..", "ALL_IN_ONE (1).sql");

// Rebuilds the isolated test database only after explicit opt-in and identity checks.
module.exports = async function globalSetup() {
  loadTestEnv();
  const testDatabase = getTestDatabaseConfig();
  assertDestructiveResetOptIn();

  const client = new Client({ connectionString: testDatabase.url });
  await client.connect();

  try {
    await assertConnectedToTestDatabase(client, testDatabase);

    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query(fs.readFileSync(SCHEMA_FILE, "utf8"));

    await runMigrations(client, {
      apply: true,
      context: { bootstrapUsername: "zz_test_bootstrap_admin" },
      log: () => {},
    });
  } finally {
    await client.end();
  }
};
