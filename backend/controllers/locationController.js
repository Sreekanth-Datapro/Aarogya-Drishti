const pool = require("../db");
const lgd = require("../services/lgdClient");
const { LEVELS, buildPreview, runImport } = require("../services/locationImportService");
const { audit } = require("../utils/audit");
const HttpError = require("../utils/httpError");

// ==========================================
// LOCATION MASTER DATA (SUPER_ADMIN only)
// ==========================================

// For level "mandal" the parent is a district, for "village" it is a mandal
function scopeFrom(input) {
  return { stateCode: input.state_code, parentId: input.parent_id };
}

function requireScope(level, scope) {
  if (level === "district" && !scope.stateCode) throw new HttpError(400, "Choose a state", "VALIDATION");
  if (level !== "district" && !scope.parentId) {
    throw new HttpError(400, level === "mandal" ? "Choose a district" : "Choose a mandal", "VALIDATION");
  }
}

// GET /api/locations/lgd/states
exports.lgdStates = async (req, res, next) => {
  try {
    const { rows } = await lgd.getStates();
    res.json({ success: true, states: rows });
  } catch (error) {
    next(error);
  }
};

// GET /api/locations/records?level=mandal&parent_id=1
// Our saved locations (for dropdowns and the "existing records" view)
exports.listRecords = async (req, res, next) => {
  try {
    const { level, parent_id: parentId } = req.validatedQuery;
    const { table, parentColumn } = LEVELS[level];

    const filter = parentColumn && parentId ? `WHERE ${parentColumn} = $1` : "";
    const params = parentColumn && parentId ? [parentId] : [];

    const { rows } = await pool.query(
      `SELECT id, code, name_en, name_te, lgd_code, data_source, is_verified, lgd_synced_at, is_active
         FROM ${table}
         ${filter}
        ORDER BY name_en`,
      params
    );

    res.json({ success: true, level, records: rows.map((row) => ({ ...row, id: Number(row.id) })) });
  } catch (error) {
    next(error);
  }
};

// GET /api/locations/preview?level=village&parent_id=2
// Fetches from LGD and compares - nothing is saved
exports.preview = async (req, res, next) => {
  try {
    const { level } = req.validatedQuery;
    const scope = scopeFrom(req.validatedQuery);
    requireScope(level, scope);

    const preview = await buildPreview(level, scope);
    res.json({ success: true, ...preview });
  } catch (error) {
    next(error);
  }
};

// POST /api/locations/import
// Body: { level, state_code | parent_id, lgd_codes: [...], confirm: true }
exports.importSelected = async (req, res, next) => {
  try {
    const { level, lgd_codes: lgdCodes } = req.body;
    const scope = scopeFrom(req.body);
    requireScope(level, scope);

    const result = await runImport(level, scope, lgdCodes, req);

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// POST /api/locations/manual
// Fallback when LGD is unavailable or a place is missing there.
// Records typed in by an administrator are marked verified, so imports never change them.
exports.addManual = async (req, res, next) => {
  try {
    const { level, parent_id: parentId, name_en: nameEn, name_te: nameTe, lgd_code: lgdCode, state_name: stateName } = req.body;
    const { table, parentColumn } = LEVELS[level];

    if (parentColumn && !parentId) {
      throw new HttpError(400, level === "mandal" ? "Choose a district" : "Choose a mandal", "VALIDATION");
    }

    const prefix = { district: "MAN_D_", mandal: "MAN_SD_", village: "MAN_V_" }[level];
    const code = `${prefix}${Date.now().toString(36).toUpperCase()}`;

    const columns = ["code", "name_en", "name_te", "lgd_code", "data_source", "is_verified"];
    const values = [code, nameEn, nameTe || null, lgdCode || null, "MANUAL", true];

    if (parentColumn) {
      columns.push(parentColumn);
      values.push(parentId);
    } else {
      columns.push("state_name");
      values.push(stateName || "Andhra Pradesh");
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const client = await pool.connect();
    let transactionStarted = false;
    let rows;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      ({ rows } = await client.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id, code, name_en`,
        values
      ));

      await audit(req, {
        client,
        required: true,
        event: "LOCATION_MANUAL_ADD",
        resourceType: table,
        resourceId: rows[0].id,
        metadata: { level, name: nameEn, lgd: lgdCode || null },
      });
      await client.query("COMMIT");
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({ success: true, record: { ...rows[0], id: Number(rows[0].id) } });
  } catch (error) {
    if (error.code === "23505") return next(new HttpError(409, "A location with this LGD code already exists", "DUPLICATE"));
    if (error.code === "23503") return next(new HttpError(400, "Selected parent location does not exist", "VALIDATION"));
    next(error);
  }
};

// PATCH /api/locations/records/:level/:id   Body: { is_verified: true | false }
// Verified records are protected from LGD imports
exports.setVerified = async (req, res, next) => {
  try {
    const { level, id } = req.params;
    const { table } = LEVELS[level];

    const client = await pool.connect();
    let transactionStarted = false;
    let rows;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      ({ rows } = await client.query(
        `UPDATE ${table} SET is_verified = $1 WHERE id = $2 RETURNING id, name_en, is_verified`,
        [req.body.is_verified, id]
      ));
      if (!rows.length) throw new HttpError(404, "Location not found", "NOT_FOUND");

      await audit(req, {
        client,
        required: true,
        event: "LOCATION_VERIFICATION_CHANGED",
        resourceType: table,
        resourceId: id,
        metadata: { level, verified: req.body.is_verified },
      });
      await client.query("COMMIT");
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ success: true, record: { ...rows[0], id: Number(rows[0].id) } });
  } catch (error) {
    next(error);
  }
};

// GET /api/locations/imports  - recent import history
exports.importHistory = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.level, b.source, b.source_url, b.parent_name, b.fetched_count, b.selected_count,
              b.inserted_count, b.updated_count, b.linked_count, b.skipped_count, b.imported_at,
              u.full_name AS imported_by_name
         FROM tbl_location_import_batches b
         JOIN tbl_users u ON u.id = b.imported_by
        ORDER BY b.imported_at DESC
        LIMIT 20`
    );

    res.json({ success: true, imports: rows.map((row) => ({ ...row, id: Number(row.id) })) });
  } catch (error) {
    next(error);
  }
};
