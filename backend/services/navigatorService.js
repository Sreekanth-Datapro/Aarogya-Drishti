const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { requireUuid, setActor, withTransaction } = require("./medicalOfficer/scope");
const specialistAvailabilityRequestService = require("./specialistAvailabilityRequestService");

const CONTACT_CHANNELS = ["PHONE", "HOME_VISIT", "SMS", "IN_PERSON", "OTHER"];
const CONTACT_OUTCOMES = ["REACHED", "NOT_REACHED", "WRONG_NUMBER", "REFUSED", "RESCHEDULED"];
const CONTACT_RECIPIENTS = ["PATIENT", "HEALTH_WORKER"];
const REFERRAL_FILTERS = ["pending", "contacted", "scheduled", "completed", "unreachable"];

function pageOptions(query = {}) {
  const page = Math.min(Math.max(Number(query.page) || 1, 1), 10000);
  const pageSize = Math.min(Math.max(Number(query.page_size) || 20, 1), 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function pagination(page, pageSize, total) {
  return { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) };
}

function normalizeContact(input = {}) {
  const channel = typeof input.channel === "string" ? input.channel.trim().toUpperCase() : "";
  const outcome = typeof input.outcome === "string" ? input.outcome.trim().toUpperCase() : "";
  const recipient = typeof input.recipient === "string" ? input.recipient.trim().toUpperCase() : "PATIENT";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (!CONTACT_CHANNELS.includes(channel)) throw new HttpError(400, "Select a valid contact channel", "INVALID_CONTACT");
  if (!CONTACT_OUTCOMES.includes(outcome)) throw new HttpError(400, "Select a valid contact outcome", "INVALID_CONTACT");
  if (!CONTACT_RECIPIENTS.includes(recipient)) throw new HttpError(400, "Select a valid contact recipient", "INVALID_CONTACT");
  if (notes.length > 1000) throw new HttpError(400, "Contact notes must be 1000 characters or fewer", "INVALID_CONTACT");
  return { channel, outcome, recipient, notes: notes || null };
}

function contactNotes(recipient, notes) {
  return `[[recipient:${recipient}]]${notes ? `\n${notes}` : ""}`;
}

function parseContact(row) {
  const match = /^\[\[recipient:(PATIENT|HEALTH_WORKER)\]\](?:\n)?/.exec(row.notes || "");
  if (!match) return { ...row, recipient: "UNKNOWN" };
  return {
    ...row,
    recipient: match[1],
    notes: row.notes.slice(match[0].length) || null,
  };
}

function normalizeAppointment(input = {}) {
  const scheduledAt = typeof input.scheduled_at === "string" ? new Date(input.scheduled_at) : null;
  const assignedService = typeof input.assigned_service === "string" ? input.assigned_service.trim() : "";
  const locationNote = typeof input.location_note === "string" ? input.location_note.trim() : "";
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new HttpError(400, "Choose a future appointment date and time", "INVALID_APPOINTMENT");
  }
  if (assignedService.length > 200 || locationNote.length > 500) {
    throw new HttpError(400, "Appointment details are too long", "INVALID_APPOINTMENT");
  }
  return {
    scheduledAt: scheduledAt.toISOString(),
    assignedService: assignedService || null,
    locationNote: locationNote || null,
  };
}

function referralScopeSql(userParam = "$1", referralParam = "$2") {
  return `r.id = ${referralParam}
      AND r.assigned_navigator_id = ${userParam}
      AND p.deleted_at IS NULL
      AND fn_user_has_patient_access(${userParam}, p.id)
      AND EXISTS (
        SELECT 1 FROM tbl_case_assignments ca
         WHERE ca.patient_id = p.id AND ca.referral_id = r.id AND ca.user_id = ${userParam}
           AND ca.valid_from <= now() AND (ca.valid_to IS NULL OR ca.valid_to > now())
      )`;
}

const referralJoins = `
  FROM tbl_referrals r
  JOIN tbl_patients p ON p.id = r.patient_id
  JOIN mst_hospitals h ON h.id = r.to_hospital_id
  JOIN mst_specialties sp ON sp.id = r.specialty_id
  JOIN mst_referral_priorities pr ON pr.id = r.priority_id
  JOIN LATERAL (
    SELECT pc.granted
      FROM tbl_patient_consents pc
      JOIN mst_consent_purposes cp ON cp.id = pc.purpose_id
     WHERE pc.patient_id = p.id AND cp.code = 'SCREENING'
     ORDER BY pc.consent_seq DESC
     LIMIT 1
  ) consent ON TRUE
  LEFT JOIN LATERAL (
    SELECT c.outcome::text AS outcome, c.contacted_at
      FROM tbl_patient_contact_history c
     WHERE c.patient_id = p.id AND c.contacted_by = $1 AND c.contacted_at >= r.created_at
     ORDER BY c.contacted_at DESC
     LIMIT 1
  ) lc ON TRUE
  LEFT JOIN LATERAL (
    SELECT a.id, a.scheduled_at, a.attendance::text AS attendance,
           ast.code AS status_code, ast.name_en AS status_name
      FROM tbl_hospital_appointments a
      JOIN mst_appointment_statuses ast ON ast.id = a.status_id
     WHERE a.referral_id = r.id
     ORDER BY a.created_at DESC
     LIMIT 1
  ) la ON TRUE`;

const referralVisibility = `WHERE r.assigned_navigator_id = $1
  AND p.deleted_at IS NULL
  AND fn_user_has_patient_access($1, p.id)
  AND EXISTS (
    SELECT 1 FROM tbl_case_assignments ca
     WHERE ca.patient_id = p.id AND ca.referral_id = r.id AND ca.user_id = $1
       AND ca.valid_from <= now() AND (ca.valid_to IS NULL OR ca.valid_to > now())
  )
  AND consent.granted IS TRUE`;

function filterSql(filter) {
  switch (filter) {
    case "pending":
      return "AND ((lc.outcome IS NULL AND la.id IS NULL) OR la.status_code = 'REQUESTED')";
    case "contacted":
      return "AND lc.outcome = 'REACHED' AND COALESCE(la.status_code, '') NOT IN ('REQUESTED', 'CONFIRMED')";
    case "scheduled":
      return "AND la.status_code = 'CONFIRMED'";
    case "completed":
      return "AND la.status_code = 'COMPLETED' AND la.attendance = 'ATTENDED'";
    case "unreachable":
      return "AND lc.outcome IN ('NOT_REACHED', 'WRONG_NUMBER')";
    default:
      return "";
  }
}

async function getDashboard(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS assigned,
            COUNT(*) FILTER (WHERE (lc.outcome IS NULL AND la.id IS NULL) OR la.status_code = 'REQUESTED')::int AS pending,
            COUNT(*) FILTER (WHERE lc.outcome = 'REACHED' AND COALESCE(la.status_code, '') NOT IN ('REQUESTED', 'CONFIRMED'))::int AS contacted,
            COUNT(*) FILTER (WHERE la.status_code = 'CONFIRMED')::int AS scheduled,
            COUNT(*) FILTER (WHERE la.status_code = 'COMPLETED' AND la.attendance = 'ATTENDED')::int AS completed,
            COUNT(*) FILTER (WHERE lc.outcome IN ('NOT_REACHED', 'WRONG_NUMBER'))::int AS unreachable
       ${referralJoins}
      ${referralVisibility}`,
    [userId]
  );
  return rows[0] || { assigned: 0, pending: 0, contacted: 0, scheduled: 0, completed: 0, unreachable: 0 };
}

async function listReferrals(userId, query = {}) {
  const { page, pageSize } = pageOptions(query);
  const requestedFilter = String(query.filter || "").toLowerCase();
  if (requestedFilter && requestedFilter !== "all" && !REFERRAL_FILTERS.includes(requestedFilter)) {
    throw new HttpError(400, "Select a valid referral filter", "INVALID_FILTER");
  }
  const stateSql = filterSql(requestedFilter);
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total ${referralJoins} ${referralVisibility} ${stateSql}`,
    [userId]
  );
  const total = Number(count.rows[0]?.total || 0);
  const totalPages = Math.ceil(total / pageSize);
  const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const rows = await pool.query(
    `SELECT r.id, r.referral_code, r.status::text AS referral_status,
            r.mode::text AS mode, r.reason, r.created_at,
            p.patient_code, p.full_name AS patient_name,
            h.name_en AS hospital_name, sp.name_en AS specialty_name,
            pr.name_en AS priority_name, pr.code AS priority_code,
            specialist.full_name AS specialist_name,
            lc.outcome AS latest_contact_outcome, lc.contacted_at AS latest_contact_at,
            la.id AS appointment_id, la.scheduled_at AS appointment_at,
            la.status_code AS appointment_status, la.status_name AS appointment_status_name,
            la.attendance AS appointment_attendance
       ${referralJoins}
       LEFT JOIN tbl_users specialist ON specialist.id = r.assigned_specialist_id
      ${referralVisibility} ${stateSql}
      ORDER BY pr.priority_rank, r.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, pageSize, (currentPage - 1) * pageSize]
  );
  return {
    referrals: rows.rows,
    pagination: pagination(currentPage, pageSize, total),
  };
}

async function requireAssignedReferral(db, userId, referralId, { lock = false } = {}) {
  requireUuid(referralId, "Invalid referral ID");
  const { rows } = await db.query(
    `SELECT r.id, r.patient_id, r.referral_code, r.status::text AS referral_status,
            r.mode::text AS mode, r.reason, r.created_at, r.to_hospital_id, r.specialty_id,
            p.patient_code, p.full_name AS patient_name, p.contact_phone,
            CASE WHEN registrar_role.code = 'HEALTH_WORKER'
                   AND registrar.deleted_at IS NULL
                 THEN registrar.phone
                 ELSE NULL
            END AS health_worker_phone,
            CASE WHEN registrar_role.code = 'HEALTH_WORKER'
                   AND registrar.deleted_at IS NULL
                 THEN registrar.id
                 ELSE NULL
            END AS health_worker_id,
            CASE WHEN registrar_role.code = 'HEALTH_WORKER'
                   AND registrar.deleted_at IS NULL
                 THEN registrar.full_name
                 ELSE NULL
            END AS health_worker_name,
            h.name_en AS hospital_name, sp.name_en AS specialty_name,
            pr.name_en AS priority_name, pr.code AS priority_code,
            specialist.full_name AS specialist_name, consent.granted AS screening_consent
       ${referralJoins}
       LEFT JOIN tbl_users specialist ON specialist.id = r.assigned_specialist_id
       LEFT JOIN tbl_users registrar ON registrar.id = p.registered_by
       LEFT JOIN mst_roles registrar_role ON registrar_role.id = registrar.role_id
      WHERE ${referralScopeSql()} AND r.assigned_navigator_id = $1
      ${lock ? "FOR UPDATE OF r" : ""}`,
    [userId, referralId]
  );
  if (!rows.length) throw new HttpError(404, "Referral not found", "REFERRAL_NOT_FOUND");
  if (rows[0].screening_consent !== true) {
    throw new HttpError(403, "The patient has no active SCREENING consent", "CONSENT_REQUIRED");
  }
  return rows[0];
}

async function getReferral(userId, referralId) {
  const referral = await requireAssignedReferral(pool, userId, referralId);
  const [
    contacts,
    appointments,
    statusHistory,
    specialistDecision,
    videoAvailabilityRequests,
    videoConsultations,
  ] = await Promise.all([
    pool.query(
      `SELECT id, channel::text AS channel, outcome::text AS outcome, notes, contacted_at
         FROM tbl_patient_contact_history
        WHERE patient_id = $1 AND contacted_by = $2 AND contacted_at >= $3
        ORDER BY contacted_at DESC LIMIT 50`,
      [referral.patient_id, userId, referral.created_at]
    ),
    pool.query(
      `SELECT a.id, a.scheduled_at, a.assigned_service, a.location_note,
              a.attendance::text AS attendance, ast.code AS status_code, ast.name_en AS status_name
         FROM tbl_hospital_appointments a
         JOIN mst_appointment_statuses ast ON ast.id = a.status_id
        WHERE a.referral_id = $1
        ORDER BY a.created_at DESC`,
      [referral.id]
    ),
    pool.query(
      `SELECT from_status::text AS from_status, to_status::text AS to_status, changed_at
         FROM tbl_referral_status_history
        WHERE referral_id = $1
        ORDER BY changed_at`,
      [referral.id]
    ),
    pool.query(
      `SELECT d.decision_type, d.clinical_reason, d.clinical_recommendation,
              d.instructions, d.follow_up_date, d.signed_at,
              specialist.full_name AS specialist_name,
              hospital.name_en AS hospital_name,
              investigation.name_en AS investigation_name
         FROM tbl_specialist_consultation_decisions d
         JOIN tbl_users specialist ON specialist.id = d.specialist_id
         LEFT JOIN mst_hospitals hospital ON hospital.id = d.hospital_id
         LEFT JOIN mst_investigation_types investigation ON investigation.id = d.investigation_type_id
        WHERE d.referral_id = $1 AND d.patient_id = $2 AND d.status = 'SIGNED'
        LIMIT 1`,
      [referral.id, referral.patient_id]
    ).catch((error) => {
      if (error.code !== "42P01") throw error;
      console.error("Navigator Specialist decision query failed: decision migration is not applied");
      return { rows: [], decisionStorageUnavailable: true };
    }),
    specialistAvailabilityRequestService.getNavigatorRequests(userId, referral.id),
    specialistAvailabilityRequestService.getNavigatorVideoConsultations(userId, referral.id),
  ]);
  return {
    referral,
    contacts: contacts.rows.map(parseContact),
    appointments: appointments.rows,
    status_history: statusHistory.rows,
    specialist_decision: specialistDecision.rows[0] || null,
    video_availability_requests: videoAvailabilityRequests,
    video_consultations: videoConsultations,
    decision_storage_unavailable: specialistDecision.decisionStorageUnavailable === true,
  };
}

async function recordContact(userId, req, referralId, input) {
  const data = normalizeContact(input);
  return withTransaction(pool, async (client) => {
    const referral = await requireAssignedReferral(client, userId, referralId, { lock: true });
    if (data.recipient === "HEALTH_WORKER" && !referral.health_worker_id) {
      throw new HttpError(409, "The registering Health Worker is unavailable for contact", "HEALTH_WORKER_CONTACT_UNAVAILABLE");
    }
    await setActor(client, userId);
    const { rows } = await client.query(
      `INSERT INTO tbl_patient_contact_history (patient_id, contacted_by, channel, outcome, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, channel::text AS channel, outcome::text AS outcome, notes, contacted_at`,
      [referral.patient_id, userId, data.channel, data.outcome, contactNotes(data.recipient, data.notes)]
    );
    await audit(req, {
      client,
      required: true,
      event: "NAVIGATOR_CONTACT_RECORDED",
      resourceType: "patient_contact",
      resourceId: rows[0].id,
      patientId: referral.patient_id,
      metadata: {
        referral_code: referral.referral_code,
        channel: data.channel,
        outcome: data.outcome,
        recipient: data.recipient,
      },
    });
    return parseContact(rows[0]);
  });
}

async function bookAppointment(userId, req, referralId, input) {
  const data = normalizeAppointment(input);
  return withTransaction(pool, async (client) => {
    const referral = await requireAssignedReferral(client, userId, referralId, { lock: true });
    // CANCELLED / DECLINED end Navigator booking. COMPLETED means the Specialist
    // assessment finished (ck_ref_complete); hospital visits may still be booked.
    if (["CANCELLED", "DECLINED"].includes(referral.referral_status)) {
      throw new HttpError(409, "This referral cannot receive another appointment", "REFERRAL_NOT_BOOKABLE");
    }
    let decision = { rows: [] };
    try {
      decision = await client.query(
        `SELECT decision_type
           FROM tbl_specialist_consultation_decisions
          WHERE referral_id = $1 AND patient_id = $2 AND status = 'SIGNED'
          LIMIT 1`,
        [referral.id, referral.patient_id]
      );
    } catch (error) {
      if (error.code !== "42P01") throw error;
      console.error("Navigator appointment decision lookup failed: decision migration is not applied");
    }
    const specialistDecisionAllowsHospitalVisit = [
      "DIRECT_HOSPITAL_VISIT",
      "EMERGENCY_HOSPITAL_REFERRAL",
    ].includes(decision.rows[0]?.decision_type);
    if (!["HOSPITAL_VISIT", "BOTH"].includes(referral.mode) && !specialistDecisionAllowsHospitalVisit) {
      throw new HttpError(409, "This referral is not for a hospital visit", "HOSPITAL_VISIT_NOT_ALLOWED");
    }
    await setActor(client, userId);
    // One non-terminal appointment per referral (REQUESTED/CONFIRMED). Terminal
    // statuses (CANCELLED, COMPLETED, MISSED, RESCHEDULED) do not block a new booking.
    // Time changes for an active appointment go through Hospital Staff reschedule.
    const existing = await client.query(
      `SELECT a.id
         FROM tbl_hospital_appointments a
         JOIN mst_appointment_statuses ast ON ast.id = a.status_id
        WHERE a.referral_id = $1 AND ast.is_terminal IS FALSE
        LIMIT 1
        FOR UPDATE OF a`,
      [referral.id]
    );
    if (existing.rows.length) {
      throw new HttpError(409, "An active appointment already exists for this referral", "APPOINTMENT_ALREADY_EXISTS");
    }
    const requested = await client.query("SELECT id FROM mst_appointment_statuses WHERE code = 'REQUESTED'");
    if (!requested.rows.length) throw new HttpError(500, "Appointment statuses are not configured", "CONFIGURATION_ERROR");
    const inserted = await client.query(
      `INSERT INTO tbl_hospital_appointments
         (referral_id, patient_id, hospital_id, specialty_id, scheduled_at, status_id,
          assigned_service, location_note, booked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, scheduled_at, attendance::text AS attendance`,
      [referral.id, referral.patient_id, referral.to_hospital_id, referral.specialty_id,
        data.scheduledAt, requested.rows[0].id, data.assignedService, data.locationNote, userId]
    );
    await client.query(
      `INSERT INTO tbl_appointment_status_history
         (hospital_appointment_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, NULL, $2, $3, 'Navigator requested hospital appointment')`,
      [inserted.rows[0].id, requested.rows[0].id, userId]
    );
    await audit(req, {
      client,
      required: true,
      event: "NAVIGATOR_APPOINTMENT_REQUESTED",
      resourceType: "hospital_appointment",
      resourceId: inserted.rows[0].id,
      patientId: referral.patient_id,
      metadata: { referral_code: referral.referral_code },
    });
    return { ...inserted.rows[0], status_code: "REQUESTED" };
  });
}

module.exports = {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  CONTACT_RECIPIENTS,
  REFERRAL_FILTERS,
  getDashboard,
  listReferrals,
  getReferral,
  recordContact,
  bookAppointment,
  normalizeContact,
  parseContact,
  normalizeAppointment,
  pageOptions,
};
