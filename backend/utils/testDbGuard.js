const net = require("net");

const TEST_DATABASE_NAME = "aarogya_test";
const PRODUCTION_DATABASE_NAME = "Aarogya";

function requiredValue(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be explicitly configured for tests.`);
  }
  return value.trim();
}

function normalizedHost(host) {
  return host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function parseDatabaseUrl(url) {
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Tests only run against the dedicated aarogya_test database."
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid connection URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !parsed.port || !parsed.username) {
    throw new Error("TEST_DATABASE_URL must explicitly include host, port, and user.");
  }

  return {
    parsed,
    databaseName,
    host: normalizedHost(parsed.hostname),
    port: Number(parsed.port),
    user: decodeURIComponent(parsed.username),
  };
}

function assertTestDatabaseUrl(url) {
  const target = parseDatabaseUrl(url);
  if (target.databaseName !== TEST_DATABASE_NAME ||
      target.databaseName === PRODUCTION_DATABASE_NAME) {
    throw new Error(
      `Refusing to run tests: TEST_DATABASE_URL must target "${TEST_DATABASE_NAME}".`
    );
  }

  return target.databaseName;
}

function getTestDatabaseConfig(env = process.env) {
  const url = requiredValue(env, "TEST_DATABASE_URL");
  const expectedName = requiredValue(env, "TEST_DB_EXPECTED_NAME");
  const expectedHost = normalizedHost(requiredValue(env, "TEST_DB_EXPECTED_HOST"));
  const expectedPort = requiredValue(env, "TEST_DB_EXPECTED_PORT");
  const expectedUser = requiredValue(env, "TEST_DB_EXPECTED_USER");
  const expectedServerAddress = requiredValue(env, "TEST_DB_EXPECTED_SERVER_ADDRESS");
  const target = parseDatabaseUrl(url);

  if (expectedName !== TEST_DATABASE_NAME) {
    throw new Error(`TEST_DB_EXPECTED_NAME must be "${TEST_DATABASE_NAME}".`);
  }
  if (!net.isIP(expectedServerAddress)) {
    throw new Error("TEST_DB_EXPECTED_SERVER_ADDRESS must be an explicit server IP address.");
  }
  if (!/^\d+$/.test(expectedPort) || Number(expectedPort) < 1 || Number(expectedPort) > 65535) {
    throw new Error("TEST_DB_EXPECTED_PORT must be an explicit port from 1 to 65535.");
  }
  if (target.databaseName !== expectedName ||
      target.host !== expectedHost ||
      target.port !== Number(expectedPort) ||
      target.user !== expectedUser) {
    throw new Error("TEST_DATABASE_URL does not match the explicitly approved test identity.");
  }

  assertTestDatabaseUrl(url);
  return {
    url,
    databaseName: expectedName,
    host: expectedHost,
    port: Number(expectedPort),
    user: expectedUser,
    serverAddress: expectedServerAddress,
  };
}

function assertDestructiveResetOptIn(env = process.env) {
  if (env.TEST_DB_ALLOW_DESTRUCTIVE_RESET !== "true") {
    throw new Error(
      "Destructive test database reset is disabled. Set TEST_DB_ALLOW_DESTRUCTIVE_RESET=true only for the DBA-verified isolated test database."
    );
  }
}

async function assertConnectedToTestDatabase(queryable, config = getTestDatabaseConfig()) {
  const result = await queryable.query(
    `SELECT current_database() AS name,
            current_user AS user,
            inet_server_addr()::text AS server_address,
            inet_server_port() AS server_port,
            NOT EXISTS (
              SELECT 1
              FROM pg_database d
              WHERE d.datname NOT IN ($1, 'template0', 'template1')
                AND has_database_privilege(current_user, d.datname, 'CONNECT')
            ) AS restricted_database_access,
            NOT EXISTS (
              SELECT 1
              FROM pg_roles r
              WHERE r.rolname = current_user
                AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole)
            ) AS restricted_role`,
    [TEST_DATABASE_NAME]
  );
  const identity = result.rows[0];

  if (
    !identity ||
    identity.name !== config.databaseName ||
    identity.user !== config.user ||
    identity.server_address !== config.serverAddress ||
    Number(identity.server_port) !== config.port ||
    identity.restricted_database_access !== true ||
    identity.restricted_role !== true
  ) {
    throw new Error(
      "Refusing test database access: connected server, database, user, or database privileges do not match the approved isolated test identity."
    );
  }
}

module.exports = {
  TEST_DATABASE_NAME,
  assertTestDatabaseUrl,
  getTestDatabaseConfig,
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
};
