// Read-only preflight for Jest integration against aarogya_test only.
// Never runs DROP / TRUNCATE / DELETE / ALTER / migrations / globalSetup.
// Usage (from backend/): npm run test:preflight-integration
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { checkPassword } = require("../utils/passwordPolicy");
const loadTestEnv = require("../tests/loadTestEnv");
const {
  getTestDatabaseConfig,
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
  TEST_DATABASE_NAME,
} = require("../utils/testDbGuard");
const { INTEGRATION_TEST_BOOTSTRAP_USERNAME } = require("../utils/migrator");

const SCHEMA_FILE = path.join(__dirname, "..", "ALL_IN_ONE (1).sql");

function fail(message) {
  console.error(`PREFLIGHT FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  console.log("Integration DB preflight (read-only; no schema changes).");

  try {
    loadTestEnv();
  } catch (error) {
    fail(error.message);
    return;
  }

  let config;
  try {
    config = getTestDatabaseConfig();
  } catch (error) {
    fail(error.message);
    return;
  }

  if (config.databaseName !== TEST_DATABASE_NAME) {
    fail(`Database name must be ${TEST_DATABASE_NAME}.`);
    return;
  }

  try {
    assertDestructiveResetOptIn();
  } catch (error) {
    fail(error.message);
    return;
  }

  const bootstrapPassword = process.env.TEST_INTEGRATION_BOOTSTRAP_PASSWORD;
  const passwordError = checkPassword(String(bootstrapPassword || ""), {
    username: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
  });
  if (passwordError) {
    fail(`TEST_INTEGRATION_BOOTSTRAP_PASSWORD is invalid: ${passwordError}`);
    return;
  }

  if (!fs.existsSync(SCHEMA_FILE)) {
    fail(`Missing base schema file: ${SCHEMA_FILE}`);
    return;
  }

  console.log("Config identity (no secrets):");
  console.log(`  expected_name=${config.databaseName}`);
  console.log(`  expected_host=${config.host}`);
  console.log(`  expected_port=${config.port}`);
  console.log(`  expected_user=${config.user}`);
  console.log(`  expected_server_address=${config.serverAddress}`);
  console.log(`  destructive_reset_opt_in=true`);
  console.log(`  bootstrap_password_configured=yes`);
  console.log(`  all_in_one_present=yes`);

  const client = new Client({ connectionString: config.url });
  try {
    await client.connect();
  } catch (error) {
    fail(`Connect failed: ${error.message}`);
    return;
  }

  try {
    await assertConnectedToTestDatabase(client, config);

    const live = await client.query(
      `SELECT current_database() AS name,
              current_user AS user,
              host(inet_server_addr()) AS server_address,
              inet_server_port() AS server_port`
    );
    const row = live.rows[0];
    console.log("Live identity:");
    console.log(`  current_database=${row.name}`);
    console.log(`  current_user=${row.user}`);
    console.log(`  server_address=${row.server_address}`);
    console.log(`  inet_server_port=${row.server_port}`);
    console.log(
      "  restricted_role_and_connect_scope=verified (testDbGuard)"
    );
    console.log("PREFLIGHT PASS: safe to run Jest integration against aarogya_test.");
  } catch (error) {
    fail(error.message);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  fail(error.message || String(error));
});
