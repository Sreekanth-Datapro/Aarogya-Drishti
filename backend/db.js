const isTest = process.env.NODE_ENV === "test";
const path = require("path");

if (!isTest) {
  require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
}

const { Pool } = require("pg");

let poolConfig;

if (isTest) {
  const { getTestDatabaseConfig } = require("./utils/testDbGuard");
  const testDatabase = getTestDatabaseConfig();
  poolConfig = { connectionString: testDatabase.url };
} else {
  const config = require("./config/config");
  poolConfig = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  };
  if (config.database.ssl) {
    poolConfig.ssl = config.database.ssl;
  }
}

const pool = new Pool({
  ...poolConfig,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

if (!isTest) {
  pool.on("connect", () => {
    console.log("PostgreSQL connection established.");
  });
}

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err.message);
});

module.exports = pool;
