const fs = require("fs");

/**
 * Build node-pg `ssl` options from environment.
 *
 * DB_SSL:
 *   unset | disable | false  → no SSL (local Postgres)
 *   require | verify-full | true → TLS with certificate verification
 *
 * Optional CA:
 *   DB_SSL_CA       → PEM string
 *   DB_SSL_CA_FILE  → path to PEM file
 *
 * Never defaults to rejectUnauthorized:false (no "disable verify" workaround).
 */
function buildDatabaseSslConfig(env = process.env) {
  const mode = String(env.DB_SSL || "").trim().toLowerCase();
  if (!mode || mode === "disable" || mode === "false" || mode === "0" || mode === "off") {
    return undefined;
  }

  if (!["require", "verify-full", "verify-ca", "true", "1", "on"].includes(mode)) {
    throw new Error(
      `Unsupported DB_SSL value "${mode}". Use disable, require, or verify-full.`
    );
  }

  const ssl = {
    // Always verify certificates when SSL is enabled.
    rejectUnauthorized: true,
  };

  let ca = typeof env.DB_SSL_CA === "string" ? env.DB_SSL_CA.trim() : "";
  if (!ca && env.DB_SSL_CA_FILE) {
    ca = fs.readFileSync(String(env.DB_SSL_CA_FILE), "utf8");
  }
  if (ca) {
    ssl.ca = ca;
  }

  return ssl;
}

module.exports = { buildDatabaseSslConfig };
