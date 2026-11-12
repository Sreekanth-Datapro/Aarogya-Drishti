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
  ensureMeetingProvisioned,
} = require("./videoMeetingService");

const ACTIVE_REQUEST_STATES = ["STAFF_REVIEW", "PENDING", "ACCEPTED", "SUGGESTED"];
const SPECIALIST_VISIBLE_STATES = ["PENDING"];
const REQUEST_TIME_CONFLICT = "This time slot is already booked for another patient.";

const EVENT_COPY = {
  SPECIALIST_AVAILABILITY_REQUEST: {
    title: "Specialist availability request",
    message: "Hospital Staff requested a video consultation availability response.",
  },
  SPECIALIST_AVAILABILITY_RESPONSE: {
    title: "Specialist availability response",
    message: "The assigned Specialist responded to a video consultation availability request.",
  },
  SPECIALIST_AVAILABILITY_ALTERNATIVE: {
    title: "Specialist suggested another time",
    message: "The Specialist suggested an alternative video consultation time. Hospital Staff must review it.",
  },
  SPECIALIST_AVAILABILITY_UNAVAILABLE: {
    title: "Specialist unavailable",
    message: "The Specialist marked the requested video consultation time as unavailable.",
  },
  HOSPITAL_VIDEO_REQUEST_DECLINED: {
    title: "Video appointment request declined",
    message: "Hospital Staff declined a video consultation coordination request.",
  },
  HOSPITAL_VIDEO_REQUEST_RESCHEDULED: {
    title: "Video appointment request rescheduled",
    message: "Hospital Staff rescheduled a video consultation coordination request.",
  },
  NAVIGATOR_VIDEO_PREFERRED_TIME: {
    title: "Navigator preferred video time",
    message: "A Navigator submitted a patient's preferred video consultation time for Hospital Staff review.",
  },
};

async function loadApptReminderTemplate(client) {
  const { rows: templates } = await client.query(
    `SELECT template.id, template.language_id
       FROM mst_notification_templates template
       JOIN mst_languages language ON language.id = template.language_id
      WHERE template.code = 'APPT_REMINDER'
        AND template.channel = 'IN_APP'
        AND template.is_active IS TRUE
      ORDER BY (language.code = 'en') DESC, template.id
      LIMIT 1`
  );
  if (!templates.length) {
    throw new HttpError(500, "In-app notification template is not configured", "CONFIGURATION_ERROR");
  }
  return templates[0];
}

async function createCoordinationNotification(client, {
  recipientUserId,
  event,
  requestId = null,
  consultationId = null,
  patientId = null,
  targetPath = null,
  title = null,
  message = null,
  dedupeKey = null,
  extras = {},
}) {
  if (!recipientUserId) return false;
  const copy = EVENT_COPY[event] || {};
  const payload = {
    event,
    ...(requestId ? { request_id: requestId } : {}),
    ...(consultationId ? { video_consultation_id: consultationId } : {}),
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    ...(targetPath ? { target_path: targetPath } : {}),
    title: title || copy.title || "Video consultation update",
    message: message || copy.message || "A video consultation update is available.",
    ...extras,
  };

  if (dedupeKey) {
    const existing = await client.query(
      `SELECT 1
         FROM tbl_notifications
        WHERE recipient_user_id = $1
          AND payload->>'event' = $2
          AND payload->>'dedupe_key' = $3
        LIMIT 1`,
      [recipientUserId, event, dedupeKey]
    );
    if (existing.rows.length) return false;
  }

  const template = await loadApptReminderTemplate(client);
  await client.query(
    `INSERT INTO tbl_notifications
       (recipient_user_id, patient_id, template_id, channel, language_id, status,
        payload, related_video_id, sent_at)
     VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, $6, now())`,
    [
      recipientUserId,
      patientId,
      template.id,
      template.language_id,
      JSON.stringify(payload),
      consultationId,
    ]
  );
  return true;
}

async function createAvailabilityNotification(client, recipientUserId, event, requestId, extras = {}) {
  return createCoordinationNotification(client, {
    recipientUserId,
    event,
    requestId,
    dedupeKey: `${event}:${requestId}:${recipientUserId}`,
    ...extras,
  });
}

async function notifyReferralCoordinators(client, {
  referralId,
  event,
  requestId = null,
  consultationId = null,
  includeHospitalRequesterId = null,
  includeHealthWorker = false,
  excludeUserIds = [],
  targetForNavigator = "/navigator/appointments",
  targetForHealthWorker = "/health-worker/appointments",
  title = null,
  message = null,
  dedupeSuffix = "",
}) {
  const { rows } = await client.query(
    `SELECT referral.assigned_navigator_id,
            patient.registered_by AS health_worker_id,
            registrar_role.code AS health_worker_role
       FROM tbl_referrals referral
       JOIN tbl_patients patient ON patient.id = referral.patient_id
       LEFT JOIN tbl_users registrar ON registrar.id = patient.registered_by
       LEFT JOIN mst_roles registrar_role ON registrar_role.id = registrar.role_id
      WHERE referral.id = $1`,
    [referralId]
  );
  if (!rows.length) return;
  const context = rows[0];
  const excluded = new Set(excludeUserIds.filter(Boolean));
  const recipients = [];
  if (context.assigned_navigator_id && !excluded.has(context.assigned_navigator_id)) {
    recipients.push({
      userId: context.assigned_navigator_id,
      targetPath: requestId
        ? `${targetForNavigator}#video-availability-request-${requestId}`
        : targetForNavigator,
    });
  }
  if (includeHealthWorker
    && context.health_worker_role === "HEALTH_WORKER"
    && context.health_worker_id
    && !excluded.has(context.health_worker_id)) {
    recipients.push({
      userId: context.health_worker_id,
      targetPath: targetForHealthWorker,
    });
  }
  if (includeHospitalRequesterId && !excluded.has(includeHospitalRequesterId)) {
    recipients.push({
      userId: includeHospitalRequesterId,
      targetPath: requestId
        ? `/hospital-staff/appointments#video-availability-request-${requestId}`
        : "/hospital-staff/appointments",
    });
  }
  const seen = new Set();
  for (const recipient of recipients) {
    if (seen.has(recipient.userId)) continue;
    seen.add(recipient.userId);
    await createCoordinationNotification(client, {
      recipientUserId: recipient.userId,
      event,
      requestId,
      consultationId,
      targetPath: recipient.targetPath,
      title,
      message,
      dedupeKey: `${event}:${requestId || consultationId}:${recipient.userId}:${dedupeSuffix}`,
    });
  }
}

async function notifyHospitalStaffForReferral(client, {
  hospitalId,
  event,
  requestId,
  patientId = null,
  excludeUserId = null,
}) {
  const { rows } = await client.query(
    `SELECT DISTINCT staff.id
       FROM tbl_users staff
       JOIN mst_roles role ON role.id = staff.role_id
       JOIN tbl_user_facility_assignments assignment ON assignment.user_id = staff.id
       JOIN mst_facilities facility ON facility.id = assignment.facility_id
      WHERE role.code = 'HOSPITAL_STAFF'
        AND role.is_active IS TRUE
        AND staff.status = 'ACTIVE'
        AND staff.deleted_at IS NULL
        AND facility.facility_type = 'HOSPITAL'
        AND facility.hospital_id = $1
        AND facility.is_active IS TRUE
        AND assignment.valid_from <= CURRENT_DATE
        AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        AND ($2::uuid IS NULL OR staff.id <> $2::uuid)`,
    [hospitalId, excludeUserId]
  );
  for (const staff of rows) {
    await createCoordinationNotification(client, {
      recipientUserId: staff.id,
      event,
      requestId,
      patientId,
      targetPath: `/hospital-staff/appointments#video-availability-request-${requestId}`,
      dedupeKey: `${event}:${requestId}:${staff.id}`,
    });
  }
}

function specialistResponseEvent(status) {
  if (status === "SUGGESTED") return "SPECIALIST_AVAILABILITY_ALTERNATIVE";
  if (status === "DECLINED") return "SPECIALIST_AVAILABILITY_UNAVAILABLE";
  return "SPECIALIST_AVAILABILITY_RESPONSE";
}

async function notifyVideoAppointmentConfirmed(client, {
  referralId,
  patientId,
  consultationId,
  slotStart,
  slotEnd,
  meetingProvisioned,
}) {
  const template = await loadApptReminderTemplate(client);
  const { rows } = await client.query(
    `SELECT referral.referral_code,
            patient.patient_code,
            patient.registered_by AS health_worker_id,
            registrar_role.code AS health_worker_role,
            referral.assigned_navigator_id,
            referral.assigned_specialist_id,
            specialist.full_name AS specialist_name,
            hospital.name_en AS hospital_name,
            specialty.name_en AS specialty_name
       FROM tbl_referrals referral
       JOIN tbl_patients patient ON patient.id = referral.patient_id
       LEFT JOIN tbl_users registrar ON registrar.id = patient.registered_by
       LEFT JOIN mst_roles registrar_role ON registrar_role.id = registrar.role_id
       JOIN tbl_users specialist ON specialist.id = referral.assigned_specialist_id
       JOIN mst_hospitals hospital ON hospital.id = referral.to_hospital_id
       JOIN mst_specialties specialty ON specialty.id = referral.specialty_id
      WHERE referral.id = $1
        AND referral.patient_id = $2`,
    [referralId, patientId]
  );
  if (!rows.length) return { notified: [] };

  const context = rows[0];
  const recipients = [];
  if (context.health_worker_role === "HEALTH_WORKER" && context.health_worker_id) {
    recipients.push({
      userId: context.health_worker_id,
      target_path: "/health-worker/appointments",
    });
  }
  if (context.assigned_navigator_id) {
    recipients.push({
      userId: context.assigned_navigator_id,
      target_path: "/navigator/appointments",
    });
  }
  if (context.assigned_specialist_id) {
    recipients.push({
      userId: context.assigned_specialist_id,
      target_path: "/specialist/consultations",
    });
  }

  const notified = [];
  for (const recipient of recipients) {
    const existing = await client.query(
      `SELECT 1
         FROM tbl_notifications notification
        WHERE notification.recipient_user_id = $1
          AND notification.related_video_id = $2
          AND notification.payload->>'event' = 'VIDEO_APPOINTMENT_CONFIRMED'
        LIMIT 1`,
      [recipient.userId, consultationId]
    );
    if (existing.rows.length) continue;

    const payload = {
      event: "VIDEO_APPOINTMENT_CONFIRMED",
      video_consultation_id: consultationId,
      referral_code: context.referral_code,
      patient_code: context.patient_code,
      specialist_name: context.specialist_name,
      facility: context.hospital_name,
      specialty: context.specialty_name,
      scheduled_start: slotStart,
      scheduled_end: slotEnd,
      status: "CONFIRMED",
      meeting_ready: meetingProvisioned === true,
      target_path: recipient.target_path,
      title: "Video consultation confirmed",
      message: meetingProvisioned
        ? `A video consultation for ${context.referral_code} was confirmed. Open My Appointments to join at the scheduled time.`
        : `A video consultation for ${context.referral_code} was confirmed. Meeting link setup is pending; open My Appointments for details.`,
    };
    await client.query(
      `INSERT INTO tbl_notifications
         (recipient_user_id, patient_id, template_id, channel, language_id, status,
          payload, related_video_id, sent_at)
       VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, $6, now())`,
      [
        recipient.userId,
        patientId,
        template.id,
        template.language_id,
        JSON.stringify(payload),
        consultationId,
      ]
    );
    notified.push(recipient.userId);
  }
  return { notified };
}

async function provisionConfirmedMeeting(client, consultation, slot) {
  try {
    const meeting = await ensureMeetingProvisioned(client, {
      id: consultation.id,
      status_code: "CONFIRMED",
      is_active: true,
      provider: consultation.provider || null,
      room_ref: consultation.room_ref || null,
      meeting_expires_at: consultation.meeting_expires_at || null,
      slot_end: slot.slot_end,
    }, slot);
    return {
      meeting_provisioned: true,
      meeting_already_existed: meeting.already_existed === true,
      provider: meeting.provider,
      room_ref: meeting.room_ref,
      meeting_expires_at: meeting.meeting_expires_at,
      meeting_error: null,
      meeting_error_code: null,
    };
  } catch (error) {
    if (error.code === "VIDEO_PROVIDER_NOT_CONFIGURED") {
      return {
        meeting_provisioned: false,
        meeting_already_existed: false,
        provider: null,
        room_ref: null,
        meeting_expires_at: null,
        meeting_error: error.message,
        meeting_error_code: error.code,
      };
    }
    throw error;
  }
}

const STAFF_FACILITY_SCOPE = `EXISTS (
  SELECT 1
    FROM tbl_user_facility_assignments assignment
    JOIN mst_facilities facility ON facility.id = assignment.facility_id
   WHERE assignment.user_id = $1
     AND facility.facility_type = 'HOSPITAL'
     AND facility.hospital_id = availability.hospital_id
     AND facility.is_active IS TRUE
     AND assignment.valid_from <= CURRENT_DATE
     AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
)`;

const ELIGIBLE_FACILITY_SCOPE = `EXISTS (
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

const SPECIALIST_CASE_SCOPE = `referral.assigned_specialist_id = $1
  AND EXISTS (
    SELECT 1
      FROM tbl_case_assignments case_assignment
     WHERE case_assignment.patient_id = referral.patient_id
       AND case_assignment.referral_id = referral.id
       AND case_assignment.user_id = $1
       AND case_assignment.valid_from <= now()
       AND (case_assignment.valid_to IS NULL OR case_assignment.valid_to > now())
  )
  AND fn_user_has_patient_access($1, referral.patient_id)
  AND EXISTS (
    SELECT 1
      FROM tbl_user_facility_assignments specialist_assignment
      JOIN mst_facilities specialist_facility
        ON specialist_facility.id = specialist_assignment.facility_id
     WHERE specialist_assignment.user_id = $1
       AND specialist_facility.facility_type = 'HOSPITAL'
       AND specialist_facility.hospital_id = referral.to_hospital_id
       AND specialist_facility.is_active IS TRUE
       AND specialist_assignment.valid_from <= CURRENT_DATE
       AND (specialist_assignment.valid_to IS NULL
            OR specialist_assignment.valid_to >= CURRENT_DATE)
  )`;

const REQUEST_SELECT = `
  SELECT availability.id, availability.referral_id, availability.patient_id,
         availability.specialist_id, availability.hospital_id, availability.specialty_id,
         availability.requested_by, availability.requested_start, availability.requested_end,
         availability.status, availability.response_reason, availability.proposed_start,
         availability.proposed_end, availability.slot_id,
         availability.video_consultation_id, availability.rescheduled_from_id,
         availability.responded_at, availability.confirmed_at,
         slot.is_booked AS slot_is_booked,
         CASE
           WHEN slot.id IS NULL
            AND availability.status IN ('ACCEPTED', 'SUGGESTED') THEN 'AVAILABLE'
           WHEN slot.id IS NULL THEN 'PENDING'
           WHEN slot.is_booked IS TRUE THEN 'BOOKED'
           ELSE 'AVAILABLE'
         END AS availability_status,
         COALESCE(alternatives.slots, '[]'::json) AS alternative_slots,
         patient.patient_code, patient.full_name AS patient_name,
         requester.full_name AS hospital_staff_name,
         referral.referral_code, referral.mode::text AS referral_mode,
         specialty.name_en AS specialty_name, specialist.full_name AS specialist_name,
         hospital.name_en AS hospital_name,
         CASE
           WHEN consent.id IS NULL THEN 'NOT_GIVEN'
           WHEN consent.granted IS TRUE THEN 'ACTIVE'
           WHEN consent.previously_granted IS TRUE THEN 'WITHDRAWN'
           ELSE 'DECLINED'
         END AS teleconsult_consent_status,
         EXISTS (
           SELECT 1 FROM tbl_specialist_consultation_decisions decision
            WHERE decision.referral_id = referral.id
              AND decision.patient_id = referral.patient_id
              AND decision.specialist_id = referral.assigned_specialist_id
              AND decision.signed_by = referral.assigned_specialist_id
              AND decision.signed_at IS NOT NULL
              AND decision.status = 'SIGNED'
              AND decision.decision_type = 'VIDEO_CONSULTATION'
         ) AS signed_video_decision,
         slot.slot_start, slot.slot_end,
         video_status.code AS video_status
    FROM tbl_specialist_availability_requests availability
    JOIN tbl_referrals referral ON referral.id = availability.referral_id
    JOIN tbl_patients patient ON patient.id = availability.patient_id AND patient.deleted_at IS NULL
    JOIN mst_specialties specialty ON specialty.id = availability.specialty_id
    JOIN mst_hospitals hospital ON hospital.id = availability.hospital_id
    JOIN tbl_users specialist ON specialist.id = availability.specialist_id
    JOIN tbl_users requester ON requester.id = availability.requested_by
    LEFT JOIN tbl_consultation_slots slot ON slot.id = availability.slot_id
    LEFT JOIN tbl_video_consultations video ON video.id = availability.video_consultation_id
    LEFT JOIN mst_appointment_statuses video_status ON video_status.id = video.status_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', available_slot.id,
               'slot_start', available_slot.slot_start,
               'slot_end', available_slot.slot_end
             ) ORDER BY available_slot.slot_start) AS slots
        FROM (
          SELECT candidate.id, candidate.slot_start, candidate.slot_end
            FROM tbl_consultation_slots candidate
           WHERE candidate.specialist_id = availability.specialist_id
             AND candidate.mode = 'VIDEO'
             AND candidate.is_booked IS FALSE
             AND candidate.slot_start > now()
             AND (candidate.hospital_id IS NULL
                  OR candidate.hospital_id = availability.hospital_id)
             AND (availability.slot_id IS NULL OR candidate.id <> availability.slot_id)
             AND NOT EXISTS (
               SELECT 1 FROM tbl_video_consultations booked
                WHERE booked.slot_id = candidate.id AND booked.is_active IS TRUE
             )
             AND NOT EXISTS (
               SELECT 1 FROM tbl_specialist_availability_requests proposed
                WHERE proposed.specialist_id = candidate.specialist_id
                  AND proposed.status IN ('ACCEPTED', 'SUGGESTED')
                  AND tstzrange(proposed.proposed_start, proposed.proposed_end, '[)')
                      && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
             )
           ORDER BY candidate.slot_start
           LIMIT 10
        ) available_slot
    ) alternatives ON TRUE
    LEFT JOIN LATERAL (
      SELECT pc.id, pc.granted,
             EXISTS (
               SELECT 1
                 FROM tbl_patient_consents previous
                WHERE previous.patient_id = pc.patient_id
                  AND previous.purpose_id = pc.purpose_id
                  AND previous.granted IS TRUE
                  AND previous.consent_seq < pc.consent_seq
             ) AS previously_granted
        FROM tbl_patient_consents pc
        JOIN mst_consent_purposes purpose ON purpose.id = pc.purpose_id
       WHERE pc.patient_id = availability.patient_id AND purpose.code = 'TELECONSULT'
       ORDER BY pc.consent_seq DESC
       LIMIT 1
    ) consent ON TRUE`;

function futureDateTime(value, label) {
  const date = typeof value === "string" || value instanceof Date ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new HttpError(400, `${label} must be a future date and time`, "INVALID_AVAILABILITY_REQUEST");
  }
  return date.toISOString();
}

function validateRange(start, end) {
  const requestedStart = futureDateTime(start, "The requested start");
  const requestedEnd = futureDateTime(end, "The requested end");
  if (new Date(requestedEnd) <= new Date(requestedStart)) {
    throw new HttpError(400, "The end time must be after the start time", "INVALID_AVAILABILITY_RANGE");
  }
  return { start: requestedStart, end: requestedEnd };
}

function requiredReason(value, label) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 1000) {
    throw new HttpError(400, `${label} is required and must be 1000 characters or fewer`, "INVALID_AVAILABILITY_REQUEST");
  }
  return reason;
}

function requireVideoReferral(referral) {
  // COMPLETED means Specialist assessment finished; video booking may still proceed.
  // Mode may remain HOSPITAL_VISIT when the Specialist later signs VIDEO_CONSULTATION.
  const videoModeOrDecision = ["VIDEO_CONSULT", "BOTH"].includes(referral.mode)
    || referral.has_signed_video_decision === true;
  if (
    !videoModeOrDecision
    || !referral.assigned_specialist_id
    || ["CANCELLED", "DECLINED"].includes(referral.referral_status)
    || referral.is_emergency_referral
  ) {
    throw new HttpError(409, "This referral is not eligible for video consultation coordination", "VIDEO_REFERRAL_UNAVAILABLE");
  }
}

// CANCELLED video rows must never block a new booking. Keep the cancelled record
// (and history) intact; only clear is_active so the old slot can be reused.
async function releaseCancelledVideoConsultations(client, referralId) {
  await client.query(
    `UPDATE tbl_video_consultations consultation
        SET is_active = FALSE
       FROM mst_appointment_statuses status
      WHERE consultation.referral_id = $1
        AND consultation.is_active IS TRUE
        AND status.id = consultation.status_id
        AND status.code = 'CANCELLED'`,
    [referralId]
  );
}

async function findBlockingVideoConsultation(client, referralId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT consultation.id, status.code AS status
       FROM tbl_video_consultations consultation
       JOIN mst_appointment_statuses status ON status.id = consultation.status_id
      WHERE consultation.referral_id = $1
        AND consultation.is_active IS TRUE
        AND status.code <> 'CANCELLED'
      ${forUpdate ? "FOR UPDATE OF consultation" : ""}
      LIMIT 1`,
    [referralId]
  );
  return rows[0] || null;
}

async function findLatestCancelledVideoConsultationId(client, referralId) {
  const { rows } = await client.query(
    `SELECT consultation.id
       FROM tbl_video_consultations consultation
       JOIN mst_appointment_statuses status ON status.id = consultation.status_id
      WHERE consultation.referral_id = $1
        AND status.code = 'CANCELLED'
      ORDER BY consultation.updated_at DESC NULLS LAST, consultation.created_at DESC
      LIMIT 1`,
    [referralId]
  );
  return rows[0]?.id || null;
}

function requireSignedVideoDecision(referral) {
  if (!referral.has_signed_video_decision) {
    throw new HttpError(
      409,
      "A signed VIDEO_CONSULTATION decision from the assigned Specialist is required",
      "VIDEO_DECISION_REQUIRED"
    );
  }
}

async function assertActiveSpecialist(client, specialistId, hospitalId) {
  const { rows } = await client.query(
    `SELECT specialist.id
       FROM tbl_users specialist
       JOIN mst_roles role ON role.id = specialist.role_id
      WHERE specialist.id = $1
        AND specialist.status = 'ACTIVE'
        AND specialist.deleted_at IS NULL
        AND role.code = 'SPECIALIST'
        AND role.is_active IS TRUE
        AND EXISTS (
          SELECT 1
            FROM tbl_user_facility_assignments assignment
            JOIN mst_facilities facility ON facility.id = assignment.facility_id
           WHERE assignment.user_id = specialist.id
             AND facility.facility_type = 'HOSPITAL'
             AND facility.hospital_id = $2
             AND facility.is_active IS TRUE
             AND assignment.valid_from <= CURRENT_DATE
             AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        )
      FOR UPDATE OF specialist, role`,
    [specialistId, hospitalId]
  );
  if (!rows.length) {
    throw new HttpError(409, "The assigned Specialist is not active at this hospital", "VIDEO_SPECIALIST_UNAVAILABLE");
  }
}

async function getEligibleReferrals(userId) {
  const { rows } = await pool.query(
    `SELECT referral.id AS referral_id, referral.patient_id, referral.to_hospital_id AS hospital_id,
            referral.specialty_id, referral.assigned_specialist_id AS specialist_id,
            referral.mode::text AS referral_mode, referral.referral_code, patient.patient_code,
            specialty.name_en AS specialty_name, specialist.full_name AS specialist_name,
            hospital.name_en AS hospital_name, 'ACTIVE'::text AS teleconsult_consent_status,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = referral.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS signed_video_decision,
            COALESCE(available.slots, '[]'::json) AS available_slots
       FROM tbl_referrals referral
       JOIN tbl_patients patient ON patient.id = referral.patient_id AND patient.deleted_at IS NULL
       JOIN mst_specialties specialty ON specialty.id = referral.specialty_id
       JOIN mst_hospitals hospital ON hospital.id = referral.to_hospital_id
       JOIN tbl_users specialist ON specialist.id = referral.assigned_specialist_id
       JOIN mst_roles specialist_role ON specialist_role.id = specialist.role_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
                 'id', available_slot.id,
                 'slot_start', available_slot.slot_start,
                 'slot_end', available_slot.slot_end
               ) ORDER BY available_slot.slot_start) AS slots
          FROM (
            SELECT candidate.id, candidate.slot_start, candidate.slot_end
              FROM tbl_consultation_slots candidate
             WHERE candidate.specialist_id = referral.assigned_specialist_id
               AND candidate.mode = 'VIDEO'
               AND candidate.is_booked IS FALSE
               AND candidate.slot_start > now()
               AND (candidate.hospital_id IS NULL
                    OR candidate.hospital_id = referral.to_hospital_id)
               AND NOT EXISTS (
                 SELECT 1 FROM tbl_video_consultations booked
                  WHERE booked.slot_id = candidate.id AND booked.is_active IS TRUE
               )
               AND NOT EXISTS (
                 SELECT 1 FROM tbl_specialist_availability_requests proposed
                  WHERE proposed.specialist_id = candidate.specialist_id
                    AND proposed.status IN ('ACCEPTED', 'SUGGESTED')
                    AND tstzrange(proposed.proposed_start, proposed.proposed_end, '[)')
                        && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
               )
               AND NOT EXISTS (
                 SELECT 1 FROM tbl_specialist_availability_requests requested
                  WHERE requested.slot_id = candidate.id
                    AND requested.status IN ('PENDING', 'ACCEPTED', 'SUGGESTED')
               )
             ORDER BY candidate.slot_start
             LIMIT 10
          ) available_slot
      ) available ON TRUE
      WHERE ${ELIGIBLE_FACILITY_SCOPE}
        AND referral.status::text NOT IN ('CANCELLED', 'DECLINED')
        AND specialist.status = 'ACTIVE' AND specialist.deleted_at IS NULL
        AND specialist_role.code = 'SPECIALIST' AND specialist_role.is_active IS TRUE
        AND EXISTS (
          SELECT 1
            FROM tbl_user_facility_assignments specialist_assignment
            JOIN mst_facilities specialist_facility
              ON specialist_facility.id = specialist_assignment.facility_id
           WHERE specialist_assignment.user_id = specialist.id
             AND specialist_facility.facility_type = 'HOSPITAL'
             AND specialist_facility.hospital_id = referral.to_hospital_id
             AND specialist_facility.is_active IS TRUE
             AND specialist_assignment.valid_from <= CURRENT_DATE
             AND (specialist_assignment.valid_to IS NULL
                  OR specialist_assignment.valid_to >= CURRENT_DATE)
        )
        AND EXISTS (
          SELECT 1 FROM tbl_patient_consents pc
          JOIN mst_consent_purposes purpose ON purpose.id = pc.purpose_id
          WHERE pc.patient_id = patient.id AND purpose.code = 'TELECONSULT'
            AND pc.granted IS TRUE
            AND pc.consent_seq = (
              SELECT max(latest.consent_seq) FROM tbl_patient_consents latest
              WHERE latest.patient_id = pc.patient_id
                AND latest.purpose_id = pc.purpose_id
            )
        )
        AND NOT EXISTS (
          SELECT 1
            FROM tbl_video_consultations video
            JOIN mst_appointment_statuses video_status ON video_status.id = video.status_id
           WHERE video.referral_id = referral.id
             AND video.is_active IS TRUE
             AND video_status.code <> 'CANCELLED'
        )
        AND NOT EXISTS (
          SELECT 1 FROM tbl_specialist_availability_requests availability
           WHERE availability.referral_id = referral.id
             AND availability.status IN ('STAFF_REVIEW', 'PENDING', 'ACCEPTED', 'SUGGESTED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM tbl_specialist_consultation_decisions decision
           WHERE decision.referral_id = referral.id
             AND decision.status = 'SIGNED'
             AND decision.decision_type = 'EMERGENCY_HOSPITAL_REFERRAL'
        )
        AND EXISTS (
          SELECT 1 FROM tbl_specialist_consultation_decisions decision
           WHERE decision.referral_id = referral.id
             AND decision.patient_id = referral.patient_id
             AND decision.specialist_id = referral.assigned_specialist_id
             AND decision.signed_by = referral.assigned_specialist_id
             AND decision.signed_at IS NOT NULL
             AND decision.status = 'SIGNED'
             AND decision.decision_type = 'VIDEO_CONSULTATION'
        )
      ORDER BY referral.created_at DESC
      LIMIT 200`,
    [userId]
  );
  return { referrals: rows };
}

async function listHospitalRequests(userId) {
  const { rows } = await pool.query(
    `${REQUEST_SELECT}
      WHERE ${STAFF_FACILITY_SCOPE}
      ORDER BY availability.created_at DESC
      LIMIT 200`,
    [userId]
  );
  return { requests: rows };
}

async function listSpecialistRequests(userId) {
  const { rows } = await pool.query(
    `${REQUEST_SELECT}
      WHERE availability.specialist_id = $1
        AND availability.status = 'PENDING'
        AND ${SPECIALIST_CASE_SCOPE}
      ORDER BY availability.created_at DESC, availability.requested_start DESC
      LIMIT 100`,
    [userId]
  );
  return { requests: rows };
}

async function listSpecialistAppointments(userId) {
  const { rows: requests } = await pool.query(
    `${REQUEST_SELECT}
      WHERE availability.specialist_id = $1
        AND availability.status IN ('PENDING', 'ACCEPTED', 'SUGGESTED')
        AND ${SPECIALIST_CASE_SCOPE}
      ORDER BY availability.created_at DESC, availability.requested_start DESC
      LIMIT 200`,
    [userId]
  );
  const { rows: consultations } = await pool.query(
    `SELECT consultation.id, consultation.patient_id, consultation.referral_id,
            consultation.specialist_id, consultation.slot_id,
            status.code AS status,
            consultation.attendance::text AS attendance,
            patient.patient_code, patient.full_name AS patient_name,
            referral.referral_code, specialty.name_en AS specialty_name,
            hospital.name_en AS hospital_name,
            requester.full_name AS hospital_staff_name,
            slot.slot_start AS scheduled_start, slot.slot_end AS scheduled_end,
            slot.mode::text AS consultation_type
       FROM tbl_video_consultations consultation
       JOIN tbl_referrals referral
         ON referral.id = consultation.referral_id
        AND referral.patient_id = consultation.patient_id
       JOIN tbl_patients patient
         ON patient.id = consultation.patient_id
        AND patient.deleted_at IS NULL
       JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
       JOIN mst_appointment_statuses status ON status.id = consultation.status_id
       JOIN mst_specialties specialty ON specialty.id = referral.specialty_id
       JOIN mst_hospitals hospital ON hospital.id = referral.to_hospital_id
       JOIN tbl_users requester ON requester.id = consultation.requested_by
      WHERE consultation.specialist_id = $1
        AND referral.assigned_specialist_id = $1
        AND consultation.is_active IS TRUE
        AND status.code IN ('CONFIRMED', 'COMPLETED')
        AND fn_user_has_patient_access($1, referral.patient_id)
        AND EXISTS (
          SELECT 1
            FROM tbl_case_assignments case_assignment
           WHERE case_assignment.patient_id = referral.patient_id
             AND case_assignment.referral_id = referral.id
             AND case_assignment.user_id = $1
             AND case_assignment.valid_from <= now()
             AND (case_assignment.valid_to IS NULL OR case_assignment.valid_to > now())
        )
        AND EXISTS (
          SELECT 1
            FROM tbl_user_facility_assignments specialist_assignment
            JOIN mst_facilities specialist_facility
              ON specialist_facility.id = specialist_assignment.facility_id
           WHERE specialist_assignment.user_id = $1
             AND specialist_facility.facility_type = 'HOSPITAL'
             AND specialist_facility.hospital_id = referral.to_hospital_id
             AND specialist_facility.is_active IS TRUE
             AND specialist_assignment.valid_from <= CURRENT_DATE
             AND (specialist_assignment.valid_to IS NULL
                  OR specialist_assignment.valid_to >= CURRENT_DATE)
        )
      ORDER BY slot.slot_start DESC
      LIMIT 200`,
    [userId]
  );

  return {
    pending_requests: requests.filter((request) => request.status === "PENDING"),
    accepted_requests: requests.filter((request) =>
      ["ACCEPTED", "SUGGESTED"].includes(request.status)
    ),
    confirmed_appointments: consultations.filter((consultation) => consultation.status === "CONFIRMED"),
    completed_consultations: consultations.filter((consultation) => consultation.status === "COMPLETED"),
  };
}

async function lockEligibleReferral(client, userId, referralId) {
  const { rows } = await client.query(
    `SELECT referral.id, referral.patient_id, referral.to_hospital_id,
            referral.specialty_id, referral.assigned_specialist_id,
            referral.mode::text AS mode, referral.status::text AS referral_status,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'EMERGENCY_HOSPITAL_REFERRAL'
            ) AS is_emergency_referral,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = referral.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS has_signed_video_decision
       FROM tbl_referrals referral
      WHERE referral.id = $2
        AND ${ELIGIBLE_FACILITY_SCOPE}
      FOR UPDATE OF referral`,
    [userId, referralId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Referral not found in your authorized hospital facilities", "REFERRAL_NOT_FOUND");
  }
  const referral = rows[0];
  requireVideoReferral(referral);
  requireSignedVideoDecision(referral);
  if (!referral.assigned_specialist_id) {
    throw new HttpError(409, "This referral has no assigned Specialist", "VIDEO_SPECIALIST_UNAVAILABLE");
  }
  await assertActiveSpecialist(client, referral.assigned_specialist_id, referral.to_hospital_id);
  if (!(await hasConsent(client, referral.patient_id, "TELECONSULT"))) {
    throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
  }
  return referral;
}

async function directConfirmHospitalSlot(userId, req, input = {}) {
  const referralId = requireUuid(input.referral_id, "Invalid referral ID");
  const slotId = requireUuid(input.slot_id, "Invalid consultation slot ID");

  try {
    return await withTransaction(pool, async (client) => {
      await setActor(client, userId);
      const referral = await lockEligibleReferral(client, userId, referralId);
      await releaseCancelledVideoConsultations(client, referral.id);
      if (await findBlockingVideoConsultation(client, referral.id, { forUpdate: true })) {
        throw new HttpError(409, "An active video consultation already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
      }

      const { rows: activeRequests } = await client.query(
        `SELECT id, status, requested_start, requested_end
           FROM tbl_specialist_availability_requests
          WHERE referral_id = $1 AND status = ANY($2::text[])
          FOR UPDATE`,
        [referral.id, ACTIVE_REQUEST_STATES]
      );
      const staffReview = activeRequests.find((row) => row.status === "STAFF_REVIEW") || null;
      if (activeRequests.some((row) => row.status !== "STAFF_REVIEW")) {
        throw new HttpError(409, "An active video consultation request already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
      }

      const { rows: slotRows } = await client.query(
        `SELECT slot.id, slot.slot_start, slot.slot_end, slot.mode::text AS mode,
                slot.hospital_id, slot.is_booked
           FROM tbl_consultation_slots slot
          WHERE slot.id = $1
            AND slot.specialist_id = $2
            AND slot.mode = 'VIDEO'
            AND slot.slot_start > now()
            AND slot.is_booked IS FALSE
            AND (slot.hospital_id IS NULL OR slot.hospital_id = $3)
            AND NOT EXISTS (
              SELECT 1 FROM tbl_video_consultations booked
               WHERE booked.slot_id = slot.id AND booked.is_active IS TRUE
            )
            AND NOT EXISTS (
              SELECT 1 FROM tbl_specialist_availability_requests availability
               WHERE availability.slot_id = slot.id
                 AND availability.status IN ('PENDING', 'ACCEPTED', 'SUGGESTED', 'STAFF_REVIEW')
            )
          FOR UPDATE OF slot`,
        [slotId, referral.assigned_specialist_id, referral.to_hospital_id]
      );
      if (!slotRows.length) {
        throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
      }
      if (!(await hasConsent(client, referral.patient_id, "TELECONSULT"))) {
        throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
      }
      await assertNoProposedAvailabilityConflict(client, referral.assigned_specialist_id, {
        start: slotRows[0].slot_start,
        end: slotRows[0].slot_end,
      });

      const { rows: statusRows } = await client.query(
        "SELECT id FROM mst_appointment_statuses WHERE code = 'CONFIRMED'"
      );
      if (!statusRows.length) {
        throw new HttpError(500, "Appointment statuses are not configured", "CONFIGURATION_ERROR");
      }
      const slot = slotRows[0];
      const rescheduledFromId = await findLatestCancelledVideoConsultationId(client, referral.id);
      const { rows: consultationRows } = await client.query(
        `INSERT INTO tbl_video_consultations
           (referral_id, patient_id, slot_id, specialist_id, requested_by, status_id, rescheduled_from_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, slot_id, status_id, attendance::text AS attendance,
                   provider, room_ref, meeting_expires_at, rescheduled_from_id`,
        [
          referral.id,
          referral.patient_id,
          slot.id,
          referral.assigned_specialist_id,
          userId,
          statusRows[0].id,
          rescheduledFromId,
        ]
      );
      const consultation = consultationRows[0];
      await client.query(
        `INSERT INTO tbl_appointment_status_history
           (video_consultation_id, from_status_id, to_status_id, changed_by, reason)
         VALUES ($1, NULL, $2, $3, $4)`,
        [
          consultation.id,
          statusRows[0].id,
          userId,
          rescheduledFromId
            ? "Hospital Staff confirmed a published Specialist slot after cancelled appointment reschedule"
            : "Hospital Staff confirmed an existing Specialist video slot",
        ]
      );

      let requestId = staffReview?.id || null;
      if (staffReview) {
        await client.query(
          `UPDATE tbl_specialist_availability_requests
              SET status = 'CONFIRMED',
                  proposed_start = $2,
                  proposed_end = $3,
                  slot_id = $4,
                  video_consultation_id = $5,
                  confirmed_by = $6,
                  confirmed_at = now(),
                  version = version + 1
            WHERE id = $1 AND status = 'STAFF_REVIEW'`,
          [staffReview.id, slot.slot_start, slot.slot_end, slot.id, consultation.id, userId]
        );
      } else {
        const { rows: insertedRequests } = await client.query(
          `INSERT INTO tbl_specialist_availability_requests
             (referral_id, patient_id, specialist_id, hospital_id, specialty_id,
              requested_by, requested_start, requested_end, status,
              proposed_start, proposed_end, slot_id, video_consultation_id,
              confirmed_by, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED',
                   $7, $8, $9, $10, $6, now())
           RETURNING id`,
          [
            referral.id,
            referral.patient_id,
            referral.assigned_specialist_id,
            referral.to_hospital_id,
            referral.specialty_id,
            userId,
            slot.slot_start,
            slot.slot_end,
            slot.id,
            consultation.id,
          ]
        );
        requestId = insertedRequests[0].id;
      }

      const meeting = await provisionConfirmedMeeting(client, consultation, slot);
      await notifyVideoAppointmentConfirmed(client, {
        referralId: referral.id,
        patientId: referral.patient_id,
        consultationId: consultation.id,
        slotStart: slot.slot_start,
        slotEnd: slot.slot_end,
        meetingProvisioned: meeting.meeting_provisioned,
      });

      await audit(req, {
        client,
        required: true,
        event: "HOSPITAL_VIDEO_SLOT_CONFIRMED",
        resourceType: "video_consultation",
        resourceId: consultation.id,
        patientId: referral.patient_id,
        metadata: {
          referral_id: referral.id,
          slot_id: slot.id,
          request_id: requestId,
          meeting_provisioned: meeting.meeting_provisioned,
        },
      });
      return {
        ...consultation,
        request_id: requestId,
        status_code: "CONFIRMED",
        scheduled_at: slot.slot_start,
        slot_end: slot.slot_end,
        ...meeting,
        meeting_retry_path: meeting.meeting_provisioned
          ? null
          : `/api/video-consultations/${consultation.id}/provision`,
      };
    });
  } catch (error) {
    if (["23P01", "23505"].includes(error.code)) {
      throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
    }
    throw error;
  }
}

async function createHospitalRequest(userId, req, input = {}) {
  const referralId = requireUuid(input.referral_id, "Invalid referral ID");
  const range = validateRange(input.requested_start, input.requested_end);
  const rescheduleConsultationId = input.reschedule_consultation_id
    ? requireUuid(input.reschedule_consultation_id, "Invalid video consultation ID")
    : null;

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const referral = await lockEligibleReferral(client, userId, referralId);
    const activeRequests = await client.query(
      `SELECT 1 FROM tbl_specialist_availability_requests
        WHERE referral_id = $1 AND status = ANY($2::text[])
        LIMIT 1`,
      [referral.id, ACTIVE_REQUEST_STATES]
    );
    if (activeRequests.rows.length) {
      throw new HttpError(409, "An active video consultation request already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
    }

    await releaseCancelledVideoConsultations(client, referral.id);
    const { rows: activeConsultations } = await client.query(
      `SELECT consultation.id, status.code AS status,
              consultation.attendance::text AS attendance,
              slot.mode::text AS slot_mode, slot.slot_start, slot.is_booked,
              EXISTS (
                SELECT 1 FROM tbl_video_consultations other
                 WHERE other.slot_id = slot.id
                   AND other.is_active IS TRUE
                   AND other.id <> consultation.id
              ) AS another_consultation_on_slot
         FROM tbl_video_consultations consultation
         JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
         JOIN mst_appointment_statuses status ON status.id = consultation.status_id
        WHERE consultation.referral_id = $1
          AND consultation.patient_id = $2
          AND consultation.specialist_id = $3
          AND consultation.is_active IS TRUE
          AND status.code <> 'CANCELLED'
        FOR UPDATE OF consultation, slot`,
      [referral.id, referral.patient_id, referral.assigned_specialist_id]
    );
    if (activeConsultations.length) {
      const current = activeConsultations[0];
      const isEligibleForAvailabilityReschedule = rescheduleConsultationId
        && activeConsultations.length === 1
        && current.id === rescheduleConsultationId
        && ["REQUESTED", "RESCHEDULED"].includes(current.status)
        && current.attendance === "PENDING"
        && !(current.slot_mode === "VIDEO"
          && new Date(current.slot_start).getTime() > Date.now()
          && current.is_booked
          && !current.another_consultation_on_slot);
      if (!isEligibleForAvailabilityReschedule) {
        throw new HttpError(409, "An active video consultation already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
      }
    } else if (rescheduleConsultationId) {
      // Cancelled consultations are released (is_active=false) but remain valid
      // reschedule sources — never revive them; a new request/consultation is created.
      const { rows: cancelledRows } = await client.query(
        `SELECT consultation.id
           FROM tbl_video_consultations consultation
           JOIN mst_appointment_statuses status ON status.id = consultation.status_id
          WHERE consultation.id = $1
            AND consultation.referral_id = $2
            AND consultation.patient_id = $3
            AND consultation.specialist_id = $4
            AND status.code = 'CANCELLED'
          FOR UPDATE OF consultation`,
        [
          rescheduleConsultationId,
          referral.id,
          referral.patient_id,
          referral.assigned_specialist_id,
        ]
      );
      if (!cancelledRows.length) {
        throw new HttpError(409, "The video consultation is no longer available for rescheduling", "CONSULTATION_NOT_FOUND");
      }
    }

    const { rows } = await client.query(
      `INSERT INTO tbl_specialist_availability_requests
         (referral_id, patient_id, specialist_id, hospital_id, specialty_id,
          requested_by, requested_start, requested_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, referral_id, requested_start, requested_end, status`,
      [
        referral.id,
        referral.patient_id,
        referral.assigned_specialist_id,
        referral.to_hospital_id,
        referral.specialty_id,
        userId,
        range.start,
        range.end,
      ]
    );
    await createAvailabilityNotification(
      client,
      referral.assigned_specialist_id,
      "SPECIALIST_AVAILABILITY_REQUEST",
      rows[0].id,
      {
        patientId: referral.patient_id,
        targetPath: `/specialist/referrals#availability-request-${rows[0].id}`,
      }
    );
    await notifyReferralCoordinators(client, {
      referralId: referral.id,
      event: "SPECIALIST_AVAILABILITY_REQUEST",
      requestId: rows[0].id,
      title: "Video availability requested",
      message: "Hospital Staff requested Specialist availability for a video consultation.",
      dedupeSuffix: "navigator-copy",
    });
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_VIDEO_AVAILABILITY_REQUESTED",
      resourceType: "specialist_availability_request",
      resourceId: rows[0].id,
      patientId: referral.patient_id,
      metadata: {
        referral_id: referral.id,
        specialist_id: referral.assigned_specialist_id,
        requested_start: range.start,
        requested_end: range.end,
      },
    });
    return rows[0];
  });
}

async function lockNavigatorReferral(client, userId, referralId) {
  const { rows } = await client.query(
    `SELECT referral.id, referral.patient_id, referral.to_hospital_id,
            referral.specialty_id, referral.assigned_specialist_id,
            referral.mode::text AS mode, referral.status::text AS referral_status,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'EMERGENCY_HOSPITAL_REFERRAL'
            ) AS is_emergency_referral,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = referral.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS has_signed_video_decision
       FROM tbl_referrals referral
      WHERE referral.id = $2
        AND referral.assigned_navigator_id = $1
        AND fn_user_has_patient_access($1, referral.patient_id)
      FOR UPDATE OF referral`,
    [userId, referralId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Referral not found in your assigned navigation caseload", "REFERRAL_NOT_FOUND");
  }
  const referral = rows[0];
  requireVideoReferral(referral);
  requireSignedVideoDecision(referral);
  if (!referral.assigned_specialist_id) {
    throw new HttpError(409, "This referral has no assigned Specialist", "VIDEO_SPECIALIST_UNAVAILABLE");
  }
  await assertActiveSpecialist(client, referral.assigned_specialist_id, referral.to_hospital_id);
  if (!(await hasConsent(client, referral.patient_id, "TELECONSULT"))) {
    throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
  }
  return referral;
}

async function createNavigatorPreferredRequest(userId, req, referralId, input = {}) {
  const lockedReferralId = requireUuid(referralId, "Invalid referral ID");
  const range = validateRange(input.requested_start, input.requested_end);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const referral = await lockNavigatorReferral(client, userId, lockedReferralId);
    const activeRequests = await client.query(
      `SELECT 1 FROM tbl_specialist_availability_requests
        WHERE referral_id = $1 AND status = ANY($2::text[])
        LIMIT 1`,
      [referral.id, ACTIVE_REQUEST_STATES]
    );
    if (activeRequests.rows.length) {
      throw new HttpError(409, "An active video consultation request already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
    }
    await releaseCancelledVideoConsultations(client, referral.id);
    if (await findBlockingVideoConsultation(client, referral.id, { forUpdate: true })) {
      throw new HttpError(409, "An active video consultation already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
    }

    const { rows } = await client.query(
      `INSERT INTO tbl_specialist_availability_requests
         (referral_id, patient_id, specialist_id, hospital_id, specialty_id,
          requested_by, requested_start, requested_end, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STAFF_REVIEW')
       RETURNING id, referral_id, requested_start, requested_end, status`,
      [
        referral.id,
        referral.patient_id,
        referral.assigned_specialist_id,
        referral.to_hospital_id,
        referral.specialty_id,
        userId,
        range.start,
        range.end,
      ]
    );
    await notifyHospitalStaffForReferral(client, {
      hospitalId: referral.to_hospital_id,
      event: "NAVIGATOR_VIDEO_PREFERRED_TIME",
      requestId: rows[0].id,
      patientId: referral.patient_id,
      excludeUserId: userId,
    });
    await audit(req, {
      client,
      required: true,
      event: "NAVIGATOR_VIDEO_PREFERRED_TIME_SUBMITTED",
      resourceType: "specialist_availability_request",
      resourceId: rows[0].id,
      patientId: referral.patient_id,
      metadata: {
        referral_id: referral.id,
        specialist_id: referral.assigned_specialist_id,
        requested_start: range.start,
        requested_end: range.end,
      },
    });
    return rows[0];
  });
}

async function forwardStaffReviewToSpecialist(userId, req, requestId) {
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const request = await lockHospitalRequest(client, userId, requestId);
    if (request.status !== "STAFF_REVIEW") {
      throw new HttpError(409, "Only Navigator preferred-time requests awaiting Hospital Staff review can be forwarded", "INVALID_AVAILABILITY_TRANSITION");
    }
    const { rows } = await client.query(
      `UPDATE tbl_specialist_availability_requests
          SET status = 'PENDING', version = version + 1
        WHERE id = $1 AND status = 'STAFF_REVIEW'
        RETURNING id, referral_id, patient_id, specialist_id, status, requested_start, requested_end`,
      [request.id]
    );
    if (!rows.length) {
      throw new HttpError(409, "This preferred-time request changed before it could be forwarded", "INVALID_AVAILABILITY_TRANSITION");
    }
    await createAvailabilityNotification(
      client,
      rows[0].specialist_id,
      "SPECIALIST_AVAILABILITY_REQUEST",
      rows[0].id,
      {
        patientId: rows[0].patient_id,
        targetPath: `/specialist/referrals#availability-request-${rows[0].id}`,
      }
    );
    await notifyReferralCoordinators(client, {
      referralId: rows[0].referral_id,
      event: "SPECIALIST_AVAILABILITY_REQUEST",
      requestId: rows[0].id,
      includeHospitalRequesterId: userId,
      title: "Preferred time sent to Specialist",
      message: "Hospital Staff forwarded the patient's preferred video time to the assigned Specialist.",
      dedupeSuffix: "forwarded",
    });
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_VIDEO_PREFERRED_TIME_FORWARDED",
      resourceType: "specialist_availability_request",
      resourceId: rows[0].id,
      patientId: rows[0].patient_id,
      metadata: { referral_id: rows[0].referral_id },
    });
    return rows[0];
  });
}

async function lockSpecialistRequest(client, userId, requestId) {
  requireUuid(requestId, "Invalid availability request ID");
  const { rows } = await client.query(
    `SELECT availability.*, referral.mode::text AS referral_mode,
            referral.status::text AS referral_status,
            referral.assigned_specialist_id, referral.to_hospital_id,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'EMERGENCY_HOSPITAL_REFERRAL'
            ) AS is_emergency_referral,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = referral.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS has_signed_video_decision
       FROM tbl_specialist_availability_requests availability
       JOIN tbl_referrals referral ON referral.id = availability.referral_id
      WHERE availability.id = $2
        AND availability.specialist_id = $1
        AND ${SPECIALIST_CASE_SCOPE}
      FOR UPDATE OF availability`,
    [userId, requestId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Availability request not found in your assigned cases", "AVAILABILITY_REQUEST_NOT_FOUND");
  }
  const request = rows[0];
  requireVideoReferral({
    mode: request.referral_mode,
    assigned_specialist_id: request.assigned_specialist_id,
    referral_status: request.referral_status,
    is_emergency_referral: request.is_emergency_referral,
  });
  requireSignedVideoDecision(request);
  if (request.specialist_id !== userId || request.assigned_specialist_id !== userId) {
    throw new HttpError(403, "Only the assigned Specialist can respond to this request", "FORBIDDEN");
  }
  return request;
}

async function lockSpecialist(client, specialistId) {
  const { rows } = await client.query(
    `SELECT specialist.id
       FROM tbl_users specialist
       JOIN mst_roles role ON role.id = specialist.role_id
      WHERE specialist.id = $1
        AND specialist.status = 'ACTIVE'
        AND specialist.deleted_at IS NULL
        AND role.code = 'SPECIALIST'
        AND role.is_active IS TRUE
      FOR UPDATE OF specialist`,
    [specialistId]
  );
  if (!rows.length) {
    throw new HttpError(409, "The assigned Specialist is no longer active", "VIDEO_SPECIALIST_UNAVAILABLE");
  }
}

async function assertNoProposedAvailabilityConflict(client, specialistId, interval, excludedRequestId = null) {
  const { rows } = await client.query(
    `SELECT id
       FROM tbl_specialist_availability_requests
      WHERE specialist_id = $1
        AND id IS DISTINCT FROM $4::uuid
        AND status IN ('ACCEPTED', 'SUGGESTED')
        AND tstzrange(proposed_start, proposed_end, '[)')
            && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      LIMIT 1
      FOR UPDATE`,
    [specialistId, interval.start, interval.end, excludedRequestId]
  );
  if (rows.length) {
    throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
  }
}

async function assertSpecialistAvailability(client, request, interval) {
  await assertNoProposedAvailabilityConflict(
    client,
    request.specialist_id,
    interval,
    request.id
  );
  const { rows } = await client.query(
    `SELECT slot.id, slot.slot_start, slot.slot_end, slot.mode::text AS mode,
            slot.hospital_id, slot.is_booked,
            EXISTS (
              SELECT 1 FROM tbl_video_consultations video
               WHERE video.slot_id = slot.id AND video.is_active IS TRUE
            ) AS has_active_video
       FROM tbl_consultation_slots slot
      WHERE slot.specialist_id = $1
        AND tstzrange(slot.slot_start, slot.slot_end, '[)')
            && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      ORDER BY slot.slot_start
      FOR UPDATE`,
    [request.specialist_id, interval.start, interval.end]
  );
  const exactSlot = rows.find((slot) =>
    new Date(slot.slot_start).getTime() === new Date(interval.start).getTime()
    && new Date(slot.slot_end).getTime() === new Date(interval.end).getTime()
    && slot.mode === "VIDEO"
    && (slot.hospital_id === null || Number(slot.hospital_id) === Number(request.hospital_id))
    && !slot.is_booked
    && !slot.has_active_video
  );
  if (rows.length && !exactSlot) {
    throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
  }
}

async function findOrCreateAvailabilitySlot(client, request, interval) {
  await assertNoProposedAvailabilityConflict(
    client,
    request.specialist_id,
    interval,
    request.id
  );
  const { rows } = await client.query(
    `SELECT slot.id, slot.slot_start, slot.slot_end, slot.mode::text AS mode,
            slot.hospital_id, slot.is_booked,
            EXISTS (
              SELECT 1 FROM tbl_video_consultations video
               WHERE video.slot_id = slot.id AND video.is_active IS TRUE
            ) AS has_active_video
       FROM tbl_consultation_slots slot
      WHERE slot.specialist_id = $1
        AND tstzrange(slot.slot_start, slot.slot_end, '[)')
            && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      ORDER BY slot.slot_start
      FOR UPDATE`,
    [request.specialist_id, interval.start, interval.end]
  );
  const exactSlot = rows.find((slot) =>
    new Date(slot.slot_start).getTime() === new Date(interval.start).getTime()
    && new Date(slot.slot_end).getTime() === new Date(interval.end).getTime()
    && slot.mode === "VIDEO"
    && (slot.hospital_id === null || Number(slot.hospital_id) === Number(request.hospital_id))
    && !slot.is_booked
    && !slot.has_active_video
  );
  if (exactSlot) return exactSlot;
  if (rows.length) {
    throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO tbl_consultation_slots
       (specialist_id, hospital_id, slot_start, slot_end, mode, created_by)
     VALUES ($1, $2, $3, $4, 'VIDEO', $1)
     RETURNING id, slot_start, slot_end, mode::text AS mode, hospital_id, is_booked`,
    [request.specialist_id, request.hospital_id, interval.start, interval.end]
  );
  return inserted[0];
}

async function respondToRequest(userId, req, requestId, input = {}) {
  const response = String(input.response || "").toUpperCase();
  if (!["ACCEPT", "SUGGEST", "DECLINE"].includes(response)) {
    throw new HttpError(400, "Choose accept, suggest, or decline", "INVALID_AVAILABILITY_RESPONSE");
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (response === "DECLINE" && (!reason || reason.length > 1000)) {
    throw new HttpError(400, "A decline reason of up to 1000 characters is required", "INVALID_AVAILABILITY_RESPONSE");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const request = await lockSpecialistRequest(client, userId, requestId);
    if (request.status !== "PENDING") {
      throw new HttpError(409, "Only pending availability requests can receive a response", "INVALID_AVAILABILITY_TRANSITION");
    }
    await lockSpecialist(client, userId);

    if (response === "DECLINE") {
      const { rows } = await client.query(
        `UPDATE tbl_specialist_availability_requests
            SET status = 'DECLINED', responded_by = $2, responded_at = now(),
                response_reason = $3, version = version + 1
          WHERE id = $1 AND status = 'PENDING'
          RETURNING id, status, response_reason, responded_at`,
        [request.id, userId, reason]
      );
      const event = specialistResponseEvent("DECLINED");
      await createAvailabilityNotification(
        client,
        request.requested_by,
        event,
        request.id,
        {
          patientId: request.patient_id,
          targetPath: `/hospital-staff/appointments#video-availability-request-${request.id}`,
        }
      );
      await notifyHospitalStaffForReferral(client, {
        hospitalId: request.hospital_id,
        event,
        requestId: request.id,
        patientId: request.patient_id,
        excludeUserId: request.requested_by,
      });
      await notifyReferralCoordinators(client, {
        referralId: request.referral_id,
        event,
        requestId: request.id,
        excludeUserIds: [request.requested_by],
        dedupeSuffix: "specialist-declined",
      });
      await audit(req, {
        client,
        required: true,
        event: "SPECIALIST_VIDEO_AVAILABILITY_DECLINED",
        resourceType: "specialist_availability_request",
        resourceId: request.id,
        patientId: request.patient_id,
        metadata: { referral_id: request.referral_id },
      });
      return rows[0];
    }

    if (!(await hasConsent(client, request.patient_id, "TELECONSULT"))) {
      throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
    }
    const interval = response === "ACCEPT"
      ? validateRange(request.requested_start, request.requested_end)
      : validateRange(input.proposed_start, input.proposed_end);
    await assertSpecialistAvailability(client, request, interval);
    const status = response === "ACCEPT" ? "ACCEPTED" : "SUGGESTED";
    const { rows } = await client.query(
      `UPDATE tbl_specialist_availability_requests
          SET status = $2, responded_by = $3, responded_at = now(),
              response_reason = $4, proposed_start = $5, proposed_end = $6,
              version = version + 1
        WHERE id = $1 AND status = 'PENDING'
        RETURNING id, status, response_reason, proposed_start, proposed_end, slot_id, responded_at`,
      [request.id, status, userId, reason || null, interval.start, interval.end]
    );
    const event = specialistResponseEvent(status);
    await createAvailabilityNotification(
      client,
      request.requested_by,
      event,
      request.id,
      {
        patientId: request.patient_id,
        targetPath: `/hospital-staff/appointments#video-availability-request-${request.id}`,
      }
    );
    await notifyHospitalStaffForReferral(client, {
      hospitalId: request.hospital_id,
      event,
      requestId: request.id,
      patientId: request.patient_id,
      excludeUserId: request.requested_by,
    });
    await notifyReferralCoordinators(client, {
      referralId: request.referral_id,
      event,
      requestId: request.id,
      excludeUserIds: [request.requested_by],
      dedupeSuffix: `specialist-${status.toLowerCase()}`,
    });
    await audit(req, {
      client,
      required: true,
      event: `SPECIALIST_VIDEO_AVAILABILITY_${status}`,
      resourceType: "specialist_availability_request",
      resourceId: request.id,
      patientId: request.patient_id,
      metadata: {
        referral_id: request.referral_id,
        proposed_start: interval.start,
        proposed_end: interval.end,
      },
    });
    return rows[0];
  }).catch((error) => {
    if (error.code === "23P01") {
      throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
    }
    throw error;
  });
}

async function lockHospitalRequest(client, userId, requestId) {
  requireUuid(requestId, "Invalid availability request ID");
  const { rows } = await client.query(
    `SELECT availability.*, referral.mode::text AS referral_mode,
            referral.status::text AS referral_status,
            referral.assigned_specialist_id, referral.to_hospital_id,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'EMERGENCY_HOSPITAL_REFERRAL'
            ) AS is_emergency_referral,
            EXISTS (
              SELECT 1 FROM tbl_specialist_consultation_decisions decision
               WHERE decision.referral_id = referral.id
                 AND decision.patient_id = referral.patient_id
                 AND decision.specialist_id = referral.assigned_specialist_id
                 AND decision.signed_by = referral.assigned_specialist_id
                 AND decision.signed_at IS NOT NULL
                 AND decision.status = 'SIGNED'
                 AND decision.decision_type = 'VIDEO_CONSULTATION'
            ) AS has_signed_video_decision
       FROM tbl_specialist_availability_requests availability
       JOIN tbl_referrals referral ON referral.id = availability.referral_id
      WHERE availability.id = $2
        AND ${STAFF_FACILITY_SCOPE}
      FOR UPDATE OF availability, referral`,
    [userId, requestId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Availability request not found in your authorized facilities", "AVAILABILITY_REQUEST_NOT_FOUND");
  }
  const request = rows[0];
  requireVideoReferral({
    mode: request.referral_mode,
    assigned_specialist_id: request.assigned_specialist_id,
    referral_status: request.referral_status,
    is_emergency_referral: request.is_emergency_referral,
  });
  requireSignedVideoDecision(request);
  if (request.to_hospital_id !== request.hospital_id) {
    throw new HttpError(409, "The request hospital no longer matches the referral", "VIDEO_REFERRAL_UNAVAILABLE");
  }
  if (request.assigned_specialist_id !== request.specialist_id) {
    throw new HttpError(409, "The assigned Specialist changed; this request is no longer valid", "VIDEO_SPECIALIST_UNAVAILABLE");
  }
  await assertActiveSpecialist(client, request.specialist_id, request.hospital_id);
  return request;
}

async function confirmHospitalRequest(userId, req, requestId) {
  try {
    return await withTransaction(pool, async (client) => {
      await setActor(client, userId);
      const request = await lockHospitalRequest(client, userId, requestId);
      if (!["ACCEPTED", "SUGGESTED"].includes(request.status)) {
        throw new HttpError(409, "Wait for the assigned Specialist response before confirming", "INVALID_AVAILABILITY_TRANSITION");
      }
      if (request.assigned_specialist_id !== request.specialist_id) {
        throw new HttpError(409, "The assigned Specialist changed; this request cannot be confirmed", "VIDEO_SPECIALIST_UNAVAILABLE");
      }
      if (!(await hasConsent(client, request.patient_id, "TELECONSULT"))) {
        throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
      }
      await client.query("SELECT id FROM tbl_users WHERE id = $1 FOR UPDATE", [request.specialist_id]);

      const interval = validateRange(request.proposed_start, request.proposed_end);
      const slot = await findOrCreateAvailabilitySlot(client, request, interval);

      const booked = await client.query(
        `SELECT id FROM tbl_video_consultations
          WHERE slot_id = $1 AND is_active IS TRUE
          FOR UPDATE`,
        [slot.id]
      );
      if (booked.rows.length) {
        throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
      }
      const { rows: statusRows } = await client.query(
        "SELECT id FROM mst_appointment_statuses WHERE code = 'CONFIRMED'"
      );
      if (!statusRows.length) {
        throw new HttpError(500, "Appointment statuses are not configured", "CONFIGURATION_ERROR");
      }

      await releaseCancelledVideoConsultations(client, request.referral_id);
      const { rows: existingConsultations } = await client.query(
        `SELECT consultation.id, consultation.status_id,
                consultation.attendance::text AS attendance,
                consultation.provider, consultation.room_ref, consultation.meeting_expires_at,
                status.code AS status
           FROM tbl_video_consultations consultation
           JOIN mst_appointment_statuses status ON status.id = consultation.status_id
          WHERE consultation.referral_id = $1
            AND consultation.patient_id = $2
            AND consultation.specialist_id = $3
            AND consultation.is_active IS TRUE
            AND status.code <> 'CANCELLED'
          FOR UPDATE OF consultation`,
        [request.referral_id, request.patient_id, request.specialist_id]
      );
      if (existingConsultations.length > 1) {
        throw new HttpError(409, "Multiple active video consultations already exist for this referral", "CONSULTATION_ALREADY_EXISTS");
      }

      let consultation;
      if (existingConsultations.length === 1) {
        const existingConsultation = existingConsultations[0];
        if (!["REQUESTED", "RESCHEDULED"].includes(existingConsultation.status)
          || existingConsultation.attendance !== "PENDING") {
          throw new HttpError(409, "An active video consultation already exists for this referral", "CONSULTATION_ALREADY_EXISTS");
        }
        const { rows } = await client.query(
          `UPDATE tbl_video_consultations
              SET slot_id = $2, status_id = $3
            WHERE id = $1 AND is_active IS TRUE
            RETURNING id, slot_id, status_id, attendance::text AS attendance,
                      provider, room_ref, meeting_expires_at`,
          [existingConsultation.id, slot.id, statusRows[0].id]
        );
        if (!rows.length) {
          throw new HttpError(409, "The video consultation changed before confirmation", "INVALID_AVAILABILITY_TRANSITION");
        }
        consultation = rows[0];
        await client.query(
          `INSERT INTO tbl_appointment_status_history
             (video_consultation_id, from_status_id, to_status_id, changed_by, reason)
           VALUES ($1, $2, $3, $4, 'Hospital Staff confirmed the replacement Specialist availability time')`,
          [consultation.id, existingConsultation.status_id, statusRows[0].id, userId]
        );
      } else {
        // Always insert a new consultation after CANCELLED. Never revive a cancelled row.
        const rescheduledFromId = await findLatestCancelledVideoConsultationId(
          client,
          request.referral_id
        );
        const { rows } = await client.query(
          `INSERT INTO tbl_video_consultations
             (referral_id, patient_id, slot_id, specialist_id, requested_by, status_id, rescheduled_from_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, slot_id, status_id, attendance::text AS attendance,
                     provider, room_ref, meeting_expires_at, rescheduled_from_id`,
          [
            request.referral_id,
            request.patient_id,
            slot.id,
            request.specialist_id,
            request.requested_by,
            statusRows[0].id,
            rescheduledFromId,
          ]
        );
        consultation = rows[0];
        await client.query(
          `INSERT INTO tbl_appointment_status_history
             (video_consultation_id, from_status_id, to_status_id, changed_by, reason)
           VALUES ($1, NULL, $2, $3, $4)`,
          [
            consultation.id,
            statusRows[0].id,
            userId,
            rescheduledFromId
              ? "Hospital Staff confirmed Specialist availability after cancelled appointment reschedule"
              : "Hospital Staff confirmed Specialist availability request",
          ]
        );
      }

      await client.query(
        `UPDATE tbl_specialist_availability_requests
            SET status = 'CONFIRMED', slot_id = $2, video_consultation_id = $3,
                confirmed_by = $4, confirmed_at = now(), version = version + 1
          WHERE id = $1 AND status IN ('ACCEPTED', 'SUGGESTED')`,
        [request.id, slot.id, consultation.id, userId]
      );

      const meeting = await provisionConfirmedMeeting(client, consultation, slot);
      await notifyVideoAppointmentConfirmed(client, {
        referralId: request.referral_id,
        patientId: request.patient_id,
        consultationId: consultation.id,
        slotStart: slot.slot_start,
        slotEnd: slot.slot_end,
        meetingProvisioned: meeting.meeting_provisioned,
      });

      await audit(req, {
        client,
        required: true,
        event: "HOSPITAL_VIDEO_AVAILABILITY_CONFIRMED",
        resourceType: "specialist_availability_request",
        resourceId: request.id,
        patientId: request.patient_id,
        metadata: {
          video_consultation_id: consultation.id,
          slot_id: slot.id,
          meeting_provisioned: meeting.meeting_provisioned,
        },
      });
      return {
        request_id: request.id,
        status: "CONFIRMED",
        video_consultation_id: consultation.id,
        slot_id: slot.id,
        scheduled_at: slot.slot_start,
        slot_end: slot.slot_end,
        video_status: "CONFIRMED",
        ...meeting,
        meeting_retry_path: meeting.meeting_provisioned
          ? null
          : `/api/video-consultations/${consultation.id}/provision`,
      };
    });
  } catch (error) {
    if (["23P01", "23505"].includes(error.code)) {
      throw new HttpError(409, REQUEST_TIME_CONFLICT, "CONSULTATION_SLOT_UNAVAILABLE");
    }
    throw error;
  }
}

async function declineHospitalRequest(userId, req, requestId, input = {}) {
  const reason = requiredReason(input.reason, "A decline reason");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const request = await lockHospitalRequest(client, userId, requestId);
    if (!ACTIVE_REQUEST_STATES.includes(request.status) && request.status !== "DECLINED") {
      throw new HttpError(409, "This availability request can no longer be declined", "INVALID_AVAILABILITY_TRANSITION");
    }
    const { rows } = await client.query(
      `UPDATE tbl_specialist_availability_requests
          SET status = 'HOSPITAL_DECLINED', cancelled_by = $2, cancelled_at = now(),
              cancellation_reason = $3, version = version + 1
        WHERE id = $1
        RETURNING id, status, cancellation_reason, cancelled_at`,
      [request.id, userId, reason]
    );
    await notifyReferralCoordinators(client, {
      referralId: request.referral_id,
      event: "HOSPITAL_VIDEO_REQUEST_DECLINED",
      requestId: request.id,
      includeHealthWorker: true,
      dedupeSuffix: "hospital-declined",
    });
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_VIDEO_AVAILABILITY_DECLINED",
      resourceType: "specialist_availability_request",
      resourceId: request.id,
      patientId: request.patient_id,
      metadata: { referral_id: request.referral_id },
    });
    return rows[0];
  });
}

async function rescheduleHospitalRequest(userId, req, requestId, input = {}) {
  const range = validateRange(input.requested_start, input.requested_end);
  const reason = requiredReason(input.reason, "A reschedule reason");

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const previous = await lockHospitalRequest(client, userId, requestId);
    if (!["STAFF_REVIEW", "PENDING", "ACCEPTED", "SUGGESTED", "DECLINED"].includes(previous.status)) {
      throw new HttpError(409, "This availability request cannot be rescheduled", "INVALID_AVAILABILITY_TRANSITION");
    }
    if (!(await hasConsent(client, previous.patient_id, "TELECONSULT"))) {
      throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
    }

    await client.query(
      `UPDATE tbl_specialist_availability_requests
          SET status = 'CANCELLED', cancelled_by = $2, cancelled_at = now(),
              cancellation_reason = $3, version = version + 1
        WHERE id = $1`,
      [previous.id, userId, reason]
    );
    const nextStatus = previous.status === "STAFF_REVIEW" ? "STAFF_REVIEW" : "PENDING";
    const { rows } = await client.query(
      `INSERT INTO tbl_specialist_availability_requests
         (referral_id, patient_id, specialist_id, hospital_id, specialty_id,
          requested_by, requested_start, requested_end, status, rescheduled_from_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, referral_id, requested_start, requested_end, status, rescheduled_from_id`,
      [
        previous.referral_id,
        previous.patient_id,
        previous.specialist_id,
        previous.hospital_id,
        previous.specialty_id,
        userId,
        range.start,
        range.end,
        nextStatus,
        previous.id,
      ]
    );
    if (nextStatus === "PENDING") {
      await createAvailabilityNotification(
        client,
        previous.specialist_id,
        "SPECIALIST_AVAILABILITY_REQUEST",
        rows[0].id,
        {
          patientId: previous.patient_id,
          targetPath: `/specialist/referrals#availability-request-${rows[0].id}`,
        }
      );
    } else {
      await notifyHospitalStaffForReferral(client, {
        hospitalId: previous.hospital_id,
        event: "NAVIGATOR_VIDEO_PREFERRED_TIME",
        requestId: rows[0].id,
        patientId: previous.patient_id,
        excludeUserId: userId,
      });
    }
    await notifyReferralCoordinators(client, {
      referralId: previous.referral_id,
      event: "HOSPITAL_VIDEO_REQUEST_RESCHEDULED",
      requestId: rows[0].id,
      includeHealthWorker: true,
      dedupeSuffix: "rescheduled",
    });
    await audit(req, {
      client,
      required: true,
      event: "HOSPITAL_VIDEO_AVAILABILITY_RESCHEDULED",
      resourceType: "specialist_availability_request",
      resourceId: rows[0].id,
      patientId: previous.patient_id,
      metadata: {
        previous_request_id: previous.id,
        requested_start: range.start,
        requested_end: range.end,
      },
    });
    return rows[0];
  });
}

async function getNavigatorRequests(userId, referralId) {
  const referral = requireUuid(referralId, "Invalid referral ID");
  const { rows } = await pool.query(
    `${REQUEST_SELECT}
      WHERE availability.referral_id = $2
        AND referral.assigned_navigator_id = $1
        AND fn_user_has_patient_access($1, availability.patient_id)
      ORDER BY availability.created_at DESC, availability.id DESC`,
    [userId, referral]
  );
  return rows;
}

async function getNavigatorVideoConsultations(userId, referralId) {
  requireUuid(referralId, "Invalid referral ID");
  const { rows } = await pool.query(
    `SELECT consultation.id, video_slot.slot_start, video_slot.slot_end,
            status.code AS status_code, consultation.attendance::text AS attendance,
            consultation.is_active,
            specialist.full_name AS specialist_name,
            hospital.name_en AS hospital_name
       FROM tbl_video_consultations consultation
       JOIN tbl_consultation_slots video_slot ON video_slot.id = consultation.slot_id
       JOIN tbl_referrals referral ON referral.id = consultation.referral_id
       JOIN tbl_users specialist ON specialist.id = consultation.specialist_id
       JOIN mst_hospitals hospital ON hospital.id = referral.to_hospital_id
       JOIN mst_appointment_statuses status ON status.id = consultation.status_id
      WHERE referral.id = $2
        AND referral.assigned_navigator_id = $1
        AND fn_user_has_patient_access($1, referral.patient_id)
        AND (
          (consultation.is_active IS TRUE
            AND NOT EXISTS (
              SELECT 1 FROM tbl_specialist_availability_requests availability
               WHERE availability.video_consultation_id = consultation.id
            ))
          OR status.code = 'CANCELLED'
        )
      ORDER BY video_slot.slot_start DESC`,
    [userId, referralId]
  );
  return rows;
}

module.exports = {
  getEligibleReferrals,
  listHospitalRequests,
  listSpecialistRequests,
  listSpecialistAppointments,
  createHospitalRequest,
  createNavigatorPreferredRequest,
  forwardStaffReviewToSpecialist,
  directConfirmHospitalSlot,
  respondToRequest,
  confirmHospitalRequest,
  rescheduleHospitalRequest,
  declineHospitalRequest,
  getNavigatorRequests,
  getNavigatorVideoConsultations,
};
