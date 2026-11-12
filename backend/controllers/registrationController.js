const crypto = require("crypto");
const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { resolveAuthorizedDistrict } = require("../utils/districtAuthorization");
const { hasTwoStageRegistrationSchema } = require("../utils/registrationWorkflowSchema");

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REMARKS_LENGTH = 1000;

function requireRequestId(req) {
  if (!UUID_PATTERN.test(String(req.params?.id || ""))) {
    throw new HttpError(400, "Invalid registration request", "INVALID_REGISTRATION");
  }
}

// permission: one code, or a list of codes of which the user needs at least one
function requireActor(req, role, permission) {
  const actualRole = req.user?.role_name || req.user?.role;
  const allowed = Array.isArray(permission) ? permission : [permission];
  if (!req.user?.id || actualRole !== role || !allowed.some((code) => req.user.permissions?.includes(code))) {
    throw new HttpError(403, "You are not authorized to access this resource", "FORBIDDEN");
  }
}

// Medical Officers review with registration.recommend (added by migration 015) or
// the existing registration.verify grant (migration 011) until 015 is applied.
const MO_REVIEW_PERMISSIONS = ["registration.recommend", "registration.verify"];

// Mandal scope: the request's Mandal is a current assignment of the signed-in, active MO ($1)
const MO_MANDAL_SCOPE = `EXISTS (
  SELECT 1
    FROM tbl_medical_officer_mandal_assignments a
    JOIN tbl_users u ON u.id = a.user_id
    JOIN mst_roles role ON role.id = u.role_id
    JOIN mst_mandals mandal ON mandal.id = a.mandal_id
   WHERE a.user_id = $1
     AND a.mandal_id = r.mandal_id
     AND a.valid_from <= CURRENT_DATE
     AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
     AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
     AND role.code = 'MEDICAL_OFFICER' AND role.is_active IS TRUE
     AND mandal.is_active IS TRUE
)`;

// Applicant and location columns shared by the queue and the details view
const QUEUE_COLUMNS = `
  r.id, r.full_name, r.username, r.phone, r.email, r.designation, r.employee_ref,
  r.status, r.created_at, r.workflow_version, r.mandal_id,
  d.name_en AS district_name, d.name_te AS district_name_te,
  f.name_en AS facility_name, f.name_te AS facility_name_te,
  m.name_en AS mandal_name, m.name_te AS mandal_name_te,
  v.name_en AS village_name, v.name_te AS village_name_te`;

const QUEUE_JOINS = `
  FROM tbl_user_registration_requests r
  JOIN mst_facilities f ON f.id = r.facility_id
  JOIN mst_mandals m ON m.id = r.mandal_id
  JOIN mst_districts d ON d.id = m.district_id
  JOIN mst_villages v ON v.id = r.village_id`;

// Recommendation columns exist only after migration 015
const RECOMMENDATION_COLUMNS = `,
  r.mo_recommended_by, r.mo_recommended_at, r.mo_recommendation, r.mo_recommendation_note,
  reviewer.full_name AS mo_reviewer_name`;
const NO_RECOMMENDATION_COLUMNS = `,
  NULL::uuid AS mo_recommended_by, NULL::timestamptz AS mo_recommended_at,
  NULL::text AS mo_recommendation, NULL::text AS mo_recommendation_note,
  NULL::text AS mo_reviewer_name`;

function workflowInfo(twoStage) {
  return { two_stage: twoStage, can_recommend: twoStage };
}

function hashStatusToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// GET /registrations/medical-officer?view=pending|all
// Pending requests of the MO's current Mandals. Both compatibility requests
// (workflow_version NULL) and two-stage requests (workflow_version 1) are listed.
// view=pending (default) hides requests that already have an MO recommendation.
async function listForMedicalOfficer(req, res, next) {
  try {
    requireActor(req, "MEDICAL_OFFICER", MO_REVIEW_PERMISSIONS);
    const twoStage = await hasTwoStageRegistrationSchema(pool);
    const showAll = req.query?.view === "all";
    const { rows } = await pool.query(
      `SELECT ${QUEUE_COLUMNS}${twoStage ? RECOMMENDATION_COLUMNS : NO_RECOMMENDATION_COLUMNS}
       ${QUEUE_JOINS}
       ${twoStage ? "LEFT JOIN tbl_users reviewer ON reviewer.id = r.mo_recommended_by" : ""}
        WHERE r.status = 'PENDING'
          AND (r.workflow_version IS NULL OR r.workflow_version = 1)
          AND ${MO_MANDAL_SCOPE}
          ${twoStage && !showAll ? "AND r.mo_recommended_by IS NULL" : ""}
        ORDER BY r.created_at ASC
        LIMIT 100`,
      [req.user.id]
    );
    res.json({ success: true, registrations: rows, workflow: workflowInfo(twoStage) });
  } catch (error) {
    next(error);
  }
}

// GET /registrations/medical-officer/requests/:id - one request of the MO's Mandals with its history
async function getForMedicalOfficer(req, res, next) {
  try {
    requireActor(req, "MEDICAL_OFFICER", MO_REVIEW_PERMISSIONS);
    requireRequestId(req);
    const twoStage = await hasTwoStageRegistrationSchema(pool);
    const { rows } = await pool.query(
      `SELECT ${QUEUE_COLUMNS}${twoStage ? RECOMMENDATION_COLUMNS : NO_RECOMMENDATION_COLUMNS},
              r.reviewed_at, r.rejection_reason, f.facility_type::text AS facility_type,
              lang.name_en AS language_name, lang.native_name AS language_native_name
       ${QUEUE_JOINS}
       LEFT JOIN mst_languages lang ON lang.id = r.language_id
       ${twoStage ? "LEFT JOIN tbl_users reviewer ON reviewer.id = r.mo_recommended_by" : ""}
        WHERE r.id = $2 AND ${MO_MANDAL_SCOPE}`,
      [req.user.id, req.params.id]
    );
    if (!rows.length) throw new HttpError(404, "Registration request not found", "REGISTRATION_NOT_FOUND");

    // Decision history from the append-only audit trail (no personal data in metadata)
    const history = await pool.query(
      `SELECT a.event, a.outcome, a.actor_role, a.occurred_at, u.full_name AS actor_name
         FROM tbl_audit_logs a
         LEFT JOIN tbl_users u ON u.id = a.actor_id
        WHERE a.resource_type = 'registration_request' AND a.resource_id = $1
        ORDER BY a.occurred_at ASC
        LIMIT 50`,
      [req.params.id]
    );
    res.json({
      success: true,
      registration: rows[0],
      history: history.rows,
      workflow: workflowInfo(twoStage),
    });
  } catch (error) {
    next(error);
  }
}

async function listMedicalOfficerHistory(req, res, next) {
  try {
    requireActor(req, "MEDICAL_OFFICER", MO_REVIEW_PERMISSIONS);
    // No recommendations can exist before migration 015 adds their columns
    if (!await hasTwoStageRegistrationSchema(pool)) {
      res.json({ success: true, registrations: [], workflow: workflowInfo(false) });
      return;
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.username, r.designation, r.status, r.created_at,
              r.mandal_id, r.mo_recommended_at, r.mo_recommendation,
              r.mo_recommendation_note, r.reviewed_at, r.rejection_reason,
              reviewer.full_name AS mo_reviewer_name,
              decision_maker.full_name AS decision_maker_name,
              f.name_en AS facility_name, f.name_te AS facility_name_te,
              m.name_en AS mandal_name, m.name_te AS mandal_name_te,
              v.name_en AS village_name, v.name_te AS village_name_te
         FROM tbl_user_registration_requests r
         JOIN mst_facilities f ON f.id = r.facility_id
         JOIN mst_mandals m ON m.id = r.mandal_id
         JOIN mst_villages v ON v.id = r.village_id
         JOIN tbl_medical_officer_mandal_assignments a
           ON a.mandal_id = r.mandal_id AND a.user_id = $1
         JOIN tbl_users u ON u.id = a.user_id
         JOIN mst_roles role ON role.id = u.role_id
         JOIN mst_mandals assigned_mandal ON assigned_mandal.id = a.mandal_id
         LEFT JOIN tbl_users reviewer ON reviewer.id = r.mo_recommended_by
         LEFT JOIN tbl_users decision_maker ON decision_maker.id = r.reviewed_by
        WHERE r.workflow_version = 1
          AND r.mo_recommended_by = $1
          AND a.valid_from <= CURRENT_DATE
          AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
          AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND role.code = 'MEDICAL_OFFICER' AND role.is_active IS TRUE
          AND assigned_mandal.is_active IS TRUE
        ORDER BY r.mo_recommended_at DESC
        LIMIT 100`,
      [req.user.id]
    );
    res.json({ success: true, registrations: rows });
  } catch (error) {
    next(error);
  }
}

async function recommend(req, res, next) {
  try {
    requireActor(req, "MEDICAL_OFFICER", MO_REVIEW_PERMISSIONS);
    requireRequestId(req);
    const { action, remarks } = req.body || {};
    const recommendationNote = typeof remarks === "string" ? remarks.trim() : "";
    if (!["RECOMMENDED", "NOT_RECOMMENDED"].includes(action) || !recommendationNote) {
      throw new HttpError(400, "Choose a recommendation and provide remarks", "INVALID_RECOMMENDATION");
    }
    if (recommendationNote.length > MAX_REMARKS_LENGTH) {
      throw new HttpError(400, "Remarks must be at most 1000 characters", "INVALID_RECOMMENDATION");
    }
    // Without migration 015 there is no column to store a recommendation in.
    // Refuse clearly instead of saving it somewhere else.
    if (!await hasTwoStageRegistrationSchema(pool)) {
      throw new HttpError(
        409,
        "Recommendations can be recorded after the two-stage registration update is installed",
        "TWO_STAGE_WORKFLOW_UNAVAILABLE"
      );
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [req.user.id]);

      const { rows } = await client.query(
        `SELECT id, username, mandal_id, status, workflow_version, mo_recommended_by
           FROM tbl_user_registration_requests
          WHERE id = $1
          FOR UPDATE`,
        [req.params.id]
      );
      const registration = rows[0];
      if (!registration || registration.workflow_version !== 1 || registration.status !== "PENDING") {
        throw new HttpError(404, "Pending registration request not found", "REGISTRATION_NOT_FOUND");
      }
      if (registration.mo_recommended_by) {
        throw new HttpError(409, "A recommendation has already been recorded", "RECOMMENDATION_EXISTS");
      }

      const assignment = await client.query(
        `SELECT a.id
           FROM tbl_medical_officer_mandal_assignments a
           JOIN tbl_users u ON u.id = a.user_id
           JOIN mst_roles role ON role.id = u.role_id
           JOIN mst_mandals assigned_mandal ON assigned_mandal.id = a.mandal_id
          WHERE a.user_id = $1 AND a.mandal_id = $2
            AND a.valid_from <= CURRENT_DATE
            AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
            AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
            AND role.code = 'MEDICAL_OFFICER' AND role.is_active IS TRUE
            AND assigned_mandal.is_active IS TRUE
          FOR SHARE OF a, u, role`,
        [req.user.id, registration.mandal_id]
      );
      if (!assignment.rows.length) {
        throw new HttpError(403, "You are not currently assigned to this registration's Mandal", "MANDAL_NOT_ASSIGNED");
      }

      const saved = await client.query(
        `UPDATE tbl_user_registration_requests
            SET mo_recommended_by = $1,
                mo_recommended_at = NOW(),
                mo_recommendation = $2,
                mo_recommendation_note = $3
          WHERE id = $4 AND status = 'PENDING' AND mo_recommended_by IS NULL
          RETURNING mo_recommended_at`,
        [req.user.id, action, recommendationNote, registration.id]
      );
      await audit(req, {
        client,
        required: true,
        event: "REGISTRATION_RECOMMENDED",
        resourceType: "registration_request",
        resourceId: registration.id,
        metadata: { username: registration.username, recommendation: action },
      });
      await client.query("COMMIT");
      transactionStarted = false;
      // The request stays PENDING: only the District Admin can approve or reject it
      res.json({
        success: true,
        message: "Recommendation recorded",
        recommendation: {
          id: registration.id,
          status: "PENDING",
          mo_recommendation: action,
          mo_recommendation_note: recommendationNote,
          mo_recommended_at: saved.rows[0]?.mo_recommended_at || null,
        },
      });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

// What a District Admin sees for each application. Never the password hash or status token.
const DA_COLUMNS = `
  r.id, r.full_name, r.username, r.phone, r.email, r.designation, r.employee_ref,
  r.status, r.created_at, r.mandal_id,
  r.mo_recommended_by, r.mo_recommended_at, r.mo_recommendation, r.mo_recommendation_note,
  reviewer.full_name AS mo_reviewer_name,
  d.name_en AS district_name, d.name_te AS district_name_te,
  f.name_en AS facility_name, f.name_te AS facility_name_te,
  m.name_en AS mandal_name, m.name_te AS mandal_name_te,
  v.name_en AS village_name, v.name_te AS village_name_te`;

const DA_JOINS = `
  FROM tbl_user_registration_requests r
  JOIN mst_facilities f ON f.id = r.facility_id
  JOIN mst_districts d ON d.id = f.district_id
  JOIN mst_mandals m ON m.id = r.mandal_id
  JOIN mst_villages v ON v.id = r.village_id
  LEFT JOIN tbl_users reviewer ON reviewer.id = r.mo_recommended_by`;

// GET /registrations/district-admin
// Applications of the District Admin's own district that a Medical Officer has
// reviewed. BOTH outcomes are listed: RECOMMENDED and NOT_RECOMMENDED.
async function listForDistrictAdmin(req, res, next) {
  try {
    requireActor(req, "DISTRICT_ADMIN", "registration.monitor");
    const districtId = await resolveAuthorizedDistrict(req);
    const twoStage = await hasTwoStageRegistrationSchema(pool);
    const workflow = {
      two_stage: twoStage,
      can_finalize: twoStage && req.user.permissions.includes("registration.finalize"),
    };

    let registrations = [];
    if (twoStage) {
      const { rows } = await pool.query(
        `SELECT ${DA_COLUMNS}
         ${DA_JOINS}
          WHERE r.workflow_version = 1
            AND r.status = 'PENDING'
            AND r.mo_recommended_by IS NOT NULL
            AND f.district_id = $1
          ORDER BY r.mo_recommended_at ASC
          LIMIT 100`,
        [districtId]
      );
      registrations = rows;
    }

    // Applications of the district that are still waiting for a Medical Officer
    const waiting = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM tbl_user_registration_requests r
         JOIN mst_facilities f ON f.id = r.facility_id
        WHERE r.status = 'PENDING'
          AND f.district_id = $1
          ${twoStage ? "AND r.mo_recommended_by IS NULL" : ""}`,
      [districtId]
    );

    res.json({
      success: true,
      registrations,
      awaiting_mo_review: Number(waiting.rows[0]?.count || 0),
      workflow,
    });
  } catch (error) {
    next(error);
  }
}

// GET /registrations/district-admin/history - final decisions of the own district
async function listDistrictAdminHistory(req, res, next) {
  try {
    requireActor(req, "DISTRICT_ADMIN", "registration.monitor");
    const districtId = await resolveAuthorizedDistrict(req);
    // Final decisions by a District Admin exist only after migration 015
    if (!await hasTwoStageRegistrationSchema(pool)) {
      res.json({ success: true, registrations: [] });
      return;
    }
    const { rows } = await pool.query(
      `SELECT ${DA_COLUMNS},
              r.reviewed_at, r.rejection_reason,
              decision_maker.full_name AS decision_maker_name,
              created_user.id AS created_user_id,
              created_user.username AS created_username,
              created_user.status AS account_status
       ${DA_JOINS}
         LEFT JOIN tbl_users decision_maker ON decision_maker.id = r.reviewed_by
         LEFT JOIN tbl_users created_user ON created_user.id = r.created_user_id
        WHERE r.workflow_version = 1
          AND r.status IN ('APPROVED', 'REJECTED')
          AND f.district_id = $1
        ORDER BY r.reviewed_at DESC
        LIMIT 100`,
      [districtId]
    );
    res.json({ success: true, registrations: rows });
  } catch (error) {
    next(error);
  }
}

async function decide(req, res, next) {
  try {
    requireActor(req, "DISTRICT_ADMIN", "registration.finalize");
    requireRequestId(req);
    const { action, rejection_reason: rejectionReason } = req.body || {};
    const normalizedReason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
    if (!["APPROVE", "REJECT"].includes(action) || (action === "REJECT" && !normalizedReason)) {
      throw new HttpError(400, "Choose a final decision and provide a rejection reason when rejecting", "INVALID_FINAL_DECISION");
    }
    if (normalizedReason.length > MAX_REMARKS_LENGTH) {
      throw new HttpError(400, "Rejection reason must be at most 1000 characters", "INVALID_FINAL_DECISION");
    }
    // Before migration 015 the database only accepts decisions from a Medical Officer
    if (!await hasTwoStageRegistrationSchema(pool)) {
      throw new HttpError(
        409,
        "Final decisions can be recorded after the two-stage registration update is installed",
        "TWO_STAGE_WORKFLOW_UNAVAILABLE"
      );
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [req.user.id]);
      const districtId = await resolveAuthorizedDistrict(req, client);
      const { rows } = await client.query(
        `SELECT r.*, f.district_id
           FROM tbl_user_registration_requests r
           JOIN mst_facilities f ON f.id = r.facility_id
          WHERE r.id = $1
          FOR UPDATE OF r`,
        [req.params.id]
      );
      const registration = rows[0];
      if (!registration || registration.workflow_version !== 1) {
        throw new HttpError(404, "Pending registration request not found", "REGISTRATION_NOT_FOUND");
      }
      if (registration.status !== "PENDING") {
        throw new HttpError(409, "Registration request has already been finalized", "REGISTRATION_FINALIZED");
      }
      if (Number(registration.district_id) !== districtId) {
        throw new HttpError(404, "Pending registration request not found", "REGISTRATION_NOT_FOUND");
      }
      if (!registration.mo_recommended_by) {
        throw new HttpError(409, "A Medical Officer recommendation is required before the final decision", "RECOMMENDATION_REQUIRED");
      }

      let newUserId = null;
      if (action === "APPROVE") {
        const roleResult = await client.query(
          "SELECT id FROM mst_roles WHERE code = 'HEALTH_WORKER' AND is_active IS TRUE"
        );
        if (!roleResult.rows.length) throw new Error("Health Worker role is unavailable");

        const location = await client.query(
          `SELECT f.district_id
             FROM mst_facilities f
             JOIN mst_mandals m ON m.id = $2 AND m.district_id = f.district_id AND m.is_active IS TRUE
             JOIN mst_villages v ON v.id = $3 AND v.mandal_id = m.id AND v.is_active IS TRUE
            WHERE f.id = $1 AND f.mandal_id = m.id AND f.is_active IS TRUE`,
          [registration.facility_id, registration.mandal_id, registration.village_id]
        );
        if (!location.rows.length) {
          throw new HttpError(409, "The registration facility, Mandal and village no longer match. Ask the applicant to submit a new request.", "REGISTRATION_LOCATION_CHANGED");
        }

        const user = await client.query(
          `INSERT INTO tbl_users
             (username, password_hash, full_name, phone, email, designation, role_id,
              status, district_id, must_change_password, is_synthetic)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, FALSE, FALSE)
           RETURNING id`,
          [
            registration.username,
            registration.password_hash,
            registration.full_name,
            registration.phone,
            registration.email || null,
            registration.designation,
            roleResult.rows[0].id,
            location.rows[0].district_id,
          ]
        );
        newUserId = user.rows[0].id;

        await client.query(
          `INSERT INTO tbl_user_facility_assignments (user_id, facility_id, is_primary)
           VALUES ($1, $2, TRUE)`,
          [newUserId, registration.facility_id]
        );
        await client.query(
          `INSERT INTO tbl_health_worker_location_assignments
             (user_id, district_id, mandal_id, village_id, facility_id, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newUserId, location.rows[0].district_id, registration.mandal_id, registration.village_id,
            registration.facility_id, req.user.id]
        );
      }

      const finalStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
      const decided = await client.query(
        `UPDATE tbl_user_registration_requests
            SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
                rejection_reason = $3, created_user_id = $4
          WHERE id = $5 AND status = 'PENDING'
          RETURNING reviewed_at`,
        [finalStatus, req.user.id,
          action === "REJECT" ? normalizedReason : null, newUserId, registration.id]
      );
      await audit(req, {
        client,
        required: true,
        event: action === "APPROVE" ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED",
        resourceType: "registration_request",
        resourceId: registration.id,
        metadata: { username: registration.username, created_user_id: newUserId },
      });
      await client.query("COMMIT");
      transactionStarted = false;
      res.json({
        success: true,
        message: action === "APPROVE" ? "Registration approved" : "Registration rejected",
        decision: {
          id: registration.id,
          status: finalStatus,
          reviewed_at: decided.rows[0]?.reviewed_at || null,
          rejection_reason: action === "REJECT" ? normalizedReason : null,
          // Only a reference to the new account; never the password hash
          account: newUserId ? { user_id: newUserId, username: registration.username, status: "ACTIVE" } : null,
        },
      });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK");
      if (error.code === "23505") {
        throw new HttpError(409, "A user account or registration decision already exists", "DUPLICATE_REGISTRATION_DECISION");
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

async function applicantStatus(req, res, next) {
  try {
    const token = typeof req.body?.status_token === "string" ? req.body.status_token.trim() : "";
    if (!TOKEN_PATTERN.test(token)) {
      throw new HttpError(404, "Registration status is unavailable", "STATUS_NOT_FOUND");
    }
    if (!await hasTwoStageRegistrationSchema(pool)) {
      throw new HttpError(404, "Registration status is unavailable", "STATUS_NOT_FOUND");
    }
    const { rows } = await pool.query(
      `SELECT status, created_at, mo_recommendation, mo_recommendation_note,
              mo_recommended_at, reviewed_at, rejection_reason
         FROM tbl_user_registration_requests
        WHERE status_token_hash = $1
          AND status_token_expires_at > NOW()
        LIMIT 1`,
      [hashStatusToken(token)]
    );
    if (!rows.length) throw new HttpError(404, "Registration status is unavailable", "STATUS_NOT_FOUND");
    const registration = rows[0];
    res.json({
      success: true,
      status: registration.status,
      submitted_at: registration.created_at,
      recommendation: registration.mo_recommendation,
      recommendation_remarks: registration.mo_recommendation_note,
      recommended_at: registration.mo_recommended_at,
      decided_at: registration.reviewed_at,
      rejection_reason: registration.status === "REJECTED" ? registration.rejection_reason : null,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listForMedicalOfficer,
  getForMedicalOfficer,
  listMedicalOfficerHistory,
  recommend,
  listForDistrictAdmin,
  listDistrictAdminHistory,
  decide,
  applicantStatus,
  hashStatusToken,
};
