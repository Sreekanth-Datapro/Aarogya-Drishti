const pool = require("../../db");
const HttpError = require("../../utils/httpError");
const { audit } = require("../../utils/audit");
const { mandalScope, pageOptions, pagination, requireUuid, setActor, withTransaction } = require("./scope");

// ==========================================
// FOLLOW-UP TASKS (tbl_followup_tasks)
// The existing schema requires every task to belong to a referral and to be
// owned by a NAVIGATOR (trg_followup_owner_role), so follow-ups are planned
// for referred patients of my Mandals and assigned to a Navigator of the
// patient's district. Statuses come from mst_followup_statuses.
// ==========================================

const TASK_TYPES = ["REMINDER", "MISSED_APPOINTMENT", "TRANSPORT", "RESULT_COLLECTION", "LOST_CONTACT", "TREATMENT_LINKAGE", "OTHER"];

async function getFollowupOptions(userId) {
  const [referrals, navigators, statuses] = await Promise.all([
    pool.query(
      `SELECT r.id, r.referral_code, p.patient_code, r.status::text AS status, pf.district_id
         FROM tbl_referrals r
         JOIN tbl_patients p ON p.id = r.patient_id AND p.deleted_at IS NULL
         JOIN mst_villages pv ON pv.id = p.village_id
         JOIN mst_facilities pf ON pf.id = p.registered_facility_id
        WHERE ${mandalScope("$1")} AND r.status NOT IN ('CANCELLED', 'DECLINED')
        ORDER BY r.created_at DESC
        LIMIT 200`,
      [userId]
    ),
    pool.query(
      `SELECT u.id, u.full_name, u.district_id
         FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id AND r.code = 'NAVIGATOR'
        WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND u.district_id IN (
            SELECT DISTINCT m.district_id
              FROM tbl_medical_officer_mandal_assignments moa
              JOIN mst_mandals m ON m.id = moa.mandal_id
             WHERE moa.user_id = $1 AND moa.valid_from <= CURRENT_DATE
               AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE))
        ORDER BY u.full_name`,
      [userId]
    ),
    pool.query("SELECT id, code, name_en, name_te, is_terminal FROM mst_followup_statuses ORDER BY sort_order"),
  ]);
  return {
    referrals: referrals.rows.map((row) => ({ ...row, district_id: Number(row.district_id) })),
    navigators: navigators.rows.map((row) => ({ ...row, district_id: Number(row.district_id) })),
    statuses: statuses.rows.map((row) => ({ ...row, id: Number(row.id) })),
    task_types: TASK_TYPES,
  };
}

function normalizeTask(input = {}) {
  const taskType = input.task_type;
  if (!TASK_TYPES.includes(taskType)) throw new HttpError(400, "Select a follow-up type", "INVALID_FOLLOWUP");
  const priority = Number(input.priority || 3);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    throw new HttpError(400, "Priority must be between 1 and 5", "INVALID_FOLLOWUP");
  }
  const dueAt = new Date(input.due_at);
  if (!input.due_at || Number.isNaN(dueAt.getTime())) throw new HttpError(400, "Choose a due date", "INVALID_FOLLOWUP");
  if (dueAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "The due date cannot be in the past", "INVALID_FOLLOWUP");
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 500) throw new HttpError(400, "Describe the follow-up", "INVALID_FOLLOWUP");
  return {
    referralId: requireUuid(input.referral_id, "Select a referral"),
    navigatorId: requireUuid(input.navigator_id, "Select a navigator"),
    taskType,
    priority,
    dueAt: dueAt.toISOString(),
    reason,
  };
}

async function createFollowup(userId, req, input) {
  const data = normalizeTask(input);
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const referral = await client.query(
      `SELECT r.id, r.patient_id, pf.district_id
         FROM tbl_referrals r
         JOIN tbl_patients p ON p.id = r.patient_id AND p.deleted_at IS NULL
         JOIN mst_villages pv ON pv.id = p.village_id
         JOIN mst_facilities pf ON pf.id = p.registered_facility_id
        WHERE r.id = $2 AND ${mandalScope("$1")} AND r.status NOT IN ('CANCELLED', 'DECLINED')
        FOR SHARE OF r`,
      [userId, data.referralId]
    );
    if (!referral.rows.length) throw new HttpError(404, "Referral not found in your Mandals", "REFERRAL_NOT_FOUND");
    const { patient_id: patientId, district_id: districtId } = referral.rows[0];

    const navigator = await client.query(
      `SELECT 1 FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id AND r.code = 'NAVIGATOR'
        WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL AND u.district_id = $2`,
      [data.navigatorId, districtId]
    );
    if (!navigator.rows.length) throw new HttpError(400, "Select an active navigator of the patient's district", "INVALID_FOLLOWUP");

    const openStatus = await client.query("SELECT id FROM mst_followup_statuses WHERE code = 'OPEN'");
    if (!openStatus.rows.length) throw new HttpError(500, "Follow-up statuses are not configured", "CONFIGURATION_ERROR");

    const inserted = await client.query(
      `INSERT INTO tbl_followup_tasks
         (referral_id, patient_id, owner_id, task_type, trigger_event, priority, due_at, status_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, due_at`,
      [data.referralId, patientId, data.navigatorId, data.taskType, data.reason, data.priority,
        data.dueAt, openStatus.rows[0].id, userId]
    );

    // The navigator needs a care relationship to open the patient
    await client.query(
      `INSERT INTO tbl_case_assignments (patient_id, referral_id, user_id, assigned_by, reason)
       SELECT $1, $2, $3, $4, 'Follow-up'
        WHERE NOT EXISTS (
          SELECT 1 FROM tbl_case_assignments
           WHERE patient_id = $1 AND referral_id = $2 AND user_id = $3 AND valid_to IS NULL)`,
      [patientId, data.referralId, data.navigatorId, userId]
    );

    await audit(req, {
      client,
      required: true,
      event: "FOLLOWUP_TASK_CREATED",
      resourceType: "followup_task",
      resourceId: inserted.rows[0].id,
      patientId,
      metadata: { task_type: data.taskType, priority: data.priority },
    });
    return inserted.rows[0];
  });
}

async function listFollowups(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  let statusSql = "";
  if (query.state === "open") statusSql = "AND t.closed_at IS NULL";
  if (query.state === "overdue") statusSql = "AND t.closed_at IS NULL AND t.due_at < now()";
  if (query.state === "closed") statusSql = "AND t.closed_at IS NOT NULL";
  const fromSql = `
    FROM tbl_followup_tasks t
    JOIN tbl_patients p ON p.id = t.patient_id
    JOIN mst_villages pv ON pv.id = p.village_id
    JOIN tbl_referrals r ON r.id = t.referral_id
    JOIN mst_followup_statuses st ON st.id = t.status_id
    LEFT JOIN tbl_users owner ON owner.id = t.owner_id
   WHERE ${mandalScope("$1")} ${statusSql}`;

  const [count, rows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total ${fromSql}`, [userId]),
    pool.query(
      `SELECT t.id, t.task_type::text AS task_type, t.trigger_event AS reason, t.priority, t.due_at,
              t.accepted_at, t.closed_at, t.closure_reason, t.created_at,
              st.code AS status_code, st.name_en AS status_name, st.name_te AS status_name_te,
              owner.full_name AS navigator_name, p.patient_code, r.referral_code,
              (t.closed_at IS NULL AND t.due_at < now()) AS overdue
       ${fromSql}
        ORDER BY (t.closed_at IS NULL) DESC, t.due_at ASC
        LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    ),
  ]);
  return { tasks: rows.rows, pagination: pagination(page, pageSize, Number(count.rows[0].total)) };
}

module.exports = { TASK_TYPES, getFollowupOptions, createFollowup, listFollowups, normalizeTask };
