const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { hasConsent, requireUuid, setActor, withTransaction } = require("./medicalOfficer/scope");

const APPOINTMENT_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "RESCHEDULED",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
];
const ATTENDANCE_VALUES = ["ATTENDED", "NO_SHOW"];

const FACILITY_SCOPE = `EXISTS (
  SELECT 1
    FROM tbl_user_facility_assignments assignment
    JOIN mst_facilities facility ON facility.id = assignment.facility_id
   WHERE assignment.user_id = $1
     AND facility.facility_type = 'HOSPITAL'
     AND facility.hospital_id = appointment.hospital_id
     AND facility.is_active IS TRUE
     AND assignment.valid_from <= CURRENT_DATE
     AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
)`;

const VIDEO_FACILITY_SCOPE = `EXISTS (
  SELECT 1
    FROM tbl_user_facility_assignments assignment
    JOIN mst_facilities facility ON facility.id = assignment.facility_id
   WHERE assignment.user_id = $1
     AND facility.facility_type = 'HOSPITAL'
     AND facility.hospital_id = referral.to_hospital_id
     AND facility.is_active IS TRUE
     AND assignment.valid_from <= CURRENT_DATE
     AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
)`;

const VIDEO_CONSULTATION_SELECT = `
  SELECT vc.id, vc.patient_id, vc.referral_id, vc.specialist_id, vc.slot_id,
         vc.status_id, status.code AS status_code, status.is_terminal,
         vc.attendance::text AS attendance, vc.is_active,
         patient.patient_code, referral.referral_code,
         referral.mode::text AS referral_mode,
         referral.assigned_specialist_id, referral.to_hospital_id, referral.specialty_id,
         specialty.name_en AS specialty_name, specialist.full_name AS specialist_name,
         hospital.name_en AS hospital_name, slot.slot_start AS scheduled_at,
         slot.slot_end, slot.mode::text AS consultation_mode, slot.hospital_id AS slot_hospital_id,
         slot.is_booked, specialist.status = 'ACTIVE' AND specialist.deleted_at IS NULL
           AND specialist_role.code = 'SPECIALIST' AND specialist_role.is_active
           AS specialist_active,
         EXISTS (
           SELECT 1
             FROM tbl_user_facility_assignments specialist_assignment
             JOIN mst_facilities specialist_facility
               ON specialist_facility.id = specialist_assignment.facility_id
            WHERE specialist_assignment.user_id = vc.specialist_id
              AND specialist_facility.facility_type = 'HOSPITAL'
              AND specialist_facility.hospital_id = referral.to_hospital_id
              AND specialist_facility.is_active IS TRUE
              AND specialist_assignment.valid_from <= CURRENT_DATE
              AND (specialist_assignment.valid_to IS NULL
                   OR specialist_assignment.valid_to >= CURRENT_DATE)
         ) AS specialist_facility_assigned,
         (decision.id IS NOT NULL) AS signed_video_decision,
         consent.granted AS teleconsult_consent_granted,
         CASE
           WHEN consent.id IS NULL THEN 'NOT_GIVEN'
           WHEN consent.granted IS TRUE THEN 'ACTIVE'
           WHEN consent.previously_granted IS TRUE THEN 'WITHDRAWN'
           ELSE 'DECLINED'
         END AS teleconsult_consent_status,
         CASE
           WHEN status.code IN ('REQUESTED', 'RESCHEDULED')
            AND slot.slot_start <= now() THEN 'EXPIRED'
           WHEN consent.granted IS TRUE
            AND referral.mode::text IN ('VIDEO_CONSULT', 'BOTH')
            AND referral.assigned_specialist_id = vc.specialist_id
            AND specialist.status = 'ACTIVE' AND specialist.deleted_at IS NULL
            AND specialist_role.code = 'SPECIALIST' AND specialist_role.is_active
            AND (decision.id IS NOT NULL OR availability_request.id IS NOT NULL)
            AND EXISTS (
              SELECT 1
                FROM tbl_user_facility_assignments specialist_assignment
                JOIN mst_facilities specialist_facility
                  ON specialist_facility.id = specialist_assignment.facility_id
               WHERE specialist_assignment.user_id = vc.specialist_id
                 AND specialist_facility.facility_type = 'HOSPITAL'
                 AND specialist_facility.hospital_id = referral.to_hospital_id
                 AND specialist_facility.is_active IS TRUE
                 AND specialist_assignment.valid_from <= CURRENT_DATE
                 AND (specialist_assignment.valid_to IS NULL
                      OR specialist_assignment.valid_to >= CURRENT_DATE)
            )
            AND slot.mode = 'VIDEO' AND slot.slot_start > now()
            AND slot.is_booked IS TRUE AND vc.is_active IS TRUE
            AND NOT EXISTS (
              SELECT 1 FROM tbl_video_consultations other
               WHERE other.slot_id = slot.id AND other.is_active IS TRUE AND other.id <> vc.id
            )
           THEN 'RESERVED'
           ELSE 'UNAVAILABLE'
         END AS availability_status,
         COALESCE(alternatives.slots, '[]'::json) AS alternative_slots
    FROM tbl_video_consultations vc
    JOIN tbl_referrals referral ON referral.id = vc.referral_id AND referral.patient_id = vc.patient_id
    JOIN tbl_patients patient ON patient.id = vc.patient_id AND patient.deleted_at IS NULL
    JOIN tbl_consultation_slots slot ON slot.id = vc.slot_id
    JOIN mst_appointment_statuses status ON status.id = vc.status_id
    JOIN mst_hospitals hospital ON hospital.id = referral.to_hospital_id
    JOIN mst_specialties specialty ON specialty.id = referral.specialty_id
    JOIN tbl_users specialist ON specialist.id = vc.specialist_id
    JOIN mst_roles specialist_role ON specialist_role.id = specialist.role_id
    LEFT JOIN LATERAL (
      SELECT pc.id, pc.granted,
             EXISTS (
               SELECT 1 FROM tbl_patient_consents previous
                WHERE previous.patient_id = pc.patient_id
                  AND previous.purpose_id = pc.purpose_id
                  AND previous.granted IS TRUE
                  AND previous.consent_seq < pc.consent_seq
             ) AS previously_granted
        FROM tbl_patient_consents pc
        JOIN mst_consent_purposes purpose ON purpose.id = pc.purpose_id
       WHERE pc.patient_id = vc.patient_id AND purpose.code = 'TELECONSULT'
       ORDER BY pc.consent_seq DESC
       LIMIT 1
    ) consent ON TRUE
    LEFT JOIN tbl_specialist_consultation_decisions decision
      ON decision.referral_id = referral.id
     AND decision.patient_id = referral.patient_id
     AND decision.specialist_id = vc.specialist_id
     AND decision.decision_type = 'VIDEO_CONSULTATION'
     AND decision.status = 'SIGNED'
     AND decision.signed_by = vc.specialist_id
    LEFT JOIN tbl_specialist_availability_requests availability_request
      ON availability_request.video_consultation_id = vc.id
     AND availability_request.status = 'CONFIRMED'
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', available_slot.id,
               'slot_start', available_slot.slot_start,
               'slot_end', available_slot.slot_end
             ) ORDER BY available_slot.slot_start) AS slots
        FROM (
          SELECT candidate.id, candidate.slot_start, candidate.slot_end
            FROM tbl_consultation_slots candidate
           WHERE candidate.specialist_id = vc.specialist_id
             AND candidate.mode = 'VIDEO'
             AND candidate.is_booked IS FALSE
             AND candidate.slot_start > now()
             AND (candidate.hospital_id IS NULL
                  OR candidate.hospital_id = referral.to_hospital_id)
             AND referral.assigned_specialist_id = vc.specialist_id
             AND specialist.status = 'ACTIVE' AND specialist.deleted_at IS NULL
             AND specialist_role.code = 'SPECIALIST' AND specialist_role.is_active
             AND (decision.id IS NOT NULL OR availability_request.id IS NOT NULL)
             AND EXISTS (
               SELECT 1
                 FROM tbl_user_facility_assignments specialist_assignment
                 JOIN mst_facilities specialist_facility
                   ON specialist_facility.id = specialist_assignment.facility_id
                WHERE specialist_assignment.user_id = vc.specialist_id
                  AND specialist_facility.facility_type = 'HOSPITAL'
                  AND specialist_facility.hospital_id = referral.to_hospital_id
                  AND specialist_facility.is_active IS TRUE
                  AND specialist_assignment.valid_from <= CURRENT_DATE
                  AND (specialist_assignment.valid_to IS NULL
                       OR specialist_assignment.valid_to >= CURRENT_DATE)
             )
             AND NOT EXISTS (
               SELECT 1 FROM tbl_video_consultations booked
                WHERE booked.slot_id = candidate.id AND booked.is_active IS TRUE
             )
           ORDER BY candidate.slot_start
           LIMIT 10
        ) available_slot
    ) alternatives ON TRUE`;

function futureDateTime(value, label) {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new HttpError(400, `${label} must be a future date and time`, "INVALID_APPOINTMENT");
  }
  return date.toISOString();
}

function requiredReason(value, label = "Reason") {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 1000) {
    throw new HttpError(400, `${label} is required and must be 1000 characters or fewer`, "INVALID_APPOINTMENT");
  }
  return reason;
}

function appointmentId(value) {
  return requireUuid(value, "Invalid appointment ID");
}

async function listAppointments(userId, query = {}) {
  const status = String(query.status || "").toUpperCase();
  if (status && !APPOINTMENT_STATUSES.includes(status)) {
    throw new HttpError(400, "Select a valid appointment status", "INVALID_FILTER");
  }
  const values = [userId];
  const statusSql = status
    ? `AND status.code = $${values.push(status)}`
    : "";
  const { rows } = await pool.query(
    `SELECT appointment.id, appointment.patient_id, patient.patient_code,
            appointment.referral_id, referral.referral_code,
            specialty.name_en AS specialty_name, specialty.name_te AS specialty_name_te,
            requester.full_name AS requesting_clinician,
            requester_role.code AS requesting_role,
            appointment.scheduled_at, appointment.assigned_service, appointment.location_note,
            appointment.attendance::text AS attendance,
            status.code AS status_code, status.name_en AS status_name,
            hospital.name_en AS hospital_name,
            referral.mode::text AS referral_mode,
            referral.assigned_specialist_id,
            assigned_specialist.full_name AS specialist_name,
            EXISTS (
              SELECT 1
                FROM tbl_video_consultations video
               WHERE video.referral_id = referral.id
                 AND video.patient_id = appointment.patient_id
                 AND video.is_active IS TRUE
            ) AS has_active_video_consultation,
            EXISTS (
              SELECT 1
                FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = appointment.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS signed_video_decision
       FROM tbl_hospital_appointments appointment
       JOIN tbl_patients patient ON patient.id = appointment.patient_id AND patient.deleted_at IS NULL
       JOIN tbl_referrals referral ON referral.id = appointment.referral_id
       JOIN mst_hospitals hospital ON hospital.id = appointment.hospital_id
       JOIN mst_specialties specialty ON specialty.id = appointment.specialty_id
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
       JOIN tbl_users requester ON requester.id = appointment.booked_by
       JOIN mst_roles requester_role ON requester_role.id = requester.role_id
       LEFT JOIN tbl_users assigned_specialist ON assigned_specialist.id = referral.assigned_specialist_id
      WHERE ${FACILITY_SCOPE}
        AND NOT (
          appointment.assigned_service ILIKE '%video consultation%'
          AND EXISTS (
            SELECT 1
              FROM tbl_video_consultations video
             WHERE video.referral_id = appointment.referral_id
               AND video.patient_id = appointment.patient_id
               AND video.is_active IS TRUE
          )
        )
        ${statusSql}
      ORDER BY appointment.scheduled_at DESC, appointment.created_at DESC
      LIMIT 200`,
    values
  );
  return { appointments: rows };
}

async function listVideoConsultations(userId, query = {}) {
  const status = String(query.status || "").toUpperCase();
  if (status && !APPOINTMENT_STATUSES.includes(status)) {
    throw new HttpError(400, "Select a valid consultation status", "INVALID_FILTER");
  }
  const values = [userId];
  const statusSql = status ? `AND status.code = $${values.push(status)}` : "";
  // CANCELLED rows may be is_active=FALSE after reschedule begins; keep them listable.
  const activeSql = status === "CANCELLED"
    ? ""
    : status
      ? "AND vc.is_active IS TRUE"
      : "AND (vc.is_active IS TRUE OR status.code = 'CANCELLED')";
  const { rows } = await pool.query(
    `${VIDEO_CONSULTATION_SELECT}
      WHERE ${VIDEO_FACILITY_SCOPE}
        ${activeSql} ${statusSql}
      ORDER BY slot.slot_start DESC, vc.created_at DESC
      LIMIT 200`,
    values
  );
  return { consultations: rows };
}

async function getAppointment(userId, id) {
  appointmentId(id);
  const appointment = await pool.query(
    `SELECT appointment.id, appointment.patient_id, patient.patient_code,
            appointment.referral_id, referral.referral_code,
            specialty.name_en AS specialty_name, specialty.name_te AS specialty_name_te,
            requester.full_name AS requesting_clinician,
            requester_role.code AS requesting_role,
            appointment.scheduled_at, appointment.assigned_service, appointment.location_note,
            appointment.attendance::text AS attendance,
            status.code AS status_code, status.name_en AS status_name,
            hospital.name_en AS hospital_name
       FROM tbl_hospital_appointments appointment
       JOIN tbl_patients patient ON patient.id = appointment.patient_id AND patient.deleted_at IS NULL
       JOIN tbl_referrals referral ON referral.id = appointment.referral_id
       JOIN mst_hospitals hospital ON hospital.id = appointment.hospital_id
       JOIN mst_specialties specialty ON specialty.id = appointment.specialty_id
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
       JOIN tbl_users requester ON requester.id = appointment.booked_by
       JOIN mst_roles requester_role ON requester_role.id = requester.role_id
      WHERE appointment.id = $2 AND ${FACILITY_SCOPE}`,
    [userId, id]
  );
  if (!appointment.rows.length) {
    throw new HttpError(404, "Appointment not found in your authorized facilities", "APPOINTMENT_NOT_FOUND");
  }
  const history = await pool.query(
    `SELECT history.from_status_id, from_status.code AS from_status,
            to_status.code AS to_status, to_status.name_en AS status_name,
            history.reason, history.changed_at, actor.full_name AS changed_by
       FROM tbl_appointment_status_history history
       LEFT JOIN mst_appointment_statuses from_status ON from_status.id = history.from_status_id
       JOIN mst_appointment_statuses to_status ON to_status.id = history.to_status_id
       JOIN tbl_users actor ON actor.id = history.changed_by
      WHERE history.hospital_appointment_id = $1
      ORDER BY history.changed_at, history.id`,
    [id]
  );
  return { appointment: appointment.rows[0], history: history.rows };
}

async function lockAuthorizedAppointment(client, userId, id) {
  appointmentId(id);
  const { rows } = await client.query(
    `SELECT appointment.id, appointment.patient_id, appointment.referral_id,
            appointment.hospital_id, appointment.specialty_id,
            appointment.assigned_service, appointment.location_note,
            appointment.scheduled_at, appointment.status_id,
            status.code AS status_code, status.is_terminal,
            appointment.attendance::text AS attendance,
            referral.mode::text AS referral_mode,
            EXISTS (
              SELECT 1
                FROM tbl_video_consultations video
               WHERE video.referral_id = referral.id
                 AND video.patient_id = appointment.patient_id
                 AND video.is_active IS TRUE
            ) AS has_active_video_consultation,
            EXISTS (
              SELECT 1
                FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = appointment.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS signed_video_decision
       FROM tbl_hospital_appointments appointment
       JOIN tbl_referrals referral ON referral.id = appointment.referral_id
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
      WHERE appointment.id = $2 AND ${FACILITY_SCOPE}
      FOR UPDATE OF appointment`,
    [userId, id]
  );
  if (!rows.length) {
    throw new HttpError(404, "Appointment not found in your authorized facilities", "APPOINTMENT_NOT_FOUND");
  }
  return rows[0];
}

function rejectVideoHospitalAppointment(appointment) {
  const service = String(appointment.assigned_service || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const labeledVideo = service.includes("VIDEO_CONSULTATION") || service.includes("VIDEO_CONSULT");
  // BOTH referrals may carry a video-looking service label before the Specialist
  // signs VIDEO_CONSULTATION. Until then Hospital Staff may confirm the hospital visit.
  if (
    appointment.has_active_video_consultation
    || appointment.referral_mode === "VIDEO_CONSULT"
    || (labeledVideo && appointment.signed_video_decision === true)
  ) {
    throw new HttpError(
      409,
      "Video consultation requests must be confirmed from the Specialist slot request",
      "VIDEO_CONSULTATION_CONFIRMATION_REQUIRED"
    );
  }
}

async function lockAuthorizedVideoConsultation(client, userId, id) {
  requireUuid(id, "Invalid video consultation ID");
  const { rows } = await client.query(
    `${VIDEO_CONSULTATION_SELECT}
      WHERE vc.id = $2 AND ${VIDEO_FACILITY_SCOPE}
        AND vc.is_active IS TRUE
      FOR UPDATE OF vc, slot`,
    [userId, id]
  );
  if (!rows.length) {
    throw new HttpError(404, "Video consultation not found in your authorized facilities", "CONSULTATION_NOT_FOUND");
  }
  return rows[0];
}

function assertAssignedVideoSpecialist(consultation) {
  if (
    !["VIDEO_CONSULT", "BOTH"].includes(consultation.referral_mode)
    || consultation.assigned_specialist_id !== consultation.specialist_id
    || !consultation.specialist_active
    || !consultation.specialist_facility_assigned
    || !consultation.signed_video_decision
  ) {
    throw new HttpError(
      409,
      "The assigned Specialist is not active and verified for this referral",
      "VIDEO_SPECIALIST_UNAVAILABLE"
    );
  }
}

async function assertActiveTeleconsultConsent(client, patientId) {
  if (!(await hasConsent(client, patientId, "TELECONSULT"))) {
    throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
  }
}

async function lockHospital(client, hospitalId) {
  const { rows } = await client.query(
    `SELECT id FROM mst_hospitals WHERE id = $1 FOR UPDATE`,
    [hospitalId]
  );
  if (!rows.length) throw new HttpError(404, "Hospital not found", "HOSPITAL_NOT_FOUND");
}

async function statusId(client, code) {
  const { rows } = await client.query(
    "SELECT id FROM mst_appointment_statuses WHERE code = $1",
    [code]
  );
  if (!rows.length) throw new HttpError(500, "Appointment statuses are not configured", "CONFIGURATION_ERROR");
  return rows[0].id;
}

async function assertNoConflict(client, hospitalId, scheduledAt, excludedId) {
  const { rows } = await client.query(
    `SELECT appointment.id
       FROM tbl_hospital_appointments appointment
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
      WHERE appointment.hospital_id = $1
        AND appointment.scheduled_at = $2
        AND status.is_terminal IS FALSE
        AND ($3::uuid IS NULL OR appointment.id <> $3)
      LIMIT 1`,
    [hospitalId, scheduledAt, excludedId || null]
  );
  if (rows.length) {
    throw new HttpError(409, "Another active appointment already uses this hospital time", "APPOINTMENT_TIME_CONFLICT");
  }
}

async function writeHistory(client, appointmentIdValue, fromStatusId, toStatusId, userId, reason) {
  await client.query(
    `INSERT INTO tbl_appointment_status_history
       (hospital_appointment_id, from_status_id, to_status_id, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [appointmentIdValue, fromStatusId, toStatusId, userId, reason]
  );
}

async function confirmAppointment(userId, req, id) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockAuthorizedAppointment(client, userId, id);
    rejectVideoHospitalAppointment(appointment);
    if (appointment.status_code !== "REQUESTED") {
      throw new HttpError(409, "Only requested appointments can be confirmed", "INVALID_APPOINTMENT_TRANSITION");
    }
    await lockHospital(client, appointment.hospital_id);
    await assertNoConflict(client, appointment.hospital_id, appointment.scheduled_at, appointment.id);
    const confirmedId = await statusId(client, "CONFIRMED");
    const { rows } = await client.query(
      `UPDATE tbl_hospital_appointments
          SET status_id = $2, confirmed_by = $3, confirmed_at = now(), version = version + 1
        WHERE id = $1
        RETURNING id, scheduled_at, attendance::text AS attendance`,
      [appointment.id, confirmedId, userId]
    );
    await writeHistory(client, appointment.id, appointment.status_id, confirmedId, userId, "Appointment confirmed by Hospital Staff");
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_APPOINTMENT_CONFIRMED",
      resourceType: "hospital_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
    });
    return { ...rows[0], status_code: "CONFIRMED" };
  });
}

// Legacy confirm bypassed the mandatory workflow:
// availability request → Specialist ACCEPT/SUGGEST → Hospital Staff final confirm.
// Keep the route for auth/RBAC compatibility, but never confirm from this path.
async function confirmVideoConsultation(userId, req, id) {
  requireUuid(id, "Invalid video consultation ID");
  // Still enforce facility scope so unauthorized IDs do not leak as a generic bypass error.
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await lockAuthorizedVideoConsultation(client, userId, id);
    throw new HttpError(
      409,
      "Video consultations must be confirmed from an accepted Specialist availability request",
      "VIDEO_AVAILABILITY_CONFIRMATION_REQUIRED"
    );
  });
}

async function rescheduleAppointment(userId, req, id, input = {}) {
  const scheduledAt = futureDateTime(input.scheduled_at, "New appointment date and time");
  const reason = requiredReason(input.reason, "Reschedule reason");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockAuthorizedAppointment(client, userId, id);
    rejectVideoHospitalAppointment(appointment);
    if (!["REQUESTED", "CONFIRMED"].includes(appointment.status_code)
      || appointment.attendance !== "PENDING") {
      throw new HttpError(409, "This appointment cannot be rescheduled", "INVALID_APPOINTMENT_TRANSITION");
    }
    await lockHospital(client, appointment.hospital_id);
    await assertNoConflict(client, appointment.hospital_id, scheduledAt, appointment.id);
    const rescheduledId = await statusId(client, "RESCHEDULED");
    const confirmedId = await statusId(client, "CONFIRMED");
    await client.query(
      `UPDATE tbl_hospital_appointments
          SET status_id = $2, cancel_reason = $3, version = version + 1
        WHERE id = $1`,
      [appointment.id, rescheduledId, reason]
    );
    await writeHistory(client, appointment.id, appointment.status_id, rescheduledId, userId, reason);
    const { rows } = await client.query(
      `INSERT INTO tbl_hospital_appointments
         (referral_id, patient_id, hospital_id, specialty_id, assigned_service, location_note,
          scheduled_at, status_id, booked_by, confirmed_by, confirmed_at, rescheduled_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,now(),$10)
       RETURNING id, scheduled_at, attendance::text AS attendance`,
      [appointment.referral_id, appointment.patient_id, appointment.hospital_id, appointment.specialty_id,
        appointment.assigned_service, appointment.location_note, scheduledAt, confirmedId, userId, appointment.id]
    );
    await writeHistory(client, rows[0].id, null, confirmedId, userId, reason);
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_APPOINTMENT_RESCHEDULED",
      resourceType: "hospital_appointment",
      resourceId: rows[0].id,
      patientId: appointment.patient_id,
      metadata: { previous_appointment_id: appointment.id },
    });
    return { ...rows[0], status_code: "CONFIRMED", rescheduled_from_id: appointment.id };
  });
}

async function rescheduleVideoConsultation(userId, req, id, input = {}) {
  const slotId = requireUuid(input.slot_id, "Invalid Specialist slot ID");
  const reason = requiredReason(input.reason, "Reschedule reason");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const consultation = await lockAuthorizedVideoConsultation(client, userId, id);
    if (!["REQUESTED", "RESCHEDULED", "CONFIRMED"].includes(consultation.status_code)
      || consultation.attendance !== "PENDING") {
      throw new HttpError(409, "This video consultation cannot be rescheduled", "INVALID_APPOINTMENT_TRANSITION");
    }
    assertAssignedVideoSpecialist(consultation);
    await assertActiveTeleconsultConsent(client, consultation.patient_id);
    if (slotId === consultation.slot_id) {
      throw new HttpError(400, "Select a different available Specialist slot", "CONSULTATION_SLOT_UNAVAILABLE");
    }
    const availableSlot = await client.query(
      `SELECT id, slot_start, slot_end
         FROM tbl_consultation_slots candidate
        WHERE candidate.id = $1
          AND candidate.specialist_id = $2
          AND candidate.mode = 'VIDEO'
          AND candidate.is_booked IS FALSE
          AND candidate.slot_start > now()
          AND (candidate.hospital_id IS NULL OR candidate.hospital_id = $3)
          AND NOT EXISTS (
            SELECT 1 FROM tbl_video_consultations booked
             WHERE booked.slot_id = candidate.id AND booked.is_active IS TRUE
          )
        FOR UPDATE`,
      [slotId, consultation.specialist_id, consultation.to_hospital_id]
    );
    if (!availableSlot.rows.length) {
      throw new HttpError(409, "The selected Specialist slot is no longer available", "CONSULTATION_SLOT_UNAVAILABLE");
    }
    const rescheduledId = await statusId(client, "RESCHEDULED");
    const { rows } = await client.query(
      `UPDATE tbl_video_consultations
          SET slot_id = $2, status_id = $3
        WHERE id = $1 AND is_active IS TRUE
        RETURNING id, slot_id, status_id, attendance::text AS attendance`,
      [consultation.id, slotId, rescheduledId]
    );
    if (!rows.length) {
      throw new HttpError(409, "The video consultation request changed before rescheduling", "INVALID_APPOINTMENT_TRANSITION");
    }
    await client.query(
      `INSERT INTO tbl_appointment_status_history
         (video_consultation_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [consultation.id, consultation.status_id, rescheduledId, userId, reason]
    );
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_VIDEO_CONSULTATION_RESCHEDULED",
      resourceType: "video_consultation",
      resourceId: consultation.id,
      patientId: consultation.patient_id,
      metadata: {
        previous_slot_id: consultation.slot_id,
        slot_id: slotId,
      },
    });
    return {
      ...rows[0],
      scheduled_at: availableSlot.rows[0].slot_start,
      status_code: "RESCHEDULED",
    };
  });
}

async function cancelAppointment(userId, req, id, input = {}) {
  const reason = requiredReason(input.reason, "Cancellation reason");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockAuthorizedAppointment(client, userId, id);
    if (appointment.status_code !== "REQUESTED") {
      throw new HttpError(409, "Only requested appointments can be cancelled by Hospital Staff", "INVALID_APPOINTMENT_TRANSITION");
    }
    const cancelledId = await statusId(client, "CANCELLED");
    await client.query(
      `UPDATE tbl_hospital_appointments
          SET status_id = $2, cancel_reason = $3, version = version + 1
        WHERE id = $1`,
      [appointment.id, cancelledId, reason]
    );
    await writeHistory(client, appointment.id, appointment.status_id, cancelledId, userId, reason);
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_APPOINTMENT_CANCELLED",
      resourceType: "hospital_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
    });
    return { id: appointment.id, status_code: "CANCELLED" };
  });
}

async function recordAttendance(userId, req, id, input = {}) {
  const attendance = String(input.attendance || "").toUpperCase();
  if (!ATTENDANCE_VALUES.includes(attendance)) {
    throw new HttpError(400, "Attendance must be ATTENDED or NO_SHOW", "INVALID_ATTENDANCE");
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > 1000 || (attendance === "NO_SHOW" && !reason)) {
    throw new HttpError(400, "A reason of up to 1000 characters is required when the patient does not attend", "INVALID_ATTENDANCE");
  }
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockAuthorizedAppointment(client, userId, id);
    rejectVideoHospitalAppointment(appointment);
    if (appointment.status_code !== "CONFIRMED" || appointment.attendance !== "PENDING") {
      throw new HttpError(409, "Attendance can only be recorded once for a confirmed appointment", "INVALID_ATTENDANCE_TRANSITION");
    }
    const nextStatus = attendance === "ATTENDED" ? "COMPLETED" : "MISSED";
    const nextStatusId = await statusId(client, nextStatus);
    const { rows } = await client.query(
      `UPDATE tbl_hospital_appointments
          SET status_id = $2, attendance = $3,
              attended_at = CASE WHEN $3 = 'ATTENDED' THEN now() ELSE NULL END,
              missed_reason_text = $4, version = version + 1
        WHERE id = $1
        RETURNING id, scheduled_at, attendance::text AS attendance`,
      [appointment.id, nextStatusId, attendance, reason || null]
    );
    await writeHistory(client, appointment.id, appointment.status_id, nextStatusId, userId, reason || `Attendance recorded: ${attendance}`);
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_APPOINTMENT_ATTENDANCE_RECORDED",
      resourceType: "hospital_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
      metadata: { attendance },
    });
    return { ...rows[0], status_code: nextStatus };
  });
}

module.exports = {
  listAppointments,
  listVideoConsultations,
  getAppointment,
  confirmAppointment,
  confirmVideoConsultation,
  rescheduleAppointment,
  rescheduleVideoConsultation,
  cancelAppointment,
  recordAttendance,
  futureDateTime,
  requiredReason,
};
