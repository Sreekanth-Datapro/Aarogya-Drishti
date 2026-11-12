const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");
const { getTestDatabaseConfig } = require("../utils/testDbGuard");

function loadTestEnv() {
  process.env.NODE_ENV = "test";
  dotenv.config({
    path: path.join(__dirname, "..", ".env.test"),
    override: false,
    quiet: true,
  });
  getTestDatabaseConfig();

  process.env.MFA_ENCRYPTION_KEY = process.env.TEST_MFA_ENCRYPTION_KEY
    || crypto.createHash("sha256").update("aarogya-test-mfa-key").digest("base64");
}

module.exports = loadTestEnv;
