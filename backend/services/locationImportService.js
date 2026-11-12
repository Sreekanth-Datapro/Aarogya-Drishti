const pool = require("../db");
const lgd = require("./lgdClient");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");

// ==========================================
// LOCATION IMPORT
// 1. preview: fetch from LGD and compare with our tables (read only)
// 2. import:  fetch again, compare again, then save only the rows the
//             administrator selected - inside one transaction
// Existing ids are never changed and rows marked is_verified are never touched.
// ==========================================

// Fixed list of tables (never built from user input)
const LEVELS = {
  district: { table: "mst_districts", parentColumn: null, codePrefix: "LGD_D_", batchLevel: "DISTRICT" },
  mandal: { table: "mst_mandals", parentColumn: "district_id", codePrefix: "LGD_SD_", batchLevel: "MANDAL" },
  village: { table: "mst_villages", parentColumn: "mandal_id", codePrefix: "LGD_V_", batchLevel: "VILLAGE" },
};

// Actions that change the database when selected
const IMPORTABLE = ["new", "update", "link"];

const IMPORT_LOCK_KEY = 4821518;

// "G. Madugula" and "G.Madugula" count as the same name
function looseName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Finds what we are importing into: a state (for districts), a district (for mandals)
// or a mandal (for villages). The parent must already carry an LGD code.
async function loadParent(level, { stateCode, parentId }, client = pool) {
  if (level === "district") {
    const { rows } = await lgd.getStates();
    const state = rows.find((row) => row.lgd_code === Number(stateCode));
    if (!state) throw new HttpError(404, "State not found in LGD", "NOT_FOUND");
    return { id: null, lgd_code: state.lgd_code, name_en: state.name_en };
  }

  const parentTable = level === "mandal" ? "mst_districts" : "mst_mandals";
  const { rows } = await client.query(
    `SELECT id, lgd_code, name_en FROM ${parentTable} WHERE id = $1`,
    [parentId]
  );

  if (!rows.length) throw new HttpError(404, "Selected parent location was not found", "NOT_FOUND");
  if (!rows[0].lgd_code) {
    throw new HttpError(
      409,
      `"${rows[0].name_en}" has no LGD code yet. Import or link it first.`,
      "PARENT_NOT_LINKED"
    );
  }

  return rows[0];
}

async function fetchFromLgd(level, parent) {
  if (level === "district") return lgd.getDistricts(parent.lgd_code);
  if (level === "mandal") return lgd.getSubDistricts(parent.lgd_code);
  return lgd.getVillages(parent.lgd_code);
}

// Our rows that could match: same LGD code anywhere, or rows under the same parent
async function loadExisting(level, parent, lgdCodes, client = pool) {
  const { table, parentColumn } = LEVELS[level];

  if (level === "district") {
    const { rows } = await client.query(
      `SELECT id, code, name_en, name_te, lgd_code, is_verified, data_source, NULL::bigint AS parent_id
         FROM mst_districts
        WHERE lgd_code = ANY($1::int[])
           OR state_lgd_code = $2
           OR (lgd_code IS NULL AND lower(state_name) = lower($3))`,
      [lgdCodes, parent.lgd_code, parent.name_en]
    );
    return rows;
  }

  const { rows } = await client.query(
    `SELECT id, code, name_en, name_te, lgd_code, is_verified, data_source, ${parentColumn} AS parent_id
       FROM ${table}
      WHERE lgd_code = ANY($1::int[]) OR ${parentColumn} = $2`,
    [lgdCodes, parent.id]
  );
  return rows;
}

// Decides one action per LGD row
function planRows(level, lgdRows, existingRows, parent) {
  const byCode = new Map(existingRows.filter((r) => r.lgd_code).map((r) => [Number(r.lgd_code), r]));
  const sameParent = (row) => level === "district" || String(row.parent_id) === String(parent.id);
  const claimed = new Set();

  const rows = lgdRows.map((item) => {
    const match = byCode.get(item.lgd_code);
    let action;
    let existing = match || null;

    if (match) {
      claimed.add(match.id);
      if (!sameParent(match)) action = "conflict";
      else if (match.is_verified) action = "protected";
      else if (match.name_en !== item.name_en) action = "update";
      else action = "unchanged";
    } else {
      // A record typed in by hand (no LGD code) with the same name under the same parent
      const nameMatch = existingRows.find(
        (row) => !row.lgd_code && sameParent(row) && !claimed.has(row.id) && looseName(row.name_en) === looseName(item.name_en)
      );

      if (nameMatch) {
        claimed.add(nameMatch.id);
        existing = nameMatch;
        action = nameMatch.is_verified ? "protected" : "link";
      } else {
        action = "new";
      }
    }

    return {
      ...item,
      action,
      existing: existing && {
        id: Number(existing.id),
        code: existing.code,
        name_en: existing.name_en,
        is_verified: existing.is_verified,
        data_source: existing.data_source,
      },
    };
  });

  // Our records under this parent that LGD does not list (kept as they are)
  const onlyInAarogya = existingRows
    .filter((row) => sameParent(row) && !claimed.has(row.id))
    .map((row) => ({ id: Number(row.id), code: row.code, name_en: row.name_en, lgd_code: row.lgd_code, is_verified: row.is_verified }));

  const counts = { new: 0, update: 0, link: 0, unchanged: 0, protected: 0, conflict: 0 };
  rows.forEach((row) => { counts[row.action] += 1; });

  return { rows, counts, onlyInAarogya };
}

async function buildPreview(level, scope, client = pool) {
  const parent = await loadParent(level, scope, client);
  const fetched = await fetchFromLgd(level, parent);
  const existing = await loadExisting(level, parent, fetched.rows.map((r) => r.lgd_code), client);
  const plan = planRows(level, fetched.rows, existing, parent);

  return {
    level,
    source: "LGD",
    source_url: fetched.sourceUrl,
    fetched_at: new Date().toISOString(),
    parent: { id: parent.id ? Number(parent.id) : null, lgd_code: parent.lgd_code, name_en: parent.name_en },
    ...plan,
  };
}

async function insertRow(client, level, row, parent, batchId) {
  const { codePrefix } = LEVELS[level];
  const code = `${codePrefix}${row.lgd_code}`;

  if (level === "district") {
    await client.query(
      `INSERT INTO mst_districts
         (code, name_en, name_te, state_name, lgd_code, state_lgd_code, data_source, lgd_synced_at, import_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'LGD', now(), $7)`,
      [code, row.name_en, row.name_te, parent.name_en, row.lgd_code, parent.lgd_code, batchId]
    );
  } else if (level === "mandal") {
    await client.query(
      `INSERT INTO mst_mandals
         (district_id, code, name_en, name_te, lgd_code, data_source, lgd_synced_at, import_batch_id)
       VALUES ($1, $2, $3, $4, $5, 'LGD', now(), $6)`,
      [parent.id, code, row.name_en, row.name_te, row.lgd_code, batchId]
    );
  } else {
    await client.query(
      `INSERT INTO mst_villages
         (mandal_id, code, name_en, name_te, lgd_code, data_source, lgd_synced_at, import_batch_id)
       VALUES ($1, $2, $3, $4, $5, 'LGD', now(), $6)`,
      [parent.id, code, row.name_en, row.name_te, row.lgd_code, batchId]
    );
  }
}

// Name changed in LGD: update the English name, fill the Telugu name only if empty
async function updateRow(client, level, row, batchId) {
  const { table } = LEVELS[level];
  const result = await client.query(
    `UPDATE ${table}
        SET name_en = $1, name_te = COALESCE(name_te, $2), lgd_synced_at = now(), import_batch_id = $3
      WHERE id = $4 AND is_verified = FALSE`,
    [row.name_en, row.name_te, batchId, row.existing.id]
  );
  return result.rowCount;
}

// Same place entered by hand: only attach the LGD code, keep id, code and name
async function linkRow(client, level, row, batchId) {
  const { table } = LEVELS[level];
  const extra = level === "district" ? ", state_lgd_code = COALESCE(state_lgd_code, $4)" : "";
  const params = [row.lgd_code, batchId, row.existing.id];
  if (level === "district") params.push(row.state_lgd_code);

  const result = await client.query(
    `UPDATE ${table}
        SET lgd_code = $1, lgd_synced_at = now(), import_batch_id = $2${extra}
      WHERE id = $3 AND is_verified = FALSE AND lgd_code IS NULL`,
    params
  );
  return result.rowCount;
}

async function runImport(level, scope, selectedCodes, req) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // One import at a time, so two admins cannot insert the same LGD code together
    await client.query("SELECT pg_advisory_xact_lock($1)", [IMPORT_LOCK_KEY]);

    const preview = await buildPreview(level, scope, client);
    const selected = new Set(selectedCodes.map(Number));
    const toApply = preview.rows.filter((row) => selected.has(row.lgd_code) && IMPORTABLE.includes(row.action));

    const batch = await client.query(
      `INSERT INTO tbl_location_import_batches
         (level, source, source_url, parent_lgd_code, parent_name, fetched_count, selected_count, imported_by)
       VALUES ($1, 'LGD', $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [LEVELS[level].batchLevel, preview.source_url, preview.parent.lgd_code, preview.parent.name_en,
        preview.rows.length, selected.size, req.user.id]
    );
    const batchId = batch.rows[0].id;

    const counts = { inserted: 0, updated: 0, linked: 0 };
    const parent = { id: preview.parent.id, lgd_code: preview.parent.lgd_code, name_en: preview.parent.name_en };

    for (const row of toApply) {
      if (row.action === "new") {
        await insertRow(client, level, row, parent, batchId);
        counts.inserted += 1;
      } else if (row.action === "update") {
        counts.updated += await updateRow(client, level, row, batchId);
      } else {
        counts.linked += await linkRow(client, level, { ...row, state_lgd_code: parent.lgd_code }, batchId);
      }
    }

    const skipped = selected.size - (counts.inserted + counts.updated + counts.linked);

    await client.query(
      `UPDATE tbl_location_import_batches
          SET inserted_count = $1, updated_count = $2, linked_count = $3, skipped_count = $4
        WHERE id = $5`,
      [counts.inserted, counts.updated, counts.linked, skipped, batchId]
    );

    const result = { batch_id: Number(batchId), ...counts, skipped, parent: preview.parent, source_url: preview.source_url };
    await audit(req, {
      client,
      required: true,
      event: "LOCATION_IMPORT",
      resourceType: "location_import",
      resourceId: result.batch_id,
      metadata: {
        level,
        parent: result.parent.name_en,
        inserted: result.inserted,
        updated: result.updated,
        linked: result.linked,
        skipped: result.skipped,
      },
    });
    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new HttpError(409, "Some of these locations were added by someone else just now. Refresh the preview and try again.", "DUPLICATE");
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { LEVELS, IMPORTABLE, buildPreview, runImport, planRows, looseName };
