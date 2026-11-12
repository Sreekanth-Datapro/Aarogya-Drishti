const pool = require("../db");

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function dateValue(value, fallback) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? fallback : value;
}

function addFilters(params, where, field, value) {
  if (value) {
    params.push(value);
    where.push(`${field} = $${params.length}`);
  }
}

exports.analytics = async (req, res, next) => {
  try {
    const districtId = positiveId(req.query.district_id);
    const facilityId = positiveId(req.query.facility_id);
    const dateFrom = dateValue(req.query.date_from, null);
    const dateTo = dateValue(req.query.date_to, null);

    const userParams = [];
    const userWhere = ["u.deleted_at IS NULL"];
    addFilters(userParams, userWhere, "u.district_id", districtId);
    if (facilityId) {
      userParams.push(facilityId);
      userWhere.push(`EXISTS (
        SELECT 1 FROM tbl_user_facility_assignments ufa
        WHERE ufa.user_id = u.id AND ufa.facility_id = $${userParams.length}
      )`);
    }
    if (dateFrom) {
      userParams.push(dateFrom);
      userWhere.push(`u.created_at >= $${userParams.length}::date`);
    }
    if (dateTo) {
      userParams.push(dateTo);
      userWhere.push(`u.created_at < ($${userParams.length}::date + interval '1 day')`);
    }

    let facilityQuery = `
      SELECT d.id AS district_id, d.name_en AS district_name, d.name_te AS district_name_te,
             COUNT(f.id) AS total,
             COUNT(f.id) FILTER (WHERE f.is_active) AS active
        FROM mst_districts d
        LEFT JOIN mst_facilities f ON f.district_id = d.id
       WHERE d.is_active = TRUE`;
    const facilityParams = [];
    if (districtId) {
      facilityParams.push(districtId);
      facilityQuery += ` AND d.id = $${facilityParams.length}`;
    }
    if (facilityId) {
      facilityParams.push(facilityId);
      facilityQuery += ` AND f.id = $${facilityParams.length}`;
    }
    facilityQuery += " GROUP BY d.id, d.name_en, d.name_te ORDER BY d.name_en";

    let registrationQuery = `
      SELECT COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending,
             COUNT(*) FILTER (WHERE r.status = 'APPROVED') AS approved,
             COUNT(*) FILTER (WHERE r.status = 'REJECTED') AS rejected,
             COUNT(*) AS total
        FROM tbl_user_registration_requests r
        JOIN mst_facilities f ON f.id = r.facility_id
       WHERE 1=1`;
    const registrationParams = [];
    if (dateFrom) {
      registrationParams.push(dateFrom);
      registrationQuery += ` AND r.created_at >= $${registrationParams.length}::date`;
    }
    if (dateTo) {
      registrationParams.push(dateTo);
      registrationQuery += ` AND r.created_at < ($${registrationParams.length}::date + interval '1 day')`;
    }
    if (districtId) {
      registrationParams.push(districtId);
      registrationQuery += ` AND f.district_id = $${registrationParams.length}`;
    }
    if (facilityId) {
      registrationParams.push(facilityId);
      registrationQuery += ` AND f.id = $${registrationParams.length}`;
    }

    let designationQuery = `
      SELECT r.designation, COUNT(*) AS total
        FROM tbl_user_registration_requests r
        JOIN mst_facilities f ON f.id = r.facility_id
       WHERE r.requested_role = 'HEALTH_WORKER'`;
    const designationParams = [];
    if (dateFrom) {
      designationParams.push(dateFrom);
      designationQuery += ` AND r.created_at >= $${designationParams.length}::date`;
    }
    if (dateTo) {
      designationParams.push(dateTo);
      designationQuery += ` AND r.created_at < ($${designationParams.length}::date + interval '1 day')`;
    }
    if (districtId) {
      designationParams.push(districtId);
      designationQuery += ` AND f.district_id = $${designationParams.length}`;
    }
    if (facilityId) {
      designationParams.push(facilityId);
      designationQuery += ` AND f.id = $${designationParams.length}`;
    }
    designationQuery += " GROUP BY r.designation ORDER BY r.designation";

    const [summary, roleStats, facilityStats, registrationStats, designationStats, setupStats, deliveryStats, monthly, filters] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE u.status = 'ACTIVE') AS active
             FROM tbl_users u
            WHERE ${userWhere.join(" AND ")}`,
          userParams
        ),
        pool.query(
          `SELECT r.code AS role, COUNT(u.id) AS total
             FROM mst_roles r
             LEFT JOIN tbl_users u ON u.role_id = r.id AND ${userWhere.join(" AND ")}
            GROUP BY r.id, r.code
            ORDER BY r.code`,
          userParams
        ),
        pool.query(facilityQuery, facilityParams),
        pool.query(registrationQuery, registrationParams),
        pool.query(designationQuery, designationParams),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE u.status = 'PENDING_SETUP') AS pending_setup,
                  COUNT(*) FILTER (WHERE u.status = 'ACTIVE') AS completed,
                  COUNT(*) AS total
             FROM tbl_users u
             JOIN mst_roles r ON r.id = u.role_id
            WHERE r.code = 'DISTRICT_ADMIN' AND ${userWhere.join(" AND ")}`,
          userParams
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE t.email_delivery_status = 'SENT') AS email_sent,
                  COUNT(*) FILTER (WHERE t.email_delivery_status = 'FAILED') AS email_failed,
                  COUNT(*) FILTER (WHERE t.sms_delivery_status = 'SENT') AS sms_sent,
                  COUNT(*) FILTER (WHERE t.sms_delivery_status = 'FAILED') AS sms_failed
             FROM tbl_district_admin_setup_tokens t
             JOIN tbl_users u ON u.id = t.user_id
            WHERE ${userWhere.join(" AND ")}`,
          userParams
        ),
        pool.query(
          `SELECT to_char(month_start, 'Mon') AS month,
                  to_char(month_start, 'YYYY-MM') AS month_key,
                  (SELECT COUNT(*) FROM tbl_user_registration_requests r WHERE date_trunc('month', r.created_at) = month_start) AS registrations,
                  (SELECT COUNT(*) FROM tbl_users u WHERE date_trunc('month', u.created_at) = month_start AND u.deleted_at IS NULL) AS users,
                  (SELECT COUNT(*) FROM mst_facilities f WHERE date_trunc('month', f.created_at) = month_start) AS facilities
             FROM generate_series(date_trunc('month', NOW() - interval '5 months'), date_trunc('month', NOW()), interval '1 month') month_start
            ORDER BY month_start`
        ),
        Promise.all([
          pool.query("SELECT id, name_en, name_te FROM mst_districts WHERE is_active = TRUE ORDER BY name_en"),
          pool.query("SELECT id, name_en, name_te, district_id FROM mst_facilities WHERE is_active = TRUE ORDER BY name_en"),
        ]),
      ]);

    res.json({
      success: true,
      total_users: Number(summary.rows[0].total),
      active_users: Number(summary.rows[0].active),
      users_by_role: roleStats.rows.map((row) => ({ role: row.role, total: Number(row.total) })),
      district_facilities: facilityStats.rows.map((row) => ({
        district_id: Number(row.district_id),
        district_name: row.district_name,
        district_name_te: row.district_name_te,
        total: Number(row.total),
        active: Number(row.active),
      })),
      registration: {
        designation: designationStats.rows.map((row) => ({
          designation: row.designation,
          total: Number(row.total),
        })),
        total: Number(registrationStats.rows[0].total),
        pending: Number(registrationStats.rows[0].pending),
        approved: Number(registrationStats.rows[0].approved),
        rejected: Number(registrationStats.rows[0].rejected),
      },
      account_setup: {
        pending_setup: Number(setupStats.rows[0].pending_setup),
        completed: Number(setupStats.rows[0].completed),
        total: Number(setupStats.rows[0].total),
      },
      delivery: {
        email_sent: Number(deliveryStats.rows[0].email_sent),
        email_failed: Number(deliveryStats.rows[0].email_failed),
        sms_sent: Number(deliveryStats.rows[0].sms_sent),
        sms_failed: Number(deliveryStats.rows[0].sms_failed),
      },
      monthly_activity: monthly.rows.map((row) => ({
        month: row.month,
        month_key: row.month_key,
        registrations: Number(row.registrations),
        users: Number(row.users),
        facilities: Number(row.facilities),
      })),
      filters: {
        districts: filters[0].rows,
        facilities: filters[1].rows.map((row) => ({
          id: Number(row.id),
          name_en: row.name_en,
          name_te: row.name_te,
          district_id: Number(row.district_id),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
