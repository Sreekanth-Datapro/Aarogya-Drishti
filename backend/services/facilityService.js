const crypto = require("crypto");
const pool = require("../db");
const HttpError = require("../utils/httpError");
const { CATEGORIES, HOSPITAL_CATEGORIES } = require("../utils/facilityCategories");
const { audit } = require("../utils/audit");

// ==========================================
// FACILITY MANAGEMENT
// Facilities live in mst_facilities. PHCs also need a row in mst_phcs and
// hospitals a row in mst_hospitals (used by patients and referrals); this
// service keeps those linked rows in step, always inside one transaction.
// ==========================================

// category (shown in the app) -> facility_type (database) + linked table
// Everything the list and details pages show, with location names
const SELECT_FACILITY = `
  SELECT f.id, f.code, f.name_en, f.name_te, f.category, f.facility_type, f.is_active,
         f.district_id, d.name_en AS district_name, d.name_te AS district_name_te,
         f.mandal_id,   m.name_en AS mandal_name,   m.name_te AS mandal_name_te,
         f.village_id,  v.name_en AS village_name,  v.name_te AS village_name_te,
         f.address, f.pin_code, f.contact_phone, f.email, f.incharge_name,
         f.created_at, f.updated_at,
         (SELECT COUNT(*) FROM tbl_patients p
           WHERE p.registered_facility_id = f.id AND p.deleted_at IS NULL)::int AS patient_count,
         (SELECT COUNT(DISTINCT ufa.user_id) FROM tbl_user_facility_assignments ufa
            JOIN tbl_users su ON su.id = ufa.user_id AND su.deleted_at IS NULL
           WHERE ufa.facility_id = f.id
             AND ufa.valid_from <= CURRENT_DATE
             AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE))::int AS staff_count
    FROM mst_facilities f
    JOIN mst_districts d ON d.id = f.district_id
    LEFT JOIN mst_mandals m ON m.id = f.mandal_id
    LEFT JOIN mst_villages v ON v.id = f.village_id`;

function toFacility(row) {
  return {
    ...row,
    id: Number(row.id),
    district_id: Number(row.district_id),
    mandal_id: row.mandal_id ? Number(row.mandal_id) : null,
    village_id: row.village_id ? Number(row.village_id) : null,
  };
}

// Code for the linked mst_phcs / mst_hospitals row (never shown to users)
function internalCode() {
  return `AD_${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

// The mandal must be in the district and the village in the mandal
async function checkLocation(client, { district_id: districtId, mandal_id: mandalId, village_id: villageId }) {
  const { rows } = await client.query(
    `SELECT d.id AS district_id, d.is_active AS district_active,
            m.id AS mandal_id, m.district_id AS mandal_district, m.is_active AS mandal_active,
            v.id AS village_id, v.mandal_id AS village_mandal, v.is_active AS village_active
       FROM (SELECT $1::bigint AS d_id, $2::bigint AS m_id, $3::bigint AS v_id) input
       LEFT JOIN mst_districts d ON d.id = input.d_id
       LEFT JOIN mst_mandals   m ON m.id = input.m_id
       LEFT JOIN mst_villages  v ON v.id = input.v_id`,
    [districtId, mandalId, villageId]
  );
  const row = rows[0];

  if (!row.district_id || !row.district_active) throw new HttpError(400, "Select a valid district", "INVALID_LOCATION");
  if (!row.mandal_id || !row.mandal_active) throw new HttpError(400, "Select a valid mandal", "INVALID_LOCATION");
  if (!row.village_id || !row.village_active) throw new HttpError(400, "Select a valid village", "INVALID_LOCATION");

  if (String(row.mandal_district) !== String(districtId)) {
    throw new HttpError(400, "The selected mandal does not belong to the selected district", "INVALID_LOCATION");
  }
  if (String(row.village_mandal) !== String(mandalId)) {
    throw new HttpError(400, "The selected village does not belong to the selected mandal", "INVALID_LOCATION");
  }
}

// Turns database errors into messages the admin can act on
function friendlyError(error) {
  if (error.code === "23505" && /code/.test(error.constraint || error.detail || "")) {
    return new HttpError(409, "A facility with this code already exists", "DUPLICATE_CODE");
  }
  if (error.code === "23505") return new HttpError(409, "This facility already exists", "DUPLICATE");
  return error;
}

// ---------- read ----------

async function summary(districtId = null) {
  const params = districtId ? [districtId] : [];
  const where = districtId ? "WHERE f.district_id = $1" : "";
  const { rows } = await pool.query(
    `SELECT COUNT(*)                                             AS total,
            COUNT(*) FILTER (WHERE is_active)                    AS active,
            COUNT(*) FILTER (WHERE NOT is_active)                AS inactive,
            COUNT(*) FILTER (WHERE category = 'PHC')             AS phc,
            COUNT(*) FILTER (WHERE category = 'CHC')             AS chc,
            COUNT(*) FILTER (WHERE category IN ('DISTRICT_HOSPITAL', 'AREA_HOSPITAL', 'MEDICAL_COLLEGE')) AS hospital
       FROM mst_facilities f
       ${where}`,
    params
  );
  const counts = {};
  Object.entries(rows[0]).forEach(([key, value]) => { counts[key] = Number(value); });
  return counts;
}

// filters: { search, district_id, mandal_id, village_id, category, status, page, page_size }
async function list(filters, districtId = null) {
  const where = [];
  const params = [];
  // Adds a value to the query parameters and returns its placeholder ($1, $2, ...)
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.search) {
    const text = param(`%${filters.search}%`);
    where.push(`(f.name_en ILIKE ${text} OR f.name_te ILIKE ${text} OR f.code ILIKE ${text})`);
  }
  if (districtId) {
    where.push(`f.district_id = ${param(districtId)}`);
  } else if (filters.district_id) {
    where.push(`f.district_id = ${param(filters.district_id)}`);
  }
  if (filters.mandal_id) where.push(`f.mandal_id = ${param(filters.mandal_id)}`);
  if (filters.village_id) where.push(`f.village_id = ${param(filters.village_id)}`);
  if (filters.category) where.push(`f.category = ${param(filters.category)}`);
  if (filters.status === "active") where.push("f.is_active = TRUE");
  if (filters.status === "inactive") where.push("f.is_active = FALSE");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM mst_facilities f ${whereSql}`, params);

  const pageSize = filters.page_size;
  const offset = (filters.page - 1) * pageSize;
  const { rows } = await pool.query(
    `${SELECT_FACILITY} ${whereSql}
      ORDER BY f.is_active DESC, f.name_en
      LIMIT ${param(pageSize)} OFFSET ${param(offset)}`,
    params
  );

  return {
    facilities: rows.map(toFacility),
    total: Number(countResult.rows[0].total),
    page: filters.page,
    page_size: pageSize,
  };
}

async function getById(id, client = pool, districtId = null) {
  const params = districtId ? [id, districtId] : [id];
  const districtWhere = districtId ? "AND f.district_id = $2" : "";
  const { rows } = await client.query(`${SELECT_FACILITY} WHERE f.id = $1 ${districtWhere}`, params);
  if (!rows.length) throw new HttpError(404, "Facility not found", "NOT_FOUND");
  const facility = toFacility(rows[0]);

  const staffResult = await client.query(
    `SELECT u.id, u.username, u.full_name, r.code AS role_name,
            ufa.is_primary, ufa.valid_from, ufa.valid_to
       FROM tbl_user_facility_assignments ufa
       JOIN tbl_users u ON u.id = ufa.user_id
       JOIN mst_roles r ON r.id = u.role_id
      WHERE ufa.facility_id = $1
        AND u.deleted_at IS NULL
        AND u.status = 'ACTIVE'
        AND ufa.valid_from <= CURRENT_DATE
        AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)
      ORDER BY ufa.is_primary DESC, u.full_name, u.username`,
    [id]
  );
  facility.assigned_staff = staffResult.rows.map((row) => ({
    ...row,
    is_primary: Boolean(row.is_primary),
  }));
  return facility;
}

// ---------- write ----------

async function create(input, districtId = null, req) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const trustedInput = districtId
      ? { ...input, district_id: districtId }
      : input;
    await checkLocation(client, trustedInput);

    const config = CATEGORIES[input.category];
    let phcId = null;
    let hospitalId = null;

    // Linked rows used elsewhere in the system (patients, referrals)
    if (config.parent === "phc") {
      const phc = await client.query(
        `INSERT INTO mst_phcs (mandal_id, code, name_en, name_te) VALUES ($1, $2, $3, $4) RETURNING id`,
        [trustedInput.mandal_id, internalCode(), trustedInput.name_en, trustedInput.name_te || null]
      );
      phcId = phc.rows[0].id;
    } else if (config.parent === "hospital") {
      const hospital = await client.query(
        `INSERT INTO mst_hospitals (district_id, code, name_en, name_te, level) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [trustedInput.district_id, internalCode(), trustedInput.name_en, trustedInput.name_te || null, config.level]
      );
      hospitalId = hospital.rows[0].id;
    }

    const { rows } = await client.query(
      `INSERT INTO mst_facilities
         (code, name_en, name_te, category, facility_type, phc_id, hospital_id,
          district_id, mandal_id, village_id, address, pin_code, contact_phone, email, incharge_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
      [trustedInput.code || null, trustedInput.name_en, trustedInput.name_te || null, trustedInput.category, config.facilityType, phcId, hospitalId,
        trustedInput.district_id, trustedInput.mandal_id, trustedInput.village_id, trustedInput.address || null, trustedInput.pin_code || null,
        trustedInput.contact_phone || null, trustedInput.email || null, trustedInput.incharge_name || null, trustedInput.is_active !== false]
    );

    const facility = await getById(rows[0].id, client, districtId);
    await audit(req, {
      client,
      required: true,
      event: "FACILITY_CREATED",
      resourceType: "facility",
      resourceId: facility.id,
      metadata: { name: facility.name_en, category: facility.category, village: facility.village_id },
    });
    await client.query("COMMIT");
    return facility;
  } catch (error) {
    await client.query("ROLLBACK");
    throw friendlyError(error);
  } finally {
    client.release();
  }
}

async function update(id, input, districtId = null, req) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentParams = districtId ? [id, districtId] : [id];
    const districtWhere = districtId ? "AND district_id = $2" : "";
    const current = await client.query(
      `SELECT id, code, name_en, name_te, category, facility_type, phc_id, hospital_id,
              district_id, mandal_id, village_id, address, pin_code, contact_phone, email, incharge_name
         FROM mst_facilities
        WHERE id = $1 ${districtWhere}
        FOR UPDATE`,
      currentParams
    );
    if (!current.rows.length) throw new HttpError(404, "Facility not found", "NOT_FOUND");
    const existing = current.rows[0];

    const trustedInput = districtId
      ? { ...input, district_id: districtId }
      : input;

    // Switching e.g. a PHC into a hospital would break its linked records
    const newConfig = CATEGORIES[trustedInput.category];
    if (newConfig.facilityType !== existing.facility_type) {
      throw new HttpError(
        400,
        "This facility type cannot be changed to that type. Hospital types can be switched among themselves; otherwise create a new facility.",
        "TYPE_CHANGE_NOT_ALLOWED"
      );
    }

    await checkLocation(client, trustedInput);

    await client.query(
      `UPDATE mst_facilities
          SET code = $1, name_en = $2, name_te = $3, category = $4,
              district_id = $5, mandal_id = $6, village_id = $7,
              address = $8, pin_code = $9, contact_phone = $10, email = $11, incharge_name = $12
        WHERE id = $13${districtId ? " AND district_id = $14" : ""}`,
      districtId
        ? [trustedInput.code || null, trustedInput.name_en, trustedInput.name_te || null, trustedInput.category,
        trustedInput.district_id, trustedInput.mandal_id, trustedInput.village_id, trustedInput.address || null, trustedInput.pin_code || null,
        trustedInput.contact_phone || null, trustedInput.email || null, trustedInput.incharge_name || null, id, districtId]
        : [trustedInput.code || null, trustedInput.name_en, trustedInput.name_te || null, trustedInput.category,
        trustedInput.district_id, trustedInput.mandal_id, trustedInput.village_id, trustedInput.address || null, trustedInput.pin_code || null,
        trustedInput.contact_phone || null, trustedInput.email || null, trustedInput.incharge_name || null, id]
    );

    // Keep the linked PHC / hospital row in step (same id, new details)
    if (existing.phc_id) {
      await client.query(
        "UPDATE mst_phcs SET name_en = $1, name_te = $2, mandal_id = $3 WHERE id = $4",
        [trustedInput.name_en, trustedInput.name_te || null, trustedInput.mandal_id, existing.phc_id]
      );
    }
    if (existing.hospital_id) {
      await client.query(
        "UPDATE mst_hospitals SET name_en = $1, name_te = $2, district_id = $3, level = $4 WHERE id = $5",
        [trustedInput.name_en, trustedInput.name_te || null, trustedInput.district_id, newConfig.level, existing.hospital_id]
      );
    }

    const facility = await getById(id, client, districtId);
    const changed = Object.keys(input).filter((key) => String(existing[key] ?? "") !== String(facility[key] ?? ""));
    await audit(req, {
      client,
      required: true,
      event: "FACILITY_UPDATED",
      resourceType: "facility",
      resourceId: facility.id,
      metadata: { changed: changed.join(",") || "none" },
    });
    await client.query("COMMIT");
    return facility;
  } catch (error) {
    await client.query("ROLLBACK");
    throw friendlyError(error);
  } finally {
    client.release();
  }
}

// Facilities are never deleted, only switched on or off
async function setStatus(id, isActive, districtId = null, req) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params = districtId ? [isActive, id, districtId] : [isActive, id];
    const districtWhere = districtId ? "AND district_id = $3" : "";
    const { rows } = await client.query(
      `UPDATE mst_facilities SET is_active = $1
        WHERE id = $2 ${districtWhere}
        RETURNING phc_id, hospital_id`,
      params
    );
    if (!rows.length) throw new HttpError(404, "Facility not found", "NOT_FOUND");

    if (rows[0].phc_id) await client.query("UPDATE mst_phcs SET is_active = $1 WHERE id = $2", [isActive, rows[0].phc_id]);
    if (rows[0].hospital_id) {
      await client.query("UPDATE mst_hospitals SET is_active = $1 WHERE id = $2", [isActive, rows[0].hospital_id]);
    }

    const facility = await getById(id, client, districtId);
    await audit(req, {
      client,
      required: true,
      event: "FACILITY_STATUS_CHANGED",
      resourceType: "facility",
      resourceId: facility.id,
      metadata: { active: facility.is_active },
    });
    await client.query("COMMIT");
    return facility;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { CATEGORIES, HOSPITAL_CATEGORIES, summary, list, getById, create, update, setStatus };
