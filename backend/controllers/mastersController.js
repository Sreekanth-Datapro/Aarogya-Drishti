const pool = require("../db");
const { resolveAuthorizedDistrict } = require("../utils/districtAuthorization");

// ==========================================
// REGISTRATION FORM OPTIONS (public)
// Only non-sensitive master data is returned
// ==========================================

exports.registrationOptions = async (req, res, next) => {
  try {
    const [districts, facilities, mandals, villages, languages] = await Promise.all([
      pool.query(
        `SELECT id, name_en, name_te
         FROM mst_districts
         WHERE is_active = TRUE
         ORDER BY name_en`
      ),
      pool.query(
        `SELECT id, code, name_en, name_te, facility_type, district_id, mandal_id
         FROM mst_facilities
         WHERE is_active = TRUE
         AND facility_type IN ('PHC', 'SCREENING_SITE')
         ORDER BY name_en`
      ),
      pool.query(
        `SELECT id, code, name_en, name_te, district_id
         FROM mst_mandals
         WHERE is_active = TRUE
         ORDER BY name_en`
      ),
      pool.query(
        `SELECT v.id, v.code, v.name_en, v.name_te, v.mandal_id, v.lgd_code
         FROM mst_villages v
         WHERE v.is_active = TRUE
         ORDER BY v.name_en`
      ),
      pool.query(
        `SELECT id, code, name_en, native_name
         FROM mst_languages
         WHERE is_active = TRUE
         ORDER BY id`
      ),
    ]);

    return res.status(200).json({
      success: true,
      districts: districts.rows,
      facilities: facilities.rows,
      mandals: mandals.rows,
      villages: villages.rows,
      languages: languages.rows,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// LOCATION LISTS FOR ADMIN FORMS (signed in, master.view)
// District -> its mandals -> its villages. Active records only.
// ==========================================

exports.districts = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    const params = districtId ? [districtId] : [];
    const where = districtId ? "AND id = $1" : "";
    const { rows } = await pool.query(
      `SELECT id, name_en, name_te
         FROM mst_districts
        WHERE is_active = TRUE ${where}
        ORDER BY name_en`
      , params
    );
    res.json({ success: true, districts: rows });
  } catch (error) {
    next(error);
  }
};

exports.mandals = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    const authorizedDistrictId = districtId || req.validatedQuery.district_id;
    const { rows } = await pool.query(
      `SELECT id, district_id, name_en, name_te
         FROM mst_mandals
        WHERE is_active = TRUE AND district_id = $1
        ORDER BY name_en`,
      [authorizedDistrictId]
    );
    res.json({ success: true, mandals: rows });
  } catch (error) {
    next(error);
  }
};

exports.villages = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    let mandalId = req.validatedQuery.mandal_id;
    if (districtId) {
      const mandal = await pool.query(
        `SELECT id FROM mst_mandals
          WHERE id = $1 AND district_id = $2 AND is_active = TRUE`,
        [mandalId, districtId]
      );
      if (!mandal.rows.length) {
        return res.json({ success: true, villages: [] });
      }
    }
    const { rows } = await pool.query(
      `SELECT id, mandal_id, name_en, name_te, lgd_code
         FROM mst_villages
        WHERE is_active = TRUE AND mandal_id = $1
        ORDER BY name_en`,
      [req.validatedQuery.mandal_id]
    );
    res.json({ success: true, villages: rows });
  } catch (error) {
    next(error);
  }
};
