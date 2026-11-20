/**
 * Build backend/database/seeds/AAROGYA_INITIAL_SEED.sql from:
 *   - schema/_mst_data.sql  (verified master rows from local dump)
 *   - database/seeds/_role_permissions_export.json (optional; from exportRolePermissions.js)
 *
 * Output is DATA ONLY (no DDL). Idempotent via ON CONFLICT / NOT EXISTS.
 *
 * Usage: node scripts/buildInitialSeedSql.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const mstDump = path.join(backendRoot, "schema", "_mst_data.sql");
const roleExport = path.join(backendRoot, "database", "seeds", "_role_permissions_export.json");
const outFile = path.join(backendRoot, "database", "seeds", "AAROGYA_INITIAL_SEED.sql");

const JUNK_ROLE_CODES = new Set(["AO_123", "PO_123"]);

/** Tables that have UNIQUE(code) and can upsert by code. */
const CODE_UNIQUE_TABLES = new Set([
  "mst_appointment_statuses",
  "mst_consent_purposes",
  "mst_diagnostic_categories",
  "mst_diagnostic_tests",
  "mst_districts",
  "mst_exposure_types",
  "mst_facilities",
  "mst_followup_statuses",
  "mst_gram_panchayats",
  "mst_hospitals",
  "mst_investigation_statuses",
  "mst_investigation_types",
  "mst_languages",
  "mst_mandals",
  "mst_missed_reasons",
  "mst_permissions",
  "mst_phcs",
  "mst_protocol_rules",
  "mst_referral_priorities",
  "mst_roles",
  "mst_screening_sites",
  "mst_specialties",
  "mst_symptoms",
  "mst_villages",
]);

function stripNoise(sql) {
  return sql
    .replace(/^\\restrict .*$/gm, "")
    .replace(/^\\unrestrict .*$/gm, "")
    .replace(/^-- Dumped by pg_dump.*$/gm, "")
    .replace(/^-- Dumped from database version.*$/gm, "")
    .replace(/^SET .*$/gm, "")
    .replace(/^SELECT pg_catalog\.set_config\(.*$/gm, "")
    .replace(/^SELECT pg_catalog\.setval\(.*$/gm, "")
    .replace(/^--\n-- Name: .*_id_seq; Type: SEQUENCE SET.*$/gm, "")
    .replace(/^--\n-- PostgreSQL database dump.*$/gm, "")
    .replace(/^--\n-- PostgreSQL database dump complete.*$/gm, "");
}

/**
 * Convert "INSERT INTO public.mst_x (...) OVERRIDING SYSTEM VALUE VALUES ..."
 * into inserts that omit identity `id` where possible is hard; keep explicit ids
 * with OVERRIDING SYSTEM VALUE + ON CONFLICT on code where available.
 */
function convertInsertBlock(block) {
  const match = block.match(
    /INSERT INTO public\.(\w+)\s*\(([^)]+)\)\s*OVERRIDING SYSTEM VALUE VALUES\s*([\s\S]*);/i
  );
  if (!match) return block.trim() ? `${block.trim()}\n` : "";

  const table = match[1];
  const cols = match[2].split(",").map((c) => c.trim());
  let valuesSql = match[3].trim();

  // Drop junk custom roles from local DB dump (keep SYSTEM_ADMIN inactive as in dump)
  if (table === "mst_roles") {
    const rows = [];
    let depth = 0;
    let inSingle = false;
    let rowStart = -1;
    for (let i = 0; i < valuesSql.length; i++) {
      const ch = valuesSql[i];
      if (inSingle) {
        if (ch === "'" && valuesSql[i + 1] === "'") {
          i += 1;
          continue;
        }
        if (ch === "'") inSingle = false;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === "(") {
        if (depth === 0) rowStart = i;
        depth += 1;
        continue;
      }
      if (ch === ")") {
        depth -= 1;
        if (depth === 0 && rowStart >= 0) {
          rows.push(valuesSql.slice(rowStart, i + 1));
          rowStart = -1;
        }
      }
    }
    valuesSql = rows
      .filter((row) => ![...JUNK_ROLE_CODES].some((code) => row.includes(`'${code}'`)))
      .join(",\n\t");
  }

  if (table === "mst_ai_models") {
    // Unique is (provider, model_version) — keep OVERRIDING ids + conflict target
    return (
      `INSERT INTO public.mst_ai_models (${cols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n` +
      `\t${valuesSql}\n` +
      `ON CONFLICT (provider, model_version) DO NOTHING;\n\n`
    );
  }

  if (table === "mst_notification_templates") {
    return (
      `INSERT INTO public.mst_notification_templates (${cols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n` +
      `\t${valuesSql}\n` +
      `ON CONFLICT (code, language_id, channel) DO NOTHING;\n\n`
    );
  }

  if (table === "mst_ui_translations") {
    return (
      `INSERT INTO public.mst_ui_translations (${cols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n` +
      `\t${valuesSql}\n` +
      `ON CONFLICT (msg_key, language_id) DO NOTHING;\n\n`
    );
  }

  if (CODE_UNIQUE_TABLES.has(table)) {
    // Prefer conflict on code; for roles also update flags to match seed intent
    if (table === "mst_roles") {
      return (
        `INSERT INTO public.mst_roles (${cols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n` +
        `\t${valuesSql}\n` +
        `ON CONFLICT (code) DO UPDATE SET\n` +
        `  name_en = EXCLUDED.name_en,\n` +
        `  name_te = EXCLUDED.name_te,\n` +
        `  description = EXCLUDED.description,\n` +
        `  mfa_required = EXCLUDED.mfa_required,\n` +
        `  is_active = EXCLUDED.is_active,\n` +
        `  is_system_role = EXCLUDED.is_system_role;\n\n`
      );
    }
    return (
      `INSERT INTO public.${table} (${cols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n` +
      `\t${valuesSql}\n` +
      `ON CONFLICT (code) DO NOTHING;\n\n`
    );
  }

  // Fallback: insert only when empty / no natural unique key beyond id
  return (
    `INSERT INTO public.${table} (${cols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n` +
    `\t${valuesSql}\n` +
    `ON CONFLICT DO NOTHING;\n\n`
  );
}

/**
 * Extract INSERT ... ; statements without treating ';' inside string literals
 * as terminators (mst descriptions contain semicolons).
 */
function extractInsertBlocks(sql) {
  const blocks = [];
  const startRe = /INSERT INTO public\.\w+/gi;
  let start;
  while ((start = startRe.exec(sql)) !== null) {
    let i = start.index;
    let inSingle = false;
    let end = -1;
    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (inSingle) {
        if (ch === "'" && sql[i + 1] === "'") {
          i += 1; // escaped ''
          continue;
        }
        if (ch === "'") inSingle = false;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === ";") {
        end = i;
        break;
      }
    }
    if (end === -1) break;
    blocks.push(sql.slice(start.index, end + 1));
    startRe.lastIndex = end + 1;
  }
  return blocks;
}

function buildRolePermissionsSql(exportData) {
  if (!exportData || !Array.isArray(exportData.pairs) || exportData.pairs.length === 0) {
    return [
      "-- ---------------------------------------------------------------------------",
      "-- tbl_role_permissions",
      "-- Missing export: run `node database/seeds/exportRolePermissions.js` then rebuild.",
      "-- ---------------------------------------------------------------------------",
      "",
    ].join("\n");
  }

  const lines = [
    "-- ---------------------------------------------------------------------------",
    "-- tbl_role_permissions (system roles only; resolved by role/permission code)",
    `-- Pairs: ${exportData.pairs.length}`,
    "-- ---------------------------------------------------------------------------",
    "",
    "INSERT INTO public.tbl_role_permissions (role_id, permission_id)",
    "SELECT r.id, p.id",
    "FROM (VALUES",
  ];

  exportData.pairs.forEach((pair, idx) => {
    const comma = idx === exportData.pairs.length - 1 ? "" : ",";
    lines.push(
      `  ('${pair.role_code.replace(/'/g, "''")}', '${pair.permission_code.replace(/'/g, "''")}')${comma}`
    );
  });

  lines.push(
    ") AS v(role_code, permission_code)",
    "JOIN public.mst_roles r ON r.code = v.role_code",
    "JOIN public.mst_permissions p ON p.code = v.permission_code",
    "ON CONFLICT (role_id, permission_id) DO NOTHING;",
    "",
    "-- Align sequences after explicit identity inserts",
    "SELECT setval(pg_get_serial_sequence('public.mst_roles', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_roles), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_permissions', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_permissions), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_districts', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_districts), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_mandals', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_mandals), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_villages', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_villages), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_facilities', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_facilities), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_languages', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_languages), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_notification_templates', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_notification_templates), 1), true);",
    ""
  );

  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(mstDump)) {
    console.error("Missing schema/_mst_data.sql — dump mst_* data first.");
    process.exit(1);
  }

  let roleData = null;
  if (fs.existsSync(roleExport)) {
    roleData = JSON.parse(fs.readFileSync(roleExport, "utf8"));
  } else {
    console.warn("WARNING: _role_permissions_export.json missing; seed will omit grants.");
  }

  const raw = stripNoise(fs.readFileSync(mstDump, "utf8"));
  const blocks = extractInsertBlocks(raw);

  const header = [
    "-- =============================================================================",
    "-- Aarogya Drishti — INITIAL APPLICATION SEED (DATA ONLY)",
    `-- Generated: ${new Date().toISOString()}`,
    "--",
    "-- Prerequisites: full schema already loaded (no CREATE/ALTER here).",
    "-- Safe to re-run: uses ON CONFLICT / DO NOTHING.",
    "-- Does NOT create users or password hashes (see create-system-admin.js).",
    "-- Does NOT insert patient / clinical transactional rows.",
    "--",
    "-- Notes:",
    "--   - Designations ASHA/ANM/CHO/OTHER are CHECK constraints, not master rows.",
    "--   - user_status / sex_type / facility_type are PostgreSQL ENUMs (schema).",
    "--   - SYSTEM_ADMIN role exists but is inactive after migration 011;",
    "--     platform admin role is SUPER_ADMIN (MFA required).",
    "--   - Local junk custom roles (AO_123, PO_123) are excluded.",
    "-- =============================================================================",
    "",
    "BEGIN;",
    "",
  ].join("\n");

  const bodyParts = [];
  for (const block of blocks) {
    bodyParts.push(convertInsertBlock(block));
  }

  const footer = ["", "COMMIT;", "", "-- End of AAROGYA_INITIAL_SEED.sql", ""].join("\n");

  const sql =
    header +
    bodyParts.join("") +
    buildRolePermissionsSql(roleData) +
    footer;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, sql, "utf8");
  console.log(`Wrote ${outFile}`);
  console.log(`Bytes: ${Buffer.byteLength(sql)}`);
  console.log(`Insert blocks processed: ${blocks.length}`);
}

main();
