/**
 * READ-ONLY: parse migration files + optional local catalog presence checks.
 * Does not connect to Render. Does not write to any database.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const config = require("../config/config");
const { buildDatabaseSslConfig } = require("../utils/dbSsl");

const migrationsDir = path.join(__dirname, "..", "migrations");
const bootstrapSql = path.join(
  __dirname,
  "..",
  "schema",
  "AAROGYA_BOOTSTRAP_FINAL.sql"
);
const outJson = path.join(
  __dirname,
  "..",
  "database",
  "seeds",
  "_migration_object_inventory.json"
);

function listFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.(sql|js)$/.test(f))
    .sort();
}

function parseSql(file, text) {
  const tables = [
    ...text.matchAll(
      /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?([a-z0-9_]+)/gi
    ),
  ].map((m) => m[1].toLowerCase());

  const riskyCreate = [
    ...text.matchAll(
      /CREATE TABLE\s+(?!IF\s+NOT\s+EXISTS)(?:public\.)?([a-z0-9_]+)/gi
    ),
  ].map((m) => m[1].toLowerCase());

  const cols = [
    ...text.matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z0-9_]+)/gi),
  ].map((m) => m[1].toLowerCase());

  const enums = [
    ...text.matchAll(
      /ALTER TYPE\s+([a-z0-9_]+)\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([^']+)'/gi
    ),
  ].map((m) => `${m[1]}.${m[2]}`);

  const types = [
    ...text.matchAll(/CREATE TYPE\s+([a-z0-9_]+)/gi),
  ].map((m) => m[1].toLowerCase());

  const idxs = [
    ...text.matchAll(
      /CREATE(?:\s+UNIQUE)?\s+INDEX(?:\s+IF NOT EXISTS)?\s+([a-z0-9_]+)/gi
    ),
  ].map((m) => m[1].toLowerCase());

  const riskyIdx = [
    ...text.matchAll(
      /CREATE(?:\s+UNIQUE)?\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)([a-z0-9_]+)/gi
    ),
  ].map((m) => m[1].toLowerCase());

  const cons = [
    ...text.matchAll(/ADD CONSTRAINT\s+([a-z0-9_]+)/gi),
  ].map((m) => m[1].toLowerCase());

  const fns = [
    ...text.matchAll(
      /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)/gi
    ),
  ].map((m) => m[1].toLowerCase());

  const trgs = [
    ...text.matchAll(
      /CREATE(?:\s+CONSTRAINT\s+)?TRIGGER\s+([a-z0-9_]+)/gi
    ),
  ].map((m) => m[1].toLowerCase());

  const alterTables = [
    ...text.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-z0-9_]+)/gi),
  ].map((m) => m[1].toLowerCase());

  return {
    file,
    tables: [...new Set(tables)],
    riskyCreate: [...new Set(riskyCreate)],
    cols: [...new Set(cols)],
    enums: [...new Set(enums)],
    types: [...new Set(types)],
    idxs: [...new Set(idxs)],
    riskyIdx: [...new Set(riskyIdx)],
    cons: [...new Set(cons)],
    fns: [...new Set(fns)],
    trgs: [...new Set(trgs)],
    alterTables: [...new Set(alterTables)],
    isJs: file.endsWith(".js"),
  };
}

function inBootstrap(name, bootstrapText) {
  const n = name.toLowerCase();
  return (
    bootstrapText.includes(`CREATE TABLE public.${n}`) ||
    bootstrapText.includes(`CREATE TABLE ${n}`) ||
    bootstrapText.includes(`CREATE FUNCTION public.${n}`) ||
    bootstrapText.includes(`CREATE TYPE public.${n}`) ||
    bootstrapText.includes(`CREATE INDEX ${n}`) ||
    bootstrapText.includes(`CREATE UNIQUE INDEX ${n}`) ||
    bootstrapText.includes(`ADD CONSTRAINT ${n}`) ||
    bootstrapText.includes(`CREATE TRIGGER ${n}`) ||
    bootstrapText.includes(`'${n.split(".")[1] || ""}'`) // weak for enums
  );
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

  const bootstrapText = fs.existsSync(bootstrapSql)
    ? fs.readFileSync(bootstrapSql, "utf8")
    : "";

  const inventory = listFiles().map((file) => {
    const text = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const parsed = parseSql(file, text);
    parsed.inBootstrap = {
      tables: parsed.tables.filter((t) =>
        bootstrapText.includes(`CREATE TABLE public.${t}`)
      ),
      riskyCreate: parsed.riskyCreate.filter((t) =>
        bootstrapText.includes(`CREATE TABLE public.${t}`)
      ),
    };
    return parsed;
  });

  // Local catalog (Aarogya) — read-only SELECT only
  const client = new Client({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    ssl: buildDatabaseSslConfig(process.env),
  });
  await client.connect();
  const dbName = (await client.query("SELECT current_database() AS n")).rows[0].n;
  if (dbName !== "Aarogya") {
    await client.end();
    throw new Error(`Refusing: expected local Aarogya, got ${dbName}`);
  }

  const tables = (
    await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    )
  ).rows.map((r) => r.table_name);
  const columns = (
    await client.query(
      `SELECT table_name||'.'||column_name AS c FROM information_schema.columns WHERE table_schema='public'`
    )
  ).rows.map((r) => r.c);
  const indexes = (
    await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public'`
    )
  ).rows.map((r) => r.indexname);
  const constraints = (
    await client.query(
      `SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace`
    )
  ).rows.map((r) => r.conname);
  const functions = (
    await client.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`
    )
  ).rows.map((r) => r.proname);
  const triggers = (
    await client.query(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`
    )
  ).rows.map((r) => r.tgname);
  const enums = (
    await client.query(
      `SELECT t.typname||'.'||e.enumlabel AS e
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid=t.oid
         JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public'`
    )
  ).rows.map((r) => r.e);

  await client.end();

  const local = {
    tables: new Set(tables),
    columns: new Set(columns),
    indexes: new Set(indexes),
    constraints: new Set(constraints),
    functions: new Set(functions),
    triggers: new Set(triggers),
    enums: new Set(enums),
  };

  // User-confirmed present on Render
  const renderKnown = new Set(
    [
      "mst_roles",
      "mst_permissions",
      "tbl_users",
      "tbl_role_permissions",
      "tbl_health_worker_location_assignments",
      "tbl_medical_officer_mandal_assignments",
      "tbl_medical_officer_case_claims",
      "tbl_specialist_consultation_decisions",
    ].map((s) => s.toLowerCase())
  );

  const report = inventory.map((m) => {
    const existingLocal = {
      tables: m.tables.filter((t) => local.tables.has(t)),
      idxs: m.idxs.filter((i) => local.indexes.has(i)),
      cons: m.cons.filter((c) => local.constraints.has(c)),
      fns: m.fns.filter((f) => local.functions.has(f)),
      trgs: m.trgs.filter((t) => local.triggers.has(t)),
      enums: m.enums.filter((e) => local.enums.has(e)),
    };
    const missingLocal = {
      tables: m.tables.filter((t) => !local.tables.has(t)),
      idxs: m.idxs.filter((i) => !local.indexes.has(i)),
      cons: m.cons.filter((c) => !local.constraints.has(c)),
      fns: m.fns.filter((f) => !local.functions.has(f)),
      trgs: m.trgs.filter((t) => !local.triggers.has(t)),
      enums: m.enums.filter((e) => !local.enums.has(e)),
    };

    const renderConfirmed = m.tables.filter((t) => renderKnown.has(t));
    const bootstrapHasTables = m.inBootstrap.tables;
    const wouldFailIfApplied =
      m.riskyCreate.length > 0 &&
      (m.riskyCreate.some((t) => renderKnown.has(t)) ||
        m.riskyCreate.every((t) => bootstrapHasTables.includes(t)));

    let risk = "LOW";
    let recommendation = "VERIFY_THEN_BASELINE_OR_APPLY";
    if (m.isJs && m.file.startsWith("003_")) {
      risk = "HIGH";
      recommendation = "DUAL_APPROVE_OR_HISTORY_ONLY_IF_ALREADY_PROMOTED";
    } else if (m.riskyCreate.length || m.riskyIdx.length || m.cons.length) {
      if (
        m.riskyCreate.some((t) => renderKnown.has(t)) ||
        (bootstrapHasTables.length &&
          m.riskyCreate.every((t) => bootstrapHasTables.includes(t)))
      ) {
        risk = "CRITICAL";
        recommendation = "DO_NOT_APPLY_DDL__HISTORY_ONLY_IF_COMPLETE";
      } else if (bootstrapHasTables.length === m.tables.length && m.tables.length) {
        risk = "HIGH";
        recommendation = "LIKELY_ALREADY_IN_BOOTSTRAP__HISTORY_ONLY";
      } else {
        risk = "MEDIUM";
        recommendation = "VERIFY_RENDER_CATALOG_BEFORE_APPLY";
      }
    } else if (
      m.tables.length &&
      m.tables.every((t) => bootstrapHasTables.includes(t))
    ) {
      risk = "MEDIUM";
      recommendation = "LIKELY_PRESENT_IF_BOOTSTRAP_LOADED__HISTORY_ONLY";
    } else if (!m.tables.length && !m.cols.length && !m.enums.length && !m.isJs) {
      risk = "LOW";
      recommendation = "DATA_OR_RBAC_ONLY__SAFE_IF_IDEMPOTENT";
    }

    return {
      file: m.file,
      creates: m.tables,
      riskyCreate: m.riskyCreate,
      columnsAdded: m.cols,
      enums: m.enums,
      indexes: m.idxs,
      constraints: m.cons,
      functions: m.fns,
      triggers: m.trgs,
      bootstrapContainsTables: bootstrapHasTables,
      renderUserConfirmedTables: renderConfirmed,
      localComplete: Object.values(missingLocal).every((a) => a.length === 0),
      existingLocal,
      missingLocal,
      risk,
      recommendation,
      wouldFailIfAppliedOnKnownRender: wouldFailIfApplied,
    };
  });

  const summary = {
    localDatabase: dbName,
    migrationCount: report.length,
    critical: report.filter((r) => r.risk === "CRITICAL").map((r) => r.file),
    high: report.filter((r) => r.risk === "HIGH").map((r) => r.file),
    note:
      "Render live catalog was NOT queried this run (no session DB_*). " +
      "Render inferences use user-confirmed tables + AAROGYA_BOOTSTRAP_FINAL.sql overlap.",
  };

  fs.writeFileSync(outJson, JSON.stringify({ summary, report }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  for (const r of report) {
    console.log(
      [
        r.file,
        `risk=${r.risk}`,
        `rec=${r.recommendation}`,
        `tables=${r.creates.join(",") || "-"}`,
        `renderHit=${r.renderUserConfirmedTables.join(",") || "-"}`,
        `bootTables=${r.bootstrapContainsTables.length}/${r.creates.length}`,
      ].join(" | ")
    );
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
