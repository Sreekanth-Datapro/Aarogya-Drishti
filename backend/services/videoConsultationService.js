const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const {
  hasConsent,
  requireUuid,
  setActor,
  withTransaction,
} = require("./medicalOfficer/scope");
const {
  deriveLifecycle,
  ensureMeetingProvisioned,
  formatInKolkata,
  issuePublicMeetingAccess,
  kolkataDateKey,
  isVideoProviderConfigured,
} = require("./videoMeetingService");

const APPOINTMENT_FILTERS = new Set(["upcoming", "today", "completed", "cancelled"]);

const CONSULTATION_SELECT = `
  SELECT consultation.id AS video_consultation_id,
         consultation.referral_id,
         consultation.patient_id,
         consultation.specialist_id,
         consultation.is_active,
         consultation.provider,
         consultation.room_ref,
         consultation.meeting_expires_at,
         consultation.started_at,
         consultation.ended_at,
         consultation.attendance::text AS attendance,
         status.code AS status_code,
         status.name_en AS status_name,
         slot.slot_start,
         slot.slot_end,
         EXTRACT(EPOCH FROM (slot.slot_end - slot.slot_start))::int AS duration_seconds,
         patient.patient_code,
         patient.full_name AS patient_name,
         patient.registered_by AS health_worker_id,
         health_worker.full_name AS health_worker_name,
         referral.referral_code,
         referral.assigned_navigator_id,
         navigator.full_name AS navigator_name,
         specialist.full_name AS specialist_name,
         specialty.name_en AS specialty_name,
         specialty.name_te AS specialty_name_te,
         hospital.name_en AS hospital_name,
         hospital.name_te AS hospital_name_te,
         EXISTS (
           SELECT 1
             FROM tbl_patient_contact_history contact
            WHERE contact.patient_id = patient.id
              AND contact.contacted_by = referral.assigned_navigator_id
         ) AS has_navigator_contact,
         (
           SELECT contact.outcome::text
             FROM tbl_patient_contact_history contact
            WHERE contact.patient_id = patient.id
              AND contact.contacted_by = referral.assigned_navigator_id
            ORDER BY contact.contacted_at DESC
            LIMIT 1
         ) AS latest_contact_outcome,
         EXISTS (
           SELECT 1
             FROM tbl_notifications reminder
            WHERE reminder.related_video_id = consultation.id
              AND reminder.payload->>'event' = 'VIDEO_APPOINTMENT_CONFIRMED'
         ) AS reminder_sent,
         EXISTS (
           SELECT 1
             FROM tbl_consultation_notes note
            WHERE note.consultation_id = consultation.id
              AND note.signed_at IS NOT NULL
         ) AS has_signed_report
    FROM tbl_video_consultations consultation
    JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
    JOIN mst_appointment_statuses status ON status.id = consultation.status_id
    JOIN tbl_patients patient ON patient.id = consultation.patient_id
    JOIN tbl_referrals referral
      ON referral.id = consultation.referral_id
     AND referral.patient_id = consultation.patient_id
    JOIN tbl_users specialist ON specialist.id = consultation.specialist_id
    JOIN mst_specialties specialty ON specialty.id = referral.specialty_id
    JOIN mst_hospitals hospital ON hospital.id = referral.to_hospital_id
    LEFT JOIN tbl_users health_worker ON health_worker.id = patient.registered_by
    LEFT JOIN tbl_users navigator ON navigator.id = referral.assigned_navigator_id
`;

function requireFilter(filter) {
  const value = String(filter || "upcoming").toLowerCase();
  if (!APPOINTMENT_FILTERS.has(value)) {
    throw new HttpError(400, "Invalid appointment filter", "VALIDATION_ERROR");
  }
  return value;
}

function matchesFilter(row, filter, now = new Date()) {
  const lifecycle = deriveLifecycle({
    statusCode: row.status_code,
    isActive: row.is_active,
    slotStart: row.slot_start,
    slotEnd: row.slot_end,
    meetingExpiresAt: row.meeting_expires_at,
    now,
  });
  if (filter === "cancelled") {
    return lifecycle.lifecycle_status === "CANCELLED" || row.status_code === "CANCELLED" || row.is_active === false;
  }
  if (filter === "completed") {
    return lifecycle.lifecycle_status === "COMPLETED" || row.status_code === "COMPLETED";
  }
  if (filter === "today") {
    return kolkataDateKey(row.slot_start) === kolkataDateKey(now)
      && !["CANCELLED", "COMPLETED"].includes(lifecycle.lifecycle_status);
  }
  // upcoming: confirmed/rescheduled and not yet expired/completed/cancelled
  return ["SCHEDULED", "IN_PROGRESS"].includes(lifecycle.lifecycle_status)
    && new Date(row.slot_end).getTime() >= now.getTime() - (15 * 60 * 1000);
}

function serializeAppointment(row, language = "en", options = {}) {
  const lifecycle = deriveLifecycle({
    statusCode: row.status_code,
    isActive: row.is_active,
    slotStart: row.slot_start,
    slotEnd: row.slot_end,
    meetingExpiresAt: row.meeting_expires_at,
    now: options.now || new Date(),
  });
  const meetingReady = Boolean(row.provider && row.room_ref);
  return {
    video_consultation_id: row.video_consultation_id,
    referral_id: row.referral_id,
    referral_code: row.referral_code,
    patient_id: row.patient_id,
    patient_code: row.patient_code,
    patient_name: row.patient_name,
    specialist_id: row.specialist_id,
    specialist_name: row.specialist_name,
    specialty_name: language === "te" && row.specialty_name_te
      ? row.specialty_name_te
      : row.specialty_name,
    hospital_name: language === "te" && row.hospital_name_te
      ? row.hospital_name_te
      : row.hospital_name,
    health_worker_id: row.health_worker_id,
    health_worker_name: row.health_worker_name,
    navigator_id: row.assigned_navigator_id,
    navigator_name: row.navigator_name,
    slot_start: row.slot_start,
    slot_end: row.slot_end,
    scheduled_at_display: formatInKolkata(row.slot_start, language),
    slot_end_display: formatInKolkata(row.slot_end, language),
    duration_minutes: Math.max(1, Math.round(Number(row.duration_seconds || 0) / 60)),
    appointment_status: row.status_code,
    appointment_status_name: row.status_name,
    attendance: row.attendance,
    video_status: lifecycle.lifecycle_status,
    meeting_ready: meetingReady,
    meeting_provider: meetingReady ? row.provider : null,
    can_join: lifecycle.can_join && meetingReady && isVideoProviderConfigured(),
    join_blocked_reason: !meetingReady
      ? "MEETING_NOT_READY"
      : (!isVideoProviderConfigured() ? "VIDEO_PROVIDER_NOT_CONFIGURED" : lifecycle.join_blocked_reason),
    patient_contact_status: row.latest_contact_outcome || (row.has_navigator_contact ? "CONTACTED" : "NOT_CONTACTED"),
    reminder_status: row.reminder_sent ? "SENT" : "PENDING",
    has_signed_report: row.has_signed_report === true,
    timezone: "Asia/Kolkata",
  };
}

async function listHealthWorkerAppointments(userId, query = {}) {
  const filter = requireFilter(query.filter);
  const { rows } = await pool.query(
    `${CONSULTATION_SELECT}
      WHERE patient.registered_by = $1
        AND patient.deleted_at IS NULL
        AND fn_user_has_patient_access($1, patient.id)
        AND EXISTS (
          SELECT 1
            FROM mst_roles role
            JOIN tbl_users actor ON actor.role_id = role.id
           WHERE actor.id = $1
             AND role.code = 'HEALTH_WORKER'
        )
      ORDER BY slot.slot_start DESC
      LIMIT 200`,
    [userId]
  );
  const now = new Date();
  return {
    filter,
    appointments: rows
      .filter((row) => matchesFilter(row, filter, now))
      .map((row) => serializeAppointment(row, query.language || "en", { now })),
  };
}

async function listNavigatorAppointments(userId, query = {}) {
  const filter = requireFilter(query.filter);
  const { rows } = await pool.query(
    `${CONSULTATION_SELECT}
      WHERE referral.assigned_navigator_id = $1
        AND patient.deleted_at IS NULL
        AND fn_user_has_patient_access($1, patient.id)
        AND EXISTS (
          SELECT 1
            FROM mst_roles role
            JOIN tbl_users actor ON actor.role_id = role.id
           WHERE actor.id = $1
             AND role.code = 'NAVIGATOR'
        )
      ORDER BY slot.slot_start DESC
      LIMIT 200`,
    [userId]
  );
  const now = new Date();
  return {
    filter,
    appointments: rows
      .filter((row) => matchesFilter(row, filter, now))
      .map((row) => serializeAppointment(row, query.language || "en", { now })),
  };
}

async function getAuthorizedConsultation(client, userId, consultationId, { forUpdate = false } = {}) {
  const id = requireUuid(consultationId, "Invalid video consultation ID");
  const { rows: actorRows } = await client.query(
    `SELECT actor.id, actor.full_name, actor.email, role.code AS role_code
       FROM tbl_users actor
       JOIN mst_roles role ON role.id = actor.role_id
      WHERE actor.id = $1`,
    [userId]
  );
  if (!actorRows.length) {
    throw new HttpError(401, "Authenticated user was not found", "UNAUTHORIZED");
  }
  const actor = actorRows[0];
  const lock = forUpdate ? "FOR UPDATE OF consultation" : "";
  const { rows } = await client.query(
    `${CONSULTATION_SELECT}
      WHERE consultation.id = $2
        AND patient.deleted_at IS NULL
        AND fn_user_has_patient_access($1, patient.id)
      ${lock}`,
    [userId, id]
  );
  if (!rows.length) {
    throw new HttpError(404, "Video consultation not found", "VIDEO_CONSULTATION_NOT_FOUND");
  }
  const row = rows[0];
  const role = actor.role_code;
  const actorId = String(userId);
  let allowed = false;
  // Only the registering Health Worker, assigned Navigator, or assigned Specialist.
  if (role === "HEALTH_WORKER" && String(row.health_worker_id || "") === actorId) allowed = true;
  if (role === "NAVIGATOR" && String(row.assigned_navigator_id || "") === actorId) allowed = true;
  if (role === "SPECIALIST" && String(row.specialist_id || "") === actorId) {
    const { rows: caseRows } = await client.query(
      `SELECT 1
         FROM tbl_case_assignments case_assignment
        WHERE case_assignment.patient_id = $2
          AND case_assignment.referral_id = $3
          AND case_assignment.user_id = $1
          AND case_assignment.valid_from <= now()
          AND (case_assignment.valid_to IS NULL OR case_assignment.valid_to > now())
        LIMIT 1`,
      [userId, row.patient_id, row.referral_id]
    );
    allowed = caseRows.length > 0;
  }
  if (role === "HOSPITAL_STAFF") {
    const { rows: facilityRows } = await client.query(
      `SELECT 1
         FROM tbl_user_facility_assignments assignment
         JOIN mst_facilities facility ON facility.id = assignment.facility_id
         JOIN tbl_referrals referral ON referral.id = $2
        WHERE assignment.user_id = $1
          AND facility.facility_type = 'HOSPITAL'
          AND facility.hospital_id = referral.to_hospital_id
          AND facility.is_active IS TRUE
          AND assignment.valid_from <= CURRENT_DATE
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        LIMIT 1`,
      [userId, row.referral_id]
    );
    allowed = facilityRows.length > 0;
  }
  if (!allowed) {
    throw new HttpError(403, "You are not authorized for this video consultation", "FORBIDDEN");
  }
  return { row, actor };
}

async function provisionMeeting(userId, req, consultationId) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { row } = await getAuthorizedConsultation(client, userId, consultationId, { forUpdate: true });
    if (!["CONFIRMED", "RESCHEDULED"].includes(row.status_code) || row.is_active === false) {
      throw new HttpError(409, "Only confirmed consultations can receive a meeting", "MEETING_NOT_ALLOWED");
    }
    if (!(await hasConsent(client, row.patient_id, "TELECONSULT"))) {
      throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
    }
    const meeting = await ensureMeetingProvisioned(client, {
      id: row.video_consultation_id,
      status_code: row.status_code,
      is_active: row.is_active,
      provider: row.provider,
      room_ref: row.room_ref,
      meeting_expires_at: row.meeting_expires_at,
      slot_end: row.slot_end,
    }, { slot_end: row.slot_end });
    await audit(req, {
      client,
      required: true,
      event: "VIDEO_MEETING_PROVISIONED",
      resourceType: "video_consultation",
      resourceId: row.video_consultation_id,
      patientId: row.patient_id,
      metadata: {
        already_existed: meeting.already_existed === true,
        provider: meeting.provider,
      },
    });
    return {
      video_consultation_id: row.video_consultation_id,
      meeting_provisioned: true,
      meeting_already_existed: meeting.already_existed === true,
      provider: meeting.provider,
      meeting_expires_at: meeting.meeting_expires_at,
    };
  });
}

async function joinConsultation(userId, req, consultationId) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { row, actor } = await getAuthorizedConsultation(client, userId, consultationId, { forUpdate: true });

    if (!(await hasConsent(client, row.patient_id, "TELECONSULT"))) {
      throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
    }
    if (!row.provider || !row.room_ref) {
      throw new HttpError(
        409,
        "The meeting is not ready yet. Ask Hospital Staff to retry meeting provisioning.",
        "MEETING_NOT_READY"
      );
    }

    const lifecycle = deriveLifecycle({
      statusCode: row.status_code,
      isActive: row.is_active,
      slotStart: row.slot_start,
      slotEnd: row.slot_end,
      meetingExpiresAt: row.meeting_expires_at,
    });
    if (!lifecycle.can_join) {
      const messages = {
        CANCELLED: "This consultation was cancelled",
        COMPLETED: "This consultation is already completed",
        EXPIRED: "This consultation meeting has expired",
        TOO_EARLY: "Join opens 10 minutes before the scheduled start (Asia/Kolkata)",
        NOT_CONFIRMED: "Only confirmed consultations can be joined",
      };
      throw new HttpError(
        409,
        messages[lifecycle.join_blocked_reason] || "Joining is not allowed for this consultation",
        lifecycle.join_blocked_reason || "JOIN_NOT_ALLOWED"
      );
    }

    const moderator = actor.role_code === "SPECIALIST";
    const issued = issuePublicMeetingAccess({
      roomRef: row.room_ref,
      userId,
      displayName: actor.full_name,
      moderator,
    });

    await client.query(
      `INSERT INTO tbl_video_join_tokens
         (consultation_id, user_id, token_hash, expires_at, ip_address)
       VALUES ($1, $2, $3, $4, $5::inet)`,
      [
        row.video_consultation_id,
        userId,
        issued.token_hash,
        issued.expires_at,
        req.ip || null,
      ]
    );

    await audit(req, {
      client,
      required: true,
      event: "VIDEO_CONSULTATION_JOIN_AUTHORIZED",
      resourceType: "video_consultation",
      resourceId: row.video_consultation_id,
      patientId: row.patient_id,
      metadata: {
        role: actor.role_code,
        expires_at: issued.expires_at,
        public_jitsi: true,
        // Opening the meeting must never mark attendance.
        attendance_unchanged: true,
      },
    });

    return {
      video_consultation_id: row.video_consultation_id,
      provider: issued.provider,
      domain: issued.domain,
      room_ref: issued.room_ref,
      display_name: issued.display_name,
      moderator: issued.moderator,
      jwt: null,
      expires_at: issued.expires_at,
      join_url: issued.join_url,
      public_room_warning: true,
      video_status: lifecycle.lifecycle_status,
      attendance: row.attendance,
    };
  });
}

module.exports = {
  listHealthWorkerAppointments,
  listNavigatorAppointments,
  provisionMeeting,
  joinConsultation,
  serializeAppointment,
  matchesFilter,
};
