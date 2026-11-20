/**
 * Read-only helper: export system role → permission codes from the local DB.
 * Usage: node database/seeds/exportRolePermissions.js
 */
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../../.env"), quiet: true });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("../../config/config");

const SYSTEM_ROLES = [
  "HEALTH_WORKER",
  "MEDICAL_OFFICER",
  "SPECIALIST",
  "NAVIGATOR",
  "HOSPITAL_STAFF",
  "DISTRICT_ADMIN",
  "SYSTEM_ADMIN",
  "SUPER_ADMIN",
];

async function main() {
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  });

  try {
    const roles = await pool.query(
      `SELECT code, is_active, mfa_required, is_system_role
         FROM mst_roles
        WHERE code = ANY($1::text[])
        ORDER BY id`,
      [SYSTEM_ROLES]
    );

    const pairs = await pool.query(
      `SELECT r.code AS role_code, p.code AS permission_code
         FROM tbl_role_permissions rp
         JOIN mst_roles r ON r.id = rp.role_id
         JOIN mst_permissions p ON p.id = rp.permission_id
        WHERE r.code = ANY($1::text[])
        ORDER BY r.code, p.code`,
      [SYSTEM_ROLES]
    );

    const out = path.join(__dirname, "_role_permissions_export.json");
    fs.writeFileSync(
      out,
      JSON.stringify({ roles: roles.rows, pairs: pairs.rows }, null, 2)
    );
    console.log(`Wrote ${out}`);
    console.log(`roles=${roles.rows.length} permission_pairs=${pairs.rows.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
