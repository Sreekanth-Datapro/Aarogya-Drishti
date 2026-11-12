const crypto = require("crypto");
const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const {
  mandalScope,
  pageOptions,
  pagination,
  requireActiveClaim,
  requirePositiveId,
  requireUuid,
  setActor,
  withTransaction,
} = require("./medicalOfficer/scope");

const ACTIVE_PLAN_STATUSES = [
  "AWAITING_NAVIGATOR",
  "FOLLOWUP_ACTIVE",
  "PATIENT_UNCOMFORTABLE",
  "MO_REASSESSMENT",
  "TREATMENT_COMPLETED",
  "FINAL_CHECKUP_PENDING",
  "RECOVERY_CONFIRMED",
];

/** Referral statuses that keep the patient out of MO community-treatment workflow. */
const OPEN_SPECIALIST_REFERRAL_STATUSES = ["PLANNED", "SENT", "ACCEPTED"];

const ISSUE_TYPES = [
  "INCREASED_SYMPTOMS",
  "MEDICINE_DISCOMFORT",
  "NO_IMPROVEMENT",
  "NEW_COMPLAINT",
  "DIFFICULTY_FOLLOWING",
  "OTHER",
];

const SEVERITIES = ["MILD", "MODERATE", "SEVERE", "EMERGENCY"];

function optionalText(value, max, label) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text`, "INVALID_CARE");
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new HttpError(400, `${label} is too long`, "INVALID_CARE");
  return text;
}

function requireText(value, max, label) {
  const text = optionalText(value, max, label);
  if (!text) throw new HttpError(400, `${label} is required`, "INVALID_CARE");
  return text;
}

function normalizeMedicines(medicines) {
  if (!Array.isArray(medicines) || medicines.length < 1) {
    throw new HttpError(400, "Add at least one medicine", "INVALID_CARE");
  }
  if (medicines.length > 20) {
    throw new HttpError(400, "Too many medicines on one plan", "INVALID_CARE");
  }
  return medicines.map((item, index) => {
    const durationDays = Number(item.duration_days);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      throw new HttpError(400, "Medicine duration must be 1–365 days", "INVALID_CARE");
    }
    return {
      medicine_name: requireText(item.medicine_name, 200, "Medicine name"),
      dosage: requireText(item.dosage, 120, "Dosage"),
      frequency: requireText(item.frequency, 120, "Frequency"),
      duration_days: durationDays,
      precautions: optionalText(item.precautions, 1000, "Medicine precautions"),
      sort_order: index + 1,
    };
  });
}

function requireDate(value, label) {
  if (value == null || value === "") {
    throw new HttpError(400, `${label} is required`, "INVALID_CARE");
  }
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpError(400, `Invalid ${label}`, "INVALID_CARE");
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `Invalid ${label}`, "INVALID_CARE");
  }
  return text;
}

function addDaysIso(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function computeExpectedEndDate(startDate, medicines, explicitEnd = null) {
  if (explicitEnd) {
    const end = requireDate(explicitEnd, "Expected end date");
    if (end < startDate) {
      throw new HttpError(400, "Expected end date cannot be before treatment start", "INVALID_CARE");
    }
    return end;
  }
  const maxDays = Math.max(...medicines.map((item) => item.duration_days));
  return addDaysIso(startDate, maxDays);
}

function requireHospitalRevisitDate(value, startDate) {
  const revisit = requireDate(value, "Hospital revisit date");
  if (revisit < startDate) {
    throw new HttpError(400, "Hospital revisit date cannot be before treatment start", "INVALID_CARE");
  }
  return revisit;
}

const FINAL_REVIEW_DECISIONS = [
  "CLOSE_RECOVERED",
  "CONTINUE_TREATMENT",
  "REFER_SPECIALIST",
  "URGENT_ESCALATION",
];

const FINAL_REVIEW_READY_STATUSES = [
  "FINAL_CHECKUP_PENDING",
  "TREATMENT_COMPLETED",
  "RECOVERY_CONFIRMED",
  "FOLLOWUP_ACTIVE",
  "MO_REASSESSMENT",
  "PATIENT_UNCOMFORTABLE",
];

async function loadCareTemplate(client, code) {
  const { rows } = await client.query(
    `SELECT template.id, template.language_id
       FROM mst_notification_templates template
       JOIN mst_languages language ON language.id = template.language_id
      WHERE template.code = $1
        AND template.channel = 'IN_APP'
        AND template.is_active IS TRUE
      ORDER BY (language.code = 'en') DESC, template.id
      LIMIT 1`,
    [code]
  );
  if (!rows.length && code !== "CARE_PLAN_READY") {
    const fallback = await client.query(
      `SELECT template.id, template.language_id
         FROM mst_notification_templates template
         JOIN mst_languages language ON language.id = template.language_id
        WHERE template.code = 'CARE_PLAN_READY'
          AND template.channel = 'IN_APP'
          AND template.is_active IS TRUE
        ORDER BY (language.code = 'en') DESC, template.id
        LIMIT 1`
    );
    if (fallback.rows.length) return fallback.rows[0];
  }
  if (!rows.length) {
    throw new HttpError(500, `Notification template ${code} is missing`, "CONFIGURATION_ERROR");
  }
  return rows[0];
}

async function notifyCare(client, {
  templateCode,
  recipientUserId,
  patientId = null,
  event,
  title,
  message,
  targetPath,
  planId = null,
  dedupeKey = null,
}) {
  if (!recipientUserId) return false;
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

  const template = await loadCareTemplate(client, templateCode);
  const payload = {
    event,
    title,
    message,
    target_path: targetPath,
    ...(planId ? { plan_id: planId } : {}),
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
  };
  await client.query(
    `INSERT INTO tbl_notifications
       (recipient_user_id, patient_id, template_id, channel, language_id, status, payload, sent_at)
     VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, now())`,
    [recipientUserId, patientId, template.id, template.language_id, JSON.stringify(payload)]
  );
  return true;
}

async function recordStatusChange(client, planId, fromStatus, toStatus, userId, reason = null) {
  await client.query(
    `INSERT INTO tbl_care_plan_status_history
       (plan_id, from_status, to_status, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [planId, fromStatus, toStatus, userId, reason]
  );
}

async function findOpenSpecialistReferral(client, patientId) {
  const { rows } = await client.query(
    `SELECT id, referral_code, status::text AS status
       FROM tbl_referrals
      WHERE patient_id = $1
        AND status = ANY($2::referral_status[])
      ORDER BY created_at DESC
      LIMIT 1`,
    [patientId, OPEN_SPECIALIST_REFERRAL_STATUSES]
  );
  return rows[0] || null;
}

async function assertNoOpenSpecialistReferral(client, patientId, {
  allowUrgentEscalation = false,
  decision = null,
} = {}) {
  if (allowUrgentEscalation && decision === "URGENT_ESCALATION") return null;
  const open = await findOpenSpecialistReferral(client, patientId);
  if (!open) return null;
  throw new HttpError(
    409,
    `Patient has an active specialist referral (${open.referral_code || open.status}). `
      + "Complete or return from that referral before MO community treatment actions.",
    "REFERRAL_ACTIVE"
  );
}

/**
 * Parks MO community care plans when a specialist referral becomes active.
 * Supersedes plans (never deletes). Cancels routine follow-ups. Case stays open.
 */
async function parkMoCarePlansForSpecialistReferral(client, {
  patientId,
  userId,
  referralId = null,
  reason = "REFERRED_TO_SPECIALIST",
}) {
  // Only MO-sourced plans. Never park/supersede Specialist-owned clinical plans here.
  const { rows } = await client.query(
    `SELECT id, status::text AS status, referral_id
       FROM tbl_care_plans
      WHERE patient_id = $1
        AND source = 'MO'
        AND status = ANY($2::care_plan_status[])
      FOR UPDATE`,
    [patientId, ACTIVE_PLAN_STATUSES]
  );
  const parked = [];
  for (const plan of rows) {
    await client.query(
      `UPDATE tbl_care_followup_schedules
          SET status = 'CANCELLED', updated_at = now()
        WHERE plan_id = $1 AND status = 'SCHEDULED'`,
      [plan.id]
    );
    if (referralId && !plan.referral_id) {
      await client.query(
        `UPDATE tbl_care_plans
            SET referral_id = $2, status = 'SUPERSEDED', updated_by = $3
          WHERE id = $1`,
        [plan.id, referralId, userId]
      );
    } else {
      await client.query(
        `UPDATE tbl_care_plans
            SET status = 'SUPERSEDED', updated_by = $2
          WHERE id = $1`,
        [plan.id, userId]
      );
    }
    await recordStatusChange(client, plan.id, plan.status, "SUPERSEDED", userId, reason);
    parked.push(plan.id);
  }
  return parked;
}

/** SQL fragment: patient currently has an open specialist referral. */
function openReferralExistsSql(patientIdExpr) {
  return `EXISTS (
    SELECT 1 FROM tbl_referrals open_ref
     WHERE open_ref.patient_id = ${patientIdExpr}
       AND open_ref.status IN ('PLANNED', 'SENT', 'ACCEPTED')
  )`;
}

async function ensureNavigatorAssignment(client, {
  patientId,
  navigatorId,
  assignedBy,
  referralId = null,
  reason,
}) {
  await client.query(
    `INSERT INTO tbl_case_assignments
       (patient_id, referral_id, user_id, assigned_by, reason)
     SELECT $1, $2, $3, $4, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM tbl_case_assignments ca
         WHERE ca.patient_id = $1
           AND ca.user_id = $3
           AND ca.valid_to IS NULL
           AND (
             ($2::uuid IS NULL AND ca.referral_id IS NULL)
             OR ca.referral_id IS NOT DISTINCT FROM $2::uuid
           )
      )`,
    [patientId, referralId, navigatorId, assignedBy, reason]
  );
}

async function ensureHwAssignment(client, {
  patientId,
  healthWorkerId,
  assignedBy,
  referralId = null,
  reason,
}) {
  await client.query(
    `INSERT INTO tbl_case_assignments
       (patient_id, referral_id, user_id, assigned_by, reason)
     SELECT $1, $2, $3, $4, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM tbl_case_assignments ca
         WHERE ca.patient_id = $1
           AND ca.user_id = $3
           AND ca.valid_to IS NULL
           AND (
             ($2::uuid IS NULL AND ca.referral_id IS NULL)
             OR ca.referral_id IS NOT DISTINCT FROM $2::uuid
           )
      )`,
    [patientId, referralId, healthWorkerId, assignedBy, reason]
  );
}

function deriveHospitalRevisitStatus(plan) {
  if (plan.hospital_attended === true) return "ATTENDED";
  if (plan.hospital_attended === false) return "MISSED";
  if (plan.patient_informed) return "PATIENT_INFORMED";
  if (plan.hospital_revisit_scheduled) return "SCHEDULED";
  return "NOT_SCHEDULED";
}

/** Who owns clinical reassessment notifications for this plan. */
function clinicalOwnerNotify(plan) {
  const source = plan.source || plan.plan_source;
  if (String(source) === "SPECIALIST" && plan.responsible_specialist_id) {
    return {
      userId: plan.responsible_specialist_id,
      path: "/specialist/care",
      role: "sp",
      label: "Specialist",
    };
  }
  return {
    userId: plan.responsible_mo_id,
    path: "/medical-officer/care",
    role: "mo",
    label: "Medical Officer",
  };
}

async function notifyMissedRevisit(client, plan) {
  const today = new Date().toISOString().slice(0, 10);
  const owner = clinicalOwnerNotify(plan);
  const recipients = [
    { id: plan.assigned_navigator_id, path: "/navigator/followups?filter=duration_due", role: "nav" },
    { id: owner.userId, path: owner.path, role: owner.role },
  ];
  for (const recipient of recipients) {
    if (!recipient.id) continue;
    await notifyCare(client, {
      templateCode: "CARE_REVISIT_MISSED",
      recipientUserId: recipient.id,
      patientId: plan.patient_id,
      event: "CARE_REVISIT_MISSED",
      title: "Hospital revisit missed",
      message: "Hospital revisit date passed without attendance. Coordinate a new revisit. Do not close the case.",
      targetPath: recipient.path,
      planId: plan.id,
      dedupeKey: `CARE_REVISIT_MISSED:${plan.id}:${plan.hospital_revisit_date || today}:${recipient.role}`,
    });
  }
}

/**
 * Marks overdue hospital revisits as missed when attendance is still unknown.
 * Never closes the care case. Safe to call repeatedly (deduped notifications).
 * Skips plans whose revisit date is still in the future (rescheduled).
 */
async function scanMissedHospitalRevisits(client = null) {
  const run = async (db) => {
    const { rows } = await db.query(
      `SELECT id, patient_id, responsible_mo_id, responsible_specialist_id,
              assigned_navigator_id, source::text AS source,
              hospital_revisit_date, hospital_attended, status::text AS status
         FROM tbl_care_plans
        WHERE hospital_revisit_date IS NOT NULL
          AND hospital_revisit_date < CURRENT_DATE
          AND hospital_attended IS NULL
          AND status NOT IN ('CLOSED', 'SUPERSEDED')
        ORDER BY hospital_revisit_date
        LIMIT 200
        FOR UPDATE SKIP LOCKED`
    );
    const marked = [];
    for (const plan of rows) {
      const updated = await db.query(
        `UPDATE tbl_care_plans
            SET hospital_attended = FALSE, updated_at = now()
          WHERE id = $1 AND hospital_attended IS NULL
          RETURNING id`,
        [plan.id]
      );
      if (!updated.rows.length) continue;

      const missReason = `HOSPITAL_REVISIT_MISSED:${plan.hospital_revisit_date}`;
      const alreadyLogged = await db.query(
        `SELECT 1 FROM tbl_care_plan_status_history
          WHERE plan_id = $1 AND reason = $2
          LIMIT 1`,
        [plan.id, missReason]
      );
      if (!alreadyLogged.rows.length) {
        await recordStatusChange(
          db,
          plan.id,
          plan.status,
          plan.status,
          plan.responsible_mo_id,
          missReason
        );
      }
      await notifyMissedRevisit(db, plan);
      marked.push(plan.id);
    }
    return marked;
  };

  if (client) return run(client);
  return withTransaction(pool, async (tx) => run(tx));
}

function careReferralSignatureHash(review, userId, signedAt, decision) {
  return crypto.createHash("sha256").update(JSON.stringify({
    review_id: review.id,
    version: Number(review.version) + 1,
    doctor_id: userId,
    finding: review.finding,
    impression: review.impression,
    decision,
    signed_at: signedAt,
  })).digest("hex");
}

/**
 * Creates or reuses a specialist referral for care reassessment.
 * Amends clinical review decision when needed so fn_referral_guard passes.
 * Does not force illegal case_state transitions (e.g. CARE_LINKED -> REFERRAL_PLANNED).
 */
async function createOrLinkCareSpecialistReferral(client, {
  userId,
  plan,
  referralReason,
  input = {},
}) {
  const openReferral = await client.query(
    `SELECT id, referral_code, status::text AS status, assigned_navigator_id
       FROM tbl_referrals
      WHERE patient_id = $1
        AND status IN ('PLANNED', 'SENT', 'ACCEPTED')
      ORDER BY created_at DESC
      LIMIT 1`,
    [plan.patient_id]
  );
  if (openReferral.rows.length) {
    const existing = openReferral.rows[0];
    if (plan.referral_id !== existing.id) {
      await client.query(
        `UPDATE tbl_care_plans SET referral_id = $2, updated_by = $3 WHERE id = $1`,
        [plan.id, existing.id, userId]
      );
    }
    if (plan.assigned_navigator_id && !existing.assigned_navigator_id) {
      await client.query(
        `UPDATE tbl_referrals SET assigned_navigator_id = $2 WHERE id = $1`,
        [existing.id, plan.assigned_navigator_id]
      );
    }
    return {
      referral_id: existing.id,
      referral_code: existing.referral_code,
      created: false,
      reused: true,
    };
  }

  const hospitalFacilityId = requirePositiveId(input.hospital_facility_id, "Select a hospital");
  const specialtyId = requirePositiveId(input.specialty_id, "Select a specialty");
  const priorityId = requirePositiveId(input.priority_id, "Select a priority");
  const mode = ["HOSPITAL_VISIT", "VIDEO_CONSULT", "BOTH"].includes(input.mode)
    ? input.mode
    : "HOSPITAL_VISIT";
  const specialistId = input.specialist_id
    ? requireUuid(input.specialist_id, "Invalid specialist")
    : null;

  const patient = await client.query(
    `SELECT patient.id, patient.registered_facility_id, facility.district_id
       FROM tbl_patients patient
       JOIN mst_facilities facility ON facility.id = patient.registered_facility_id
      WHERE patient.id = $1`,
    [plan.patient_id]
  );
  if (!patient.rows.length) {
    throw new HttpError(404, "Patient not found", "NOT_FOUND");
  }

  const hospital = await client.query(
    `SELECT hospital_id FROM mst_facilities
      WHERE id = $1 AND district_id = $2 AND facility_type = 'HOSPITAL'
        AND hospital_id IS NOT NULL AND is_active IS TRUE`,
    [hospitalFacilityId, patient.rows[0].district_id]
  );
  if (!hospital.rows.length) {
    throw new HttpError(400, "Select an active hospital in the patient's district", "INVALID_REFERRAL");
  }

  const masters = await client.query(
    `SELECT (SELECT COUNT(*) FROM mst_specialties WHERE id = $1 AND is_active IS TRUE) AS specialty,
            (SELECT COUNT(*) FROM mst_referral_priorities WHERE id = $2 AND is_active IS TRUE) AS priority`,
    [specialtyId, priorityId]
  );
  if (Number(masters.rows[0].specialty) !== 1) {
    throw new HttpError(400, "Select an active specialty", "INVALID_REFERRAL");
  }
  if (Number(masters.rows[0].priority) !== 1) {
    throw new HttpError(400, "Select a priority", "INVALID_REFERRAL");
  }

  if (specialistId) {
    const specialist = await client.query(
      `SELECT 1 FROM tbl_users u
         JOIN mst_roles r ON r.id = u.role_id AND r.code = 'SPECIALIST'
         JOIN tbl_user_facility_assignments ufa ON ufa.user_id = u.id AND ufa.facility_id = $2
        WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND ufa.valid_from <= CURRENT_DATE AND (ufa.valid_to IS NULL OR ufa.valid_to >= CURRENT_DATE)`,
      [specialistId, hospitalFacilityId]
    );
    if (!specialist.rows.length) {
      throw new HttpError(400, "The specialist is not assigned to this hospital", "INVALID_REFERRAL");
    }
  }

  const review = await client.query(
    `SELECT cr.*
       FROM tbl_clinical_reviews cr
      WHERE cr.screening_id = $1 AND cr.patient_id = $2
      FOR UPDATE`,
    [plan.screening_id, plan.patient_id]
  );
  if (!review.rows.length || !review.rows[0].signed_at) {
    throw new HttpError(
      409,
      "A signed clinical review is required before creating a specialist referral",
      "REFERRAL_NOT_ALLOWED"
    );
  }
  const clinicalReview = review.rows[0];
  if (!["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(clinicalReview.decision)) {
    const signedAt = new Date().toISOString();
    const amendmentReason = `Care reassessment specialist referral: ${referralReason}`.slice(0, 2000);
    await client.query(
      `UPDATE tbl_clinical_reviews
          SET decision = 'SPECIALIST_REVIEW',
              referral_reason = $2,
              amendment_reason = $3,
              signed_at = $4,
              signature_hash = $5,
              version = version + 1
        WHERE id = $1`,
      [
        clinicalReview.id,
        referralReason,
        amendmentReason,
        signedAt,
        careReferralSignatureHash(clinicalReview, userId, signedAt, "SPECIALIST_REVIEW"),
      ]
    );
  } else if (!clinicalReview.referral_reason) {
    await client.query(
      `UPDATE tbl_clinical_reviews
          SET referral_reason = $2,
              amendment_reason = $3,
              version = version + 1
        WHERE id = $1`,
      [
        clinicalReview.id,
        referralReason,
        `Care reassessment referral reason update: ${referralReason}`.slice(0, 2000),
      ]
    );
  }

  const navigatorId = plan.assigned_navigator_id || null;
  const inserted = await client.query(
    `INSERT INTO tbl_referrals
       (review_id, patient_id, from_facility_id, to_hospital_id, specialty_id, priority_id,
        mode, reason, assigned_specialist_id, assigned_navigator_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, referral_code, status::text AS status`,
    [
      clinicalReview.id,
      plan.patient_id,
      patient.rows[0].registered_facility_id,
      hospital.rows[0].hospital_id,
      specialtyId,
      priorityId,
      mode,
      referralReason,
      specialistId,
      navigatorId,
      userId,
    ]
  );
  const referral = inserted.rows[0];
  await client.query(
    `INSERT INTO tbl_referral_status_history (referral_id, from_status, to_status, changed_by, reason)
     VALUES ($1, NULL, $2, $3, 'Care reassessment specialist referral')`,
    [referral.id, referral.status, userId]
  );

  for (const assignee of [specialistId, navigatorId].filter(Boolean)) {
    await client.query(
      `INSERT INTO tbl_case_assignments (patient_id, referral_id, user_id, assigned_by, reason)
       SELECT $1, $2, $3, $4, $5
        WHERE NOT EXISTS (
          SELECT 1 FROM tbl_case_assignments ca
           WHERE ca.patient_id = $1 AND ca.user_id = $3 AND ca.valid_to IS NULL
             AND ca.referral_id IS NOT DISTINCT FROM $2::uuid
        )`,
      [plan.patient_id, referral.id, assignee, userId, "Care reassessment referral"]
    );
  }

  await client.query(
    `UPDATE tbl_care_plans SET referral_id = $2, updated_by = $3 WHERE id = $1`,
    [plan.id, referral.id, userId]
  );

  const screening = await client.query(
    `SELECT case_state::text AS case_state FROM tbl_screenings WHERE id = $1 FOR UPDATE`,
    [plan.screening_id]
  );
  if (screening.rows[0]?.case_state === "REVIEWED") {
    await client.query(
      `UPDATE tbl_screenings SET case_state = 'REFERRAL_PLANNED' WHERE id = $1`,
      [plan.screening_id]
    );
  }

  return {
    referral_id: referral.id,
    referral_code: referral.referral_code,
    created: true,
    reused: false,
  };
}

async function insertMedicines(client, planId, medicines, userId, planStartDate = null) {
  for (const medicine of medicines) {
    const startDate = medicine.start_date || planStartDate || null;
    const endDate = medicine.expected_end_date
      || (startDate ? addDaysIso(startDate, medicine.duration_days) : null);
    await client.query(
      `INSERT INTO tbl_care_medicines
         (plan_id, medicine_name, dosage, frequency, duration_days, precautions,
          sort_order, start_date, expected_end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        planId,
        medicine.medicine_name,
        medicine.dosage,
        medicine.frequency,
        medicine.duration_days,
        medicine.precautions,
        medicine.sort_order,
        startDate,
        endDate,
        userId,
      ]
    );
  }
}

// Documented mirror of states that fn_case_transition_allowed(from, 'CLOSED') allows.
// Runtime closure uses the database function (same matrix as fn_check_case_transition).
const SCREENING_CLOSEABLE_STATES = [
  "DRAFT",
  "SCREENED",
  "REVIEWED",
  "ASSESSED",
  "RESULT_REVIEWED",
  "CARE_LINKED",
  "RESCHEDULED",
  "MISSED",
  "DECLINED",
  "LOST_CONTACT",
];

function deriveScreeningSync(planStatus, caseState) {
  if (planStatus !== "CLOSED") {
    return {
      screening_sync_status: "NOT_APPLICABLE",
      screening_closed: caseState === "CLOSED",
      screening_sync_message: null,
    };
  }
  if (caseState === "CLOSED") {
    return {
      screening_sync_status: "SYNCED",
      screening_closed: true,
      screening_sync_message: null,
    };
  }
  return {
    screening_sync_status: "PENDING_SCREENING_CLOSE",
    screening_closed: false,
    screening_sync_message:
      `Care plan is closed, but screening case_state is ${caseState} and cannot legally move to CLOSED yet.`,
  };
}

async function markScreeningClosePending(client, { planId, userId, state, reason }) {
  await client.query(
    `INSERT INTO tbl_care_plan_status_history
       (plan_id, from_status, to_status, changed_by, reason)
     VALUES ($1, 'CLOSED', 'CLOSED', $2, $3)`,
    [
      planId,
      userId,
      `Screening sync pending: case_state=${state} cannot legally close (${reason})`,
    ]
  );
  return {
    screening_sync_status: "PENDING_SCREENING_CLOSE",
    screening_closed: false,
    screening_case_state: state,
    screening_sync_message:
      `Care plan closed. Screening remains ${state} until a legal transition to CLOSED is possible.`,
  };
}

/**
 * Attempt a legal screening close using the same transition matrix as the DB trigger.
 * Asks fn_case_transition_allowed, then UPDATEs so the trigger still enforces rules.
 * Never forces an illegal transition; returns PENDING_SCREENING_CLOSE instead.
 */
async function tryCloseScreening(client, screeningId, { userId, planId, reason }) {
  const screening = await client.query(
    `SELECT case_state::text AS case_state FROM tbl_screenings WHERE id = $1 FOR UPDATE`,
    [screeningId]
  );
  const state = screening.rows[0]?.case_state || null;
  if (!state) {
    return {
      screening_sync_status: "PENDING_SCREENING_CLOSE",
      screening_closed: false,
      screening_case_state: null,
      screening_sync_message: "Screening record was not found during closure.",
    };
  }
  if (state === "CLOSED") {
    return {
      screening_sync_status: "SYNCED",
      screening_closed: true,
      screening_case_state: state,
      screening_sync_message: null,
    };
  }

  // Same legal matrix as fn_check_case_transition (via shared DB function).
  const allowed = await client.query(
    `SELECT fn_case_transition_allowed($1, 'CLOSED') AS ok`,
    [state]
  );
  if (!allowed.rows[0]?.ok) {
    return markScreeningClosePending(client, { planId, userId, state, reason });
  }

  // SAVEPOINT so a rejected trigger does not abort the outer care-plan transaction.
  await client.query("SAVEPOINT care_screening_close");
  try {
    await client.query(`UPDATE tbl_screenings SET case_state = 'CLOSED' WHERE id = $1`, [screeningId]);
    await client.query("RELEASE SAVEPOINT care_screening_close");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT care_screening_close");
    // Trigger still owns final say (check_violation / 23514).
    const code = err && err.code;
    const message = String((err && err.message) || "");
    if (code === "23514" || message.includes("invalid case transition")) {
      return markScreeningClosePending(client, { planId, userId, state, reason });
    }
    throw err;
  }

  return {
    screening_sync_status: "SYNCED",
    screening_closed: true,
    screening_case_state: "CLOSED",
    screening_sync_message: null,
  };
}

async function loadPlanDetail(client, planId) {
  const { rows } = await client.query(
    `SELECT plan.id, plan.screening_id, plan.patient_id, plan.referral_id,
            plan.source::text AS source, plan.status::text AS status,
            plan.plan_version, plan.clinical_summary, plan.precautions,
            plan.treatment_start_date, plan.expected_end_date,
            plan.hospital_revisit_date, plan.patient_informed,
            plan.hospital_revisit_scheduled, plan.hospital_attended,
            plan.precautions_duration_days, plan.precautions_expected_end_date,
            plan.responsible_mo_id, plan.responsible_specialist_id,
            plan.assigned_navigator_id,
            plan.closed_at, plan.created_at, plan.updated_at,
            patient.patient_code, patient.full_name AS patient_name,
            mo.full_name AS medical_officer_name,
            sp.full_name AS specialist_name,
            nav.full_name AS navigator_name,
            screening.case_state::text AS case_state,
            (
              SELECT fr.decision::text
                FROM tbl_care_final_reviews fr
               WHERE fr.plan_id = plan.id
               ORDER BY fr.signed_at DESC
               LIMIT 1
            ) AS mo_reassessment_outcome
       FROM tbl_care_plans plan
       JOIN tbl_patients patient ON patient.id = plan.patient_id
       JOIN tbl_screenings screening ON screening.id = plan.screening_id
       JOIN tbl_users mo ON mo.id = plan.responsible_mo_id
       LEFT JOIN tbl_users sp ON sp.id = plan.responsible_specialist_id
       LEFT JOIN tbl_users nav ON nav.id = plan.assigned_navigator_id
      WHERE plan.id = $1`,
    [planId]
  );
  if (!rows.length) throw new HttpError(404, "Care plan not found", "NOT_FOUND");

  const medicines = await client.query(
    `SELECT id, medicine_name, dosage, frequency, duration_days, precautions, sort_order,
            start_date, expected_end_date
       FROM tbl_care_medicines
      WHERE plan_id = $1 AND is_active IS TRUE
      ORDER BY sort_order, created_at`,
    [planId]
  );
  const followups = await client.query(
    `SELECT schedule.id, schedule.due_at, schedule.status::text AS status,
            schedule.instructions, schedule.assigned_hw_id,
            hw.full_name AS health_worker_name,
            report.id AS report_id, report.submitted_at AS report_submitted_at,
            report.adhering_to_treatment, report.improvement_noted,
            report.side_effects, report.precautions_followed,
            report.hospital_attended AS report_hospital_attended,
            report.hospital_revisit_reminded
       FROM tbl_care_followup_schedules schedule
       JOIN tbl_users hw ON hw.id = schedule.assigned_hw_id
       LEFT JOIN tbl_care_followup_reports report ON report.schedule_id = schedule.id
      WHERE schedule.plan_id = $1
      ORDER BY schedule.due_at`,
    [planId]
  );
  const discomforts = await client.query(
    `SELECT id, issue_type, severity, is_urgent, description,
            status::text AS status, created_at, escalated_at
       FROM tbl_care_discomfort_reports
      WHERE plan_id = $1
      ORDER BY created_at DESC`,
    [planId]
  );
  const finals = await client.query(
    `SELECT id, observations, clinical_assessment, recovery_confirmed,
            decision::text AS decision, signed_at
       FROM tbl_care_final_reviews
      WHERE plan_id = $1
      ORDER BY signed_at DESC`,
    [planId]
  );

  const sync = deriveScreeningSync(rows[0].status, rows[0].case_state);
  const planStart = rows[0].treatment_start_date
    ? String(rows[0].treatment_start_date).slice(0, 10)
    : null;
  const enrichedMedicines = medicines.rows.map((medicine) => {
    const start = medicine.start_date
      ? String(medicine.start_date).slice(0, 10)
      : planStart;
    const end = medicine.expected_end_date
      ? String(medicine.expected_end_date).slice(0, 10)
      : (start ? addDaysIso(start, medicine.duration_days) : null);
    return {
      ...medicine,
      start_date: start,
      expected_end_date: end,
    };
  });
  return {
    ...rows[0],
    ...sync,
    hospital_revisit_status: deriveHospitalRevisitStatus(rows[0]),
    duration_due: Boolean(
      (rows[0].expected_end_date && String(rows[0].expected_end_date).slice(0, 10) <= new Date().toISOString().slice(0, 10))
      || (rows[0].hospital_revisit_date && String(rows[0].hospital_revisit_date).slice(0, 10) <= new Date().toISOString().slice(0, 10))
    ) && !["CLOSED", "SUPERSEDED"].includes(rows[0].status),
    medicines: enrichedMedicines,
    followups: followups.rows,
    discomforts: discomforts.rows,
    final_reviews: finals.rows,
  };
}

/**
 * Claimed/reviewed patients eligible for a new community care plan.
 * Never returns patients outside the MO mandal claim scope.
 */
async function listCareEligiblePatients(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query, 20);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const statusFilter = typeof query.case_state === "string" ? query.case_state.trim() : "";
  const allowedStates = ["REVIEWED", "REFERRAL_PLANNED", "ASSESSED"];

  const params = [userId, ACTIVE_PLAN_STATUSES];
  let searchClause = "";
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    searchClause = `AND (
      patient.full_name ILIKE ${p}
      OR patient.patient_code ILIKE ${p}
      OR village.name_en ILIKE ${p}
      OR village.name_te ILIKE ${p}
    )`;
  }

  const stateValues = statusFilter && allowedStates.includes(statusFilter)
    ? [statusFilter]
    : allowedStates;
  params.push(stateValues);
  const stateParam = `$${params.length}`;
  params.push(pageSize, offset);
  const lim = `$${params.length - 1}`;
  const off = `$${params.length}`;

  const result = await pool.query(
    `SELECT patient.id, patient.patient_code, patient.full_name AS patient_name,
            village.name_en AS village_name, village.name_te AS village_name_te,
            screening.id AS screening_id,
            screening.case_state::text AS case_state,
            screening.decision::text AS review_decision,
            screening.signed_at,
            claim.claimed_at,
            COUNT(*) OVER()::int AS total_count
       FROM tbl_medical_officer_case_claims claim
       JOIN tbl_patients patient
         ON patient.id = claim.patient_id AND patient.deleted_at IS NULL
       JOIN mst_villages village ON village.id = patient.village_id
       JOIN LATERAL (
         SELECT s.id, s.case_state, r.decision, r.signed_at, r.doctor_id
           FROM tbl_screenings s
           JOIN tbl_clinical_reviews r
             ON r.screening_id = s.id
            AND r.patient_id = s.patient_id
            AND r.signed_at IS NOT NULL
          WHERE s.patient_id = patient.id
          ORDER BY r.signed_at DESC
          LIMIT 1
       ) screening ON TRUE
      WHERE claim.medical_officer_id = $1
        AND claim.released_at IS NULL
        AND ${mandalScope("$1", "village")}
        AND screening.doctor_id = $1
        AND screening.case_state::text = ANY(${stateParam}::text[])
        ${searchClause}
        AND NOT EXISTS (
          SELECT 1 FROM tbl_care_plans plan
           WHERE plan.screening_id = screening.id
             AND plan.status = ANY($2::care_plan_status[])
        )
        AND NOT ${openReferralExistsSql("patient.id")}
      ORDER BY screening.signed_at DESC
      LIMIT ${lim} OFFSET ${off}`,
    params
  );

  const total = result.rows[0]?.total_count || 0;
  return {
    items: result.rows.map(({ total_count, ...row }) => row),
    pagination: pagination(page, pageSize, total),
  };
}

async function getLatestReviewedScreening(client, patientId) {
  const { rows } = await client.query(
    `SELECT screening.id, screening.case_state::text AS case_state,
            review.id AS review_id, review.decision::text AS decision,
            review.doctor_id, review.followup_instructions, review.finding
       FROM tbl_screenings screening
       JOIN tbl_clinical_reviews review
         ON review.screening_id = screening.id
        AND review.patient_id = screening.patient_id
        AND review.signed_at IS NOT NULL
      WHERE screening.patient_id = $1
      ORDER BY review.signed_at DESC
      LIMIT 1`,
    [patientId]
  );
  return rows[0] || null;
}

async function createMoCarePlan(userId, req, patientId, input = {}) {
  requireUuid(patientId, "Invalid patient ID");
  const medicines = normalizeMedicines(input.medicines);
  const clinicalSummary = requireText(input.clinical_summary, 4000, "Clinical summary");
  const precautions = optionalText(input.precautions, 2000, "Precautions");
  const navigatorId = requireUuid(input.navigator_id, "Select a Navigator");
  const startDate = requireDate(
    input.treatment_start_date || new Date().toISOString().slice(0, 10),
    "Treatment start date"
  );
  const endDate = computeExpectedEndDate(startDate, medicines, input.expected_end_date || null);
  const hospitalRevisitDate = requireHospitalRevisitDate(input.hospital_revisit_date, startDate);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await requireActiveClaim(client, userId, patientId, { lock: true });

    const screening = await getLatestReviewedScreening(client, patientId);
    if (!screening) {
      throw new HttpError(400, "Sign a clinical review before creating a treatment plan", "REVIEW_REQUIRED");
    }
    // Authorization: only the MO who signed the latest review may create the plan.
    // Frontend patient picker is never trusted for this check.
    if (String(screening.doctor_id) !== String(userId)) {
      throw new HttpError(
        403,
        "Only the Medical Officer who signed the latest clinical review can create this care plan",
        "REVIEW_OWNER"
      );
    }
    if (!["REVIEWED", "REFERRAL_PLANNED", "ASSESSED"].includes(screening.case_state)) {
      throw new HttpError(409, "This case is not ready for a community treatment plan", "INVALID_STATE");
    }
    // Hard block while specialist referral is open — frontend allow_with_referral cannot bypass.
    await assertNoOpenSpecialistReferral(client, patientId);

    if (["SPECIALIST_REVIEW", "URGENT_REFERRAL"].includes(screening.decision) && !input.allow_with_referral) {
      throw new HttpError(
        409,
        "This review decided on specialist referral. Use the referral workflow or confirm direct care.",
        "REFERRAL_DECISION"
      );
    }

    const active = await client.query(
      `SELECT id FROM tbl_care_plans
        WHERE screening_id = $1 AND status = ANY($2::care_plan_status[])
        LIMIT 1`,
      [screening.id, ACTIVE_PLAN_STATUSES]
    );
    if (active.rows.length) {
      throw new HttpError(409, "An active care plan already exists for this case", "PLAN_EXISTS");
    }

    const navigator = await client.query(
      `SELECT u.id
         FROM tbl_users u
         JOIN mst_roles role ON role.id = u.role_id AND role.code = 'NAVIGATOR'
        WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`,
      [navigatorId]
    );
    if (!navigator.rows.length) {
      throw new HttpError(400, "Selected Navigator is not available", "INVALID_NAVIGATOR");
    }

    const inserted = await client.query(
      `INSERT INTO tbl_care_plans
         (screening_id, patient_id, source, status, responsible_mo_id, assigned_navigator_id,
          clinical_summary, precautions, treatment_start_date, expected_end_date,
          hospital_revisit_date, created_by, updated_by)
       VALUES ($1, $2, 'MO', 'AWAITING_NAVIGATOR', $3, $4, $5, $6, $7, $8, $9, $3, $3)
       RETURNING id`,
      [
        screening.id,
        patientId,
        userId,
        navigatorId,
        clinicalSummary,
        precautions,
        startDate,
        endDate,
        hospitalRevisitDate,
      ]
    );
    const planId = inserted.rows[0].id;
    await recordStatusChange(client, planId, null, "AWAITING_NAVIGATOR", userId, "MO direct treatment plan");
    await insertMedicines(client, planId, medicines, userId, startDate);
    await ensureNavigatorAssignment(client, {
      patientId,
      navigatorId,
      assignedBy: userId,
      reason: "MO direct care plan",
    });

    await notifyCare(client, {
      templateCode: "CARE_PLAN_READY",
      recipientUserId: navigatorId,
      patientId,
      event: "CARE_PLAN_READY",
      title: "New care plan from Medical Officer",
      message: "A Medical Officer sent a treatment plan for follow-up coordination.",
      targetPath: `/navigator/tracking/${patientId}`,
      planId,
      dedupeKey: `CARE_PLAN_READY:${planId}`,
    });

    await audit(req, {
      event: "CARE_PLAN_CREATED",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: planId,
      patientId,
      metadata: { source: "MO", screening_id: screening.id },
    });

    return loadPlanDetail(client, planId);
  });
}

async function listMoCarePlans(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const filter = typeof query.filter === "string" ? query.filter : "active";
  let statusClause = "plan.status = ANY($2::care_plan_status[])";
  let statuses = ACTIVE_PLAN_STATUSES;
  // Active MO clinical workflow excludes patients parked on an open specialist referral.
  let excludeOpenReferral = true;
  let sourceClause = "plan.source = 'MO'";
  if (filter === "escalations") {
    statuses = ["PATIENT_UNCOMFORTABLE", "MO_REASSESSMENT"];
  } else if (filter === "final") {
    // Specialist owns SPECIALIST-sourced plans; MO final queue is MO plans only.
    statuses = ["FINAL_CHECKUP_PENDING", "TREATMENT_COMPLETED", "RECOVERY_CONFIRMED"];
    sourceClause = "plan.source = 'MO'";
    excludeOpenReferral = true;
  } else if (filter === "closed") {
    statusClause = "plan.status IN ('CLOSED', 'SUPERSEDED')";
    statuses = null;
    sourceClause = "TRUE";
    excludeOpenReferral = false;
  } else if (filter === "referred") {
    // Historical/parked plans linked while referral was active (read-only context).
    statusClause = "plan.status = 'SUPERSEDED'";
    statuses = null;
    sourceClause = "plan.source = 'MO'";
    excludeOpenReferral = false;
  }

  const params = statuses ? [userId, statuses, pageSize, offset] : [userId, pageSize, offset];
  const limitParam = statuses ? "$3" : "$2";
  const offsetParam = statuses ? "$4" : "$3";
  const openReferralClause = excludeOpenReferral
    ? `AND NOT ${openReferralExistsSql("patient.id")}`
    : "";

  const list = await pool.query(
    `SELECT plan.id, plan.status::text AS status, plan.source::text AS source,
            plan.created_at, plan.expected_end_date, plan.referral_id,
            patient.id AS patient_id, patient.patient_code, patient.full_name AS patient_name,
            nav.full_name AS navigator_name,
            COUNT(*) OVER()::int AS total_count
       FROM tbl_care_plans plan
       JOIN tbl_patients patient ON patient.id = plan.patient_id AND patient.deleted_at IS NULL
       JOIN mst_villages pv ON pv.id = patient.village_id
       LEFT JOIN tbl_users nav ON nav.id = plan.assigned_navigator_id
      WHERE plan.responsible_mo_id = $1
        AND ${mandalScope("$1")}
        AND ${statusClause}
        AND ${sourceClause}
        ${openReferralClause}
      ORDER BY plan.updated_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const total = list.rows[0]?.total_count || 0;
  return {
    items: list.rows.map(({ total_count, ...row }) => row),
    pagination: pagination(page, pageSize, total),
  };
}

async function getCarePlanForMo(userId, planId) {
  requireUuid(planId, "Invalid care plan ID");
  const { rows } = await pool.query(
    `SELECT plan.patient_id
       FROM tbl_care_plans plan
       JOIN tbl_patients patient ON patient.id = plan.patient_id
       JOIN mst_villages pv ON pv.id = patient.village_id
      WHERE plan.id = $2
        AND plan.responsible_mo_id = $1
        AND ${mandalScope("$1")}`,
    [userId, planId]
  );
  if (!rows.length) throw new HttpError(403, "You cannot access this care plan", "FORBIDDEN");
  return loadPlanDetail(pool, planId);
}

async function createSuccessorCarePlan(client, {
  oldPlan,
  userId,
  medicines,
  clinicalSummary,
  precautions,
  reason,
  startDate,
  endDate,
  hospitalRevisitDate,
  source = "MO",
  responsibleMoId = null,
  responsibleSpecialistId = null,
}) {
  await client.query(
    `UPDATE tbl_care_plans
        SET status = 'SUPERSEDED', updated_by = $2
      WHERE id = $1`,
    [oldPlan.id, userId]
  );
  await recordStatusChange(client, oldPlan.id, oldPlan.status, "SUPERSEDED", userId, reason);

  const planSource = source === "SPECIALIST" ? "SPECIALIST" : "MO";
  const moId = responsibleMoId || (planSource === "SPECIALIST" ? oldPlan.responsible_mo_id : userId);
  const specialistId = planSource === "SPECIALIST"
    ? (responsibleSpecialistId || oldPlan.responsible_specialist_id || userId)
    : null;

  const inserted = await client.query(
    `INSERT INTO tbl_care_plans
       (screening_id, patient_id, referral_id, source, status, plan_version, supersedes_plan_id,
        responsible_mo_id, responsible_specialist_id, assigned_navigator_id, clinical_summary, precautions,
        treatment_start_date, expected_end_date, hospital_revisit_date, created_by, updated_by)
     VALUES ($1, $2, $3, $4::care_plan_source, 'AWAITING_NAVIGATOR', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
     RETURNING id`,
    [
      oldPlan.screening_id,
      oldPlan.patient_id,
      oldPlan.referral_id,
      planSource,
      Number(oldPlan.plan_version) + 1,
      oldPlan.id,
      moId,
      specialistId,
      oldPlan.assigned_navigator_id,
      clinicalSummary,
      precautions,
      startDate,
      endDate,
      hospitalRevisitDate,
      userId,
    ]
  );
  const newPlanId = inserted.rows[0].id;
  await recordStatusChange(client, newPlanId, null, "AWAITING_NAVIGATOR", userId, reason);
  await insertMedicines(client, newPlanId, medicines, userId, startDate);
  return newPlanId;
}

async function reassessCarePlan(userId, req, planId, input = {}) {
  requireUuid(planId, "Invalid care plan ID");
  const medicines = normalizeMedicines(input.medicines);
  const clinicalSummary = requireText(input.clinical_summary, 4000, "Clinical summary");
  const precautions = optionalText(input.precautions, 2000, "Precautions");
  const reason = requireText(input.reason, 1000, "Reassessment reason");
  const startDate = requireDate(
    input.treatment_start_date || new Date().toISOString().slice(0, 10),
    "Treatment start date"
  );
  const endDate = computeExpectedEndDate(startDate, medicines, input.expected_end_date || null);
  const hospitalRevisitDate = requireHospitalRevisitDate(input.hospital_revisit_date, startDate);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT plan.*
         FROM tbl_care_plans plan
         JOIN tbl_patients patient ON patient.id = plan.patient_id
         JOIN mst_villages pv ON pv.id = patient.village_id
        WHERE plan.id = $2
          AND plan.responsible_mo_id = $1
          AND ${mandalScope("$1")}
        FOR UPDATE OF plan`,
      [userId, planId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot reassess this care plan", "FORBIDDEN");
    const oldPlan = rows[0];
    if (!["PATIENT_UNCOMFORTABLE", "MO_REASSESSMENT", "FOLLOWUP_ACTIVE", "TREATMENT_COMPLETED", "FINAL_CHECKUP_PENDING"].includes(oldPlan.status)) {
      throw new HttpError(409, "This plan is not waiting for reassessment", "INVALID_STATE");
    }
    await assertNoOpenSpecialistReferral(client, oldPlan.patient_id);

    const newPlanId = await createSuccessorCarePlan(client, {
      oldPlan,
      userId,
      medicines,
      clinicalSummary,
      precautions,
      reason,
      startDate,
      endDate,
      hospitalRevisitDate,
    });

    await client.query(
      `UPDATE tbl_care_discomfort_reports
          SET status = 'RESOLVED', resolved_at = now(), resolution_notes = $2, updated_at = now()
        WHERE plan_id = $1 AND status IN ('OPEN', 'ESCALATED')`,
      [planId, reason]
    );

    if (oldPlan.assigned_navigator_id) {
      await notifyCare(client, {
        templateCode: "CARE_PLAN_READY",
        recipientUserId: oldPlan.assigned_navigator_id,
        patientId: oldPlan.patient_id,
        event: "CARE_PLAN_UPDATED",
        title: "Updated care plan",
        message: "The Medical Officer updated the treatment plan after reassessment.",
        targetPath: "/navigator/followups",
        planId: newPlanId,
        dedupeKey: `CARE_PLAN_UPDATED:${newPlanId}`,
      });
    }

    await audit(req, {
      event: "CARE_PLAN_REASSESSED",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: newPlanId,
      patientId: oldPlan.patient_id,
      metadata: { superseded_plan_id: planId },
    });

    return loadPlanDetail(client, newPlanId);
  });
}

async function finalReview(userId, req, planId, input = {}, options = {}) {
  requireUuid(planId, "Invalid care plan ID");
  const asSpecialist = options.asSpecialist === true;
  const observations = requireText(input.observations, 4000, "Final observations");
  const assessment = optionalText(input.clinical_assessment, 4000, "Clinical assessment");
  const decision = input.decision;
  if (!FINAL_REVIEW_DECISIONS.includes(decision)) {
    throw new HttpError(400, "Choose a final review decision", "INVALID_CARE");
  }
  const recoveryConfirmed = Boolean(input.recovery_confirmed);
  if (decision === "CLOSE_RECOVERED" && !recoveryConfirmed) {
    throw new HttpError(400, "Confirm recovery before closing the case", "RECOVERY_REQUIRED");
  }

  let continueMedicines = null;
  let continueSummary = null;
  let continuePrecautions = null;
  let continueStart = null;
  let continueEnd = null;
  let continueRevisit = null;
  let referralReason = null;
  let urgentReason = null;

  if (decision === "CONTINUE_TREATMENT") {
    continueMedicines = normalizeMedicines(input.medicines);
    continueSummary = requireText(
      input.clinical_summary || assessment || observations,
      4000,
      "Updated clinical summary"
    );
    continuePrecautions = optionalText(input.precautions, 2000, "Precautions");
    continueStart = requireDate(
      input.treatment_start_date || new Date().toISOString().slice(0, 10),
      "Treatment start date"
    );
    continueEnd = computeExpectedEndDate(continueStart, continueMedicines, input.expected_end_date || null);
    continueRevisit = requireHospitalRevisitDate(input.hospital_revisit_date, continueStart);
  } else if (decision === "REFER_SPECIALIST") {
    referralReason = requireText(
      input.referral_reason || assessment || observations,
      2000,
      "Referral reason"
    );
  } else if (decision === "URGENT_ESCALATION") {
    urgentReason = requireText(
      input.urgent_reason || assessment || observations,
      2000,
      "Urgent escalation reason"
    );
  }

  const clinicianLabel = asSpecialist ? "Specialist" : "Medical Officer";

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      asSpecialist
        ? `SELECT plan.*
             FROM tbl_care_plans plan
            WHERE plan.id = $2
              AND plan.responsible_specialist_id = $1
              AND plan.source = 'SPECIALIST'
            FOR UPDATE OF plan`
        : `SELECT plan.*
             FROM tbl_care_plans plan
             JOIN tbl_patients patient ON patient.id = plan.patient_id
             JOIN mst_villages pv ON pv.id = patient.village_id
            WHERE plan.id = $2
              AND plan.responsible_mo_id = $1
              AND plan.source = 'MO'
              AND ${mandalScope("$1")}
            FOR UPDATE OF plan`,
      [userId, planId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot final-review this care plan", "FORBIDDEN");
    const plan = rows[0];
    if (plan.status === "CLOSED" || plan.status === "SUPERSEDED") {
      throw new HttpError(409, "This care plan is already closed", "ALREADY_CLOSED");
    }
    if (!FINAL_REVIEW_READY_STATUSES.includes(plan.status)) {
      throw new HttpError(409, `This plan is not ready for ${clinicianLabel} reassessment`, "INVALID_STATE");
    }

    await client.query(
      `INSERT INTO tbl_care_final_reviews
         (plan_id, screening_id, patient_id, medical_officer_id, observations,
          clinical_assessment, recovery_confirmed, decision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        planId,
        plan.screening_id,
        plan.patient_id,
        userId,
        observations,
        assessment || referralReason || urgentReason,
        recoveryConfirmed,
        decision,
      ]
    );

    let screeningSync = null;
    let resultPlanId = planId;
    let referralWorkflowRequired = false;
    let careReferral = null;

    if (decision === "CLOSE_RECOVERED") {
      await client.query(
        `UPDATE tbl_care_plans
            SET status = 'CLOSED', closed_at = now(), closed_by = $2, updated_by = $2
          WHERE id = $1 AND status <> 'CLOSED'`,
        [planId, userId]
      );
      await recordStatusChange(client, planId, plan.status, "CLOSED", userId, "Recovery confirmed");

      screeningSync = await tryCloseScreening(client, plan.screening_id, {
        userId,
        planId,
        reason: "final review recovery",
      });

      for (const recipientId of [plan.assigned_navigator_id].filter(Boolean)) {
        await notifyCare(client, {
          templateCode: "CARE_CASE_CLOSED",
          recipientUserId: recipientId,
          patientId: plan.patient_id,
          event: "CARE_CASE_CLOSED",
          title: "Care case closed",
          message: `The ${clinicianLabel} closed the case after final review.`,
          targetPath: "/navigator/followups",
          planId,
          dedupeKey: `CARE_CASE_CLOSED:${planId}:${recipientId}`,
        });
      }

      const hw = await client.query(
        `SELECT registered_by FROM tbl_patients WHERE id = $1`,
        [plan.patient_id]
      );
      if (hw.rows[0]?.registered_by) {
        await notifyCare(client, {
          templateCode: "CARE_CASE_CLOSED",
          recipientUserId: hw.rows[0].registered_by,
          patientId: plan.patient_id,
          event: "CARE_CASE_CLOSED",
          title: "Care case closed",
          message: `The ${clinicianLabel} closed the case after final review.`,
          targetPath: "/health-worker/followups",
          planId,
          dedupeKey: `CARE_CASE_CLOSED:${planId}:hw`,
        });
      }
    } else if (decision === "CONTINUE_TREATMENT") {
      if (!asSpecialist) {
        await assertNoOpenSpecialistReferral(client, plan.patient_id);
      }
      resultPlanId = await createSuccessorCarePlan(client, {
        oldPlan: plan,
        userId,
        medicines: continueMedicines,
        clinicalSummary: continueSummary,
        precautions: continuePrecautions,
        reason: `CONTINUE_TREATMENT after ${asSpecialist ? "Specialist" : "MO"} reassessment`,
        startDate: continueStart,
        endDate: continueEnd,
        hospitalRevisitDate: continueRevisit,
        source: asSpecialist ? "SPECIALIST" : "MO",
        responsibleMoId: asSpecialist ? plan.responsible_mo_id : userId,
        responsibleSpecialistId: asSpecialist ? userId : null,
      });
      if (plan.assigned_navigator_id) {
        await notifyCare(client, {
          templateCode: "CARE_PLAN_READY",
          recipientUserId: plan.assigned_navigator_id,
          patientId: plan.patient_id,
          event: "CARE_CONTINUE_TREATMENT",
          title: "Continue treatment — new plan",
          message: `${clinicianLabel} created a new treatment plan. Case remains open.`,
          targetPath: "/navigator/followups",
          planId: resultPlanId,
          dedupeKey: `CARE_CONTINUE:${resultPlanId}`,
        });
      }
    } else if (decision === "REFER_SPECIALIST") {
      // Keep case OPEN. Create/link referral; park MO plans only when MO initiates.
      careReferral = await createOrLinkCareSpecialistReferral(client, {
        userId,
        plan,
        referralReason,
        input,
      });
      if (!asSpecialist) {
        await parkMoCarePlansForSpecialistReferral(client, {
          patientId: plan.patient_id,
          userId,
          referralId: careReferral.referral_id,
          reason: `REFER_SPECIALIST: ${referralReason}`,
        });
      } else {
        // Onward referral: park this Specialist plan but do not auto-close the case.
        await client.query(
          `UPDATE tbl_care_plans
              SET status = 'SUPERSEDED', updated_by = $2
            WHERE id = $1 AND status NOT IN ('CLOSED', 'SUPERSEDED')`,
          [planId, userId]
        );
        await recordStatusChange(
          client,
          planId,
          plan.status,
          "SUPERSEDED",
          userId,
          `REFER_SPECIALIST onward: ${referralReason}`
        );
      }
      referralWorkflowRequired = false;
      if (plan.assigned_navigator_id) {
        await notifyCare(client, {
          templateCode: "CARE_PLAN_READY",
          recipientUserId: plan.assigned_navigator_id,
          patientId: plan.patient_id,
          event: "CARE_REFER_SPECIALIST",
          title: asSpecialist
            ? "Onward specialist referral from reassessment"
            : "Specialist referral from care reassessment",
          message: careReferral.created
            ? `Specialist referral ${careReferral.referral_code} created.`
            : `Existing specialist referral ${careReferral.referral_code} linked.`,
          targetPath: `/navigator/tracking/${plan.patient_id}`,
          planId,
          dedupeKey: `CARE_REFER_SPECIALIST:${planId}:${careReferral.referral_id}`,
        });
      }
    } else if (decision === "URGENT_ESCALATION") {
      // Pull emergency cases out of the routine follow-up queue.
      await client.query(
        `UPDATE tbl_care_followup_schedules
            SET status = 'CANCELLED', updated_at = now()
          WHERE plan_id = $1 AND status = 'SCHEDULED'`,
        [planId]
      );
      const hw = await client.query(
        `SELECT registered_by FROM tbl_patients WHERE id = $1`,
        [plan.patient_id]
      );
      if (hw.rows[0]?.registered_by) {
        await client.query(
          `INSERT INTO tbl_care_discomfort_reports
             (plan_id, patient_id, reported_by, issue_type, severity, is_urgent, description, status,
              escalated_to_mo, escalated_at)
           VALUES ($1, $2, $3, 'INCREASED_SYMPTOMS', 'EMERGENCY', TRUE, $4, 'ESCALATED', $5, now())`,
          [planId, plan.patient_id, hw.rows[0].registered_by, urgentReason, userId]
        );
      }
      await client.query(
        `UPDATE tbl_care_plans SET status = 'MO_REASSESSMENT', updated_by = $2 WHERE id = $1`,
        [planId, userId]
      );
      await recordStatusChange(
        client,
        planId,
        plan.status,
        "MO_REASSESSMENT",
        userId,
        `URGENT_ESCALATION: ${urgentReason}`
      );
      if (plan.assigned_navigator_id) {
        await notifyCare(client, {
          templateCode: "CARE_DISCOMFORT_ALERT",
          recipientUserId: plan.assigned_navigator_id,
          patientId: plan.patient_id,
          event: "CARE_URGENT_ESCALATION",
          title: "Urgent clinical escalation",
          message: `${clinicianLabel} marked this case as urgent. It left the routine follow-up queue.`,
          targetPath: `/navigator/tracking/${plan.patient_id}`,
          planId,
          dedupeKey: `CARE_URGENT_ESCALATION:${planId}:${Date.now()}`,
        });
      }
    }

    await audit(req, {
      event: "CARE_FINAL_REVIEW",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: resultPlanId,
      patientId: plan.patient_id,
      metadata: {
        decision,
        recovery_confirmed: recoveryConfirmed,
        as_specialist: asSpecialist,
        referral_workflow_required: referralWorkflowRequired,
        referral_id: careReferral?.referral_id || null,
        superseded_plan_id: decision === "CONTINUE_TREATMENT" ? planId : null,
        ...(screeningSync || {}),
      },
    });

    const detail = await loadPlanDetail(client, resultPlanId);
    return {
      ...detail,
      ...(screeningSync || {}),
      referral_workflow_required: referralWorkflowRequired,
      referral: careReferral,
      mo_reassessment_outcome: decision,
    };
  });
}

async function finalReviewForSpecialist(userId, req, planId, input = {}) {
  return finalReview(userId, req, planId, input, { asSpecialist: true });
}

async function closeCarePlan(userId, req, planId) {
  requireUuid(planId, "Invalid care plan ID");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT plan.*, fr.recovery_confirmed, fr.decision::text AS final_decision
         FROM tbl_care_plans plan
         JOIN tbl_patients patient ON patient.id = plan.patient_id
         JOIN mst_villages pv ON pv.id = patient.village_id
         LEFT JOIN LATERAL (
           SELECT recovery_confirmed, decision
             FROM tbl_care_final_reviews
            WHERE plan_id = plan.id
            ORDER BY signed_at DESC
            LIMIT 1
         ) fr ON TRUE
        WHERE plan.id = $2
          AND plan.responsible_mo_id = $1
          AND ${mandalScope("$1")}
        FOR UPDATE OF plan`,
      [userId, planId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot close this care plan", "FORBIDDEN");
    const plan = rows[0];
    if (plan.status === "CLOSED") {
      const detail = await loadPlanDetail(client, planId);
      // Idempotent: still try legal screening sync if pending.
      if (detail.screening_sync_status === "PENDING_SCREENING_CLOSE") {
        const sync = await tryCloseScreening(client, plan.screening_id, {
          userId,
          planId,
          reason: "retry after care plan already closed",
        });
        return { ...(await loadPlanDetail(client, planId)), ...sync };
      }
      return detail;
    }
    if (!plan.final_decision) {
      throw new HttpError(400, "Complete the final Medical Officer review before closing", "FINAL_REVIEW_REQUIRED");
    }
    if (plan.final_decision !== "CLOSE_RECOVERED" || !plan.recovery_confirmed) {
      throw new HttpError(400, "Recovery must be confirmed in the final review before closing", "RECOVERY_REQUIRED");
    }

    const updated = await client.query(
      `UPDATE tbl_care_plans
          SET status = 'CLOSED', closed_at = now(), closed_by = $2, updated_by = $2
        WHERE id = $1 AND status <> 'CLOSED'
        RETURNING id`,
      [planId, userId]
    );
    if (!updated.rows.length) {
      return loadPlanDetail(client, planId);
    }
    await recordStatusChange(client, planId, plan.status, "CLOSED", userId, "Closed after final review");

    const screeningSync = await tryCloseScreening(client, plan.screening_id, {
      userId,
      planId,
      reason: "close after final review",
    });

    await audit(req, {
      event: "CARE_CASE_CLOSED",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: planId,
      patientId: plan.patient_id,
      metadata: screeningSync,
    });

    return { ...(await loadPlanDetail(client, planId)), ...screeningSync };
  });
}

/**
 * Specialist completed review → Navigator (never returns to MO review queue).
 */
const CARE_PLAN_ELIGIBLE_DECISIONS = [
  "VIDEO_CONSULTATION",
  "DIRECT_HOSPITAL_VISIT",
  "CLINICAL_FOLLOW_UP",
];

async function sendSpecialistReviewToNavigator(userId, req, referralId, input = {}) {
  requireUuid(referralId, "Invalid referral ID");

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);

    const { rows } = await client.query(
      `SELECT r.id, r.patient_id, r.status::text AS referral_status,
              r.assigned_specialist_id, r.assigned_navigator_id,
              r.assessment_completed_at,
              cr.screening_id, cr.doctor_id AS responsible_mo_id,
              s.case_state::text AS case_state,
              d.id AS decision_id, d.status AS decision_status,
              d.clinical_recommendation, d.instructions, d.additional_notes,
              d.decision_type
         FROM tbl_referrals r
         JOIN tbl_clinical_reviews cr ON cr.id = r.review_id AND cr.patient_id = r.patient_id
         JOIN tbl_screenings s ON s.id = cr.screening_id
         LEFT JOIN tbl_specialist_consultation_decisions d
           ON d.referral_id = r.id AND d.patient_id = r.patient_id
        WHERE r.id = $1
          AND r.assigned_specialist_id = $2
        FOR UPDATE OF r`,
      [referralId, userId]
    );
    if (!rows.length) throw new HttpError(403, "You are not assigned to this referral", "FORBIDDEN");
    const referral = rows[0];
    if (["CANCELLED", "DECLINED"].includes(referral.referral_status)) {
      throw new HttpError(409, "This referral is no longer active", "INVALID_STATE");
    }
    if (!referral.decision_id || referral.decision_status !== "SIGNED") {
      throw new HttpError(400, "Sign the specialist decision before sending to Navigator", "DECISION_REQUIRED");
    }
    if (!CARE_PLAN_ELIGIBLE_DECISIONS.includes(referral.decision_type)) {
      throw new HttpError(
        400,
        "Only video consultation, direct hospital visit, or clinical follow-up decisions can create a Specialist care plan",
        "DECISION_NOT_ELIGIBLE"
      );
    }
    if (!referral.assigned_navigator_id) {
      throw new HttpError(400, "This referral has no assigned Navigator", "NAVIGATOR_REQUIRED");
    }

    // Idempotent: reuse an active SPECIALIST-sourced plan for this referral only.
    const existing = await client.query(
      `SELECT id FROM tbl_care_plans
        WHERE referral_id = $1
          AND source = 'SPECIALIST'
          AND status = ANY($2::care_plan_status[])
        LIMIT 1`,
      [referralId, ACTIVE_PLAN_STATUSES]
    );
    if (existing.rows.length) {
      return loadPlanDetail(client, existing.rows[0].id);
    }

    // Structured care plan required for create — never invent default medicines from {}.
    const medicines = normalizeMedicines(input.medicines);
    const clinicalSummary = requireText(input.clinical_summary, 4000, "Clinical summary");
    const precautions = optionalText(input.precautions, 2000, "Precautions");
    const followUpInstructions = optionalText(input.follow_up_instructions, 2000, "Follow-up instructions");
    const startDate = requireDate(
      input.treatment_start_date || new Date().toISOString().slice(0, 10),
      "Treatment start date"
    );
    const endDate = computeExpectedEndDate(startDate, medicines, input.expected_end_date || null);
    const hospitalRevisitDate = requireHospitalRevisitDate(input.hospital_revisit_date, startDate);
    let precautionsDurationDays = null;
    let precautionsEndDate = null;
    if (input.precautions_duration_days != null && input.precautions_duration_days !== "") {
      precautionsDurationDays = Number(input.precautions_duration_days);
      if (!Number.isInteger(precautionsDurationDays) || precautionsDurationDays < 1 || precautionsDurationDays > 365) {
        throw new HttpError(400, "Precautions duration must be 1–365 days", "INVALID_CARE");
      }
      precautionsEndDate = addDaysIso(startDate, precautionsDurationDays);
    }

    // Park leftover MO community plans only — never Specialist-owned plans.
    await parkMoCarePlansForSpecialistReferral(client, {
      patientId: referral.patient_id,
      userId,
      referralId,
      reason: "SPECIALIST_SEND_TO_NAVIGATOR",
    });

    const summary = clinicalSummary;
    const planMedicines = medicines;
    const precautionsText = [
      precautions,
      followUpInstructions ? `Follow-up: ${followUpInstructions}` : null,
    ].filter(Boolean).join("\n") || null;

    if (!referral.assessment_completed_at) {
      await client.query(
        `UPDATE tbl_referrals
            SET assessment_completed_at = now(),
                assessment_completed_by = $2,
                status = 'COMPLETED',
                version = version + 1
          WHERE id = $1`,
        [referralId, userId]
      );
      await client.query(
        `INSERT INTO tbl_referral_status_history
           (referral_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2::referral_status, 'COMPLETED', $3, $4)`,
        [referralId, referral.referral_status, userId, "Specialist sent review to Navigator"]
      );
    }

    if (referral.case_state === "REFERRAL_PLANNED" || referral.case_state === "APPOINTED") {
      // ASSESSED requires assessment_completed_at (now set). APPOINTED → ASSESSED is legal.
      // REFERRAL_PLANNED → ASSESSED is NOT in the transition table; only APPOINTED → ASSESSED.
      if (referral.case_state === "APPOINTED") {
        await client.query(
          `UPDATE tbl_screenings SET case_state = 'ASSESSED' WHERE id = $1`,
          [referral.screening_id]
        );
      }
    }

    const inserted = await client.query(
      `INSERT INTO tbl_care_plans
         (screening_id, patient_id, referral_id, source, status, responsible_mo_id,
          responsible_specialist_id, assigned_navigator_id, clinical_summary, precautions,
          treatment_start_date, expected_end_date, hospital_revisit_date,
          precautions_duration_days, precautions_expected_end_date, created_by, updated_by)
       VALUES ($1, $2, $3, 'SPECIALIST', 'AWAITING_NAVIGATOR', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $5, $5)
       RETURNING id`,
      [
        referral.screening_id,
        referral.patient_id,
        referralId,
        referral.responsible_mo_id,
        userId,
        referral.assigned_navigator_id,
        summary,
        precautionsText,
        startDate,
        endDate,
        hospitalRevisitDate,
        precautionsDurationDays,
        precautionsEndDate,
      ]
    );
    const planId = inserted.rows[0].id;
    await recordStatusChange(client, planId, null, "AWAITING_NAVIGATOR", userId, "Specialist send to Navigator");
    await insertMedicines(
      client,
      planId,
      planMedicines,
      userId,
      startDate
    );
    await ensureNavigatorAssignment(client, {
      patientId: referral.patient_id,
      navigatorId: referral.assigned_navigator_id,
      assignedBy: userId,
      referralId,
      reason: "Specialist completed review",
    });

    await notifyCare(client, {
      templateCode: "CARE_PLAN_READY",
      recipientUserId: referral.assigned_navigator_id,
      patientId: referral.patient_id,
      event: "CARE_SPECIALIST_TO_NAVIGATOR",
      title: "Specialist review ready",
      message: "A Specialist completed review and sent the case to Navigator.",
      targetPath: "/navigator/followups",
      planId,
      dedupeKey: `CARE_SPECIALIST_TO_NAVIGATOR:${planId}`,
    });

    await audit(req, {
      event: "CARE_SPECIALIST_SENT_TO_NAVIGATOR",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: planId,
      patientId: referral.patient_id,
      metadata: { referral_id: referralId, returned_to_mo: false },
    });

    return loadPlanDetail(client, planId);
  });
}

async function notifyDurationDueForNavigator(client, userId, plans) {
  const today = new Date().toISOString().slice(0, 10);
  for (const plan of plans) {
    const endDue = plan.expected_end_date && String(plan.expected_end_date).slice(0, 10) <= today;
    const revisitDue = plan.hospital_revisit_date
      && String(plan.hospital_revisit_date).slice(0, 10) <= today;
    if (!endDue && !revisitDue) continue;
    await notifyCare(client, {
      templateCode: "CARE_DURATION_DUE",
      recipientUserId: userId,
      patientId: plan.patient_id,
      event: "CARE_DURATION_DUE",
      title: "Treatment or revisit due",
      message: "Treatment duration or hospital revisit is due. Coordinate follow-up. Do not close the case.",
      targetPath: "/navigator/followups?filter=duration_due",
      planId: plan.id,
      dedupeKey: `CARE_DURATION_DUE:${plan.id}:${today}`,
    });
  }
}

async function listNavigatorCarePlans(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const filter = typeof query.filter === "string" ? query.filter : "inbox";
  let statuses = ["AWAITING_NAVIGATOR"];
  let durationDueOnly = false;
  let sourceClause = "";
  if (filter === "active") statuses = ["FOLLOWUP_ACTIVE"];
  else if (filter === "discomfort") statuses = ["PATIENT_UNCOMFORTABLE"];
  else if (filter === "completion") statuses = ["TREATMENT_COMPLETED", "FINAL_CHECKUP_PENDING"];
  else if (filter === "duration_due") {
    statuses = ["FOLLOWUP_ACTIVE", "TREATMENT_COMPLETED", "FINAL_CHECKUP_PENDING", "MO_REASSESSMENT"];
    durationDueOnly = true;
  }
  else if (filter === "specialist") {
    statuses = [...ACTIVE_PLAN_STATUSES];
    sourceClause = "AND plan.source = 'SPECIALIST'";
  }
  else if (filter === "closed") statuses = ["CLOSED"];
  else if (filter === "all") statuses = [...ACTIVE_PLAN_STATUSES, "CLOSED"];

  const durationClause = durationDueOnly
    ? `AND (
         (plan.expected_end_date IS NOT NULL AND plan.expected_end_date <= CURRENT_DATE)
         OR (plan.hospital_revisit_date IS NOT NULL AND plan.hospital_revisit_date <= CURRENT_DATE)
         OR (plan.precautions_expected_end_date IS NOT NULL AND plan.precautions_expected_end_date <= CURRENT_DATE)
       )`
    : "";

  const { rows } = await pool.query(
    `SELECT plan.id, plan.status::text AS status, plan.source::text AS source,
            plan.created_at, plan.expected_end_date, plan.hospital_revisit_date,
            plan.precautions_expected_end_date,
            plan.clinical_summary, plan.patient_informed, plan.hospital_revisit_scheduled,
            plan.hospital_attended,
            patient.id AS patient_id, patient.patient_code, patient.full_name AS patient_name,
            mo.full_name AS medical_officer_name,
            sp.full_name AS specialist_name,
            COUNT(*) OVER()::int AS total_count
       FROM tbl_care_plans plan
       JOIN tbl_patients patient ON patient.id = plan.patient_id AND patient.deleted_at IS NULL
       JOIN tbl_users mo ON mo.id = plan.responsible_mo_id
       LEFT JOIN tbl_users sp ON sp.id = plan.responsible_specialist_id
      WHERE plan.assigned_navigator_id = $1
        AND plan.status = ANY($2::care_plan_status[])
        ${sourceClause}
        ${durationClause}
      ORDER BY plan.updated_at DESC
      LIMIT $3 OFFSET $4`,
    [userId, statuses, pageSize, offset]
  );
  const total = rows[0]?.total_count || 0;
  const items = rows.map(({ total_count, ...row }) => ({
    ...row,
    hospital_revisit_status: deriveHospitalRevisitStatus(row),
    duration_due: durationDueOnly || Boolean(
      (row.expected_end_date && String(row.expected_end_date).slice(0, 10) <= new Date().toISOString().slice(0, 10))
      || (row.hospital_revisit_date && String(row.hospital_revisit_date).slice(0, 10) <= new Date().toISOString().slice(0, 10))
      || (row.precautions_expected_end_date && String(row.precautions_expected_end_date).slice(0, 10) <= new Date().toISOString().slice(0, 10))
    ),
  }));

  if (durationDueOnly) {
    await withTransaction(pool, async (client) => {
      await scanMissedHospitalRevisits(client);
      if (items.length) await notifyDurationDueForNavigator(client, userId, items);
    });
  }

  return {
    items,
    pagination: pagination(page, pageSize, total),
  };
}

async function getCarePlanForNavigator(userId, planId) {
  requireUuid(planId, "Invalid care plan ID");
  const { rows } = await pool.query(
    `SELECT id FROM tbl_care_plans WHERE id = $1 AND assigned_navigator_id = $2`,
    [planId, userId]
  );
  if (!rows.length) throw new HttpError(403, "You are not assigned to this care plan", "FORBIDDEN");
  return loadPlanDetail(pool, planId);
}

async function listAssignableHealthWorkers(userId, planId) {
  requireUuid(planId, "Invalid care plan ID");
  const plan = await pool.query(
    `SELECT plan.patient_id, patient.registered_by, patient.village_id, pf.district_id
       FROM tbl_care_plans plan
       JOIN tbl_patients patient ON patient.id = plan.patient_id
       JOIN mst_facilities pf ON pf.id = patient.registered_facility_id
      WHERE plan.id = $1 AND plan.assigned_navigator_id = $2`,
    [planId, userId]
  );
  if (!plan.rows.length) throw new HttpError(403, "You are not assigned to this care plan", "FORBIDDEN");

  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.full_name
       FROM tbl_users u
       JOIN mst_roles role ON role.id = u.role_id AND role.code = 'HEALTH_WORKER'
      WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
        AND (
          u.id = $1
          OR EXISTS (
            SELECT 1 FROM tbl_health_worker_location_assignments a
             WHERE a.user_id = u.id
               AND a.village_id = $2
               AND a.valid_from <= CURRENT_DATE
               AND (a.valid_to IS NULL OR a.valid_to >= CURRENT_DATE)
          )
          OR u.district_id = $3
        )
      ORDER BY u.full_name
      LIMIT 100`,
    [plan.rows[0].registered_by, plan.rows[0].village_id, plan.rows[0].district_id]
  );
  return rows;
}

async function scheduleFollowup(userId, req, planId, input = {}) {
  requireUuid(planId, "Invalid care plan ID");
  const healthWorkerId = requireUuid(input.health_worker_id, "Select a Health Worker");
  const dueAt = new Date(input.due_at);
  if (!input.due_at || Number.isNaN(dueAt.getTime())) {
    throw new HttpError(400, "Choose a follow-up due date", "INVALID_CARE");
  }
  const instructions = optionalText(input.instructions, 2000, "Instructions");

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT * FROM tbl_care_plans WHERE id = $1 AND assigned_navigator_id = $2 FOR UPDATE`,
      [planId, userId]
    );
    if (!rows.length) throw new HttpError(403, "You are not assigned to this care plan", "FORBIDDEN");
    const plan = rows[0];
    if (["CLOSED", "SUPERSEDED"].includes(plan.status)) {
      throw new HttpError(409, "This care plan is closed", "INVALID_STATE");
    }

    const hw = await client.query(
      `SELECT u.id FROM tbl_users u
         JOIN mst_roles role ON role.id = u.role_id AND role.code = 'HEALTH_WORKER'
        WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`,
      [healthWorkerId]
    );
    if (!hw.rows.length) throw new HttpError(400, "Selected Health Worker is not available", "INVALID_HW");

    const activeFollowup = await client.query(
      `SELECT id FROM tbl_care_followup_schedules
        WHERE plan_id = $1 AND status = 'SCHEDULED'
        LIMIT 1`,
      [planId]
    );
    if (activeFollowup.rows.length) {
      throw new HttpError(
        409,
        "An active follow-up task already exists for this care plan",
        "DUPLICATE_FOLLOWUP"
      );
    }

    const schedule = await client.query(
      `INSERT INTO tbl_care_followup_schedules
         (plan_id, patient_id, assigned_hw_id, due_at, instructions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, due_at, status::text AS status`,
      [planId, plan.patient_id, healthWorkerId, dueAt.toISOString(), instructions, userId]
    );

    if (["AWAITING_NAVIGATOR", "TREATMENT_COMPLETED", "MO_REASSESSMENT"].includes(plan.status)) {
      await client.query(
        `UPDATE tbl_care_plans SET status = 'FOLLOWUP_ACTIVE', updated_by = $2 WHERE id = $1`,
        [planId, userId]
      );
      await recordStatusChange(client, planId, plan.status, "FOLLOWUP_ACTIVE", userId, "Follow-up assigned");
    }

    await ensureHwAssignment(client, {
      patientId: plan.patient_id,
      healthWorkerId,
      assignedBy: userId,
      referralId: plan.referral_id,
      reason: "Care follow-up assignment",
    });

    await notifyCare(client, {
      templateCode: "CARE_FOLLOWUP_ASSIGNED",
      recipientUserId: healthWorkerId,
      patientId: plan.patient_id,
      event: "CARE_FOLLOWUP_ASSIGNED",
      title: "Follow-up assigned",
      message: "A Navigator assigned a patient follow-up visit to you.",
      targetPath: `/health-worker/tracking/${plan.patient_id}`,
      planId,
      dedupeKey: `CARE_FOLLOWUP_ASSIGNED:${schedule.rows[0].id}`,
    });

    await audit(req, {
      event: "CARE_FOLLOWUP_SCHEDULED",
      outcome: "SUCCESS",
      resourceType: "care_followup",
      resourceId: schedule.rows[0].id,
      patientId: plan.patient_id,
      metadata: { plan_id: planId, health_worker_id: healthWorkerId },
    });

    return { schedule: schedule.rows[0], plan: await loadPlanDetail(client, planId) };
  });
}

async function markTreatmentCompleted(userId, req, planId) {
  requireUuid(planId, "Invalid care plan ID");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT * FROM tbl_care_plans WHERE id = $1 AND assigned_navigator_id = $2 FOR UPDATE`,
      [planId, userId]
    );
    if (!rows.length) throw new HttpError(403, "You are not assigned to this care plan", "FORBIDDEN");
    const plan = rows[0];
    if (["CLOSED", "SUPERSEDED"].includes(plan.status)) {
      throw new HttpError(409, "This care plan is closed", "INVALID_STATE");
    }

    await client.query(
      `UPDATE tbl_care_plans
          SET status = 'FINAL_CHECKUP_PENDING', updated_by = $2
        WHERE id = $1`,
      [planId, userId]
    );
    await recordStatusChange(client, planId, plan.status, "FINAL_CHECKUP_PENDING", userId, "Treatment course completed");

    const owner = clinicalOwnerNotify(plan);
    await notifyCare(client, {
      templateCode: "CARE_FINAL_CHECKUP",
      recipientUserId: owner.userId,
      patientId: plan.patient_id,
      event: "CARE_FINAL_CHECKUP",
      title: "Final checkup pending",
      message: `Navigator marked treatment complete. Final ${owner.label} checkup is needed.`,
      targetPath: owner.path,
      planId,
      dedupeKey: `CARE_FINAL_CHECKUP:${planId}`,
    });

    await audit(req, {
      event: "CARE_TREATMENT_COMPLETED",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: planId,
      patientId: plan.patient_id,
    });

    return loadPlanDetail(client, planId);
  });
}

async function escalateDiscomfort(userId, req, planId, discomfortId) {
  requireUuid(planId, "Invalid care plan ID");
  requireUuid(discomfortId, "Invalid discomfort report ID");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT plan.*, d.id AS discomfort_id, d.status AS discomfort_status
         FROM tbl_care_plans plan
         JOIN tbl_care_discomfort_reports d ON d.plan_id = plan.id
        WHERE plan.id = $1
          AND plan.assigned_navigator_id = $2
          AND d.id = $3
        FOR UPDATE OF plan, d`,
      [planId, userId, discomfortId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot escalate this report", "FORBIDDEN");
    const plan = rows[0];
    const owner = clinicalOwnerNotify(plan);

    await client.query(
      `UPDATE tbl_care_discomfort_reports
          SET status = 'ESCALATED', escalated_to_mo = $2, escalated_at = now()
        WHERE id = $1`,
      [discomfortId, owner.userId]
    );
    await client.query(
      `UPDATE tbl_care_plans SET status = 'MO_REASSESSMENT', updated_by = $2 WHERE id = $1`,
      [planId, userId]
    );
    await recordStatusChange(client, planId, plan.status, "MO_REASSESSMENT", userId, "Discomfort escalated");

    await notifyCare(client, {
      templateCode: "CARE_DISCOMFORT_ALERT",
      recipientUserId: owner.userId,
      patientId: plan.patient_id,
      event: "CARE_DISCOMFORT_ESCALATED",
      title: "Patient discomfort escalated",
      message: `Navigator escalated a patient discomfort report for ${owner.label} review.`,
      targetPath: owner.path,
      planId,
      dedupeKey: `CARE_DISCOMFORT_ESCALATED:${discomfortId}`,
    });

    await audit(req, {
      event: "CARE_DISCOMFORT_ESCALATED",
      outcome: "SUCCESS",
      resourceType: "care_discomfort",
      resourceId: discomfortId,
      patientId: plan.patient_id,
    });

    return loadPlanDetail(client, planId);
  });
}

async function listHwFollowups(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const filter = typeof query.filter === "string" ? query.filter : "open";
  const statusClause = filter === "completed"
    ? "schedule.status = 'COMPLETED'"
    : "schedule.status = 'SCHEDULED'";

  const { rows } = await pool.query(
    `SELECT schedule.id, schedule.due_at, schedule.status::text AS status,
            schedule.instructions, schedule.plan_id,
            plan.status::text AS plan_status, plan.clinical_summary, plan.precautions,
            patient.id AS patient_id, patient.patient_code, patient.full_name AS patient_name,
            COUNT(*) OVER()::int AS total_count
       FROM tbl_care_followup_schedules schedule
       JOIN tbl_care_plans plan ON plan.id = schedule.plan_id
       JOIN tbl_patients patient ON patient.id = schedule.patient_id AND patient.deleted_at IS NULL
      WHERE schedule.assigned_hw_id = $1
        AND ${statusClause}
      ORDER BY schedule.due_at ASC
      LIMIT $2 OFFSET $3`,
    [userId, pageSize, offset]
  );
  const total = rows[0]?.total_count || 0;
  return {
    items: rows.map(({ total_count, ...row }) => row),
    pagination: pagination(page, pageSize, total),
  };
}

async function getHwFollowupDetail(userId, scheduleId) {
  requireUuid(scheduleId, "Invalid follow-up ID");
  const { rows } = await pool.query(
    `SELECT schedule.id, schedule.due_at, schedule.status::text AS status,
            schedule.instructions, schedule.plan_id, schedule.patient_id
       FROM tbl_care_followup_schedules schedule
      WHERE schedule.id = $1 AND schedule.assigned_hw_id = $2`,
    [scheduleId, userId]
  );
  if (!rows.length) throw new HttpError(403, "You are not assigned to this follow-up", "FORBIDDEN");
  const detail = await loadPlanDetail(pool, rows[0].plan_id);
  return { schedule: rows[0], plan: detail };
}

async function submitFollowupReport(userId, req, scheduleId, input = {}) {
  requireUuid(scheduleId, "Invalid follow-up ID");
  const visitAt = new Date(input.visit_at || Date.now());
  if (Number.isNaN(visitAt.getTime())) throw new HttpError(400, "Invalid visit date", "INVALID_CARE");
  const adhering = Boolean(input.adhering_to_treatment);
  const feedback = optionalText(input.patient_feedback, 2000, "Patient feedback");
  const symptoms = optionalText(input.reported_symptoms, 2000, "Reported symptoms");
  const notes = optionalText(input.notes, 2000, "Notes");
  const discomfortPresent = Boolean(input.discomfort_present);
  const improvementNoted = input.improvement_noted == null ? null : Boolean(input.improvement_noted);
  const sideEffects = optionalText(input.side_effects, 2000, "Side effects");
  const precautionsFollowed = input.precautions_followed == null
    ? null
    : Boolean(input.precautions_followed);
  const hospitalAttended = input.hospital_attended == null ? null : Boolean(input.hospital_attended);
  const hospitalRevisitReminded = Boolean(input.hospital_revisit_reminded);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT schedule.*, plan.assigned_navigator_id, plan.status AS plan_status,
              plan.responsible_mo_id, plan.responsible_specialist_id,
              plan.source::text AS source
         FROM tbl_care_followup_schedules schedule
         JOIN tbl_care_plans plan ON plan.id = schedule.plan_id
        WHERE schedule.id = $1 AND schedule.assigned_hw_id = $2
        FOR UPDATE OF schedule`,
      [scheduleId, userId]
    );
    if (!rows.length) throw new HttpError(403, "You are not assigned to this follow-up", "FORBIDDEN");
    const schedule = rows[0];
    if (schedule.status !== "SCHEDULED") {
      throw new HttpError(409, "This follow-up was already completed", "INVALID_STATE");
    }

    const report = await client.query(
      `INSERT INTO tbl_care_followup_reports
         (schedule_id, patient_id, reported_by, visit_at, adhering_to_treatment,
          patient_feedback, reported_symptoms, discomfort_present, notes,
          improvement_noted, side_effects, precautions_followed,
          hospital_attended, hospital_revisit_reminded)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        scheduleId,
        schedule.patient_id,
        userId,
        visitAt.toISOString(),
        adhering,
        feedback,
        symptoms,
        discomfortPresent,
        notes,
        improvementNoted,
        sideEffects,
        precautionsFollowed,
        hospitalAttended,
        hospitalRevisitReminded,
      ]
    );

    await client.query(
      `UPDATE tbl_care_followup_schedules SET status = 'COMPLETED' WHERE id = $1`,
      [scheduleId]
    );

    if (hospitalAttended === true) {
      await client.query(
        `UPDATE tbl_care_plans
            SET hospital_attended = TRUE,
                status = CASE
                  WHEN status IN ('CLOSED', 'SUPERSEDED') THEN status
                  ELSE 'FINAL_CHECKUP_PENDING'
                END,
                updated_by = $2
          WHERE id = $1`,
        [schedule.plan_id, userId]
      );
      if (!["CLOSED", "SUPERSEDED", "FINAL_CHECKUP_PENDING"].includes(schedule.plan_status)) {
        await recordStatusChange(
          client,
          schedule.plan_id,
          schedule.plan_status,
          "FINAL_CHECKUP_PENDING",
          userId,
          "Hospital revisit attended — clinician reassessment needed"
        );
      }
      const revisitOwner = clinicalOwnerNotify(schedule);
      await notifyCare(client, {
        templateCode: "CARE_FINAL_CHECKUP",
        recipientUserId: revisitOwner.userId,
        patientId: schedule.patient_id,
        event: "CARE_HOSPITAL_REVISIT_ATTENDED",
        title: "Hospital revisit attended",
        message: `Health Worker recorded hospital attendance. ${revisitOwner.label} reassessment is required.`,
        targetPath: revisitOwner.path,
        planId: schedule.plan_id,
        dedupeKey: `CARE_HOSPITAL_REVISIT_ATTENDED:${report.rows[0].id}`,
      });
    } else if (hospitalAttended === false) {
      await client.query(
        `UPDATE tbl_care_plans SET hospital_attended = FALSE, updated_by = $2 WHERE id = $1`,
        [schedule.plan_id, userId]
      );
      await recordStatusChange(
        client,
        schedule.plan_id,
        schedule.plan_status,
        schedule.plan_status,
        userId,
        "HOSPITAL_REVISIT_MISSED:health_worker_report"
      );
      await notifyMissedRevisit(client, {
        id: schedule.plan_id,
        patient_id: schedule.patient_id,
        responsible_mo_id: schedule.responsible_mo_id,
        responsible_specialist_id: schedule.responsible_specialist_id,
        source: schedule.source,
        assigned_navigator_id: schedule.assigned_navigator_id,
        hospital_revisit_date: null,
      });
    }

    await notifyCare(client, {
      templateCode: "CARE_FOLLOWUP_SUBMITTED",
      recipientUserId: schedule.assigned_navigator_id,
      patientId: schedule.patient_id,
      event: "CARE_FOLLOWUP_SUBMITTED",
      title: "Follow-up report received",
      message: "A Health Worker submitted a field follow-up report.",
      targetPath: "/navigator/followups",
      planId: schedule.plan_id,
      dedupeKey: `CARE_FOLLOWUP_SUBMITTED:${report.rows[0].id}`,
    });

    await audit(req, {
      event: "CARE_FOLLOWUP_REPORTED",
      outcome: "SUCCESS",
      resourceType: "care_followup_report",
      resourceId: report.rows[0].id,
      patientId: schedule.patient_id,
      metadata: {
        hospital_attended: hospitalAttended,
        improvement_noted: improvementNoted,
      },
    });

    return {
      report_id: report.rows[0].id,
      plan: await loadPlanDetail(client, schedule.plan_id),
    };
  });
}

async function updateNavigatorCoordination(userId, req, planId, input = {}) {
  requireUuid(planId, "Invalid care plan ID");
  const patientInformed = input.patient_informed == null ? null : Boolean(input.patient_informed);
  const revisitScheduled = input.hospital_revisit_scheduled == null
    ? null
    : Boolean(input.hospital_revisit_scheduled);
  const rescheduleDate = input.hospital_revisit_date
    ? requireDate(input.hospital_revisit_date, "Hospital revisit date")
    : null;
  if (patientInformed == null && revisitScheduled == null && !rescheduleDate) {
    throw new HttpError(400, "Provide patient informed, revisit scheduled, or a new revisit date", "INVALID_CARE");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT * FROM tbl_care_plans WHERE id = $1 AND assigned_navigator_id = $2 FOR UPDATE`,
      [planId, userId]
    );
    if (!rows.length) throw new HttpError(403, "You are not assigned to this care plan", "FORBIDDEN");
    const plan = rows[0];
    if (["CLOSED", "SUPERSEDED"].includes(plan.status)) {
      throw new HttpError(409, "This care plan is closed", "INVALID_STATE");
    }

    if (rescheduleDate && plan.treatment_start_date) {
      const start = String(plan.treatment_start_date).slice(0, 10);
      if (rescheduleDate < start) {
        throw new HttpError(400, "Hospital revisit date cannot be before treatment start", "INVALID_CARE");
      }
    }

    // Reschedule clears a previous miss so the new future date is tracked correctly.
    const clearMissed = Boolean(
      rescheduleDate && rescheduleDate > new Date().toISOString().slice(0, 10)
    );

    await client.query(
      `UPDATE tbl_care_plans
          SET patient_informed = COALESCE($2, patient_informed),
              hospital_revisit_scheduled = COALESCE($3, hospital_revisit_scheduled),
              hospital_revisit_date = COALESCE($4, hospital_revisit_date),
              hospital_attended = CASE WHEN $5 THEN NULL ELSE hospital_attended END,
              updated_by = $6
        WHERE id = $1`,
      [planId, patientInformed, revisitScheduled || (rescheduleDate ? true : null), rescheduleDate, clearMissed, userId]
    );

    if (clearMissed) {
      await recordStatusChange(
        client,
        planId,
        plan.status,
        plan.status,
        userId,
        `HOSPITAL_REVISIT_RESCHEDULED:${rescheduleDate}`
      );
    }

    await audit(req, {
      event: "CARE_NAVIGATOR_COORDINATION",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: planId,
      patientId: plan.patient_id,
      metadata: {
        patient_informed: patientInformed,
        hospital_revisit_scheduled: revisitScheduled,
        hospital_revisit_date: rescheduleDate,
        cleared_missed_attendance: clearMissed,
      },
    });

    return loadPlanDetail(client, planId);
  });
}

async function reportDiscomfort(userId, req, planId, input = {}) {
  requireUuid(planId, "Invalid care plan ID");
  if (!ISSUE_TYPES.includes(input.issue_type)) {
    throw new HttpError(400, "Select a valid issue type", "INVALID_CARE");
  }
  if (!SEVERITIES.includes(input.severity)) {
    throw new HttpError(400, "Select a severity", "INVALID_CARE");
  }
  const description = requireText(input.description, 2000, "Description");
  const isUrgent = Boolean(input.is_urgent) || input.severity === "EMERGENCY" || input.severity === "SEVERE";

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT plan.*
         FROM tbl_care_plans plan
        WHERE plan.id = $1
          AND plan.status = ANY($2::care_plan_status[])
          AND (
            EXISTS (
              SELECT 1 FROM tbl_care_followup_schedules s
               WHERE s.plan_id = plan.id AND s.assigned_hw_id = $3
            )
            OR EXISTS (
              SELECT 1 FROM tbl_patients p
               WHERE p.id = plan.patient_id AND p.registered_by = $3
            )
          )
        FOR UPDATE OF plan`,
      [planId, ACTIVE_PLAN_STATUSES, userId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot report discomfort for this plan", "FORBIDDEN");
    const plan = rows[0];

    const inserted = await client.query(
      `INSERT INTO tbl_care_discomfort_reports
         (plan_id, patient_id, reported_by, issue_type, severity, is_urgent, description, status,
          escalated_to_mo, escalated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               CASE WHEN $6 THEN 'ESCALATED'::care_discomfort_status ELSE 'OPEN'::care_discomfort_status END,
               CASE WHEN $6 THEN $8 ELSE NULL END,
               CASE WHEN $6 THEN now() ELSE NULL END)
       RETURNING id`,
      [
        planId,
        plan.patient_id,
        userId,
        input.issue_type,
        input.severity,
        isUrgent,
        description,
        plan.responsible_mo_id,
      ]
    );

    const nextStatus = isUrgent ? "MO_REASSESSMENT" : "PATIENT_UNCOMFORTABLE";
    await client.query(
      `UPDATE tbl_care_plans SET status = $2, updated_by = $3 WHERE id = $1`,
      [planId, nextStatus, userId]
    );
    await recordStatusChange(client, planId, plan.status, nextStatus, userId, "Patient discomfort reported");

    if (plan.assigned_navigator_id) {
      await notifyCare(client, {
        templateCode: "CARE_DISCOMFORT_ALERT",
        recipientUserId: plan.assigned_navigator_id,
        patientId: plan.patient_id,
        event: "CARE_DISCOMFORT_REPORTED",
        title: "Patient discomfort reported",
        message: isUrgent
          ? "Urgent patient discomfort reported. Escalate to Medical Officer if not already notified."
          : "A Health Worker reported patient discomfort.",
        targetPath: "/navigator/followups",
        planId,
        dedupeKey: `CARE_DISCOMFORT_REPORTED:${inserted.rows[0].id}:nav`,
      });
    }

    await notifyCare(client, {
      templateCode: "CARE_DISCOMFORT_ALERT",
      recipientUserId: plan.responsible_mo_id,
      patientId: plan.patient_id,
      event: "CARE_DISCOMFORT_REPORTED",
      title: isUrgent ? "Urgent patient discomfort" : "Patient discomfort reported",
      message: isUrgent
        ? "Urgent discomfort reported. Review promptly; do not wait for routine processing."
        : "A patient discomfort report was filed during treatment follow-up.",
      targetPath: "/medical-officer/care",
      planId,
      dedupeKey: `CARE_DISCOMFORT_REPORTED:${inserted.rows[0].id}:mo`,
    });

    await audit(req, {
      event: "CARE_DISCOMFORT_REPORTED",
      outcome: "SUCCESS",
      resourceType: "care_discomfort",
      resourceId: inserted.rows[0].id,
      patientId: plan.patient_id,
      metadata: { urgent: isUrgent, severity: input.severity },
    });

    return {
      discomfort_id: inserted.rows[0].id,
      urgent: isUrgent,
      plan: await loadPlanDetail(client, planId),
    };
  });
}

async function listNavigatorOptionsForMo(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.district_id
       FROM tbl_users u
       JOIN mst_roles role ON role.id = u.role_id AND role.code = 'NAVIGATOR'
      WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
        AND u.district_id IN (
          SELECT DISTINCT m.district_id
            FROM tbl_medical_officer_mandal_assignments moa
            JOIN mst_mandals m ON m.id = moa.mandal_id
           WHERE moa.user_id = $1
             AND moa.valid_from <= CURRENT_DATE
             AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
        )
      ORDER BY u.full_name`,
    [userId]
  );
  return rows;
}

/**
 * Explicit MO confirmation that the patient may re-enter community treatment after
 * specialist referral is terminal. Does not delete history. Parks leftover
 * SPECIALIST-sourced active plans so MO can create a new MO plan.
 */
/**
 * Specialist explicitly authorizes clinical handoff back to MO.
 * Does not close Specialist care plans. MO confirmation is a separate step.
 */
async function authorizeReturnToMo(userId, req, patientId, input = {}) {
  requireUuid(patientId, "Invalid patient ID");
  const notes = requireText(input.notes || input.authorization_notes, 2000, "Authorization notes");

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);

    const owned = await client.query(
      `SELECT plan.id
         FROM tbl_care_plans plan
        WHERE plan.patient_id = $1
          AND plan.responsible_specialist_id = $2
          AND plan.source = 'SPECIALIST'
        ORDER BY plan.updated_at DESC
        LIMIT 1`,
      [patientId, userId]
    );
    const referral = await client.query(
      `SELECT id, referral_code, status::text AS status, assigned_navigator_id,
              cr.doctor_id AS responsible_mo_id
         FROM tbl_referrals r
         JOIN tbl_clinical_reviews cr ON cr.id = r.review_id
        WHERE r.patient_id = $1
          AND r.assigned_specialist_id = $2
        ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
        LIMIT 1`,
      [patientId, userId]
    );
    if (!owned.rows.length && !referral.rows.length) {
      throw new HttpError(403, "You are not the Specialist for this patient", "FORBIDDEN");
    }

    const open = await findOpenSpecialistReferral(client, patientId);
    if (open) {
      throw new HttpError(
        409,
        `Referral ${open.referral_code || ""} is still ${open.status}. `
          + "Complete, decline, or cancel the open referral before authorizing return.",
        "REFERRAL_ACTIVE"
      );
    }

    const pending = await client.query(
      `SELECT id FROM tbl_care_return_to_mo
        WHERE patient_id = $1 AND confirmed_at IS NULL
        LIMIT 1`,
      [patientId]
    );
    if (pending.rows.length) {
      return {
        patient_id: patientId,
        authorization_id: pending.rows[0].id,
        already_authorized: true,
        message: "Return to MO is already authorized. Waiting for Medical Officer confirmation.",
      };
    }

    const referralId = referral.rows[0]?.id || null;
    const inserted = await client.query(
      `INSERT INTO tbl_care_return_to_mo
         (patient_id, referral_id, authorized_by, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, authorized_at`,
      [patientId, referralId, userId, notes]
    );

    const moId = referral.rows[0]?.responsible_mo_id || null;
    if (moId) {
      await notifyCare(client, {
        templateCode: "CARE_RETURN_AUTHORIZED",
        recipientUserId: moId,
        patientId,
        event: "CARE_RETURN_AUTHORIZED",
        title: "Specialist authorized return to MO",
        message: "Specialist authorized return. Confirm only after Specialist care plans are no longer active.",
        targetPath: "/medical-officer/care",
        planId: owned.rows[0]?.id || null,
        dedupeKey: `CARE_RETURN_AUTHORIZED:${inserted.rows[0].id}`,
      });
    }

    await audit(req, {
      event: "CARE_RETURN_AUTHORIZED",
      outcome: "SUCCESS",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
      metadata: {
        authorization_id: inserted.rows[0].id,
        referral_id: referralId,
        notes,
      },
    });

    return {
      patient_id: patientId,
      authorization_id: inserted.rows[0].id,
      authorized_at: inserted.rows[0].authorized_at,
      already_authorized: false,
      message: "Return to MO authorized. Medical Officer must confirm after Specialist care is no longer active.",
    };
  });
}

async function confirmReturnFromSpecialist(userId, req, patientId, input = {}) {
  requireUuid(patientId, "Invalid patient ID");
  const notes = optionalText(input.notes, 2000, "Return notes");

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await requireActiveClaim(client, userId, patientId, { lock: true });

    const open = await findOpenSpecialistReferral(client, patientId);
    if (open) {
      throw new HttpError(
        409,
        `Referral ${open.referral_code || ""} is still ${open.status}. `
          + "Wait until the specialist referral is completed, declined, or cancelled.",
        "REFERRAL_ACTIVE"
      );
    }

    // Referral COMPLETED alone is never enough — Specialist must authorize first.
    const authorization = await client.query(
      `SELECT id, authorized_by, authorized_at, referral_id, notes
         FROM tbl_care_return_to_mo
        WHERE patient_id = $1
          AND confirmed_at IS NULL
        ORDER BY authorized_at DESC
        LIMIT 1
        FOR UPDATE`,
      [patientId]
    );
    if (!authorization.rows.length) {
      throw new HttpError(
        409,
        "Specialist has not authorized return to MO community care yet",
        "RETURN_NOT_AUTHORIZED"
      );
    }

    // Active Specialist-owned care blocks MO return. MO must never park those plans.
    const activeSpecialist = await client.query(
      `SELECT id, status::text AS status
         FROM tbl_care_plans
        WHERE patient_id = $1
          AND source = 'SPECIALIST'
          AND status = ANY($2::care_plan_status[])
        LIMIT 1`,
      [patientId, ACTIVE_PLAN_STATUSES]
    );
    if (activeSpecialist.rows.length) {
      throw new HttpError(
        409,
        "Active Specialist care plan exists. Specialist must complete reassessment/closure before MO return.",
        "SPECIALIST_CARE_ACTIVE"
      );
    }

    const completed = await client.query(
      `SELECT id, referral_code, status::text AS status
         FROM tbl_referrals
        WHERE patient_id = $1
          AND status IN ('COMPLETED', 'DECLINED', 'CANCELLED')
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [patientId]
    );
    if (!completed.rows.length) {
      throw new HttpError(400, "No completed specialist referral found for this patient", "REFERRAL_REQUIRED");
    }

    // Park leftover MO-sourced plans only — never Specialist-owned history.
    const parked = await parkMoCarePlansForSpecialistReferral(client, {
      patientId,
      userId,
      referralId: completed.rows[0].id,
      reason: notes
        ? `RETURN_TO_MO: ${notes}`
        : `RETURN_TO_MO after ${completed.rows[0].status} referral ${completed.rows[0].referral_code}`,
    });

    await client.query(
      `UPDATE tbl_care_return_to_mo
          SET confirmed_by = $2, confirmed_at = now()
        WHERE id = $1 AND confirmed_at IS NULL`,
      [authorization.rows[0].id, userId]
    );

    await audit(req, {
      event: "CARE_RETURN_FROM_SPECIALIST",
      outcome: "SUCCESS",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
      metadata: {
        referral_id: completed.rows[0].id,
        referral_code: completed.rows[0].referral_code,
        referral_status: completed.rows[0].status,
        authorization_id: authorization.rows[0].id,
        parked_plan_ids: parked,
        notes,
      },
    });

    return {
      patient_id: patientId,
      referral: completed.rows[0],
      authorization_id: authorization.rows[0].id,
      parked_plan_ids: parked,
      eligible_for_mo_care_plan: true,
      message: "Patient returned to MO community treatment workflow. Specialist care history is preserved.",
    };
  });
}

async function listSpecialistCarePlans(userId, query = {}) {
  const { page, pageSize, offset } = pageOptions(query);
  const filter = typeof query.filter === "string" ? query.filter : "active";
  let statusClause = "plan.status = ANY($2::care_plan_status[])";
  let statuses = ACTIVE_PLAN_STATUSES;
  if (filter === "escalations") {
    statuses = ["PATIENT_UNCOMFORTABLE", "MO_REASSESSMENT"];
  } else if (filter === "final" || filter === "reassessment") {
    statuses = ["FINAL_CHECKUP_PENDING", "TREATMENT_COMPLETED", "RECOVERY_CONFIRMED", "MO_REASSESSMENT"];
  } else if (filter === "revisit_due") {
    statuses = ["FOLLOWUP_ACTIVE", "TREATMENT_COMPLETED", "FINAL_CHECKUP_PENDING", "MO_REASSESSMENT"];
  } else if (filter === "missed_revisit") {
    statuses = ACTIVE_PLAN_STATUSES;
  } else if (filter === "closed") {
    statusClause = "plan.status IN ('CLOSED', 'SUPERSEDED')";
    statuses = null;
  }

  const revisitClause = filter === "revisit_due"
    ? `AND (
         (plan.expected_end_date IS NOT NULL AND plan.expected_end_date <= CURRENT_DATE)
         OR (plan.hospital_revisit_date IS NOT NULL AND plan.hospital_revisit_date <= CURRENT_DATE)
         OR (plan.precautions_expected_end_date IS NOT NULL AND plan.precautions_expected_end_date <= CURRENT_DATE)
       )`
    : "";
  const missedClause = filter === "missed_revisit"
    ? `AND plan.hospital_attended IS FALSE
       AND plan.hospital_revisit_date IS NOT NULL
       AND plan.hospital_revisit_date < CURRENT_DATE`
    : "";

  const params = statuses ? [userId, statuses, pageSize, offset] : [userId, pageSize, offset];
  const limitParam = statuses ? "$3" : "$2";
  const offsetParam = statuses ? "$4" : "$3";

  const list = await pool.query(
    `SELECT plan.id, plan.status::text AS status, plan.source::text AS source,
            plan.created_at, plan.expected_end_date, plan.hospital_revisit_date,
            plan.hospital_attended, plan.referral_id,
            patient.id AS patient_id, patient.patient_code, patient.full_name AS patient_name,
            nav.full_name AS navigator_name,
            COUNT(*) OVER()::int AS total_count
       FROM tbl_care_plans plan
       JOIN tbl_patients patient ON patient.id = plan.patient_id AND patient.deleted_at IS NULL
       LEFT JOIN tbl_users nav ON nav.id = plan.assigned_navigator_id
      WHERE plan.responsible_specialist_id = $1
        AND plan.source = 'SPECIALIST'
        AND ${statusClause}
        ${revisitClause}
        ${missedClause}
      ORDER BY plan.updated_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const total = list.rows[0]?.total_count || 0;
  return {
    items: list.rows.map(({ total_count, ...row }) => ({
      ...row,
      hospital_revisit_status: deriveHospitalRevisitStatus(row),
    })),
    pagination: pagination(page, pageSize, total),
  };
}

async function getCarePlanForSpecialist(userId, planId) {
  requireUuid(planId, "Invalid care plan ID");
  const { rows } = await pool.query(
    `SELECT plan.id
       FROM tbl_care_plans plan
      WHERE plan.id = $2
        AND plan.responsible_specialist_id = $1
        AND plan.source = 'SPECIALIST'`,
    [userId, planId]
  );
  if (!rows.length) throw new HttpError(403, "You cannot access this care plan", "FORBIDDEN");
  return loadPlanDetail(pool, planId);
}

async function reassessCarePlanForSpecialist(userId, req, planId, input = {}) {
  requireUuid(planId, "Invalid care plan ID");
  const medicines = normalizeMedicines(input.medicines);
  const clinicalSummary = requireText(input.clinical_summary, 4000, "Clinical summary");
  const precautions = optionalText(input.precautions, 2000, "Precautions");
  const reason = requireText(input.reason, 1000, "Reassessment reason");
  const startDate = requireDate(
    input.treatment_start_date || new Date().toISOString().slice(0, 10),
    "Treatment start date"
  );
  const endDate = computeExpectedEndDate(startDate, medicines, input.expected_end_date || null);
  const hospitalRevisitDate = requireHospitalRevisitDate(input.hospital_revisit_date, startDate);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT plan.*
         FROM tbl_care_plans plan
        WHERE plan.id = $2
          AND plan.responsible_specialist_id = $1
          AND plan.source = 'SPECIALIST'
        FOR UPDATE OF plan`,
      [userId, planId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot reassess this care plan", "FORBIDDEN");
    const oldPlan = rows[0];
    if (!["PATIENT_UNCOMFORTABLE", "MO_REASSESSMENT", "FOLLOWUP_ACTIVE", "TREATMENT_COMPLETED", "FINAL_CHECKUP_PENDING"].includes(oldPlan.status)) {
      throw new HttpError(409, "This plan is not waiting for reassessment", "INVALID_STATE");
    }

    const newPlanId = await createSuccessorCarePlan(client, {
      oldPlan,
      userId,
      medicines,
      clinicalSummary,
      precautions,
      reason,
      startDate,
      endDate,
      hospitalRevisitDate,
      source: "SPECIALIST",
      responsibleMoId: oldPlan.responsible_mo_id,
      responsibleSpecialistId: userId,
    });

    await client.query(
      `UPDATE tbl_care_discomfort_reports
          SET status = 'RESOLVED', resolved_at = now(), resolution_notes = $2, updated_at = now()
        WHERE plan_id = $1 AND status IN ('OPEN', 'ESCALATED')`,
      [planId, reason]
    );

    if (oldPlan.assigned_navigator_id) {
      await notifyCare(client, {
        templateCode: "CARE_PLAN_READY",
        recipientUserId: oldPlan.assigned_navigator_id,
        patientId: oldPlan.patient_id,
        event: "CARE_PLAN_UPDATED",
        title: "Updated Specialist care plan",
        message: "The Specialist updated the treatment plan after reassessment.",
        targetPath: "/navigator/followups?filter=specialist",
        planId: newPlanId,
        dedupeKey: `CARE_PLAN_UPDATED:${newPlanId}`,
      });
    }

    await audit(req, {
      event: "CARE_PLAN_REASSESSED",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: newPlanId,
      patientId: oldPlan.patient_id,
      metadata: { superseded_plan_id: planId, as_specialist: true },
    });

    return loadPlanDetail(client, newPlanId);
  });
}

async function closeCarePlanForSpecialist(userId, req, planId) {
  requireUuid(planId, "Invalid care plan ID");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `SELECT plan.*, fr.recovery_confirmed, fr.decision::text AS final_decision
         FROM tbl_care_plans plan
         LEFT JOIN LATERAL (
           SELECT recovery_confirmed, decision
             FROM tbl_care_final_reviews
            WHERE plan_id = plan.id
            ORDER BY signed_at DESC
            LIMIT 1
         ) fr ON TRUE
        WHERE plan.id = $2
          AND plan.responsible_specialist_id = $1
          AND plan.source = 'SPECIALIST'
        FOR UPDATE OF plan`,
      [userId, planId]
    );
    if (!rows.length) throw new HttpError(403, "You cannot close this care plan", "FORBIDDEN");
    const plan = rows[0];
    if (plan.status === "CLOSED") {
      return loadPlanDetail(client, planId);
    }
    if (!plan.final_decision) {
      throw new HttpError(400, "Complete the Specialist final review before closing", "FINAL_REVIEW_REQUIRED");
    }
    if (plan.final_decision !== "CLOSE_RECOVERED" || !plan.recovery_confirmed) {
      throw new HttpError(400, "Recovery must be confirmed in the final review before closing", "RECOVERY_REQUIRED");
    }

    await client.query(
      `UPDATE tbl_care_plans
          SET status = 'CLOSED', closed_at = now(), closed_by = $2, updated_by = $2
        WHERE id = $1 AND status <> 'CLOSED'`,
      [planId, userId]
    );
    await recordStatusChange(client, planId, plan.status, "CLOSED", userId, "Closed after Specialist final review");

    const screeningSync = await tryCloseScreening(client, plan.screening_id, {
      userId,
      planId,
      reason: "specialist close after final review",
    });

    await audit(req, {
      event: "CARE_CASE_CLOSED",
      outcome: "SUCCESS",
      resourceType: "care_plan",
      resourceId: planId,
      patientId: plan.patient_id,
      metadata: { as_specialist: true, ...screeningSync },
    });

    return { ...(await loadPlanDetail(client, planId)), ...screeningSync };
  });
}

async function getSpecialistCareDashboard(userId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE plan.status = ANY($2::care_plan_status[]))::int AS active_care_plans,
       COUNT(*) FILTER (
         WHERE plan.status IN ('FINAL_CHECKUP_PENDING', 'TREATMENT_COMPLETED', 'RECOVERY_CONFIRMED', 'MO_REASSESSMENT')
       )::int AS reassessment_queue,
       COUNT(*) FILTER (
         WHERE plan.status = ANY($2::care_plan_status[])
           AND (
             (plan.expected_end_date IS NOT NULL AND plan.expected_end_date <= CURRENT_DATE)
             OR (plan.hospital_revisit_date IS NOT NULL AND plan.hospital_revisit_date <= CURRENT_DATE)
             OR (plan.precautions_expected_end_date IS NOT NULL AND plan.precautions_expected_end_date <= CURRENT_DATE)
           )
       )::int AS revisit_due,
       COUNT(*) FILTER (
         WHERE plan.status = ANY($2::care_plan_status[])
           AND plan.hospital_attended IS FALSE
           AND plan.hospital_revisit_date IS NOT NULL
           AND plan.hospital_revisit_date < CURRENT_DATE
       )::int AS missed_revisit,
       COUNT(*) FILTER (WHERE plan.status IN ('CLOSED', 'SUPERSEDED'))::int AS closed_cases
       FROM tbl_care_plans plan
      WHERE plan.responsible_specialist_id = $1
        AND plan.source = 'SPECIALIST'`,
    [userId, ACTIVE_PLAN_STATUSES]
  );

  const diagnostics = await pool.query(
    `SELECT
       COUNT(DISTINCT d.id)::int AS diagnostic_orders,
       COUNT(r.id) FILTER (WHERE r.review_status = 'PENDING')::int AS reports_pending_review
       FROM tbl_diagnostic_orders d
       LEFT JOIN tbl_diagnostic_order_reports r ON r.order_id = d.id
      WHERE d.prescribed_by = $1`,
    [userId]
  );

  return {
    ...(rows[0] || {
      active_care_plans: 0,
      reassessment_queue: 0,
      revisit_due: 0,
      missed_revisit: 0,
      closed_cases: 0,
    }),
    ...(diagnostics.rows[0] || {
      diagnostic_orders: 0,
      reports_pending_review: 0,
    }),
  };
}

module.exports = {
  createMoCarePlan,
  listCareEligiblePatients,
  listMoCarePlans,
  getCarePlanForMo,
  reassessCarePlan,
  reassessCarePlanForSpecialist,
  finalReview,
  finalReviewForSpecialist,
  closeCarePlan,
  closeCarePlanForSpecialist,
  listSpecialistCarePlans,
  getCarePlanForSpecialist,
  getSpecialistCareDashboard,
  sendSpecialistReviewToNavigator,
  authorizeReturnToMo,
  confirmReturnFromSpecialist,
  parkMoCarePlansForSpecialistReferral,
  CARE_PLAN_ELIGIBLE_DECISIONS,
  findOpenSpecialistReferral,
  listNavigatorCarePlans,
  getCarePlanForNavigator,
  listAssignableHealthWorkers,
  scheduleFollowup,
  markTreatmentCompleted,
  escalateDiscomfort,
  listHwFollowups,
  getHwFollowupDetail,
  submitFollowupReport,
  updateNavigatorCoordination,
  reportDiscomfort,
  listNavigatorOptionsForMo,
  scanMissedHospitalRevisits,
  tryCloseScreening,
  clinicalOwnerNotify,
  ACTIVE_PLAN_STATUSES,
  OPEN_SPECIALIST_REFERRAL_STATUSES,
  SCREENING_CLOSEABLE_STATES,
  FINAL_REVIEW_DECISIONS,
  ISSUE_TYPES,
  SEVERITIES,
};
