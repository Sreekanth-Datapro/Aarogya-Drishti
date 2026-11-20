/**
 * Create the initial platform administrator account (SUPER_ADMIN).
 *
 * Why SUPER_ADMIN (not SYSTEM_ADMIN)?
 * Migration 011 deactivated SYSTEM_ADMIN and moved platform ownership to
 * SUPER_ADMIN. Both roles remain in mst_roles; only SUPER_ADMIN is active.
 * MFA is required for this role — first login follows the existing enroll flow
 * (no MFA secret is written here).
 *
 * Password hashing: bcryptjs cost 12 (same as authController / bootstrap.js).
 *
 * Usage (from backend/):
 *   set SYSTEM_ADMIN_USERNAME=...
 *   set SYSTEM_ADMIN_PASSWORD=...
 *   set SYSTEM_ADMIN_EMAIL=...          (optional)
 *   set SYSTEM_ADMIN_FULL_NAME=...      (optional)
 *   node database/seeds/create-system-admin.js
 *
 * Never prints the password or hash. Never updates an existing user.
 */
"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });

const bcrypt = require("bcryptjs");
const pool = require("../../db");
const config = require("../../config/config");

const BCRYPT_ROUNDS = 12;
const TARGET_ROLE = "SUPER_ADMIN";

function requireEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }
  return String(value).trim();
}

async function main() {
  const username = requireEnv(
    "SYSTEM_ADMIN_USERNAME",
    process.env.SYSTEM_ADMIN_USERNAME || config.systemAdmin.username
  ).toLowerCase();
  const password = requireEnv(
    "SYSTEM_ADMIN_PASSWORD",
    process.env.SYSTEM_ADMIN_PASSWORD || config.systemAdmin.password
  );
  const fullName =
    (process.env.SYSTEM_ADMIN_FULL_NAME || config.systemAdmin.fullName || "").trim() ||
    "Aarogya Drishti System Administrator";
  const emailRaw = (process.env.SYSTEM_ADMIN_EMAIL || "").trim();
  const email = emailRaw ? emailRaw.toLowerCase() : null;

  if (password.length < 12) {
    throw new Error("SYSTEM_ADMIN_PASSWORD must be at least 12 characters");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT u.id, r.code AS role_code
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id
        WHERE lower(u.username) = $1
          AND u.deleted_at IS NULL`,
      [username]
    );

    if (existing.rows.length > 0) {
      console.log(
        `Account "${username}" already exists (role ${existing.rows[0].role_code}); left unchanged.`
      );
      await client.query("COMMIT");
      return;
    }

    const otherAdmin = await client.query(
      `SELECT count(*)::int AS n
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id
        WHERE r.code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN')
          AND u.deleted_at IS NULL`
    );
    if (otherAdmin.rows[0].n > 0) {
      console.log(
        "A SUPER_ADMIN or SYSTEM_ADMIN account already exists; no new account created."
      );
      await client.query("COMMIT");
      return;
    }

    const role = await client.query(
      `SELECT id, is_active, mfa_required
         FROM mst_roles
        WHERE code = $1`,
      [TARGET_ROLE]
    );
    if (!role.rows.length) {
      throw new Error(
        `Role ${TARGET_ROLE} is missing. Load AAROGYA_INITIAL_SEED.sql first.`
      );
    }
    if (role.rows[0].is_active === false) {
      throw new Error(`Role ${TARGET_ROLE} exists but is inactive.`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const inserted = await client.query(
      `INSERT INTO tbl_users (
          username, email, password_hash, full_name, role_id,
          status, is_synthetic, mfa_enabled, must_change_password
        ) VALUES (
          $1, $2, $3, $4, $5,
          'ACTIVE', FALSE, FALSE, FALSE
        )
        RETURNING id, username, status, mfa_enabled`,
      [username, email, passwordHash, fullName, role.rows[0].id]
    );

    await client.query("COMMIT");

    const row = inserted.rows[0];
    console.log(
      `Created ${TARGET_ROLE} account "${row.username}" (status ${row.status}).`
    );
    if (role.rows[0].mfa_required) {
      console.log(
        "MFA is required for this role. First login will prompt MFA enrollment " +
          "(ensure MFA_ENCRYPTION_KEY is set). No MFA secret was stored by this script."
      );
    }
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
