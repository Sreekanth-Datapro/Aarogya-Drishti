/**
 * Assemble one greenfield bootstrap SQL from a local schema dump + mst_* data
 * + schema_migrations rows matching current migration files (checksum-aware).
 *
 * Does not connect to any database. Run after pg_dump helpers have written:
 *   schema/_schema_only.sql
 *   schema/_mst_data.sql
 *
 * Usage: node scripts/buildBootstrapSql.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { migrationFileChecksum } = require("../utils/migrationChecksum");
const { listMigrationFiles } = require("../utils/migrator");

const backendRoot = path.join(__dirname, "..");
const schemaDir = path.join(backendRoot, "schema");
const outFile = path.join(schemaDir, "AAROGYA_BOOTSTRAP_FINAL.sql");
const schemaOnly = path.join(schemaDir, "_schema_only.sql");
const mstData = path.join(schemaDir, "_mst_data.sql");
const migrationsDir = path.join(backendRoot, "migrations");

function stripPgDumpNoise(sql) {
  return sql
    .replace(/^\\restrict .*$/gm, "")
    .replace(/^\\unrestrict .*$/gm, "")
    .replace(/^-- Dumped by pg_dump.*$/gm, "")
    .replace(/^-- Dumped from database version.*$/gm, "")
    // PG 17+: not available on many hosted DBs (Render often 15/16)
    .replace(/^SET transaction_timeout = .*$/gm, "")
    .replace(/^SET idle_session_timeout = .*$/gm, "");
}

function buildMigrationsHistorySql() {
  const files = listMigrationFiles();
  const lines = [
    "",
    "-- ---------------------------------------------------------------------------",
    "-- Migration history: mark all current migrator files as applied (baseline).",
    "-- After loading this file, `npm run migrate` should report: Database is up to date.",
    "-- ---------------------------------------------------------------------------",
    "CREATE TABLE IF NOT EXISTS schema_migrations (",
    "  filename     TEXT PRIMARY KEY,",
    "  checksum     CHAR(64) NOT NULL,",
    "  applied_by   TEXT NOT NULL DEFAULT 'migrator',",
    "  execution_ms INT,",
    "  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()",
    ");",
    "",
  ];

  for (const file of files) {
    const checksum = migrationFileChecksum(path.join(migrationsDir, file));
    const escaped = file.replace(/'/g, "''");
    lines.push(
      `INSERT INTO schema_migrations (filename, checksum, applied_by, execution_ms)`
    );
    lines.push(
      `VALUES ('${escaped}', '${checksum}', 'bootstrap_final', 0)`
    );
    lines.push(`ON CONFLICT (filename) DO UPDATE`);
    lines.push(`  SET checksum = EXCLUDED.checksum,`);
    lines.push(`      applied_by = EXCLUDED.applied_by,`);
    lines.push(`      applied_at = now();`);
    lines.push("");
  }

  lines.push(`-- Recorded ${files.length} migration file(s).`);
  lines.push("");
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(schemaOnly) || !fs.existsSync(mstData)) {
    console.error(
      "Missing schema/_schema_only.sql or schema/_mst_data.sql. Dump them first with pg_dump."
    );
    process.exit(1);
  }

  const generatedAt = new Date().toISOString();
  const header = [
    "-- =============================================================================",
    "-- Aarogya Drishti — FINAL BOOTSTRAP SCHEMA",
    `-- Generated: ${generatedAt}`,
    "-- Source: local database dump (schema + mst_* seed) after migrations 001–043.",
    "--",
    "-- Purpose: create a fresh database that already includes every migration effect,",
    "-- so the app can start WITHOUT running `npm run migrate` / `migrate:apply`.",
    "--",
    "-- How to use (fresh / greenfield database):",
    "--   1. CREATE DATABASE your_db;   -- or reuse a DB you are willing to wipe",
    "--   2. psql -d your_db -f backend/schema/AAROGYA_BOOTSTRAP_FINAL.sql",
    "--   3. Point DB_* env at that database",
    "--   4. npm start  (bootstrap.js may create the first admin if none exists)",
    "--   5. Optional check: npm run migrate   (should say: Database is up to date)",
    "--",
    "-- Notes:",
    "--   - This script DROPS AND RECREATES schema public (wipes existing objects).",
    "--   - Does NOT include clinical tbl_* row data or user passwords from local.",
    "--   - Includes master seed rows (mst_*) from the dump source.",
    "--   - Records schema_migrations for all migrator-tracked files.",
    "--   - Not a substitute for production migrate --apply on an existing Render DB.",
    "-- =============================================================================",
    "",
    "BEGIN;",
    "",
    "-- Reset public so a partial prior load cannot cause 'already exists' errors.",
    "DROP SCHEMA IF EXISTS public CASCADE;",
    "CREATE SCHEMA public;",
    "GRANT ALL ON SCHEMA public TO pg_database_owner;",
    "GRANT ALL ON SCHEMA public TO public;",
    "COMMENT ON SCHEMA public IS 'standard public schema';",
    "",
  ].join("\n");

  const schemaSql = stripPgDumpNoise(fs.readFileSync(schemaOnly, "utf8"));
  const dataSql = stripPgDumpNoise(fs.readFileSync(mstData, "utf8"));
  const historySql = buildMigrationsHistorySql();

  const footer = ["", "COMMIT;", "", "-- End of AAROGYA_BOOTSTRAP_FINAL.sql", ""].join("\n");

  const body = [header, schemaSql, "", dataSql, historySql, footer].join("\n");
  fs.writeFileSync(outFile, body, "utf8");

  // Drop intermediate dumps from the published folder intent (keep regeneratable).
  console.log(`Wrote ${outFile}`);
  console.log(`Bytes: ${Buffer.byteLength(body)}`);
  console.log(`Migrations recorded: ${listMigrationFiles().length}`);
}

main();
