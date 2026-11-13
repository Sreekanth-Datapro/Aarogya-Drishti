const bcrypt = require("bcryptjs");
const { checkPassword } = require("../../utils/passwordPolicy");
const { assertDestructiveResetOptIn } = require("../../utils/testDbGuard");
const {
  INTEGRATION_TEST_BOOTSTRAP_USERNAME,
  TEST_DATABASE,
} = require("../../utils/migrator");

const BCRYPT_ROUNDS = 12;

function assertIntegrationTestEnv(env = process.env) {
  if (String(env.NODE_ENV || "").trim() !== "test") {
    throw new Error("Integration bootstrap requires NODE_ENV=test.");
  }
  assertDestructiveResetOptIn(env);
}

/**
 * Creates the allowlisted SYSTEM_ADMIN used only by Jest globalSetup before the
 * isolated-test 003 harness. Never reads SYSTEM_ADMIN_USERNAME / SYSTEM_ADMIN_PASSWORD.
 */
async function createIntegrationTestBootstrapAdmin(client, env = process.env) {
  assertIntegrationTestEnv(env);

  const databaseResult = await client.query("SELECT current_database() AS name");
  const databaseName = databaseResult.rows[0]?.name;
  if (databaseName !== TEST_DATABASE) {
    throw new Error(
      `Integration bootstrap refuses database "${databaseName || "unknown"}"; ` +
        `only ${TEST_DATABASE} is permitted.`
    );
  }

  const productionUsername = String(env.SYSTEM_ADMIN_USERNAME || "").trim().toLowerCase();
  if (
    productionUsername &&
    productionUsername === INTEGRATION_TEST_BOOTSTRAP_USERNAME.toLowerCase()
  ) {
    throw new Error(
      "SYSTEM_ADMIN_USERNAME collides with the integration-test bootstrap username; refusing."
    );
  }

  const password = String(env.TEST_INTEGRATION_BOOTSTRAP_PASSWORD || "");
  const passwordError = checkPassword(password, {
    username: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
  });
  if (passwordError) {
    throw new Error(
      `TEST_INTEGRATION_BOOTSTRAP_PASSWORD is invalid: ${passwordError}`
    );
  }

  const role = await client.query(
    `SELECT id FROM mst_roles WHERE code = 'SYSTEM_ADMIN'`
  );
  if (!role.rows.length) {
    throw new Error(
      "SYSTEM_ADMIN role is missing; apply migrations 001–002 before integration bootstrap."
    );
  }

  const existing = await client.query(
    `SELECT u.id, r.code AS role_code
       FROM tbl_users u
       JOIN mst_roles r ON r.id = u.role_id
      WHERE lower(u.username) = lower($1)
        AND u.deleted_at IS NULL`,
    [INTEGRATION_TEST_BOOTSTRAP_USERNAME]
  );

  if (existing.rows.length) {
    if (existing.rows[0].role_code !== "SYSTEM_ADMIN") {
      throw new Error(
        `Integration bootstrap account exists with role ${existing.rows[0].role_code}; refusing.`
      );
    }
    return {
      username: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
      id: existing.rows[0].id,
      created: false,
    };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const inserted = await client.query(
    `INSERT INTO tbl_users (username, password_hash, full_name, role_id, status, is_synthetic)
     VALUES ($1, $2, $3, $4, 'ACTIVE', TRUE)
     RETURNING id`,
    [
      INTEGRATION_TEST_BOOTSTRAP_USERNAME,
      passwordHash,
      "Integration Test Bootstrap Admin",
      role.rows[0].id,
    ]
  );

  return {
    username: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
    id: inserted.rows[0].id,
    created: true,
  };
}

module.exports = {
  INTEGRATION_TEST_BOOTSTRAP_USERNAME,
  createIntegrationTestBootstrapAdmin,
  assertIntegrationTestEnv,
  BCRYPT_ROUNDS,
};
