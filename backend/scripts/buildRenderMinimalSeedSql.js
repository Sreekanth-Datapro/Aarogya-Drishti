/**
 * Build AAROGYA_RENDER_MINIMAL_SEED.sql from AAROGYA_INITIAL_SEED.sql
 * by keeping only non-geographic core reference tables.
 *
 * Usage: node scripts/buildRenderMinimalSeedSql.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const sourceFile = path.join(backendRoot, "database", "seeds", "AAROGYA_INITIAL_SEED.sql");
const outFile = path.join(backendRoot, "database", "seeds", "AAROGYA_RENDER_MINIMAL_SEED.sql");
const roleExport = path.join(backendRoot, "database", "seeds", "_role_permissions_export.json");

/** Tables included after code dependency review (no geography/facilities). */
const INCLUDE_ORDER = [
  "mst_languages",
  "mst_appointment_statuses",
  "mst_followup_statuses",
  "mst_investigation_statuses",
  "mst_consent_purposes",
  "mst_exposure_types",
  "mst_symptoms",
  "mst_diagnostic_categories",
  "mst_investigation_types",
  "mst_diagnostic_tests",
  "mst_specialties",
  "mst_referral_priorities",
  "mst_notification_templates",
  "mst_roles",
  "mst_permissions",
];

function extractInsertBlocks(sql) {
  const blocks = [];
  const startRe = /INSERT INTO public\.(\w+)/gi;
  let start;
  while ((start = startRe.exec(sql)) !== null) {
    const table = start[1];
    let i = start.index;
    let inSingle = false;
    let end = -1;
    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (inSingle) {
        if (ch === "'" && sql[i + 1] === "'") {
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
      if (ch === ";") {
        end = i;
        break;
      }
    }
    if (end === -1) break;
    // Include trailing ON CONFLICT ... ; if present after the INSERT terminator —
    // our source already ends each statement at the ON CONFLICT semicolon.
    const statement = sql.slice(start.index, end + 1);
    blocks.push({ table, statement });
    startRe.lastIndex = end + 1;
  }
  return blocks;
}

function countValueRows(statement) {
  // Count top-level value tuples after VALUES
  const valuesIdx = statement.search(/\bVALUES\b/i);
  if (valuesIdx < 0) return 0;
  const body = statement.slice(valuesIdx + 6);
  let depth = 0;
  let inSingle = false;
  let count = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inSingle) {
      if (ch === "'" && body[i + 1] === "'") {
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
      if (depth === 0) count += 1;
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
  }
  return count;
}

function buildRolePermissionsSql() {
  if (!fs.existsSync(roleExport)) {
    throw new Error("Missing _role_permissions_export.json");
  }
  const data = JSON.parse(fs.readFileSync(roleExport, "utf8"));
  const pairs = data.pairs || [];
  const lines = [
    "-- ---------------------------------------------------------------------------",
    "-- tbl_role_permissions (system roles; by role/permission code)",
    `-- Pairs: ${pairs.length}`,
    "-- ---------------------------------------------------------------------------",
    "",
    "INSERT INTO public.tbl_role_permissions (role_id, permission_id)",
    "SELECT r.id, p.id",
    "FROM (VALUES",
  ];
  pairs.forEach((pair, idx) => {
    const comma = idx === pairs.length - 1 ? "" : ",";
    lines.push(
      `  ('${pair.role_code.replace(/'/g, "''")}', '${pair.permission_code.replace(/'/g, "''")}')${comma}`
    );
  });
  lines.push(
    ") AS v(role_code, permission_code)",
    "JOIN public.mst_roles r ON r.code = v.role_code",
    "JOIN public.mst_permissions p ON p.code = v.permission_code",
    "ON CONFLICT (role_id, permission_id) DO NOTHING;",
    ""
  );
  return { sql: lines.join("\n"), count: pairs.length };
}

function main() {
  const source = fs.readFileSync(sourceFile, "utf8");
  const blocks = extractInsertBlocks(source);
  const byTable = new Map();
  for (const block of blocks) {
    if (!INCLUDE_ORDER.includes(block.table)) continue;
    if (!byTable.has(block.table)) byTable.set(block.table, []);
    byTable.get(block.table).push(block.statement);
  }

  const counts = {};
  const bodyParts = [];
  for (const table of INCLUDE_ORDER) {
    const stmts = byTable.get(table) || [];
    if (!stmts.length) {
      console.warn(`WARNING: no statements for ${table}`);
      continue;
    }
    let n = 0;
    for (const stmt of stmts) {
      n += countValueRows(stmt);
      bodyParts.push(stmt.trim() + "\n\n");
    }
    counts[table] = n;
  }

  const rolePerms = buildRolePermissionsSql();
  counts.tbl_role_permissions = rolePerms.count;

  const header = [
    "-- =============================================================================",
    "-- Aarogya Drishti — RENDER MINIMAL SEED (core config only)",
    `-- Generated: ${new Date().toISOString()}`,
    "--",
    "-- Prerequisites: schema already loaded; master tables empty or compatible.",
    "-- NO geography / facilities / users / clinical / transactional data.",
    "-- Idempotent via ON CONFLICT on natural unique keys (code / composite).",
    "--",
    "-- Excluded by design:",
    "--   mst_districts, mst_mandals, mst_gram_panchayats, mst_villages,",
    "--   mst_hospitals, mst_phcs, mst_facilities, mst_screening_sites,",
    "--   tbl_location_import_batches, mst_ai_models, mst_ui_translations,",
    "--   mst_protocol_rules, mst_missed_reasons, tbl_users, clinical tbl_*.",
    "-- =============================================================================",
    "",
    "BEGIN;",
    "",
  ].join("\n");

  const footer = [
    "-- Align identity sequences",
    "SELECT setval(pg_get_serial_sequence('public.mst_languages', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_languages), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_appointment_statuses', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_appointment_statuses), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_followup_statuses', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_followup_statuses), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_investigation_statuses', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_investigation_statuses), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_consent_purposes', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_consent_purposes), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_exposure_types', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_exposure_types), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_symptoms', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_symptoms), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_diagnostic_categories', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_diagnostic_categories), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_investigation_types', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_investigation_types), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_diagnostic_tests', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_diagnostic_tests), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_specialties', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_specialties), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_referral_priorities', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_referral_priorities), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_notification_templates', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_notification_templates), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_roles', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_roles), 1), true);",
    "SELECT setval(pg_get_serial_sequence('public.mst_permissions', 'id'), COALESCE((SELECT MAX(id) FROM public.mst_permissions), 1), true);",
    "",
    "COMMIT;",
    "",
    "-- End of AAROGYA_RENDER_MINIMAL_SEED.sql",
    "",
  ].join("\n");

  const sql = header + bodyParts.join("") + rolePerms.sql + footer;
  fs.writeFileSync(outFile, sql, "utf8");

  console.log(`Wrote ${outFile}`);
  console.log(`Bytes: ${Buffer.byteLength(sql)}`);
  console.log(JSON.stringify(counts, null, 2));
}

main();
