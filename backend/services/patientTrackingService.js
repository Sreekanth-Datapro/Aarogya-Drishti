const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const {
  requireUuid,
  hasConsent,
  pageOptions,
  pagination,
} = require("./medicalOfficer/scope");

const TRACKING_ROLES = new Set([
  "HEALTH_WORKER",
  "NAVIGATOR",
  "SPECIALIST",
  "MEDICAL_OFFICER",
  "HOSPITAL_STAFF",
  "DISTRICT_ADMIN",
  "SYSTEM_ADMIN",
  "SUPER_ADMIN",
]);

function journeyTargetPath(roleName, patientId) {
  if (roleName === "HEALTH_WORKER") return `/health-worker/tracking/${patientId}`;
  if (roleName === "NAVIGATOR") return `/navigator/tracking/${patientId}`;
  if (roleName === "SPECIALIST") return `/specialist/tracking/${patientId}`;
  if (roleName === "MEDICAL_OFFICER") return `/medical-officer/tracking/${patientId}`;
  if (roleName === "HOSPITAL_STAFF") return `/hospital-staff/tracking/${patientId}`;
  if (roleName === "DISTRICT_ADMIN") return `/district/tracking/${patientId}`;
  return `/tracking/${patientId}`;
}

async function assertPatientAccess(userId, roleName, patientId) {
  requireUuid(patientId, "Invalid patient ID");

  if (["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(roleName)) {
    const { rows } = await pool.query(
      `SELECT patient.id, patient.patient_code, patient.full_name,
              patient.registered_facility_id, facility.name_en AS facility_name,
              facility.name_te AS facility_name_te
         FROM tbl_patients patient
         JOIN mst_facilities facility ON facility.id = patient.registered_facility_id
        WHERE patient.id = $1 AND patient.deleted_at IS NULL`,
      [patientId]
    );
    if (!rows.length) throw new HttpError(404, "Patient not found", "NOT_FOUND");
    return rows[0];
  }

  if (roleName === "DISTRICT_ADMIN") {
    const { rows } = await pool.query(
      `SELECT patient.id, patient.patient_code, patient.full_name,
              patient.registered_facility_id, facility.name_en AS facility_name,
              facility.name_te AS facility_name_te
         FROM tbl_patients patient
         JOIN mst_facilities facility ON facility.id = patient.registered_facility_id
         JOIN tbl_users admin
           ON admin.id = $1
          AND admin.district_id = facility.district_id
          AND admin.deleted_at IS NULL
        WHERE patient.id = $2 AND patient.deleted_at IS NULL`,
      [userId, patientId]
    );
    if (!rows.length) throw new HttpError(404, "Patient not found", "NOT_FOUND");
    return rows[0];
  }

  if (roleName === "HOSPITAL_STAFF") {
    const { rows } = await pool.query(
      `SELECT patient.id, patient.patient_code, patient.full_name,
              patient.registered_facility_id, facility.name_en AS facility_name,
              facility.name_te AS facility_name_te
         FROM tbl_patients patient
         JOIN mst_facilities facility ON facility.id = patient.registered_facility_id
        WHERE patient.id = $2
          AND patient.deleted_at IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM tbl_diagnostic_orders diagnostic_order
               JOIN tbl_user_facility_assignments assignment
                 ON assignment.facility_id = diagnostic_order.facility_id
                AND assignment.user_id = $1
                AND assignment.valid_from <= CURRENT_DATE
                AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
              WHERE diagnostic_order.patient_id = patient.id
            )
            OR EXISTS (
              SELECT 1 FROM tbl_hospital_appointments appointment
               JOIN mst_facilities hospital_facility
                 ON hospital_facility.hospital_id = appointment.hospital_id
                AND hospital_facility.facility_type = 'HOSPITAL'
               JOIN tbl_user_facility_assignments assignment
                 ON assignment.facility_id = hospital_facility.id
                AND assignment.user_id = $1
                AND assignment.valid_from <= CURRENT_DATE
                AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
              WHERE appointment.patient_id = patient.id
            )
          )`,
      [userId, patientId]
    );
    if (!rows.length) throw new HttpError(404, "Patient not found", "NOT_FOUND");
    return rows[0];
  }

  const { rows } = await pool.query(
    `SELECT patient.id, patient.patient_code, patient.full_name,
            patient.registered_facility_id, facility.name_en AS facility_name,
            facility.name_te AS facility_name_te
       FROM tbl_patients patient
       JOIN mst_facilities facility ON facility.id = patient.registered_facility_id
      WHERE patient.id = $2
        AND patient.deleted_at IS NULL
        AND fn_user_has_patient_access($1, patient.id)`,
    [userId, patientId]
  );
  if (!rows.length) throw new HttpError(404, "Patient not found", "NOT_FOUND");
  return rows[0];
}

const ROLE_DISPLAY = Object.freeze({
  HEALTH_WORKER: "Health Worker",
  NAVIGATOR: "Navigator",
  SPECIALIST: "Specialist",
  MEDICAL_OFFICER: "Medical Officer",
  HOSPITAL_STAFF: "Hospital Staff",
});

function isPastDue(dueAt, now = new Date()) {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

function withDue(dueAt, now = new Date()) {
  return {
    due_at: dueAt || null,
    is_overdue: isPastDue(dueAt, now),
  };
}

/**
 * Mandatory tracking fields derived from real pending workflow signals.
 * Due dates come only from scheduled tasks/appointments — never invented.
 */
function deriveTrackingSnapshot({
  caseState,
  careStatus,
  openDiagnosticAppt,
  openHospitalAppt,
  openVideo,
  scheduledFollowup,
  openEscalation,
  pendingDiagnosticOrder,
  pendingPathologyReview,
  now = new Date(),
} = {}) {
  const followup = scheduledFollowup || null;

  let next = {
    next_action: "CONTINUE_CARE",
    next_action_label: "Continue patient care pathway",
    responsible_role: null,
    responsible_user_id: null,
    ...withDue(null, now),
  };

  if (caseState === "CLOSED" || careStatus === "CLOSED") {
    next = {
      next_action: "NONE",
      next_action_label: "Case closed",
      responsible_role: null,
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (openEscalation) {
    next = {
      next_action: "REVIEW_ESCALATION",
      next_action_label: "MO review pending",
      responsible_role: "MEDICAL_OFFICER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (followup && followup.status !== "CANCELLED" && followup.status !== "COMPLETED") {
    next = {
      next_action: "COMPLETE_FOLLOWUP",
      next_action_label: "Health Worker patient follow-up pending",
      responsible_role: "HEALTH_WORKER",
      responsible_user_id: followup.assigned_hw_id || null,
      ...withDue(followup.due_at, now),
    };
  } else if (careStatus === "AWAITING_NAVIGATOR") {
    next = {
      next_action: "ASSIGN_CARE_FOLLOWUP",
      next_action_label: "Navigator coordination pending",
      responsible_role: "NAVIGATOR",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (careStatus === "MO_REASSESSMENT" || careStatus === "PATIENT_UNCOMFORTABLE") {
    next = {
      next_action: "MO_REASSESSMENT",
      next_action_label: "Medical Officer reassessment pending",
      responsible_role: "MEDICAL_OFFICER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (careStatus === "FINAL_CHECKUP_PENDING" || careStatus === "TREATMENT_COMPLETED") {
    next = {
      next_action: "MO_FINAL_REVIEW",
      next_action_label: "MO reassessment / final review pending",
      responsible_role: "MEDICAL_OFFICER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (careStatus === "RECOVERY_CONFIRMED") {
    next = {
      next_action: "CLOSE_CARE_PLAN",
      next_action_label: "MO final review pending",
      responsible_role: "MEDICAL_OFFICER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (pendingPathologyReview) {
    next = {
      next_action: "REVIEW_DIAGNOSTIC_REPORT",
      next_action_label: "Specialist report review pending",
      responsible_role: "SPECIALIST",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (
    pendingDiagnosticOrder?.status_code === "SAMPLE_COLLECTED"
    || pendingDiagnosticOrder?.status_code === "REPORT_PENDING"
  ) {
    next = {
      next_action: "UPLOAD_DIAGNOSTIC_REPORT",
      next_action_label: "Report upload pending",
      responsible_role: "HOSPITAL_STAFF",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (openDiagnosticAppt?.status_code === "REQUESTED") {
    next = {
      next_action: "CONFIRM_DIAGNOSTIC_APPOINTMENT",
      next_action_label: "Diagnostic test pending",
      responsible_role: "HOSPITAL_STAFF",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (openDiagnosticAppt?.status_code === "CONFIRMED") {
    next = {
      next_action: "ATTEND_DIAGNOSTIC_APPOINTMENT",
      next_action_label: "Diagnostic test pending",
      responsible_role: "HEALTH_WORKER",
      responsible_user_id: null,
      ...withDue(openDiagnosticAppt.confirmed_at_time, now),
    };
  } else if (pendingDiagnosticOrder) {
    next = {
      next_action: "SCHEDULE_DIAGNOSTIC",
      next_action_label: "Diagnostic test pending",
      responsible_role: "NAVIGATOR",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (openVideo) {
    next = {
      next_action: "JOIN_VIDEO_CONSULTATION",
      next_action_label: "Specialist consultation pending",
      responsible_role: "SPECIALIST",
      responsible_user_id: null,
      ...withDue(openVideo.scheduled_at, now),
    };
  } else if (openHospitalAppt && openHospitalAppt.status_code !== "CANCELLED") {
    next = {
      next_action: "CONFIRM_HOSPITAL_VISIT",
      next_action_label: openHospitalAppt.status_code === "REQUESTED"
        ? "Navigator coordination pending"
        : "Specialist consultation pending",
      responsible_role: openHospitalAppt.status_code === "REQUESTED" ? "HOSPITAL_STAFF" : "NAVIGATOR",
      responsible_user_id: null,
      ...withDue(openHospitalAppt.scheduled_at, now),
    };
  } else if (caseState === "AWAITING_CLINICIAN") {
    next = {
      next_action: "MO_CLINICAL_REVIEW",
      next_action_label: "MO review pending",
      responsible_role: "MEDICAL_OFFICER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (caseState === "REVIEWED" || caseState === "REFERRAL_PLANNED") {
    next = {
      next_action: "NAVIGATOR_COORDINATION",
      next_action_label: "Navigator coordination pending",
      responsible_role: "NAVIGATOR",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (caseState === "APPOINTED") {
    next = {
      next_action: "SPECIALIST_ASSESSMENT",
      next_action_label: "Specialist consultation pending",
      responsible_role: "SPECIALIST",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (!caseState || caseState === "DRAFT") {
    next = {
      next_action: "COMPLETE_REGISTRATION",
      next_action_label: "Registration pending",
      responsible_role: "HEALTH_WORKER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  } else if (caseState === "CONSENTED" || caseState === "SCREENED") {
    next = {
      next_action: "COMPLETE_SCREENING",
      next_action_label: "Screening pending",
      responsible_role: "HEALTH_WORKER",
      responsible_user_id: null,
      ...withDue(null, now),
    };
  }

  let stage = { current_stage: "TREATMENT", current_stage_label: "Treatment" };
  if (careStatus === "CLOSED" || caseState === "CLOSED") {
    stage = { current_stage: "CLOSURE", current_stage_label: "Closure" };
  } else if (careStatus === "RECOVERY_CONFIRMED") {
    stage = { current_stage: "RECOVERY", current_stage_label: "Recovery" };
  } else if (openEscalation) {
    stage = { current_stage: "ESCALATION", current_stage_label: "Escalation" };
  } else if (pendingPathologyReview || next.next_action === "REVIEW_DIAGNOSTIC_REPORT") {
    stage = { current_stage: "REPORT_REVIEW", current_stage_label: "Specialist Report Review" };
  } else if (next.next_action === "UPLOAD_DIAGNOSTIC_REPORT") {
    stage = { current_stage: "REPORT_UPLOAD", current_stage_label: "Report Upload" };
  } else if (
    pendingDiagnosticOrder
    || openDiagnosticAppt
    || ["SCHEDULE_DIAGNOSTIC", "CONFIRM_DIAGNOSTIC_APPOINTMENT", "ATTEND_DIAGNOSTIC_APPOINTMENT"].includes(next.next_action)
  ) {
    stage = { current_stage: "DIAGNOSTIC_TESTS", current_stage_label: "Diagnostic Tests" };
  } else if (
    followup
    || careStatus === "FOLLOWUP_ACTIVE"
    || next.next_action === "COMPLETE_FOLLOWUP"
  ) {
    stage = { current_stage: "FOLLOW_UP", current_stage_label: "Follow-up" };
  } else if (careStatus === "FINAL_CHECKUP_PENDING" || careStatus === "TREATMENT_COMPLETED") {
    stage = { current_stage: "RECOVERY", current_stage_label: "Recovery" };
  } else if (careStatus === "AWAITING_NAVIGATOR") {
    stage = { current_stage: "TREATMENT", current_stage_label: "Treatment" };
  } else if (openVideo || caseState === "APPOINTED" || openHospitalAppt) {
    stage = { current_stage: "SPECIALIST_CONSULTATION", current_stage_label: "Specialist Consultation" };
  } else if (caseState === "AWAITING_CLINICIAN" || caseState === "REVIEWED") {
    stage = { current_stage: "MO_REVIEW", current_stage_label: "MO Review" };
  } else if (caseState === "CONSENTED" || caseState === "SCREENED") {
    stage = { current_stage: "SCREENING", current_stage_label: "Screening" };
  } else if (!caseState || caseState === "DRAFT") {
    stage = { current_stage: "REGISTRATION", current_stage_label: "Registration" };
  }

  return { ...stage, ...next };
}

function resolveResponsiblePerson(next, assignments = {}) {
  const role = next.responsible_role;
  if (!role) {
    return {
      role: null,
      user_id: null,
      name: null,
      display: "Not Assigned",
      assigned: false,
    };
  }

  let userId = next.responsible_user_id || null;
  let name = null;

  if (role === "HEALTH_WORKER") {
    userId = next.responsible_user_id || assignments.health_worker_id || null;
    name = assignments.health_worker_name || null;
  } else if (role === "NAVIGATOR") {
    userId = assignments.navigator_id || null;
    name = assignments.navigator_name || null;
  } else if (role === "SPECIALIST") {
    userId = assignments.specialist_id || null;
    name = assignments.specialist_name || null;
  } else if (role === "MEDICAL_OFFICER") {
    userId = assignments.medical_officer_id || null;
    name = assignments.medical_officer_name || null;
  } else if (role === "HOSPITAL_STAFF") {
    userId = assignments.hospital_staff_id || null;
    name = assignments.hospital_staff_name || null;
  }

  if (userId && name) {
    return {
      role,
      user_id: userId,
      name,
      display: `${name} (${ROLE_DISPLAY[role] || role})`,
      assigned: true,
    };
  }

  if (userId && !name) {
    return {
      role,
      user_id: userId,
      name: null,
      display: ROLE_DISPLAY[role] || role,
      assigned: true,
    };
  }

  return {
    role,
    user_id: null,
    name: null,
    display: "Not Assigned",
    assigned: false,
  };
}

function mandatoryTrackingFields(snapshot, responsible) {
  return {
    current_stage: snapshot.current_stage,
    current_stage_label: snapshot.current_stage_label,
    responsible,
    next_action: snapshot.next_action,
    next_action_label: snapshot.next_action_label,
    next_action_due_at: snapshot.due_at,
    due_date_display: snapshot.due_at ? null : "Not Scheduled",
    is_overdue: Boolean(snapshot.is_overdue),
  };
}

/** @deprecated Prefer deriveTrackingSnapshot — kept for unit-test compatibility. */
function deriveNextAction(signals) {
  const snapshot = deriveTrackingSnapshot(signals);
  return {
    next_action: snapshot.next_action,
    next_action_label: snapshot.next_action_label,
    responsible_role: snapshot.responsible_role,
    responsible_user_id: snapshot.responsible_user_id,
    due_at: snapshot.due_at,
  };
}

async function getPatientJourney(userId, roleName, req, patientId) {
  if (!TRACKING_ROLES.has(roleName)) {
    throw new HttpError(403, "Tracking is not available for this role", "FORBIDDEN");
  }
  const patient = await assertPatientAccess(userId, roleName, patientId);
  const dataProcessing = await hasConsent(pool, patientId, "DATA_PROCESSING");
  if (!dataProcessing && !["SYSTEM_ADMIN", "SUPER_ADMIN", "DISTRICT_ADMIN"].includes(roleName)) {
    throw new HttpError(403, "The patient has no active DATA_PROCESSING consent", "CONSENT_REQUIRED");
  }

  const [
    screening,
    carePlan,
    referral,
    diagnosticOrder,
    diagnosticAppt,
    hospitalAppt,
    video,
    scheduledFollowup,
    escalation,
    pathologyPending,
    moClaim,
    timeline,
    statusHistory,
    appointments,
    diagnostics,
    followups,
    escalations,
  ] = await Promise.all([
    pool.query(
      `SELECT id, case_state::text AS case_state, screening_date, created_at
         FROM tbl_screenings
        WHERE patient_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT plan.id, plan.status::text AS status, plan.responsible_mo_id, plan.assigned_navigator_id,
              plan.clinical_summary, plan.precautions,
              plan.treatment_start_date, plan.expected_end_date, plan.hospital_revisit_date,
              plan.patient_informed, plan.hospital_revisit_scheduled, plan.hospital_attended,
              plan.referral_id,
              mo.full_name AS responsible_mo_name,
              navigator.full_name AS assigned_navigator_name,
              (
                SELECT fr.decision::text
                  FROM tbl_care_final_reviews fr
                 WHERE fr.plan_id = plan.id
                 ORDER BY fr.signed_at DESC
                 LIMIT 1
              ) AS mo_reassessment_outcome
         FROM tbl_care_plans plan
         LEFT JOIN tbl_users mo ON mo.id = plan.responsible_mo_id
         LEFT JOIN tbl_users navigator ON navigator.id = plan.assigned_navigator_id
        WHERE plan.patient_id = $1
          AND plan.status::text NOT IN ('CLOSED', 'SUPERSEDED')
        ORDER BY plan.created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT referral.id, referral.referral_code, referral.status::text AS status,
              referral.assigned_navigator_id, referral.assigned_specialist_id,
              navigator.full_name AS navigator_name, specialist.full_name AS specialist_name
         FROM tbl_referrals referral
         LEFT JOIN tbl_users navigator ON navigator.id = referral.assigned_navigator_id
         LEFT JOIN tbl_users specialist ON specialist.id = referral.assigned_specialist_id
        WHERE referral.patient_id = $1
          AND referral.status::text NOT IN ('CANCELLED', 'DECLINED')
        ORDER BY referral.created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT diagnostic_order.id, diagnostic_order.order_code, status.code AS status_code
         FROM tbl_diagnostic_orders diagnostic_order
         JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
        WHERE diagnostic_order.patient_id = $1
          AND status.is_terminal IS FALSE
        ORDER BY diagnostic_order.created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT appointment.id, status.code AS status_code, appointment.requested_at,
              appointment.confirmed_at_time
         FROM tbl_diagnostic_appointments appointment
         JOIN mst_appointment_statuses status ON status.id = appointment.status_id
        WHERE appointment.patient_id = $1
          AND status.is_terminal IS FALSE
          AND status.code <> 'CANCELLED'
        ORDER BY appointment.created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT appointment.id, status.code AS status_code, appointment.scheduled_at
         FROM tbl_hospital_appointments appointment
         JOIN mst_appointment_statuses status ON status.id = appointment.status_id
        WHERE appointment.patient_id = $1
          AND status.is_terminal IS FALSE
          AND status.code <> 'CANCELLED'
        ORDER BY appointment.scheduled_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT consultation.id, status.code AS status_code, slot.slot_start AS scheduled_at
         FROM tbl_video_consultations consultation
         JOIN mst_appointment_statuses status ON status.id = consultation.status_id
         JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
        WHERE consultation.patient_id = $1
          AND consultation.is_active IS TRUE
          AND status.is_terminal IS FALSE
          AND status.code <> 'CANCELLED'
        ORDER BY slot.slot_start DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT schedule.id, schedule.due_at, schedule.assigned_hw_id,
              schedule.status::text AS status, hw.full_name AS health_worker_name
         FROM tbl_care_followup_schedules schedule
         LEFT JOIN tbl_users hw ON hw.id = schedule.assigned_hw_id
        WHERE schedule.patient_id = $1
          AND schedule.status = 'SCHEDULED'
        ORDER BY schedule.due_at
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT report.id, report.created_at, report.status::text AS status, report.severity
         FROM tbl_care_discomfort_reports report
        WHERE report.patient_id = $1
          AND report.status::text IN ('OPEN', 'ESCALATED')
        ORDER BY report.created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT report.id
         FROM tbl_pathology_reports report
         LEFT JOIN tbl_pathology_reviews review ON review.report_id = report.id AND review.signed_at IS NOT NULL
        WHERE report.patient_id = $1
          AND review.id IS NULL
        ORDER BY report.created_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT claim.medical_officer_id, mo.full_name AS medical_officer_name
         FROM tbl_medical_officer_case_claims claim
         JOIN tbl_users mo ON mo.id = claim.medical_officer_id
        WHERE claim.patient_id = $1
          AND claim.released_at IS NULL
        ORDER BY claim.claimed_at DESC
        LIMIT 1`,
      [patientId]
    ),
    pool.query(
      `SELECT timeline.event_time, timeline.event_type, timeline.resource_type,
              timeline.resource_id, timeline.detail_code, timeline.actor_id,
              actor.full_name AS performed_by
         FROM vw_patient_timeline timeline
         LEFT JOIN tbl_users actor ON actor.id = timeline.actor_id
        WHERE timeline.patient_id = $1
        ORDER BY timeline.event_time DESC
        LIMIT 100`,
      [patientId]
    ),
    pool.query(
      `SELECT history.changed_at AS event_time,
              history.from_status::text AS previous_status,
              history.to_status::text AS new_status,
              history.reason AS notes,
              actor.full_name AS performed_by,
              plan.assigned_navigator_id,
              navigator.full_name AS responsible_name
         FROM tbl_care_plan_status_history history
         JOIN tbl_care_plans plan ON plan.id = history.plan_id
         JOIN tbl_users actor ON actor.id = history.changed_by
         LEFT JOIN tbl_users navigator ON navigator.id = plan.assigned_navigator_id
        WHERE plan.patient_id = $1
        ORDER BY history.changed_at DESC
        LIMIT 50`,
      [patientId]
    ),
    pool.query(
      `SELECT appointment.id, 'HOSPITAL' AS kind, status.code AS status_code,
              appointment.scheduled_at AS when_at, appointment.attendance::text AS attendance
         FROM tbl_hospital_appointments appointment
         JOIN mst_appointment_statuses status ON status.id = appointment.status_id
        WHERE appointment.patient_id = $1
        UNION ALL
        SELECT consultation.id, 'VIDEO', status.code, slot.slot_start, consultation.attendance::text
          FROM tbl_video_consultations consultation
          JOIN mst_appointment_statuses status ON status.id = consultation.status_id
          JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
         WHERE consultation.patient_id = $1
        UNION ALL
        SELECT diagnostic.id, 'DIAGNOSTIC', status.code,
               COALESCE(diagnostic.confirmed_at_time, diagnostic.requested_at),
               diagnostic.attendance::text
          FROM tbl_diagnostic_appointments diagnostic
          JOIN mst_appointment_statuses status ON status.id = diagnostic.status_id
         WHERE diagnostic.patient_id = $1
        ORDER BY when_at DESC
        LIMIT 30`,
      [patientId]
    ),
    pool.query(
      `SELECT diagnostic_order.id, diagnostic_order.order_code, status.code AS status_code,
              diagnostic_order.created_at, diagnostic_order.facility_id
         FROM tbl_diagnostic_orders diagnostic_order
         JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
        WHERE diagnostic_order.patient_id = $1
        ORDER BY diagnostic_order.created_at DESC
        LIMIT 20`,
      [patientId]
    ),
    pool.query(
      `SELECT schedule.id, schedule.due_at, schedule.status::text AS status,
              schedule.assigned_hw_id, hw.full_name AS health_worker_name
         FROM tbl_care_followup_schedules schedule
         LEFT JOIN tbl_users hw ON hw.id = schedule.assigned_hw_id
        WHERE schedule.patient_id = $1
          AND schedule.status::text <> 'CANCELLED'
        ORDER BY schedule.due_at DESC
        LIMIT 20`,
      [patientId]
    ),
    pool.query(
      `SELECT report.id, report.created_at, report.status::text AS status,
              report.severity, report.issue_type
         FROM tbl_care_discomfort_reports report
        WHERE report.patient_id = $1
        ORDER BY report.created_at DESC
        LIMIT 20`,
      [patientId]
    ),
  ]);

  const caseState = screening.rows[0]?.case_state || null;
  const care = carePlan.rows[0] || null;
  const ref = referral.rows[0] || null;
  const followup = scheduledFollowup.rows[0] || null;
  const claim = moClaim.rows[0] || null;
  const careMedicines = care
    ? (await pool.query(
      `SELECT medicine_name, dosage, frequency, duration_days, start_date, expected_end_date, precautions
         FROM tbl_care_medicines
        WHERE plan_id = $1 AND is_active IS TRUE
        ORDER BY sort_order, created_at`,
      [care.id]
    )).rows
    : [];

  const snapshot = deriveTrackingSnapshot({
    caseState,
    careStatus: care?.status || null,
    openDiagnosticAppt: diagnosticAppt.rows[0] || null,
    openHospitalAppt: hospitalAppt.rows[0] || null,
    openVideo: video.rows[0] || null,
    scheduledFollowup: followup,
    openEscalation: escalation.rows[0] || null,
    pendingDiagnosticOrder: diagnosticOrder.rows[0] || null,
    pendingPathologyReview: pathologyPending.rows[0] || null,
  });

  const responsible = resolveResponsiblePerson(snapshot, {
    health_worker_id: followup?.assigned_hw_id || null,
    health_worker_name: followup?.health_worker_name || null,
    navigator_id: care?.assigned_navigator_id || ref?.assigned_navigator_id || null,
    navigator_name: care?.assigned_navigator_name || ref?.navigator_name || null,
    specialist_id: ref?.assigned_specialist_id || null,
    specialist_name: ref?.specialist_name || null,
    medical_officer_id: care?.responsible_mo_id || claim?.medical_officer_id || null,
    medical_officer_name: care?.responsible_mo_name || claim?.medical_officer_name || null,
  });

  const tracking = mandatoryTrackingFields(snapshot, responsible);

  const journeyTimeline = [
    ...statusHistory.rows.map((row) => ({
      event_time: row.event_time,
      activity: "CARE_STATUS_CHANGE",
      previous_status: row.previous_status,
      new_status: row.new_status,
      performed_by: row.performed_by,
      responsible_person: row.responsible_name || "Not Assigned",
      notes: row.notes,
      next_action: tracking.next_action_label,
      due_at: tracking.next_action_due_at,
    })),
    ...timeline.rows.map((row) => ({
      event_time: row.event_time,
      activity: row.event_type,
      previous_status: null,
      new_status: row.detail_code,
      performed_by: row.performed_by || "Not Assigned",
      responsible_person: responsible.display,
      notes: null,
      next_action: tracking.next_action_label,
      due_at: tracking.next_action_due_at,
    })),
  ].sort((a, b) => new Date(b.event_time) - new Date(a.event_time));

  // District / admin journey: redact name if needed for aggregate-safe browsing still allows code
  const showIdentity = !["DISTRICT_ADMIN"].includes(roleName) || dataProcessing;

  await audit(req, {
    event: "PATIENT_JOURNEY_VIEWED",
    resourceType: "patient",
    resourceId: patientId,
    patientId,
    metadata: { role: roleName },
  });

  return {
    journey: {
      patient: {
        id: patient.id,
        patient_code: patient.patient_code,
        full_name: showIdentity ? patient.full_name : null,
        facility_id: patient.registered_facility_id,
        facility_name: patient.facility_name,
        facility_name_te: patient.facility_name_te,
      },
      ...tracking,
      current_status: care?.status || caseState || "UNKNOWN",
      case_state: caseState,
      care_plan_status: care?.status || null,
      treatment_tracking: care
        ? {
            current_treatment_status: care.status,
            clinical_summary: care.clinical_summary || null,
            precautions: care.precautions || null,
            treatment_start_date: care.treatment_start_date || null,
            medicine_end_date: care.expected_end_date || null,
            hospital_revisit_date: care.hospital_revisit_date || null,
            hospital_revisit_status: care.hospital_attended === true
              ? "ATTENDED"
              : care.hospital_attended === false
                ? "MISSED"
                : care.patient_informed
                  ? "PATIENT_INFORMED"
                  : care.hospital_revisit_scheduled
                    ? "SCHEDULED"
                    : "NOT_SCHEDULED",
            revisit_attendance_status: care.hospital_attended == null
              ? "PENDING"
              : care.hospital_attended
                ? "ATTENDED"
                : "NOT_ATTENDED",
            patient_informed: Boolean(care.patient_informed),
            hospital_revisit_scheduled: Boolean(care.hospital_revisit_scheduled),
            mo_reassessment_outcome: care.mo_reassessment_outcome || null,
            assigned_navigator_id: care.assigned_navigator_id || null,
            assigned_navigator_name: care.assigned_navigator_name || null,
            responsible_mo_id: care.responsible_mo_id || null,
            responsible_mo_name: care.responsible_mo_name || null,
            referral_id: care.referral_id || ref?.id || null,
            medicines: careMedicines,
            latest_followup: followups.rows[0] || followup || null,
            diagnostic_status: diagnostics.rows[0]?.status_code || diagnosticOrder.rows[0]?.status_code || null,
            referral_status: ref?.status || null,
            referral_code: ref?.referral_code || null,
            health_worker_name: followup?.health_worker_name
              || followups.rows.find((row) => row.health_worker_name)?.health_worker_name
              || null,
          }
        : null,
      target_path: journeyTargetPath(roleName, patientId),
      timeline: journeyTimeline,
      appointments: appointments.rows,
      diagnostics: diagnostics.rows,
      followups: followups.rows,
      escalations: escalations.rows,
      report_reviews: pathologyPending.rows.length
        ? [{ pending: true, count: pathologyPending.rows.length }]
        : [],
    },
  };
}

async function getTrackingDashboard(userId, roleName) {
  if (!TRACKING_ROLES.has(roleName)) {
    throw new HttpError(403, "Tracking is not available for this role", "FORBIDDEN");
  }

  // Mark overdue hospital revisits as missed (never closes cases). Best-effort.
  try {
    const careLifecycleService = require("./careLifecycleService");
    await careLifecycleService.scanMissedHospitalRevisits();
  } catch (_error) {
    // Tracking should still load if the scan cannot run.
  }

  if (roleName === "DISTRICT_ADMIN") {
    const { rows } = await pool.query(
      `SELECT
          COUNT(DISTINCT patient.id)::int AS total_patients,
          COUNT(DISTINCT patient.id) FILTER (
            WHERE screening.case_state::text NOT IN ('CLOSED', 'DRAFT')
               OR care.status::text NOT IN ('CLOSED', 'SUPERSEDED')
          )::int AS active_patients,
          COUNT(DISTINCT schedule.id) FILTER (
            WHERE schedule.status = 'SCHEDULED' AND schedule.due_at < now()
          )::int AS overdue_followups,
          COUNT(DISTINCT hospital.id) FILTER (
            WHERE hospital_status.is_terminal IS FALSE AND hospital.scheduled_at >= now()
          )::int
          + COUNT(DISTINCT diagnostic.id) FILTER (
            WHERE diagnostic_status.is_terminal IS FALSE
              AND COALESCE(diagnostic.confirmed_at_time, diagnostic.requested_at) >= now()
          )::int AS upcoming_appointments,
          COUNT(DISTINCT diagnostic_order.id) FILTER (
            WHERE order_status.code IN ('ADVISED', 'SCHEDULED', 'SAMPLE_COLLECTED', 'REPORT_PENDING')
          )::int AS pending_diagnostic_reports,
          COUNT(DISTINCT report.id) FILTER (
            WHERE review.id IS NULL
          )::int AS reports_awaiting_review,
          COUNT(DISTINCT discomfort.id) FILTER (
            WHERE discomfort.status::text IN ('OPEN', 'ESCALATED')
          )::int AS escalations,
          COUNT(DISTINCT patient.id) FILTER (
            WHERE screening.case_state::text = 'CLOSED'
               OR care.status::text IN ('RECOVERY_CONFIRMED', 'CLOSED')
          )::int AS recovered_closed
         FROM tbl_users admin
         JOIN mst_facilities facility ON facility.district_id = admin.district_id
         JOIN tbl_patients patient
           ON patient.registered_facility_id = facility.id
          AND patient.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT s.case_state FROM tbl_screenings s
            WHERE s.patient_id = patient.id
            ORDER BY s.created_at DESC LIMIT 1
         ) screening ON TRUE
         LEFT JOIN tbl_care_plans care
           ON care.patient_id = patient.id
          AND care.status::text NOT IN ('SUPERSEDED')
         LEFT JOIN tbl_care_followup_schedules schedule ON schedule.patient_id = patient.id
         LEFT JOIN tbl_hospital_appointments hospital ON hospital.patient_id = patient.id
         LEFT JOIN mst_appointment_statuses hospital_status ON hospital_status.id = hospital.status_id
         LEFT JOIN tbl_diagnostic_appointments diagnostic ON diagnostic.patient_id = patient.id
         LEFT JOIN mst_appointment_statuses diagnostic_status ON diagnostic_status.id = diagnostic.status_id
         LEFT JOIN tbl_diagnostic_orders diagnostic_order ON diagnostic_order.patient_id = patient.id
         LEFT JOIN mst_investigation_statuses order_status ON order_status.id = diagnostic_order.status_id
         LEFT JOIN tbl_pathology_reports report ON report.patient_id = patient.id
         LEFT JOIN tbl_pathology_reviews review
           ON review.report_id = report.id AND review.signed_at IS NOT NULL
         LEFT JOIN tbl_care_discomfort_reports discomfort ON discomfort.patient_id = patient.id
        WHERE admin.id = $1
          AND admin.district_id IS NOT NULL
          AND admin.deleted_at IS NULL`,
      [userId]
    );
    const stats = rows[0] || {};
    return {
      dashboard: {
        total_patients: stats.total_patients || 0,
        active_patients: stats.active_patients || 0,
        pending_tasks: (stats.overdue_followups || 0)
          + (stats.pending_diagnostic_reports || 0)
          + (stats.reports_awaiting_review || 0)
          + (stats.escalations || 0),
        overdue_followups: stats.overdue_followups || 0,
        upcoming_appointments: stats.upcoming_appointments || 0,
        pending_diagnostic_reports: stats.pending_diagnostic_reports || 0,
        reports_awaiting_review: stats.reports_awaiting_review || 0,
        escalations: stats.escalations || 0,
        recovered_closed: stats.recovered_closed || 0,
        // District aggregate: no patient identities
        patients: [],
      },
    };
  }

  // Role-scoped patient list with tracking fields (identity allowed for clinical roles)
  let scopeSql = "AND fn_user_has_patient_access($1, patient.id)";
  if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND (
      (patient.registered_by = $1 AND fn_user_has_patient_access($1, patient.id))
      OR EXISTS (
        SELECT 1 FROM tbl_care_followup_schedules schedule
         WHERE schedule.patient_id = patient.id
           AND schedule.assigned_hw_id = $1
      )
    )`;
  } else if (roleName === "HOSPITAL_STAFF") {
    scopeSql = `AND (
      EXISTS (
        SELECT 1 FROM tbl_diagnostic_orders diagnostic_order
         JOIN tbl_user_facility_assignments assignment
           ON assignment.facility_id = diagnostic_order.facility_id
          AND assignment.user_id = $1
          AND assignment.valid_from <= CURRENT_DATE
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        WHERE diagnostic_order.patient_id = patient.id
      )
      OR EXISTS (
        SELECT 1 FROM tbl_hospital_appointments appointment
         JOIN mst_facilities hospital_facility
           ON hospital_facility.hospital_id = appointment.hospital_id
          AND hospital_facility.facility_type = 'HOSPITAL'
         JOIN tbl_user_facility_assignments assignment
           ON assignment.facility_id = hospital_facility.id
          AND assignment.user_id = $1
          AND assignment.valid_from <= CURRENT_DATE
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        WHERE appointment.patient_id = patient.id
      )
    )`;
  } else if (roleName === "NAVIGATOR") {
    scopeSql = `AND (
      EXISTS (
        SELECT 1 FROM tbl_referrals referral
         WHERE referral.patient_id = patient.id
           AND referral.assigned_navigator_id = $1
      )
      OR EXISTS (
        SELECT 1 FROM tbl_care_plans plan
         WHERE plan.patient_id = patient.id
           AND plan.assigned_navigator_id = $1
           AND plan.status::text NOT IN ('CLOSED', 'SUPERSEDED')
      )
    )`;
  } else if (roleName === "SPECIALIST") {
    scopeSql = `AND (
      EXISTS (
        SELECT 1 FROM tbl_case_assignments assignment
         WHERE assignment.patient_id = patient.id
           AND assignment.user_id = $1
           AND assignment.valid_from <= now()
           AND (assignment.valid_to IS NULL OR assignment.valid_to > now())
      )
      OR EXISTS (
        SELECT 1 FROM tbl_referrals referral
         WHERE referral.patient_id = patient.id
           AND referral.assigned_specialist_id = $1
      )
    )`;
  } else if (roleName === "MEDICAL_OFFICER") {
    scopeSql = `AND (
      EXISTS (
        SELECT 1 FROM tbl_medical_officer_case_claims claim
         WHERE claim.patient_id = patient.id
           AND claim.medical_officer_id = $1
           AND claim.released_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM tbl_care_plans plan
         WHERE plan.patient_id = patient.id
           AND plan.responsible_mo_id = $1
           AND plan.status::text NOT IN ('CLOSED', 'SUPERSEDED')
      )
      OR fn_user_has_patient_access($1, patient.id)
    )`;
  }

  const { rows: patients } = await pool.query(
    `SELECT patient.id, patient.patient_code, patient.full_name,
            facility.name_en AS facility_name,
            screening.case_state::text AS case_state,
            care.status::text AS care_plan_status,
            care.responsible_mo_id, care.responsible_mo_name,
            care.assigned_navigator_id, care.assigned_navigator_name,
            care.clinical_summary, care.precautions,
            care.treatment_start_date, care.expected_end_date, care.hospital_revisit_date,
            care.patient_informed, care.hospital_revisit_scheduled, care.hospital_attended,
            referral.assigned_navigator_id AS referral_navigator_id,
            referral.navigator_name AS referral_navigator_name,
            referral.assigned_specialist_id, referral.specialist_name,
            referral.referral_status, referral.referral_code,
            followup.due_at AS followup_due_at,
            followup.assigned_hw_id, followup.health_worker_name,
            followup.status::text AS followup_status,
            diagnostic_appt.status_code AS diagnostic_appt_status,
            diagnostic_appt.confirmed_at_time AS diagnostic_confirmed_at,
            diagnostic_appt.requested_at AS diagnostic_requested_at,
            hospital.status_code AS hospital_status,
            hospital.scheduled_at AS hospital_scheduled_at,
            video.scheduled_at AS video_scheduled_at,
            video.status_code AS video_status,
            pending_dx.order_code AS pending_diagnostic_code,
            pending_dx.status_code AS pending_diagnostic_status,
            escalation.id AS open_escalation_id,
            pathology_pending.id AS pathology_pending_id,
            claim.medical_officer_id AS claim_mo_id,
            claim.medical_officer_name AS claim_mo_name
       FROM tbl_patients patient
       JOIN mst_facilities facility ON facility.id = patient.registered_facility_id
       LEFT JOIN LATERAL (
         SELECT s.case_state FROM tbl_screenings s
          WHERE s.patient_id = patient.id
          ORDER BY s.created_at DESC LIMIT 1
       ) screening ON TRUE
       LEFT JOIN LATERAL (
         SELECT plan.status, plan.responsible_mo_id, mo.full_name AS responsible_mo_name,
                plan.assigned_navigator_id, navigator.full_name AS assigned_navigator_name,
                plan.clinical_summary, plan.precautions,
                plan.treatment_start_date, plan.expected_end_date, plan.hospital_revisit_date,
                plan.patient_informed, plan.hospital_revisit_scheduled, plan.hospital_attended
           FROM tbl_care_plans plan
           LEFT JOIN tbl_users mo ON mo.id = plan.responsible_mo_id
           LEFT JOIN tbl_users navigator ON navigator.id = plan.assigned_navigator_id
          WHERE plan.patient_id = patient.id
            AND plan.status::text NOT IN ('CLOSED', 'SUPERSEDED')
          ORDER BY plan.created_at DESC LIMIT 1
       ) care ON TRUE
       LEFT JOIN LATERAL (
         SELECT referral.assigned_navigator_id, navigator.full_name AS navigator_name,
                referral.assigned_specialist_id, specialist.full_name AS specialist_name,
                referral.status::text AS referral_status, referral.referral_code
           FROM tbl_referrals referral
           LEFT JOIN tbl_users navigator ON navigator.id = referral.assigned_navigator_id
           LEFT JOIN tbl_users specialist ON specialist.id = referral.assigned_specialist_id
          WHERE referral.patient_id = patient.id
            AND referral.status::text NOT IN ('CANCELLED', 'DECLINED')
          ORDER BY referral.created_at DESC LIMIT 1
       ) referral ON TRUE
       LEFT JOIN LATERAL (
         SELECT schedule.due_at, schedule.assigned_hw_id, schedule.status,
                hw.full_name AS health_worker_name
           FROM tbl_care_followup_schedules schedule
           LEFT JOIN tbl_users hw ON hw.id = schedule.assigned_hw_id
          WHERE schedule.patient_id = patient.id
            AND schedule.status = 'SCHEDULED'
          ORDER BY schedule.due_at LIMIT 1
       ) followup ON TRUE
       LEFT JOIN LATERAL (
         SELECT st.code AS status_code, da.confirmed_at_time, da.requested_at
           FROM tbl_diagnostic_appointments da
           JOIN mst_appointment_statuses st ON st.id = da.status_id
          WHERE da.patient_id = patient.id
            AND st.is_terminal IS FALSE
            AND st.code <> 'CANCELLED'
          ORDER BY da.created_at DESC LIMIT 1
       ) diagnostic_appt ON TRUE
       LEFT JOIN LATERAL (
         SELECT st.code AS status_code, appointment.scheduled_at
           FROM tbl_hospital_appointments appointment
           JOIN mst_appointment_statuses st ON st.id = appointment.status_id
          WHERE appointment.patient_id = patient.id
            AND st.is_terminal IS FALSE
            AND st.code <> 'CANCELLED'
          ORDER BY appointment.scheduled_at DESC LIMIT 1
       ) hospital ON TRUE
       LEFT JOIN LATERAL (
         SELECT st.code AS status_code, slot.slot_start AS scheduled_at
           FROM tbl_video_consultations consultation
           JOIN mst_appointment_statuses st ON st.id = consultation.status_id
           JOIN tbl_consultation_slots slot ON slot.id = consultation.slot_id
          WHERE consultation.patient_id = patient.id
            AND consultation.is_active IS TRUE
            AND st.is_terminal IS FALSE
            AND st.code <> 'CANCELLED'
          ORDER BY slot.slot_start DESC LIMIT 1
       ) video ON TRUE
       LEFT JOIN LATERAL (
         SELECT diagnostic_order.order_code, st.code AS status_code
           FROM tbl_diagnostic_orders diagnostic_order
           JOIN mst_investigation_statuses st ON st.id = diagnostic_order.status_id
          WHERE diagnostic_order.patient_id = patient.id AND st.is_terminal IS FALSE
          ORDER BY diagnostic_order.created_at DESC LIMIT 1
       ) pending_dx ON TRUE
       LEFT JOIN LATERAL (
         SELECT report.id FROM tbl_care_discomfort_reports report
          WHERE report.patient_id = patient.id
            AND report.status::text IN ('OPEN', 'ESCALATED')
          ORDER BY report.created_at DESC LIMIT 1
       ) escalation ON TRUE
       LEFT JOIN LATERAL (
         SELECT report.id
           FROM tbl_pathology_reports report
           LEFT JOIN tbl_pathology_reviews review
             ON review.report_id = report.id AND review.signed_at IS NOT NULL
          WHERE report.patient_id = patient.id AND review.id IS NULL
          ORDER BY report.created_at DESC LIMIT 1
       ) pathology_pending ON TRUE
       LEFT JOIN LATERAL (
         SELECT claim.medical_officer_id, mo.full_name AS medical_officer_name
           FROM tbl_medical_officer_case_claims claim
           JOIN tbl_users mo ON mo.id = claim.medical_officer_id
          WHERE claim.patient_id = patient.id AND claim.released_at IS NULL
          ORDER BY claim.claimed_at DESC LIMIT 1
       ) claim ON TRUE
      WHERE patient.deleted_at IS NULL
        ${scopeSql}
      ORDER BY patient.created_at DESC
      LIMIT 100`,
    [userId]
  );

  const pendingReviews = await pool.query(
    `SELECT COUNT(DISTINCT report.id)::int AS count
       FROM tbl_pathology_reports report
       LEFT JOIN tbl_pathology_reviews review
         ON review.report_id = report.id AND review.signed_at IS NOT NULL
      WHERE review.id IS NULL
        AND EXISTS (
          SELECT 1 FROM tbl_patients patient
           WHERE patient.id = report.patient_id
             AND patient.deleted_at IS NULL
             AND (
               CASE
                 WHEN $2 = 'HOSPITAL_STAFF' THEN (
                   EXISTS (
                     SELECT 1 FROM tbl_diagnostic_orders diagnostic_order
                      JOIN tbl_user_facility_assignments assignment
                        ON assignment.facility_id = diagnostic_order.facility_id
                       AND assignment.user_id = $1
                       AND assignment.valid_from <= CURRENT_DATE
                       AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
                     WHERE diagnostic_order.patient_id = patient.id
                   )
                   OR EXISTS (
                     SELECT 1 FROM tbl_hospital_appointments appointment
                      JOIN mst_facilities hospital_facility
                        ON hospital_facility.hospital_id = appointment.hospital_id
                       AND hospital_facility.facility_type = 'HOSPITAL'
                      JOIN tbl_user_facility_assignments assignment
                        ON assignment.facility_id = hospital_facility.id
                       AND assignment.user_id = $1
                       AND assignment.valid_from <= CURRENT_DATE
                       AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
                     WHERE appointment.patient_id = patient.id
                   )
                 )
                 WHEN $2 = 'NAVIGATOR' THEN EXISTS (
                   SELECT 1 FROM tbl_referrals referral
                    WHERE referral.patient_id = patient.id
                      AND referral.assigned_navigator_id = $1
                 )
                 WHEN $2 = 'SPECIALIST' THEN (
                   EXISTS (
                     SELECT 1 FROM tbl_case_assignments assignment
                      WHERE assignment.patient_id = patient.id
                        AND assignment.user_id = $1
                        AND assignment.valid_from <= now()
                        AND (assignment.valid_to IS NULL OR assignment.valid_to > now())
                   )
                   OR EXISTS (
                     SELECT 1 FROM tbl_referrals referral
                      WHERE referral.patient_id = patient.id
                        AND referral.assigned_specialist_id = $1
                   )
                 )
                 WHEN $2 = 'HEALTH_WORKER' THEN patient.registered_by = $1
                 ELSE fn_user_has_patient_access($1, patient.id)
               END
             )
        )`,
    [userId, roleName]
  );

  const trackedPatients = patients.map((row) => {
    const snapshot = deriveTrackingSnapshot({
      caseState: row.case_state,
      careStatus: row.care_plan_status,
      openDiagnosticAppt: row.diagnostic_appt_status
        ? {
          status_code: row.diagnostic_appt_status,
          confirmed_at_time: row.diagnostic_confirmed_at,
          requested_at: row.diagnostic_requested_at,
        }
        : null,
      openHospitalAppt: row.hospital_status
        ? { status_code: row.hospital_status, scheduled_at: row.hospital_scheduled_at }
        : null,
      openVideo: row.video_scheduled_at
        ? { status_code: row.video_status, scheduled_at: row.video_scheduled_at }
        : null,
      scheduledFollowup: row.followup_due_at
        ? {
          due_at: row.followup_due_at,
          assigned_hw_id: row.assigned_hw_id,
          status: row.followup_status || "SCHEDULED",
        }
        : null,
      openEscalation: row.open_escalation_id ? { id: row.open_escalation_id } : null,
      pendingDiagnosticOrder: row.pending_diagnostic_code
        ? { order_code: row.pending_diagnostic_code, status_code: row.pending_diagnostic_status }
        : null,
      pendingPathologyReview: row.pathology_pending_id ? { id: row.pathology_pending_id } : null,
    });
    const responsible = resolveResponsiblePerson(snapshot, {
      health_worker_id: row.assigned_hw_id,
      health_worker_name: row.health_worker_name,
      navigator_id: row.assigned_navigator_id || row.referral_navigator_id,
      navigator_name: row.assigned_navigator_name || row.referral_navigator_name,
      specialist_id: row.assigned_specialist_id,
      specialist_name: row.specialist_name,
      medical_officer_id: row.responsible_mo_id || row.claim_mo_id,
      medical_officer_name: row.responsible_mo_name || row.claim_mo_name,
    });
    const tracking = mandatoryTrackingFields(snapshot, responsible);
    const hospitalRevisitStatus = row.hospital_attended === true
      ? "ATTENDED"
      : row.hospital_attended === false
        ? "MISSED"
        : row.patient_informed
          ? "PATIENT_INFORMED"
          : row.hospital_revisit_scheduled
            ? "SCHEDULED"
            : row.hospital_revisit_date
              ? "NOT_SCHEDULED"
              : null;
    return {
      id: row.id,
      patient_code: row.patient_code,
      full_name: row.full_name,
      facility_name: row.facility_name,
      current_status: row.care_plan_status || row.case_state || "UNKNOWN",
      overdue_followup_at: tracking.is_overdue ? tracking.next_action_due_at : null,
      upcoming_appointment_at: row.hospital_scheduled_at || row.diagnostic_confirmed_at || row.video_scheduled_at || null,
      pending_diagnostic_code: row.pending_diagnostic_code,
      pending_diagnostic_status: row.pending_diagnostic_status || null,
      has_escalation: Boolean(row.open_escalation_id),
      target_path: journeyTargetPath(roleName, row.id),
      treatment_tracking: row.care_plan_status
        ? {
          current_treatment_status: row.care_plan_status,
          clinical_summary: row.clinical_summary || null,
          precautions: row.precautions || null,
          treatment_start_date: row.treatment_start_date || null,
          medicine_end_date: row.expected_end_date || null,
          hospital_revisit_date: row.hospital_revisit_date || null,
          hospital_revisit_status: hospitalRevisitStatus,
          assigned_navigator_name: row.assigned_navigator_name || row.referral_navigator_name || null,
          responsible_mo_name: row.responsible_mo_name || row.claim_mo_name || null,
          health_worker_name: row.health_worker_name || null,
          diagnostic_status: row.pending_diagnostic_status || null,
          referral_status: row.referral_status || null,
          referral_code: row.referral_code || null,
          latest_followup_due_at: row.followup_due_at || null,
        }
        : null,
      ...tracking,
    };
  });

  const active = trackedPatients.filter((row) => row.current_status !== "CLOSED" && row.current_stage !== "CLOSURE");
  const overdue = trackedPatients.filter((row) => row.is_overdue);
  const upcoming = trackedPatients.filter((row) => row.upcoming_appointment_at);
  const pendingDx = trackedPatients.filter((row) => row.pending_diagnostic_code);
  const escalations = trackedPatients.filter((row) => row.has_escalation);
  const recovered = trackedPatients.filter((row) =>
    row.current_stage === "CLOSURE" || row.current_stage === "RECOVERY" || row.current_status === "CLOSED"
  );
  const awaitingReview = pendingReviews.rows[0]?.count || 0;

  return {
    dashboard: {
      total_patients: trackedPatients.length,
      active_patients: active.length,
      pending_tasks: overdue.length + pendingDx.length + escalations.length + awaitingReview,
      overdue_followups: overdue.length,
      upcoming_appointments: upcoming.length,
      pending_diagnostic_reports: pendingDx.length,
      reports_awaiting_review: awaitingReview,
      escalations: escalations.length,
      recovered_closed: recovered.length,
      patients: trackedPatients,
    },
  };
}

async function listTrackedPatients(userId, roleName, query = {}) {
  const dashboard = await getTrackingDashboard(userId, roleName);
  const { page, pageSize } = pageOptions(query, 20);
  let rows = dashboard.dashboard.patients || [];
  if (query.filter === "overdue") rows = rows.filter((row) => row.is_overdue || row.overdue_followup_at);
  if (query.filter === "escalations") rows = rows.filter((row) => row.has_escalation);
  if (query.filter === "diagnostics") rows = rows.filter((row) => row.pending_diagnostic_code);
  if (query.filter === "active") {
    rows = rows.filter((row) => row.current_status !== "CLOSED" && row.current_status !== "RECOVERY_CONFIRMED");
  }
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    patients: rows.slice(start, start + pageSize),
    pagination: pagination(page, pageSize, total),
  };
}

/**
 * Notify the next responsible user for a tracking next-action.
 * Dedupes by event + patient + action + recipient so workflows can call
 * this safely after transitions without duplicate inbox noise.
 */
async function notifyNextResponsible(client, {
  recipientUserId,
  patientId,
  nextAction,
  title,
  message,
  roleName,
}) {
  if (!recipientUserId || !patientId || !nextAction || nextAction === "NONE") return false;

  const event = "TRACKING_NEXT_ACTION";
  const dedupeKey = `TRACKING_NEXT_ACTION:${patientId}:${nextAction}:${recipientUserId}`;
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

  const template = await client.query(
    `SELECT template.id, template.language_id
       FROM mst_notification_templates template
       JOIN mst_languages language ON language.id = template.language_id
      WHERE template.code IN ('APPT_REMINDER', 'CARE_PLAN_READY', 'GENERIC_IN_APP')
        AND template.channel = 'IN_APP'
        AND template.is_active IS TRUE
      ORDER BY
        CASE template.code
          WHEN 'APPT_REMINDER' THEN 0
          WHEN 'CARE_PLAN_READY' THEN 1
          ELSE 2
        END,
        (language.code = 'en') DESC
      LIMIT 1`
  );
  if (!template.rows.length) return false;

  const payload = {
    event,
    title: title || "Patient tracking action required",
    message: message || "A patient in your care needs the next tracking action.",
    target_path: journeyTargetPath(roleName || "NAVIGATOR", patientId),
    next_action: nextAction,
    dedupe_key: dedupeKey,
  };

  await client.query(
    `INSERT INTO tbl_notifications
       (recipient_user_id, patient_id, template_id, channel, language_id, status, payload, sent_at)
     VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, now())`,
    [recipientUserId, patientId, template.rows[0].id, template.rows[0].language_id, JSON.stringify(payload)]
  );
  return true;
}

module.exports = {
  getPatientJourney,
  getTrackingDashboard,
  listTrackedPatients,
  deriveNextAction,
  deriveTrackingSnapshot,
  resolveResponsiblePerson,
  mandatoryTrackingFields,
  notifyNextResponsible,
  journeyTargetPath,
  TRACKING_ROLES,
};
