const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const {
  requireUuid,
  setActor,
  withTransaction,
  hasConsent,
} = require("./medicalOfficer/scope");
const diagnosticOrderService = require("./diagnosticOrderService");
const diagnosticReportService = require("./diagnosticReportService");

const FOLLOWUP_DUE_ADVISORY_LOCK_KEY = 74321042;

const WORKFLOW = Object.freeze({
  SPECIALIST_REQUESTED: "SPECIALIST_REQUESTED",
  NAVIGATOR_RECEIVED: "NAVIGATOR_RECEIVED",
  ASSIGNED_TO_HEALTH_WORKER: "ASSIGNED_TO_HEALTH_WORKER",
  COLLECTION_IN_PROGRESS: "COLLECTION_IN_PROGRESS",
  REPORT_UPLOADED: "REPORT_UPLOADED",
  NAVIGATOR_VERIFICATION: "NAVIGATOR_VERIFICATION",
  SENT_TO_HOSPITAL_STAFF: "SENT_TO_HOSPITAL_STAFF",
  SPECIALIST_REVIEW_PENDING: "SPECIALIST_REVIEW_PENDING",
  SPECIALIST_REVIEWED: "SPECIALIST_REVIEWED",
  ADVICE_SENT_TO_NAVIGATOR: "ADVICE_SENT_TO_NAVIGATOR",
  SENT_TO_HEALTH_WORKER: "SENT_TO_HEALTH_WORKER",
  PATIENT_FOLLOWUP: "PATIENT_FOLLOWUP",
  FOLLOWUP_REPORT_SUBMITTED: "FOLLOWUP_REPORT_SUBMITTED",
  FOLLOWUP_RETURNED: "FOLLOWUP_RETURNED",
  REASSESSMENT_PENDING: "REASSESSMENT_PENDING",
  FOLLOWUP_REQUIRED: "FOLLOWUP_REQUIRED",
  VIDEO_CONSULTATION_REQUESTED: "VIDEO_CONSULTATION_REQUESTED",
  COMPLETED: "COMPLETED",
  CLOSED: "CLOSED",
  RETURNED_FOR_CORRECTION: "RETURNED_FOR_CORRECTION",
  ADDITIONAL_INFORMATION_REQUIRED: "ADDITIONAL_INFORMATION_REQUIRED",
  CANCELLED: "CANCELLED",
});

const COARSE_STATUS_FOR_WORKFLOW = Object.freeze({
  SPECIALIST_REQUESTED: "ADVISED",
  NAVIGATOR_RECEIVED: "ADVISED",
  ASSIGNED_TO_HEALTH_WORKER: "SCHEDULED",
  COLLECTION_IN_PROGRESS: "SAMPLE_COLLECTED",
  REPORT_UPLOADED: "REPORT_RECEIVED",
  NAVIGATOR_VERIFICATION: "REPORT_RECEIVED",
  SENT_TO_HOSPITAL_STAFF: "REPORT_RECEIVED",
  SPECIALIST_REVIEW_PENDING: "REPORT_RECEIVED",
  SPECIALIST_REVIEWED: "CLINICIAN_REVIEWED",
  ADVICE_SENT_TO_NAVIGATOR: "CLINICIAN_REVIEWED",
  SENT_TO_HEALTH_WORKER: "CLINICIAN_REVIEWED",
  PATIENT_FOLLOWUP: "CLINICIAN_REVIEWED",
  FOLLOWUP_REPORT_SUBMITTED: "CLINICIAN_REVIEWED",
  FOLLOWUP_RETURNED: "CLINICIAN_REVIEWED",
  REASSESSMENT_PENDING: "CLINICIAN_REVIEWED",
  FOLLOWUP_REQUIRED: "CLINICIAN_REVIEWED",
  VIDEO_CONSULTATION_REQUESTED: "CLINICIAN_REVIEWED",
  COMPLETED: "CLINICIAN_REVIEWED",
  CLOSED: "CLINICIAN_REVIEWED",
  RETURNED_FOR_CORRECTION: "REPORT_PENDING",
  ADDITIONAL_INFORMATION_REQUIRED: "REPORT_PENDING",
  CANCELLED: "CANCELLED",
});

const IMPROVEMENT_STATUSES = new Set(["Improved", "No Change", "Worsened"]);
const REASSESS_DECISIONS = Object.freeze({
  CONTINUE: "CONTINUE",
  UPDATE: "UPDATE",
  REQUEST_DIAGNOSTICS: "REQUEST_DIAGNOSTICS",
  REQUEST_VIDEO: "REQUEST_VIDEO",
  CLOSE: "CLOSE",
});

const FORWARD_ADVICE_FROM = new Set([
  WORKFLOW.SPECIALIST_REVIEWED,
  WORKFLOW.ADVICE_SENT_TO_NAVIGATOR,
  WORKFLOW.FOLLOWUP_REQUIRED,
]);

const FOLLOWUP_WRITE_FROM = new Set([
  WORKFLOW.SENT_TO_HEALTH_WORKER,
  WORKFLOW.PATIENT_FOLLOWUP,
  WORKFLOW.FOLLOWUP_RETURNED,
]);

const SIGN_ADVICE_FROM = new Set([
  WORKFLOW.SPECIALIST_REVIEW_PENDING,
  WORKFLOW.REASSESSMENT_PENDING,
  WORKFLOW.FOLLOWUP_REQUIRED,
  WORKFLOW.VIDEO_CONSULTATION_REQUESTED,
]);

function trimText(value, label, { required = false, max = 2000 } = {}) {
  if (value == null || value === "") {
    if (required) throw new HttpError(400, `${label} is required`, "VALIDATION_ERROR");
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    if (required) throw new HttpError(400, `${label} is required`, "VALIDATION_ERROR");
    return null;
  }
  if (text.length > max) {
    throw new HttpError(400, `${label} must be ${max} characters or fewer`, "VALIDATION_ERROR");
  }
  return text;
}

function isUndefinedColumn(error) {
  return error && (error.code === "42703" || /column .* does not exist/i.test(error.message || ""));
}

function isUndefinedTable(error) {
  return error && (error.code === "42P01" || /relation .* does not exist/i.test(error.message || ""));
}

async function statusId(client, code) {
  const { rows } = await client.query(
    "SELECT id FROM mst_investigation_statuses WHERE code = $1",
    [code]
  );
  if (!rows.length) {
    throw new HttpError(500, "Diagnostic statuses are not configured", "CONFIGURATION_ERROR");
  }
  return rows[0].id;
}

async function loadTemplate(client, code) {
  const { rows } = await client.query(
    `SELECT template.id, template.language_id
       FROM mst_notification_templates template
       JOIN mst_languages language ON language.id = template.language_id
      WHERE template.code = $1 AND template.channel = 'IN_APP'
      ORDER BY CASE WHEN language.code = 'en' THEN 0 ELSE 1 END
      LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

async function notifyOnce(client, {
  templateCode,
  recipientUserId,
  patientId,
  event,
  title,
  message,
  targetPath,
  orderId,
  dedupeKey,
}) {
  if (!recipientUserId) return;
  const template = await loadTemplate(client, templateCode);
  if (!template) return;
  const existing = await client.query(
    `SELECT id FROM tbl_notifications
      WHERE recipient_user_id = $1
        AND (payload->>'dedupe_key') = $2
      LIMIT 1`,
    [recipientUserId, dedupeKey]
  );
  if (existing.rows.length) return;
  await client.query(
    `INSERT INTO tbl_notifications
       (recipient_user_id, patient_id, template_id, channel, language_id, status,
        payload, sent_at)
     VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, now())`,
    [
      recipientUserId,
      patientId,
      template.id,
      template.language_id,
      JSON.stringify({
        event,
        title,
        message,
        target_path: targetPath,
        order_id: orderId,
        dedupe_key: dedupeKey,
      }),
    ]
  );
}

async function setWorkflowStatus(client, {
  orderId,
  fromStatusId,
  workflowStatus,
  userId,
  reason,
  extraSets = {},
  extraParams = [],
}) {
  const coarse = COARSE_STATUS_FOR_WORKFLOW[workflowStatus];
  if (!coarse) {
    throw new HttpError(500, "Unknown diagnostic workflow status", "CONFIGURATION_ERROR");
  }
  const nextStatusId = await statusId(client, coarse);
  const setFragments = [
    "status_id = $2",
    "workflow_status = $3",
    "updated_at = now()",
  ];
  const params = [orderId, nextStatusId, workflowStatus];
  let idx = 4;
  for (const [column, value] of Object.entries(extraSets)) {
    setFragments.push(`${column} = $${idx}`);
    params.push(value);
    idx += 1;
  }
  for (const value of extraParams) {
    params.push(value);
  }
  // Use a SAVEPOINT so a missing workflow_status column (42703) can fall back
  // without aborting the outer transaction (which otherwise surfaces as 25P02).
  await client.query("SAVEPOINT diagnostic_workflow_update");
  try {
    await client.query(
      `UPDATE tbl_diagnostic_orders
          SET ${setFragments.join(", ")}
        WHERE id = $1`,
      params
    );
    await client.query("RELEASE SAVEPOINT diagnostic_workflow_update");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT diagnostic_workflow_update").catch(() => {});
    if (!isUndefinedColumn(error)) throw error;
    // Migration 039 not applied: keep coarse status only.
    await client.query(
      `UPDATE tbl_diagnostic_orders SET status_id = $2, updated_at = now() WHERE id = $1`,
      [orderId, nextStatusId]
    );
  }
  await client.query(
    `UPDATE tbl_diagnostic_order_items SET status_id = $2, updated_at = now() WHERE order_id = $1`,
    [orderId, nextStatusId]
  );
  await client.query(
    `INSERT INTO tbl_diagnostic_status_history
       (order_id, from_status_id, to_status_id, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [orderId, fromStatusId, nextStatusId, userId, reason]
  );
  return nextStatusId;
}

function assertRole(roleName, allowed, message) {
  if (!allowed.includes(roleName)) {
    throw new HttpError(403, message || "Role is not allowed for this action", "FORBIDDEN");
  }
}

function resolveAssignedNavigatorId(order) {
  return order.assigned_navigator_id || order.care_navigator_id || null;
}

function assertAssignedHealthWorker(order, userId) {
  if (!order.assigned_health_worker_id) {
    throw new HttpError(409, "Assign a Health Worker before this follow-up action", "HW_REQUIRED");
  }
  if (order.assigned_health_worker_id !== userId) {
    throw new HttpError(403, "This follow-up is assigned to another Health Worker", "FORBIDDEN");
  }
}

function assertAssignedNavigator(order, userId) {
  const navigatorId = resolveAssignedNavigatorId(order);
  if (!navigatorId) {
    throw new HttpError(409, "No Navigator is assigned to this diagnostic case", "NAVIGATOR_REQUIRED");
  }
  if (navigatorId !== userId) {
    throw new HttpError(403, "Only the assigned Navigator may perform this handoff", "FORBIDDEN");
  }
  return navigatorId;
}

/**
 * Migration 034 only allowed PENDING|REVIEWED. Navigator verify/return needs
 * VERIFIED|RETURNED (migration 039). Expand the check when the DB is behind.
 */
async function ensureNavigatorReportReviewStatuses(client) {
  await client.query("SAVEPOINT diagnostic_review_status_check");
  try {
    const { rows } = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conname = 'tbl_diagnostic_order_reports_review_status_check'
        LIMIT 1`
    );
    const def = String(rows[0]?.def || "");
    const expanded = /VERIFIED/i.test(def) && /RETURNED/i.test(def);
    if (!expanded) {
      await client.query(`
        ALTER TABLE tbl_diagnostic_order_reports
          DROP CONSTRAINT IF EXISTS tbl_diagnostic_order_reports_review_status_check
      `);
      await client.query(`
        ALTER TABLE tbl_diagnostic_order_reports
          ADD CONSTRAINT tbl_diagnostic_order_reports_review_status_check
          CHECK (review_status IN ('PENDING', 'RETURNED', 'VERIFIED', 'REVIEWED'))
      `);
    }
    await client.query("RELEASE SAVEPOINT diagnostic_review_status_check");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT diagnostic_review_status_check").catch(() => {});
    throw error;
  }
}

async function loadOrderRow(client, orderId) {
  const { rows } = await client.query(
    `SELECT diagnostic_order.*,
            status.code AS status_code,
            patient.patient_code,
            patient.registered_by,
            patient.registered_facility_id,
            referral.assigned_navigator_id,
            care_plan.assigned_navigator_id AS care_navigator_id,
            prescriber.role_id AS prescribed_by_role_id,
            role.code AS prescribed_by_role
       FROM tbl_diagnostic_orders diagnostic_order
       JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
       JOIN tbl_patients patient ON patient.id = diagnostic_order.patient_id
       LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
       LEFT JOIN tbl_care_plans care_plan
         ON care_plan.patient_id = diagnostic_order.patient_id
        AND care_plan.status NOT IN ('CLOSED', 'SUPERSEDED')
       JOIN tbl_users prescriber ON prescriber.id = diagnostic_order.prescribed_by
       JOIN mst_roles role ON role.id = prescriber.role_id
      WHERE diagnostic_order.id = $1
      FOR UPDATE OF diagnostic_order`,
    [orderId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Diagnostic order not found", "DIAGNOSTIC_ORDER_NOT_FOUND");
  }
  return rows[0];
}

function workflowOf(order) {
  return order.workflow_status || order._inferred_workflow || null;
}

function inferWorkflowFromHistory(historyRows = [], order = {}) {
  for (const row of historyRows) {
    const reason = String(row.reason || "").toLowerCase();
    if (reason.includes("additional diagnostic")) {
      return WORKFLOW.ADDITIONAL_INFORMATION_REQUIRED;
    }
    if (reason.includes("signed diagnostic advice") || reason.includes("specialist signed")) {
      return WORKFLOW.ADVICE_SENT_TO_NAVIGATOR;
    }
    if (reason.includes("forward") && reason.includes("health worker") && reason.includes("advice")) {
      return WORKFLOW.SENT_TO_HEALTH_WORKER;
    }
    if (reason.includes("routed") && reason.includes("specialist")) {
      return WORKFLOW.SPECIALIST_REVIEW_PENDING;
    }
    if (reason.includes("forwarded") && reason.includes("hospital staff")) {
      return WORKFLOW.SENT_TO_HOSPITAL_STAFF;
    }
    if (reason.includes("returned") && reason.includes("correction")) {
      return WORKFLOW.RETURNED_FOR_CORRECTION;
    }
    if (reason.includes("navigator verified") || reason.includes("verified diagnostic reports")) {
      return WORKFLOW.NAVIGATOR_VERIFICATION;
    }
    if (reason.includes("report uploaded")) {
      return WORKFLOW.REPORT_UPLOADED;
    }
    if (reason.includes("assigned") && reason.includes("health worker")) {
      return WORKFLOW.ASSIGNED_TO_HEALTH_WORKER;
    }
    if (reason.includes("collection")) {
      return WORKFLOW.COLLECTION_IN_PROGRESS;
    }
  }

  const coarse = String(order.status_code || "").toUpperCase();
  if (coarse === "ADVISED") return WORKFLOW.SPECIALIST_REQUESTED;
  if (coarse === "SCHEDULED") return WORKFLOW.ASSIGNED_TO_HEALTH_WORKER;
  if (coarse === "SAMPLE_COLLECTED" || coarse === "REPORT_PENDING") {
    return WORKFLOW.COLLECTION_IN_PROGRESS;
  }
  if (coarse === "REPORT_RECEIVED") return WORKFLOW.REPORT_UPLOADED;
  if (coarse === "CLINICIAN_REVIEWED") return WORKFLOW.SPECIALIST_REVIEWED;
  if (coarse === "CANCELLED") return WORKFLOW.CANCELLED;
  return WORKFLOW.NAVIGATOR_RECEIVED;
}

async function attachInferredWorkflow(client, order) {
  if (!order) return order;
  if (order.workflow_status) return order;
  const { rows } = await client.query(
    `SELECT reason
       FROM tbl_diagnostic_status_history
      WHERE order_id = $1
      ORDER BY changed_at DESC
      LIMIT 20`,
    [order.id]
  );
  order._inferred_workflow = inferWorkflowFromHistory(rows, order);
  return order;
}

async function loadOrderPatientScope(clientOrPool, orderId) {
  const { rows } = await clientOrPool.query(
    `SELECT diagnostic_order.id,
            diagnostic_order.facility_id,
            diagnostic_order.patient_id,
            patient.registered_by,
            patient.registered_facility_id,
            patient.village_id,
            village.mandal_id
       FROM tbl_diagnostic_orders diagnostic_order
       JOIN tbl_patients patient ON patient.id = diagnostic_order.patient_id AND patient.deleted_at IS NULL
       LEFT JOIN mst_villages village ON village.id = patient.village_id
      WHERE diagnostic_order.id = $1`,
    [orderId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Diagnostic order not found", "NOT_FOUND");
  }
  return rows[0];
}

/**
 * Eligible HWs for a diagnostic order:
 * - ACTIVE Health Workers
 * - patient's registering HW, OR
 * - HW location assignment covering patient village/mandal/facility, OR
 * - user-facility assignment matching order/patient facility
 */
async function queryEligibleHealthWorkers(clientOrPool, orderScope) {
  const facilityId = orderScope.facility_id || orderScope.registered_facility_id || null;
  const { rows } = await clientOrPool.query(
    `SELECT DISTINCT
            users.id,
            users.full_name,
            users.username,
            COALESCE(facility.name_en, patient_facility.name_en) AS facility_name,
            COALESCE(mandal.name_en, village_mandal.name_en) AS mandal_name
       FROM tbl_users users
       JOIN mst_roles role ON role.id = users.role_id
       JOIN tbl_patients patient ON patient.id = $1
       LEFT JOIN mst_villages village ON village.id = patient.village_id
       LEFT JOIN mst_mandals village_mandal ON village_mandal.id = village.mandal_id
       LEFT JOIN mst_facilities patient_facility
         ON patient_facility.id = COALESCE($2::bigint, patient.registered_facility_id)
       LEFT JOIN LATERAL (
         SELECT hwa.facility_id, hwa.mandal_id
           FROM tbl_health_worker_location_assignments hwa
          WHERE hwa.user_id = users.id
            AND hwa.valid_to IS NULL
            AND (
              (hwa.village_id IS NOT NULL AND hwa.village_id = patient.village_id)
              OR (hwa.mandal_id IS NOT NULL AND hwa.mandal_id = village.mandal_id)
              OR (
                hwa.facility_id IS NOT NULL
                AND hwa.facility_id = COALESCE($2::bigint, patient.registered_facility_id)
              )
            )
          ORDER BY hwa.valid_from DESC
          LIMIT 1
       ) location ON TRUE
       LEFT JOIN mst_facilities facility ON facility.id = location.facility_id
       LEFT JOIN mst_mandals mandal ON mandal.id = COALESCE(location.mandal_id, village.mandal_id)
      WHERE role.code = 'HEALTH_WORKER'
        AND users.status = 'ACTIVE'
        AND users.deleted_at IS NULL
        AND (
          patient.registered_by = users.id
          OR location.facility_id IS NOT NULL
          OR location.mandal_id IS NOT NULL
          OR EXISTS (
            SELECT 1
              FROM tbl_user_facility_assignments assignment
             WHERE assignment.user_id = users.id
               AND assignment.facility_id = COALESCE($2::bigint, patient.registered_facility_id)
               AND assignment.valid_from <= CURRENT_DATE
               AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
          )
        )
      ORDER BY users.full_name`,
    [orderScope.patient_id, facilityId]
  );
  return rows;
}

async function listEligibleHealthWorkers(userId, roleName, orderId) {
  assertRole(roleName, ["NAVIGATOR"], "Only Navigator can list Health Workers for assignment");
  await diagnosticOrderService.getOrderForUser(userId, roleName, orderId);
  const orderScope = await loadOrderPatientScope(pool, orderId);
  const rows = await queryEligibleHealthWorkers(pool, orderScope);
  return { health_workers: rows };
}

async function assignHealthWorker(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["NAVIGATOR"], "Only Navigator can assign Health Workers");
  const healthWorkerId = requireUuid(input.health_worker_id, "Invalid Health Worker ID");
  const notes = trimText(input.notes, "Notes", { max: 2000 });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    const current = workflowOf(order);
    if (![
      WORKFLOW.SPECIALIST_REQUESTED,
      WORKFLOW.NAVIGATOR_RECEIVED,
      WORKFLOW.RETURNED_FOR_CORRECTION,
      WORKFLOW.ASSIGNED_TO_HEALTH_WORKER,
    ].includes(current)) {
      throw new HttpError(409, "This order cannot be assigned in its current state", "INVALID_STATE");
    }

    const orderScope = await loadOrderPatientScope(client, orderId);
    const eligible = await queryEligibleHealthWorkers(client, orderScope);
    if (!eligible.some((row) => row.id === healthWorkerId)) {
      throw new HttpError(
        403,
        "Health Worker must be active and eligible for this patient's location or facility",
        "STAFF_FACILITY_SCOPE"
      );
    }
    const { rows: hwRows } = await client.query(
      `SELECT users.id
         FROM tbl_users users
         JOIN mst_roles role ON role.id = users.role_id
        WHERE users.id = $1
          AND role.code = 'HEALTH_WORKER'
          AND users.status = 'ACTIVE'
          AND users.deleted_at IS NULL
        FOR UPDATE OF users`,
      [healthWorkerId]
    );
    if (!hwRows.length) {
      throw new HttpError(
        403,
        "Health Worker must be an active Health Worker account",
        "STAFF_FACILITY_SCOPE"
      );
    }

    await setWorkflowStatus(client, {
      orderId,
      fromStatusId: order.status_id,
      workflowStatus: WORKFLOW.ASSIGNED_TO_HEALTH_WORKER,
      userId,
      reason: notes || "Navigator assigned Health Worker for diagnostic collection",
      extraSets: {
        assigned_health_worker_id: healthWorkerId,
        returned_reason: null,
      },
    });

    await notifyOnce(client, {
      templateCode: "DIAGNOSTIC_NAV_ASSIGN_HW",
      recipientUserId: healthWorkerId,
      patientId: order.patient_id,
      event: "DIAGNOSTIC_ASSIGNED_TO_HW",
      title: "Diagnostic collection assigned",
      message: `Navigator assigned diagnostic order ${order.order_code} for collection.`,
      targetPath: `/health-worker/diagnostics/orders/${orderId}`,
      orderId,
      dedupeKey: `DIAGNOSTIC_ASSIGNED_TO_HW:${orderId}:${healthWorkerId}`,
    });

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_ASSIGNED_TO_HW",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
      metadata: { health_worker_id: healthWorkerId },
    });

    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

async function startCollection(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["HEALTH_WORKER"], "Only Health Worker can start collection");
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const order = await loadOrderRow(client, orderId);
    if (order.assigned_health_worker_id && order.assigned_health_worker_id !== userId) {
      throw new HttpError(403, "This collection task is assigned to another Health Worker", "FORBIDDEN");
    }
    if (![
      WORKFLOW.ASSIGNED_TO_HEALTH_WORKER,
      WORKFLOW.RETURNED_FOR_CORRECTION,
      WORKFLOW.COLLECTION_IN_PROGRESS,
    ].includes(workflowOf(order))) {
      throw new HttpError(409, "Collection cannot start in the current state", "INVALID_STATE");
    }
    await setWorkflowStatus(client, {
      orderId,
      fromStatusId: order.status_id,
      workflowStatus: WORKFLOW.COLLECTION_IN_PROGRESS,
      userId,
      reason: trimText(input.notes, "Notes", { max: 2000 }) || "Health Worker started diagnostic collection",
    });
    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_COLLECTION_STARTED",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
    });
    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

async function markReportUploaded(client, order, userId) {
  const current = order.workflow_status || null;
  const coarse = String(order.status_code || "").toUpperCase();
  const workflowAllows = !current || [
    WORKFLOW.COLLECTION_IN_PROGRESS,
    WORKFLOW.ASSIGNED_TO_HEALTH_WORKER,
    WORKFLOW.RETURNED_FOR_CORRECTION,
    WORKFLOW.REPORT_UPLOADED,
    WORKFLOW.NAVIGATOR_RECEIVED,
  ].includes(current);
  const coarseAllows = [
    "ADVISED",
    "SCHEDULED",
    "SAMPLE_COLLECTED",
    "REPORT_PENDING",
    "REPORT_RECEIVED",
    "COLLECTION_IN_PROGRESS",
  ].includes(coarse);
  if (workflowAllows || coarseAllows) {
    await setWorkflowStatus(client, {
      orderId: order.id,
      fromStatusId: order.status_id,
      workflowStatus: WORKFLOW.REPORT_UPLOADED,
      userId,
      reason: "Diagnostic report uploaded by Health Worker",
    });
  }
}

async function loadReportsForRequirements(client, orderId) {
  const { rows } = await client.query(
    `SELECT id, review_status, clinical_notes, original_filename, created_at
       FROM tbl_diagnostic_order_reports
      WHERE order_id = $1
      ORDER BY created_at DESC`,
    [orderId]
  );
  return rows.map((row) => diagnosticOrderService.attachDocumentCategory(row));
}

async function assertRequiredDocumentsMet(client, orderId) {
  const items = await client.query(
    `SELECT item.id, item.test_id,
            test.code AS test_code, test.name_en AS test_name,
            category.code AS category_code
       FROM tbl_diagnostic_order_items item
       JOIN mst_diagnostic_tests test ON test.id = item.test_id
       JOIN mst_diagnostic_categories category ON category.id = test.category_id
      WHERE item.order_id = $1`,
    [orderId]
  );
  const required = diagnosticOrderService.buildRequiredDocuments(items.rows);
  const reports = await loadReportsForRequirements(client, orderId);
  const reportService = require("./diagnosticReportService");
  const satisfaction = reportService.requirementsSatisfied(required, reports);
  if (!satisfaction.ok) {
    const missing = satisfaction.missing.map((row) => row.label || row.code).join(", ");
    throw new HttpError(
      409,
      `Required documents are incomplete: ${missing}`,
      "REQUIRED_DOCUMENTS_MISSING"
    );
  }
  return { required, reports };
}

async function verifyReports(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["NAVIGATOR"], "Only Navigator can verify diagnostic reports");
  const action = String(input.action || "verify").toLowerCase();
  const reason = trimText(input.reason, "Reason", {
    required: action !== "verify",
    max: 2000,
  });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    const reports = await loadReportsForRequirements(client, orderId);
    if (!reports.length) {
      throw new HttpError(409, "Upload at least one diagnostic report before verification", "REPORT_REQUIRED");
    }

    if (action === "return") {
      await ensureNavigatorReportReviewStatuses(client);
      await client.query(
        `UPDATE tbl_diagnostic_order_reports
            SET review_status = 'RETURNED'
          WHERE order_id = $1 AND review_status IN ('PENDING', 'VERIFIED')`,
        [orderId]
      );
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.RETURNED_FOR_CORRECTION,
        userId,
        reason: reason || "Navigator returned submission for correction",
        extraSets: { returned_reason: reason },
      });
      const hwRecipient = order.assigned_health_worker_id || order.registered_by;
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_RETURNED",
        recipientUserId: hwRecipient,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_RETURNED",
        title: "Diagnostic submission returned",
        message: `Navigator returned order ${order.order_code}: ${reason}`,
        targetPath: `/health-worker/diagnostics/orders/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_RETURNED:${orderId}:${Date.now()}`,
      });
    } else {
      await assertRequiredDocumentsMet(client, orderId);
      await ensureNavigatorReportReviewStatuses(client);
      await client.query(
        `UPDATE tbl_diagnostic_order_reports
            SET review_status = 'VERIFIED'
          WHERE order_id = $1 AND review_status IN ('PENDING', 'RETURNED')`,
        [orderId]
      );
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.NAVIGATOR_VERIFICATION,
        userId,
        reason: reason || "Navigator verified diagnostic reports",
        extraSets: { returned_reason: null },
      });
    }

    await audit(req, {
      client,
      required: true,
      event: action === "return" ? "DIAGNOSTIC_RETURNED" : "DIAGNOSTIC_VERIFIED",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
      metadata: { action, reason },
    });
    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

async function forwardToHospitalStaff(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["NAVIGATOR"], "Only Navigator can forward reports to Hospital Staff");
  const notes = trimText(input.notes, "Notes", { max: 2000 });
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    const currentWorkflow = order.workflow_status || null;
    if ([
      WORKFLOW.SENT_TO_HOSPITAL_STAFF,
      WORKFLOW.SPECIALIST_REVIEW_PENDING,
      WORKFLOW.SPECIALIST_REVIEWED,
      WORKFLOW.ADVICE_SENT_TO_NAVIGATOR,
      WORKFLOW.COMPLETED,
    ].includes(currentWorkflow)) {
      throw new HttpError(409, "This diagnostic order was already forwarded", "ALREADY_FORWARDED");
    }
    const verifiedReady = currentWorkflow === WORKFLOW.NAVIGATOR_VERIFICATION
      || (!currentWorkflow && ["REPORT_RECEIVED"].includes(String(order.status_code || "").toUpperCase()));
    if (!verifiedReady) {
      throw new HttpError(409, "Verify reports before forwarding to Hospital Staff", "INVALID_STATE");
    }
    await assertRequiredDocumentsMet(client, orderId);
    const { rows: verified } = await client.query(
      `SELECT id FROM tbl_diagnostic_order_reports
        WHERE order_id = $1 AND review_status = 'VERIFIED'`,
      [orderId]
    );
    if (!verified.length) {
      throw new HttpError(409, "At least one verified report is required", "REPORT_REQUIRED");
    }

    await setWorkflowStatus(client, {
      orderId,
      fromStatusId: order.status_id,
      workflowStatus: WORKFLOW.SENT_TO_HOSPITAL_STAFF,
      userId,
      reason: notes || "Navigator forwarded verified reports to Hospital Staff",
      extraSets: {
        forwarded_to_hs_by: userId,
        forwarded_to_hs_at: new Date(),
      },
    });

    const { rows: hsRows } = await client.query(
      `SELECT users.id
         FROM tbl_users users
         JOIN mst_roles role ON role.id = users.role_id
         JOIN tbl_user_facility_assignments assignment ON assignment.user_id = users.id
        WHERE role.code = 'HOSPITAL_STAFF'
          AND users.status = 'ACTIVE'
          AND assignment.facility_id = $1
          AND assignment.valid_from <= CURRENT_DATE
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)`,
      [order.facility_id]
    );
    for (const hs of hsRows) {
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_FORWARDED_HS",
        recipientUserId: hs.id,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_FORWARDED_HS",
        title: "Diagnostic report for Hospital Staff",
        message: `Navigator forwarded verified report for order ${order.order_code}.`,
        targetPath: `/hospital-staff/diagnostics/orders/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_FORWARDED_HS:${orderId}:${hs.id}`,
      });
    }

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_FORWARDED_HS",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
    });
    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

async function routeToSpecialist(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["HOSPITAL_STAFF"], "Only Hospital Staff can route reports to Specialist");
  const notes = trimText(input.notes, "Notes", { max: 2000 });
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const order = await attachInferredWorkflow(client, await loadOrderRow(client, orderId));
    if (workflowOf(order) !== WORKFLOW.SENT_TO_HOSPITAL_STAFF) {
      throw new HttpError(409, "Order is not waiting for Hospital Staff routing", "INVALID_STATE");
    }
    // Hospital Staff may only route to the prescribing Specialist (authorized requester).
    if (order.prescribed_by_role !== "SPECIALIST") {
      throw new HttpError(
        409,
        "This order was not prescribed by a Specialist; route only Specialist-authored diagnostic reviews",
        "INVALID_PRESCRIBER"
      );
    }

    await setWorkflowStatus(client, {
      orderId,
      fromStatusId: order.status_id,
      workflowStatus: WORKFLOW.SPECIALIST_REVIEW_PENDING,
      userId,
      reason: notes || "Hospital Staff routed report to authorized Specialist",
      extraSets: {
        routed_to_specialist_by: userId,
        routed_to_specialist_at: new Date(),
      },
    });

    await notifyOnce(client, {
      templateCode: "DIAGNOSTIC_ROUTED_SPECIALIST",
      recipientUserId: order.prescribed_by,
      patientId: order.patient_id,
      event: "DIAGNOSTIC_ROUTED_SPECIALIST",
      title: "Diagnostic report awaiting your review",
      message: `Hospital Staff routed order ${order.order_code} for your clinical review.`,
      targetPath: `/specialist/diagnostics/${orderId}`,
      orderId,
      dedupeKey: `DIAGNOSTIC_ROUTED_SPECIALIST:${orderId}`,
    });

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_ROUTED_SPECIALIST",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
      metadata: { specialist_id: order.prescribed_by },
    });
    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

function parseBool(value) {
  return value === true || value === "true";
}

function parseAdviceFields(input = {}, { requireFindings = true } = {}) {
  const findings = trimText(input.findings, "Findings", { required: requireFindings, max: 4000 });
  const precautions = trimText(input.precautions, "Precautions", { max: 4000 });
  const treatmentAdvice = trimText(input.treatment_advice, "Treatment advice", { max: 4000 });
  const medicineName = trimText(input.medicine_name, "Medicine", { max: 200 });
  const dosage = trimText(input.dosage, "Dosage", { max: 200 });
  const durationText = trimText(input.duration_text, "Duration", { max: 200 });
  const followUp = trimText(input.follow_up_instructions, "Follow-up instructions", { max: 4000 });
  const reassessmentInstructions = trimText(
    input.reassessment_instructions,
    "Reassessment instructions",
    { max: 4000 }
  );
  const additionalNeeded = parseBool(input.additional_diagnostics_needed);
  const additionalNotes = trimText(
    input.additional_diagnostics_notes,
    "Additional diagnostics notes",
    { required: additionalNeeded, max: 2000 }
  );
  const followUpRequired = parseBool(input.follow_up_required);
  const followUpDueDate = input.follow_up_due_date || null;
  if (followUpRequired && !followUpDueDate) {
    throw new HttpError(400, "Follow-up due date is required when follow-up is required", "VALIDATION_ERROR");
  }
  return {
    findings,
    precautions,
    treatmentAdvice,
    medicineName,
    dosage,
    durationText,
    followUp,
    reassessmentInstructions,
    additionalNeeded,
    additionalNotes,
    followUpRequired,
    followUpDueDate,
  };
}

async function loadCurrentAdvice(client, orderId, { forUpdate = false } = {}) {
  const lock = forUpdate ? "FOR UPDATE" : "FOR SHARE";
  const { rows } = await client.query(
    `SELECT * FROM tbl_diagnostic_advice
      WHERE order_id = $1
        AND (is_current IS TRUE OR is_current IS NULL)
      ORDER BY COALESCE(version_no, 1) DESC, created_at DESC
      LIMIT 1
      ${lock}`,
    [orderId]
  );
  return rows[0] || null;
}

async function nextAdviceVersion(client, orderId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(version_no), 0)::int AS max_version
       FROM tbl_diagnostic_advice WHERE order_id = $1`,
    [orderId]
  );
  return (rows[0]?.max_version || 0) + 1;
}

async function insertSignedAdviceVersion(client, {
  orderId,
  patientId,
  userId,
  fields,
  supersedesId = null,
  closureReason = null,
}) {
  const versionNo = await nextAdviceVersion(client, orderId);
  if (supersedesId || versionNo > 1) {
    await client.query(
      `UPDATE tbl_diagnostic_advice
          SET is_current = FALSE, updated_at = now()
        WHERE order_id = $1 AND COALESCE(is_current, TRUE) IS TRUE`,
      [orderId]
    );
  }
  try {
    const { rows } = await client.query(
      `INSERT INTO tbl_diagnostic_advice
         (order_id, patient_id, specialist_id, created_by, findings, precautions, treatment_advice,
          medicine_name, dosage, duration_text, follow_up_instructions,
          additional_diagnostics_needed, additional_diagnostics_notes,
          follow_up_required, follow_up_due_date, reassessment_instructions, closure_reason,
          version_no, supersedes_advice_id, is_current,
          status, signed_by, signed_at)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,TRUE,
               'SIGNED',$3,now())
       RETURNING *`,
      [
        orderId,
        patientId,
        userId,
        fields.findings,
        fields.precautions,
        fields.treatmentAdvice,
        fields.medicineName,
        fields.dosage,
        fields.durationText,
        fields.followUp,
        fields.additionalNeeded,
        fields.additionalNotes,
        fields.followUpRequired,
        fields.followUpDueDate,
        fields.reassessmentInstructions,
        closureReason,
        versionNo,
        supersedesId,
      ]
    );
    return rows[0];
  } catch (error) {
    if (isUndefinedColumn(error)) {
      // Pre-042 schema: fall back to single-row upsert.
      const { rows } = await client.query(
        `INSERT INTO tbl_diagnostic_advice
           (order_id, patient_id, specialist_id, findings, precautions, treatment_advice,
            medicine_name, dosage, duration_text, follow_up_instructions,
            additional_diagnostics_needed, additional_diagnostics_notes,
            status, signed_by, signed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SIGNED',$3,now())
         ON CONFLICT (order_id) DO UPDATE
           SET findings = EXCLUDED.findings,
               precautions = EXCLUDED.precautions,
               treatment_advice = EXCLUDED.treatment_advice,
               medicine_name = EXCLUDED.medicine_name,
               dosage = EXCLUDED.dosage,
               duration_text = EXCLUDED.duration_text,
               follow_up_instructions = EXCLUDED.follow_up_instructions,
               additional_diagnostics_needed = EXCLUDED.additional_diagnostics_needed,
               additional_diagnostics_notes = EXCLUDED.additional_diagnostics_notes,
               status = 'SIGNED',
               signed_by = EXCLUDED.signed_by,
               signed_at = now(),
               updated_at = now()
           WHERE tbl_diagnostic_advice.status = 'DRAFT'
         RETURNING *`,
        [
          orderId,
          patientId,
          userId,
          fields.findings,
          fields.precautions,
          fields.treatmentAdvice,
          fields.medicineName,
          fields.dosage,
          fields.durationText,
          fields.followUp,
          fields.additionalNeeded,
          fields.additionalNotes,
        ]
      );
      if (!rows.length) {
        throw new HttpError(409, "Signed diagnostic advice already exists and cannot be altered", "ALREADY_SIGNED");
      }
      return rows[0];
    }
    if (isUndefinedTable(error)) {
      throw new HttpError(503, "Diagnostic advice workflow requires migration 039", "MIGRATION_REQUIRED");
    }
    throw error;
  }
}

async function saveAdviceDraft(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["SPECIALIST"], "Only Specialist can save diagnostic advice drafts");
  const fields = parseAdviceFields(input, { requireFindings: true });
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await attachInferredWorkflow(client, await loadOrderRow(client, orderId));
    if (order.prescribed_by !== userId) {
      throw new HttpError(403, "Only the requesting Specialist may draft this advice", "FORBIDDEN");
    }
    const wf = workflowOf(order);
    if (![WORKFLOW.SPECIALIST_REVIEW_PENDING, WORKFLOW.REASSESSMENT_PENDING, WORKFLOW.FOLLOWUP_REQUIRED, WORKFLOW.SENT_TO_HOSPITAL_STAFF].includes(wf)) {
      throw new HttpError(409, "Order is not awaiting Specialist advice", "INVALID_STATE");
    }

    const current = await loadCurrentAdvice(client, orderId, { forUpdate: true });
    if (current && current.status === "SIGNED") {
      throw new HttpError(409, "Use reassessment Update to create a new signed advice version", "ALREADY_SIGNED");
    }

    let advice;
    try {
      if (current && current.status === "DRAFT") {
        const { rows } = await client.query(
          `UPDATE tbl_diagnostic_advice
              SET findings = $2,
                  precautions = $3,
                  treatment_advice = $4,
                  medicine_name = $5,
                  dosage = $6,
                  duration_text = $7,
                  follow_up_instructions = $8,
                  additional_diagnostics_needed = $9,
                  additional_diagnostics_notes = $10,
                  follow_up_required = COALESCE($11, follow_up_required),
                  follow_up_due_date = $12,
                  reassessment_instructions = $13,
                  updated_at = now()
            WHERE id = $1 AND status = 'DRAFT'
            RETURNING *`,
          [
            current.id,
            fields.findings,
            fields.precautions,
            fields.treatmentAdvice,
            fields.medicineName,
            fields.dosage,
            fields.durationText,
            fields.followUp,
            fields.additionalNeeded,
            fields.additionalNotes,
            fields.followUpRequired,
            fields.followUpDueDate,
            fields.reassessmentInstructions,
          ]
        );
        advice = rows[0];
      } else {
        const versionNo = await nextAdviceVersion(client, orderId);
        const { rows } = await client.query(
          `INSERT INTO tbl_diagnostic_advice
             (order_id, patient_id, specialist_id, created_by, findings, precautions, treatment_advice,
              medicine_name, dosage, duration_text, follow_up_instructions,
              additional_diagnostics_needed, additional_diagnostics_notes,
              follow_up_required, follow_up_due_date, reassessment_instructions,
              version_no, is_current, status)
           VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,'DRAFT')
           RETURNING *`,
          [
            orderId,
            order.patient_id,
            userId,
            fields.findings,
            fields.precautions,
            fields.treatmentAdvice,
            fields.medicineName,
            fields.dosage,
            fields.durationText,
            fields.followUp,
            fields.additionalNeeded,
            fields.additionalNotes,
            fields.followUpRequired,
            fields.followUpDueDate,
            fields.reassessmentInstructions,
            versionNo,
          ]
        );
        advice = rows[0];
      }
    } catch (error) {
      if (isUndefinedColumn(error)) {
        const { rows } = await client.query(
          `INSERT INTO tbl_diagnostic_advice
             (order_id, patient_id, specialist_id, findings, precautions, treatment_advice,
              medicine_name, dosage, duration_text, follow_up_instructions,
              additional_diagnostics_needed, additional_diagnostics_notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'DRAFT')
           ON CONFLICT (order_id) DO UPDATE
             SET findings = EXCLUDED.findings,
                 precautions = EXCLUDED.precautions,
                 treatment_advice = EXCLUDED.treatment_advice,
                 medicine_name = EXCLUDED.medicine_name,
                 dosage = EXCLUDED.dosage,
                 duration_text = EXCLUDED.duration_text,
                 follow_up_instructions = EXCLUDED.follow_up_instructions,
                 additional_diagnostics_needed = EXCLUDED.additional_diagnostics_needed,
                 additional_diagnostics_notes = EXCLUDED.additional_diagnostics_notes,
                 updated_at = now()
             WHERE tbl_diagnostic_advice.status = 'DRAFT'
           RETURNING *`,
          [
            orderId,
            order.patient_id,
            userId,
            fields.findings,
            fields.precautions,
            fields.treatmentAdvice,
            fields.medicineName,
            fields.dosage,
            fields.durationText,
            fields.followUp,
            fields.additionalNeeded,
            fields.additionalNotes,
          ]
        );
        if (!rows.length) {
          throw new HttpError(409, "Signed diagnostic advice already exists and cannot be altered", "ALREADY_SIGNED");
        }
        advice = rows[0];
      } else if (isUndefinedTable(error)) {
        throw new HttpError(503, "Diagnostic advice workflow requires migration 039", "MIGRATION_REQUIRED");
      } else {
        throw error;
      }
    }

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_ADVICE_DRAFT_SAVED",
      resourceType: "diagnostic_advice",
      resourceId: advice.id,
      patientId: order.patient_id,
      metadata: { order_id: orderId },
    });

    return {
      ...(await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client })),
      advice,
    };
  });
}

async function signAdvice(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["SPECIALIST"], "Only Specialist can sign diagnostic advice");
  const fields = parseAdviceFields(input, { requireFindings: true });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await attachInferredWorkflow(client, await loadOrderRow(client, orderId));
    if (order.prescribed_by !== userId) {
      throw new HttpError(403, "Only the requesting Specialist may sign this advice", "FORBIDDEN");
    }
    if (workflowOf(order) === WORKFLOW.SENT_TO_HOSPITAL_STAFF) {
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.SPECIALIST_REVIEW_PENDING,
        userId,
        reason: "Specialist review started after Hospital Staff handoff",
      });
      order.workflow_status = WORKFLOW.SPECIALIST_REVIEW_PENDING;
      order._inferred_workflow = WORKFLOW.SPECIALIST_REVIEW_PENDING;
    }
    if (!SIGN_ADVICE_FROM.has(workflowOf(order))) {
      throw new HttpError(409, "Order is not awaiting Specialist advice or reassessment", "INVALID_STATE");
    }

    const previous = await loadCurrentAdvice(client, orderId, { forUpdate: true });
    if (previous?.status === "DRAFT") {
      await client.query(
        `UPDATE tbl_diagnostic_advice
            SET is_current = FALSE, updated_at = now()
          WHERE id = $1`,
        [previous.id]
      );
    } else if (
      previous?.status === "SIGNED"
      && workflowOf(order) === WORKFLOW.SPECIALIST_REVIEW_PENDING
    ) {
      throw new HttpError(409, "Signed diagnostic advice already exists and cannot be altered", "ALREADY_SIGNED");
    }

    const advice = await insertSignedAdviceVersion(client, {
      orderId,
      patientId: order.patient_id,
      userId,
      fields,
      supersedesId: previous?.status === "SIGNED" ? previous.id : null,
    });

    await client.query(
      `UPDATE tbl_diagnostic_order_reports
          SET review_status = 'REVIEWED',
              reviewed_by = $2,
              reviewed_at = now(),
              clinical_notes = COALESCE(clinical_notes, $3)
        WHERE order_id = $1 AND review_status IN ('PENDING', 'VERIFIED')`,
      [orderId, userId, fields.findings]
    );

    const isReassessment = [
      WORKFLOW.REASSESSMENT_PENDING,
      WORKFLOW.FOLLOWUP_REQUIRED,
      WORKFLOW.VIDEO_CONSULTATION_REQUESTED,
    ].includes(workflowOf(order));

    let nextWorkflow = WORKFLOW.ADVICE_SENT_TO_NAVIGATOR;
    let reason = "Specialist signed diagnostic advice; sent to Navigator";
    if (fields.additionalNeeded) {
      nextWorkflow = WORKFLOW.ADDITIONAL_INFORMATION_REQUIRED;
      reason = "Specialist requested additional diagnostic information";
    } else if (fields.followUpRequired && isReassessment) {
      nextWorkflow = WORKFLOW.FOLLOWUP_REQUIRED;
      reason = "Specialist signed updated advice; follow-up still required";
    } else if (isReassessment) {
      nextWorkflow = WORKFLOW.ADVICE_SENT_TO_NAVIGATOR;
      reason = "Specialist signed reassessment advice; sent to Navigator";
    }

    await setWorkflowStatus(client, {
      orderId,
      fromStatusId: order.status_id,
      workflowStatus: nextWorkflow,
      userId,
      reason,
    });

    const navigatorId = order.assigned_navigator_id || order.care_navigator_id;
    const templateCode = isReassessment ? "DIAGNOSTIC_REASSESSMENT_ADVICE" : "DIAGNOSTIC_ADVICE_SIGNED";
    const event = isReassessment ? "DIAGNOSTIC_REASSESSMENT_ADVICE" : "DIAGNOSTIC_ADVICE_SIGNED";
    await notifyOnce(client, {
      templateCode,
      recipientUserId: navigatorId,
      patientId: order.patient_id,
      event,
      title: isReassessment
        ? "Updated Specialist advice after reassessment"
        : "Specialist diagnostic advice signed",
      message: `Specialist signed advice for order ${order.order_code}. Forward to Health Worker.`,
      targetPath: `/navigator/diagnostics/${orderId}`,
      orderId,
      dedupeKey: `${event}:${orderId}:${advice.id}`,
    }).catch(() => {});

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_ADVICE_SIGNED",
      resourceType: "diagnostic_advice",
      resourceId: advice.id,
      patientId: order.patient_id,
      metadata: {
        order_id: orderId,
        version_no: advice.version_no || 1,
        medicine_prescribed: Boolean(fields.medicineName),
        additional_diagnostics_needed: fields.additionalNeeded,
        follow_up_required: fields.followUpRequired,
        reassessment: isReassessment,
      },
    });

    return {
      ...(await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client })),
      advice,
    };
  });
}

async function forwardAdviceToHealthWorker(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["NAVIGATOR"], "Only Navigator can forward Specialist advice");
  const notes = trimText(input.notes, "Notes", { max: 2000 });
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    assertAssignedNavigator(order, userId);
    if (!FORWARD_ADVICE_FROM.has(workflowOf(order))) {
      throw new HttpError(409, "Signed Specialist advice is not ready to forward", "INVALID_STATE");
    }
    if (!order.assigned_health_worker_id) {
      throw new HttpError(409, "Assign a Health Worker before forwarding advice", "HW_REQUIRED");
    }
    const advice = await loadCurrentAdvice(client, orderId);
    if (!advice || advice.status !== "SIGNED") {
      throw new HttpError(409, "Only signed Specialist advice can be forwarded", "ADVICE_REQUIRED");
    }

    await setWorkflowStatus(client, {
      orderId,
      fromStatusId: order.status_id,
      workflowStatus: WORKFLOW.SENT_TO_HEALTH_WORKER,
      userId,
      reason: notes || "Navigator forwarded signed Specialist advice to Health Worker",
      extraSets: {
        advice_forwarded_to_hw_by: userId,
        advice_forwarded_to_hw_at: new Date(),
      },
    });

    await notifyOnce(client, {
      templateCode: "DIAGNOSTIC_ADVICE_TO_HW",
      recipientUserId: order.assigned_health_worker_id,
      patientId: order.patient_id,
      event: "DIAGNOSTIC_ADVICE_TO_HW",
      title: "Specialist advice for patient follow-up",
      message: `Navigator forwarded signed Specialist advice for order ${order.order_code}.`,
      targetPath: `/health-worker/diagnostics/orders/${orderId}`,
      orderId,
      dedupeKey: `DIAGNOSTIC_ADVICE_TO_HW:${orderId}:${advice.id}`,
    }).catch(() => {});

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_ADVICE_FORWARDED",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
      metadata: { advice_id: advice.id },
    });
    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

function parseFollowupFields(input = {}, { forSubmit = false } = {}) {
  const outcomeNotes = trimText(input.outcome_notes, "Outcome notes", {
    required: forSubmit,
    max: 4000,
  });
  const followupNotes = trimText(input.followup_notes, "Follow-up notes", { max: 4000 })
    || outcomeNotes;
  const symptomsStatus = trimText(input.symptoms_status, "Symptoms / status", {
    required: forSubmit,
    max: 4000,
  });
  const improvementStatus = input.improvement_status
    ? String(input.improvement_status).trim()
    : null;
  if (improvementStatus && !IMPROVEMENT_STATUSES.has(improvementStatus)) {
    throw new HttpError(400, "Improvement must be Improved, No Change, or Worsened", "VALIDATION_ERROR");
  }
  if (forSubmit && !improvementStatus) {
    throw new HttpError(400, "Improvement status is required", "VALIDATION_ERROR");
  }
  return {
    outcomeNotes: outcomeNotes || followupNotes,
    followupNotes,
    followupDate: input.followup_date || null,
    contactedAt: input.contacted_at || null,
    patientContacted: parseBool(input.patient_contacted ?? input.patient_acknowledged),
    acknowledged: parseBool(input.patient_acknowledged ?? input.patient_contacted),
    symptomsStatus,
    improvementStatus,
    adviceFollowed: input.advice_followed == null ? null : parseBool(input.advice_followed),
    medicineAdherence: trimText(input.medicine_adherence, "Medicine adherence", { max: 2000 }),
    newProblems: trimText(input.new_problems, "New problems", { max: 4000 }),
    specialistReviewNeeded: parseBool(input.specialist_review_needed),
    idempotencyKey: trimText(input.idempotency_key, "Idempotency key", { max: 100 }),
  };
}

async function nextFollowupCycle(client, orderId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(cycle_no), 0)::int AS max_cycle
       FROM tbl_diagnostic_advice_followups WHERE order_id = $1`,
    [orderId]
  );
  return (rows[0]?.max_cycle || 0) + 1;
}

async function recordPatientFollowup(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["HEALTH_WORKER"], "Only Health Worker can record patient follow-up");
  const asDraft = input.save_as_draft === true || input.save_as_draft === "true"
    || String(input.action || "").toLowerCase() === "draft";

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    assertAssignedHealthWorker(order, userId);
    if (!FOLLOWUP_WRITE_FROM.has(workflowOf(order))) {
      throw new HttpError(409, "Signed advice has not been forwarded for follow-up", "INVALID_STATE");
    }

    const fields = parseFollowupFields(input, { forSubmit: !asDraft });
    const advice = await loadCurrentAdvice(client, orderId);
    if (!advice || advice.status !== "SIGNED") {
      throw new HttpError(409, "No signed Specialist advice exists for this order", "ADVICE_REQUIRED");
    }

    if (fields.idempotencyKey) {
      const existing = await client.query(
        `SELECT * FROM tbl_diagnostic_advice_followups
          WHERE order_id = $1 AND idempotency_key = $2
          LIMIT 1`,
        [orderId, fields.idempotencyKey]
      );
      if (existing.rows.length) {
        return {
          ...(await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client })),
          followup: existing.rows[0],
          idempotent_replay: true,
        };
      }
    }

    // Block a second SUBMITTED report for this order (new idempotency keys cannot bypass).
    if (!asDraft) {
      const pending = await client.query(
        `SELECT id FROM tbl_diagnostic_advice_followups
          WHERE order_id = $1 AND status = 'SUBMITTED'
          LIMIT 1
          FOR UPDATE`,
        [orderId]
      );
      if (pending.rows.length) {
        throw new HttpError(409, "A follow-up report was already submitted for this cycle", "DUPLICATE_FOLLOWUP");
      }
    }

    const open = await client.query(
      `SELECT * FROM tbl_diagnostic_advice_followups
        WHERE order_id = $1 AND advice_id = $2 AND status IN ('DRAFT', 'RETURNED')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [orderId, advice.id]
    );

    const status = asDraft ? "DRAFT" : "SUBMITTED";
    let followup;
    try {
      if (open.rows.length) {
        const { rows } = await client.query(
          `UPDATE tbl_diagnostic_advice_followups
              SET patient_acknowledged = $2,
                  patient_contacted = $3,
                  contacted_at = COALESCE($4::timestamptz, contacted_at),
                  followup_date = $5,
                  outcome_notes = $6,
                  followup_notes = $7,
                  symptoms_status = $8,
                  improvement_status = $9,
                  advice_followed = $10,
                  medicine_adherence = $11,
                  new_problems = $12,
                  specialist_review_needed = $13,
                  status = $14,
                  submitted_at = CASE WHEN $14 = 'SUBMITTED' THEN now() ELSE submitted_at END,
                  returned_by = CASE WHEN $14 = 'SUBMITTED' THEN NULL ELSE returned_by END,
                  returned_at = CASE WHEN $14 = 'SUBMITTED' THEN NULL ELSE returned_at END,
                  return_reason = CASE WHEN $14 = 'SUBMITTED' THEN NULL ELSE return_reason END,
                  idempotency_key = COALESCE($15, idempotency_key),
                  updated_at = now()
            WHERE id = $1
            RETURNING *`,
          [
            open.rows[0].id,
            fields.acknowledged,
            fields.patientContacted,
            fields.contactedAt,
            fields.followupDate,
            fields.outcomeNotes,
            fields.followupNotes,
            fields.symptomsStatus,
            fields.improvementStatus,
            fields.adviceFollowed,
            fields.medicineAdherence,
            fields.newProblems,
            fields.specialistReviewNeeded,
            status,
            fields.idempotencyKey,
          ]
        );
        followup = rows[0];
      } else {
        const cycleNo = await nextFollowupCycle(client, orderId);
        const { rows } = await client.query(
          `INSERT INTO tbl_diagnostic_advice_followups
             (advice_id, order_id, patient_id, health_worker_id, patient_acknowledged,
              patient_contacted, contacted_at, followup_date, outcome_notes, followup_notes,
              symptoms_status, improvement_status, advice_followed, medicine_adherence,
              new_problems, specialist_review_needed, status, cycle_no, idempotency_key, submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                   CASE WHEN $17 = 'SUBMITTED' THEN now() ELSE NULL END)
           RETURNING *`,
          [
            advice.id,
            orderId,
            order.patient_id,
            userId,
            fields.acknowledged,
            fields.patientContacted,
            fields.contactedAt,
            fields.followupDate,
            fields.outcomeNotes,
            fields.followupNotes,
            fields.symptomsStatus,
            fields.improvementStatus,
            fields.adviceFollowed,
            fields.medicineAdherence,
            fields.newProblems,
            fields.specialistReviewNeeded,
            status,
            cycleNo,
            fields.idempotencyKey,
          ]
        );
        followup = rows[0];
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error?.code === "23505") {
        throw new HttpError(409, "A follow-up report was already submitted for this cycle", "DUPLICATE_FOLLOWUP");
      }
      if (isUndefinedColumn(error)) {
        // Pre-042 fallback: insert legacy thin row without completing the order.
        const { rows } = await client.query(
          `INSERT INTO tbl_diagnostic_advice_followups
             (advice_id, order_id, patient_id, health_worker_id, patient_acknowledged, followup_date, outcome_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [
            advice.id,
            orderId,
            order.patient_id,
            userId,
            fields.acknowledged,
            fields.followupDate,
            fields.outcomeNotes || "Follow-up recorded",
          ]
        );
        followup = rows[0];
      } else if (isUndefinedTable(error)) {
        throw new HttpError(503, "Diagnostic follow-up requires migration 039", "MIGRATION_REQUIRED");
      } else {
        throw error;
      }
    }

    const nextWorkflow = asDraft ? WORKFLOW.PATIENT_FOLLOWUP : WORKFLOW.FOLLOWUP_REPORT_SUBMITTED;
    try {
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: nextWorkflow,
        userId,
        reason: asDraft
          ? "Health Worker saved patient follow-up draft"
          : "Health Worker submitted patient follow-up report",
      });
    } catch (error) {
      // Pre-042 DB may reject FOLLOWUP_REPORT_SUBMITTED; keep PATIENT_FOLLOWUP and do not auto-complete.
      if (asDraft || !/check constraint|workflow_status/i.test(String(error.message || ""))) {
        throw error;
      }
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.PATIENT_FOLLOWUP,
        userId,
        reason: "Health Worker submitted patient follow-up report",
      });
    }

    if (!asDraft) {
      const navigatorId = order.assigned_navigator_id || order.care_navigator_id;
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_FOLLOWUP_DONE",
        recipientUserId: navigatorId,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_FOLLOWUP_DONE",
        title: "Diagnostic patient follow-up recorded",
        message: `Health Worker submitted follow-up for order ${order.order_code}. Review and forward to Specialist.`,
        targetPath: `/navigator/diagnostics/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_FOLLOWUP_DONE:${orderId}:${followup?.id || "unknown"}`,
      }).catch(() => {});
    }

    await audit(req, {
      client,
      required: true,
      event: asDraft ? "DIAGNOSTIC_PATIENT_FOLLOWUP_DRAFT" : "DIAGNOSTIC_PATIENT_FOLLOWUP",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
      metadata: {
        patient_acknowledged: fields.acknowledged,
        followup_id: followup?.id || null,
        status,
      },
    });

    return {
      ...(await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client })),
      followup,
    };
  });
}

async function verifyFollowupReport(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["NAVIGATOR"], "Only Navigator can verify follow-up reports");
  const action = String(input.action || "").toLowerCase();
  if (!["return", "forward"].includes(action)) {
    throw new HttpError(400, "action must be return or forward", "VALIDATION_ERROR");
  }
  const reason = trimText(input.reason, "Reason", {
    required: action === "return",
    max: 2000,
  });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    assertAssignedNavigator(order, userId);
    const wf = workflowOf(order);
    if (![WORKFLOW.FOLLOWUP_REPORT_SUBMITTED, WORKFLOW.PATIENT_FOLLOWUP].includes(wf)) {
      throw new HttpError(409, "No submitted follow-up report awaits Navigator review", "INVALID_STATE");
    }

    const { rows: followups } = await client.query(
      `SELECT * FROM tbl_diagnostic_advice_followups
        WHERE order_id = $1 AND status = 'SUBMITTED'
        ORDER BY submitted_at DESC NULLS LAST, created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [orderId]
    );
    if (!followups.length) {
      throw new HttpError(409, "No submitted follow-up report found", "FOLLOWUP_REQUIRED");
    }
    const followup = followups[0];

    if (action === "return") {
      await client.query(
        `UPDATE tbl_diagnostic_advice_followups
            SET status = 'RETURNED',
                returned_by = $2,
                returned_at = now(),
                return_reason = $3,
                updated_at = now()
          WHERE id = $1`,
        [followup.id, userId, reason]
      );
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.FOLLOWUP_RETURNED,
        userId,
        reason: reason || "Navigator returned incomplete follow-up report",
      });
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_FOLLOWUP_RETURNED",
        recipientUserId: order.assigned_health_worker_id || followup.health_worker_id,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_FOLLOWUP_RETURNED",
        title: "Follow-up report returned",
        message: `Navigator returned follow-up for order ${order.order_code}: ${reason}`,
        targetPath: `/health-worker/diagnostics/orders/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_FOLLOWUP_RETURNED:${followup.id}`,
      }).catch(() => {});
      await audit(req, {
        client,
        required: true,
        event: "DIAGNOSTIC_FOLLOWUP_RETURNED",
        resourceType: "diagnostic_followup",
        resourceId: followup.id,
        patientId: order.patient_id,
      });
    } else {
      await client.query(
        `UPDATE tbl_diagnostic_advice_followups
            SET status = 'FORWARDED',
                verified_by = $2,
                verified_at = now(),
                forwarded_to_specialist_by = $2,
                forwarded_to_specialist_at = now(),
                updated_at = now()
          WHERE id = $1`,
        [followup.id, userId]
      );
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.REASSESSMENT_PENDING,
        userId,
        reason: "Navigator forwarded verified follow-up to Specialist",
        extraSets: {
          followup_forwarded_to_specialist_by: userId,
          followup_forwarded_to_specialist_at: new Date(),
        },
      });
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST",
        recipientUserId: order.prescribed_by,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST",
        title: "Follow-up ready for reassessment",
        message: `Navigator forwarded follow-up for order ${order.order_code}.`,
        targetPath: `/specialist/diagnostics/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_FOLLOWUP_TO_SPECIALIST:${followup.id}`,
      }).catch(() => {});
      await audit(req, {
        client,
        required: true,
        event: "DIAGNOSTIC_FOLLOWUP_FORWARDED",
        resourceType: "diagnostic_followup",
        resourceId: followup.id,
        patientId: order.patient_id,
      });
    }

    return diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
  });
}

/**
 * Close open Specialist-owned care plans only after a real final review row exists.
 * Uses tbl_care_final_reviews columns from migration 026/036 — never invented columns.
 *
 * recoveryConfirmed must be an explicit Specialist checkbox (true / "true" only).
 * Without that confirmation, linked care plans stay open — we never invent CLOSE_RECOVERED.
 * Diagnostic-order closure can still proceed with other clinical closure reasons.
 */
async function bridgeCloseSpecialistCarePlans(client, {
  patientId,
  specialistId,
  userId,
  observations,
  clinicalAssessment,
  recoveryConfirmed,
}) {
  const explicitRecovery = recoveryConfirmed === true || recoveryConfirmed === "true";

  let rows;
  try {
    ({ rows } = await client.query(
      `SELECT id, status, screening_id, patient_id
         FROM tbl_care_plans
        WHERE patient_id = $1
          AND responsible_specialist_id = $2
          AND source = 'SPECIALIST'
          AND status NOT IN ('CLOSED', 'SUPERSEDED')
        FOR UPDATE`,
      [patientId, specialistId]
    ));
  } catch (error) {
    if (isUndefinedTable(error) || isUndefinedColumn(error)) {
      return {
        closed_plan_ids: [],
        left_open_plan_ids: [],
        skipped: true,
        recovery_recorded: false,
      };
    }
    throw error;
  }

  if (!rows.length) {
    return {
      closed_plan_ids: [],
      left_open_plan_ids: [],
      skipped: false,
      recovery_recorded: false,
    };
  }

  // Linked plans exist but Specialist did not explicitly confirm recovery —
  // leave them open; do not insert a fake final review.
  if (!explicitRecovery) {
    return {
      closed_plan_ids: [],
      left_open_plan_ids: rows.map((plan) => plan.id),
      skipped: false,
      recovery_recorded: false,
      message: "Linked Specialist care plans remain open until recovery is explicitly confirmed",
    };
  }

  const notes = trimText(observations, "Final review observations", { required: true, max: 4000 });
  const closedPlanIds = [];
  for (const plan of rows) {
    await client.query(
      `INSERT INTO tbl_care_final_reviews
         (plan_id, screening_id, patient_id, medical_officer_id, observations,
          clinical_assessment, recovery_confirmed, decision)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'CLOSE_RECOVERED')`,
      [
        plan.id,
        plan.screening_id,
        plan.patient_id,
        userId,
        notes,
        clinicalAssessment || null,
      ]
    );
    await client.query(
      `UPDATE tbl_care_plans
          SET status = 'CLOSED', closed_at = now(), closed_by = $2, updated_by = $2
        WHERE id = $1 AND status <> 'CLOSED'`,
      [plan.id, userId]
    );
    closedPlanIds.push(plan.id);
  }
  return {
    closed_plan_ids: closedPlanIds,
    left_open_plan_ids: [],
    skipped: false,
    recovery_recorded: true,
  };
}

async function ensureSignedVideoDecision(client, {
  referralId,
  patientId,
  specialistId,
  clinicalReason,
  instructions,
}) {
  const existing = await client.query(
    `SELECT id, decision_type, status
       FROM tbl_specialist_consultation_decisions
      WHERE referral_id = $1
      FOR UPDATE`,
    [referralId]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.status === "SIGNED" && row.decision_type === "VIDEO_CONSULTATION") {
      return row;
    }
    if (row.status === "SIGNED") {
      throw new HttpError(
        409,
        "A different signed consultation decision already exists for this referral",
        "DECISION_ALREADY_SIGNED"
      );
    }
    const { rows } = await client.query(
      `UPDATE tbl_specialist_consultation_decisions
          SET decision_type = 'VIDEO_CONSULTATION',
              status = 'SIGNED',
              clinical_reason = $2,
              instructions = $3,
              signed_by = $4,
              signed_at = now()
        WHERE id = $1 AND status = 'DRAFT'
        RETURNING id, decision_type, status`,
      [row.id, clinicalReason, instructions, specialistId]
    );
    if (!rows.length) {
      throw new HttpError(409, "A clinical decision has already been submitted for this referral", "DECISION_ALREADY_SIGNED");
    }
    return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO tbl_specialist_consultation_decisions
       (referral_id, patient_id, specialist_id, decision_type, status,
        clinical_reason, instructions, signed_by, signed_at)
     VALUES ($1, $2, $3, 'VIDEO_CONSULTATION', 'SIGNED', $4, $5, $3, now())
     RETURNING id, decision_type, status`,
    [referralId, patientId, specialistId, clinicalReason, instructions]
  );
  return rows[0];
}

async function createAvailabilityRequestForVideo(client, {
  referral,
  userId,
  requestedStart,
  requestedEnd,
}) {
  const start = new Date(requestedStart);
  const end = new Date(requestedEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new HttpError(400, "Provide valid requested start and end times", "VALIDATION_ERROR");
  }
  if (end <= start) {
    throw new HttpError(400, "The requested end time must be after the start time", "VALIDATION_ERROR");
  }
  if (start <= new Date()) {
    throw new HttpError(400, "Requested video window must be in the future", "VALIDATION_ERROR");
  }

  const active = await client.query(
    `SELECT id FROM tbl_specialist_availability_requests
      WHERE referral_id = $1
        AND status IN ('REQUESTED', 'FORWARDED', 'ACCEPTED', 'SUGGESTED', 'STAFF_REVIEW')
      LIMIT 1`,
    [referral.id]
  );
  if (active.rows.length) {
    throw new HttpError(409, "An active video consultation request already exists for this referral", "AVAILABILITY_REQUEST_EXISTS");
  }

  // STAFF_REVIEW keeps Hospital Staff as the next actor (same as navigator preferred path).
  // Never insert a CONFIRMED consultation here.
  const { rows } = await client.query(
    `INSERT INTO tbl_specialist_availability_requests
       (referral_id, patient_id, specialist_id, hospital_id, specialty_id,
        requested_by, requested_start, requested_end, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'STAFF_REVIEW')
     RETURNING id, referral_id, requested_start, requested_end, status`,
    [
      referral.id,
      referral.patient_id,
      referral.assigned_specialist_id || userId,
      referral.to_hospital_id,
      referral.specialty_id,
      userId,
      start.toISOString(),
      end.toISOString(),
    ]
  );
  const request = rows[0];

  const availabilityService = require("./specialistAvailabilityRequestService");
  const fanOut = await availabilityService.fanOutDiagnosticVideoAvailabilityNotifications(client, {
    referral,
    requestId: request.id,
    excludeUserId: userId,
  });

  return { ...request, notification_fan_out: fanOut };
}

async function reassessAfterFollowup(userId, roleName, req, orderId, input = {}) {
  assertRole(roleName, ["SPECIALIST"], "Only Specialist can reassess after follow-up");
  const decision = String(input.decision || "").toUpperCase();
  if (!Object.values(REASSESS_DECISIONS).includes(decision)) {
    throw new HttpError(400, "Invalid reassessment decision", "VALIDATION_ERROR");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client });
    const order = await loadOrderRow(client, orderId);
    if (order.prescribed_by !== userId) {
      throw new HttpError(403, "Only the requesting Specialist may reassess this case", "FORBIDDEN");
    }
    if (workflowOf(order) !== WORKFLOW.REASSESSMENT_PENDING) {
      throw new HttpError(409, "Order is not awaiting Specialist reassessment", "INVALID_STATE");
    }

    const currentAdvice = await loadCurrentAdvice(client, orderId, { forUpdate: true });
    if (!currentAdvice || currentAdvice.status !== "SIGNED") {
      throw new HttpError(409, "Signed advice is required before reassessment", "ADVICE_REQUIRED");
    }

    const navigatorId = order.assigned_navigator_id || order.care_navigator_id;
    let resultExtra = {};

    if (decision === REASSESS_DECISIONS.CONTINUE) {
      const followUpDueDate = input.follow_up_due_date || currentAdvice.follow_up_due_date;
      if (!followUpDueDate) {
        throw new HttpError(400, "Follow-up due date is required to continue advice", "VALIDATION_ERROR");
      }
      const fields = {
        findings: currentAdvice.findings,
        precautions: currentAdvice.precautions,
        treatmentAdvice: currentAdvice.treatment_advice,
        medicineName: currentAdvice.medicine_name,
        dosage: currentAdvice.dosage,
        durationText: currentAdvice.duration_text,
        followUp: trimText(input.follow_up_instructions, "Follow-up instructions", { max: 4000 })
          || currentAdvice.follow_up_instructions,
        reassessmentInstructions: trimText(
          input.reassessment_instructions,
          "Reassessment instructions",
          { max: 4000 }
        ) || currentAdvice.reassessment_instructions,
        additionalNeeded: false,
        additionalNotes: null,
        followUpRequired: true,
        followUpDueDate,
      };
      const advice = await insertSignedAdviceVersion(client, {
        orderId,
        patientId: order.patient_id,
        userId,
        fields,
        supersedesId: currentAdvice.id,
      });
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.FOLLOWUP_REQUIRED,
        userId,
        reason: "Specialist continued current advice with a new follow-up date",
      });
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_REASSESSMENT_ADVICE",
        recipientUserId: navigatorId,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_REASSESSMENT_ADVICE",
        title: "Specialist continued follow-up advice",
        message: `Specialist continued advice for order ${order.order_code}. Forward to Health Worker.`,
        targetPath: `/navigator/diagnostics/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_REASSESSMENT_CONTINUE:${advice.id}`,
      }).catch(() => {});
      resultExtra = { advice, decision };
    } else if (decision === REASSESS_DECISIONS.UPDATE) {
      const fields = parseAdviceFields({ ...input, follow_up_required: input.follow_up_required ?? true }, {
        requireFindings: true,
      });
      const advice = await insertSignedAdviceVersion(client, {
        orderId,
        patientId: order.patient_id,
        userId,
        fields,
        supersedesId: currentAdvice.id,
      });
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: fields.additionalNeeded
          ? WORKFLOW.ADDITIONAL_INFORMATION_REQUIRED
          : WORKFLOW.FOLLOWUP_REQUIRED,
        userId,
        reason: "Specialist updated advice after reassessment",
      });
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_REASSESSMENT_ADVICE",
        recipientUserId: navigatorId,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_REASSESSMENT_ADVICE",
        title: "Updated Specialist advice after reassessment",
        message: `Specialist updated advice for order ${order.order_code}. Forward to Health Worker.`,
        targetPath: `/navigator/diagnostics/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_REASSESSMENT_UPDATE:${advice.id}`,
      }).catch(() => {});
      resultExtra = { advice, decision };
    } else if (decision === REASSESS_DECISIONS.REQUEST_DIAGNOSTICS) {
      const notes = trimText(input.additional_diagnostics_notes || input.notes, "Diagnostics notes", {
        required: true,
        max: 2000,
      });
      const items = Array.isArray(input.items) ? input.items : [];
      if (!items.length) {
        throw new HttpError(400, "Select at least one diagnostic test", "VALIDATION_ERROR");
      }
      const facilityId = input.facility_id || order.facility_id;
      if (!facilityId) {
        throw new HttpError(400, "A facility is required for the additional diagnostic order", "VALIDATION_ERROR");
      }

      const created = await diagnosticOrderService.createOrder(
        userId,
        req,
        {
          patient_id: order.patient_id,
          facility_id: facilityId,
          referral_id: order.referral_id || null,
          notes,
          items,
          idempotency_key: input.idempotency_key || null,
          reassessment_source_order_id: orderId,
        },
        { client }
      );

      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.ADDITIONAL_INFORMATION_REQUIRED,
        userId,
        reason: notes,
      });
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_ADVICE_SIGNED",
        recipientUserId: navigatorId,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_ADDITIONAL_DIAGNOSTICS_REQUESTED",
        title: "Additional diagnostics requested",
        message: `Specialist created additional diagnostic order ${created.order?.order_code || created.order?.id} from ${order.order_code}.`,
        targetPath: `/navigator/diagnostics/${created.order?.id || orderId}`,
        orderId: created.order?.id || orderId,
        dedupeKey: `DIAGNOSTIC_ADDITIONAL_DX:${orderId}:${created.order?.id}`,
      }).catch(() => {});
      resultExtra = {
        decision,
        created_order_id: created.order?.id || null,
        created_order_code: created.order?.order_code || null,
        created_order: created.order || null,
        patient_id: order.patient_id,
        notes,
      };
    } else if (decision === REASSESS_DECISIONS.REQUEST_VIDEO) {
      if (!(await hasConsent(client, order.patient_id, "TELECONSULT"))) {
        throw new HttpError(403, "The patient has no active TELECONSULT consent", "CONSENT_REQUIRED");
      }
      if (!order.referral_id) {
        throw new HttpError(409, "A linked referral is required before requesting video consultation", "REFERRAL_REQUIRED");
      }

      const videoNotes = trimText(input.notes, "Notes", { max: 2000 })
        || "Specialist requested video consultation after diagnostic follow-up";
      const { rows: referralRows } = await client.query(
        `SELECT id, patient_id, referral_code, to_hospital_id, specialty_id,
                assigned_specialist_id, assigned_navigator_id
           FROM tbl_referrals
          WHERE id = $1 AND patient_id = $2
          FOR UPDATE`,
        [order.referral_id, order.patient_id]
      );
      if (!referralRows.length) {
        throw new HttpError(404, "Linked referral was not found", "REFERRAL_NOT_FOUND");
      }
      const referral = referralRows[0];

      const decisionRow = await ensureSignedVideoDecision(client, {
        referralId: referral.id,
        patientId: order.patient_id,
        specialistId: userId,
        clinicalReason: videoNotes,
        instructions: videoNotes,
      });

      try {
        await client.query(
          `UPDATE tbl_diagnostic_orders SET video_decision_id = $2 WHERE id = $1`,
          [orderId, decisionRow.id]
        );
      } catch (colError) {
        if (!(colError && (colError.code === "42703"
            || /column .* does not exist/i.test(colError.message || "")))) {
          throw colError;
        }
      }

      const slotId = input.slot_id ? requireUuid(input.slot_id, "Invalid consultation slot ID") : null;
      let videoConsultation = null;
      let availabilityRequest = null;
      let bookingPath = null;

      if (slotId) {
        // Path A: published Specialist slot → consultation stays REQUESTED for Hospital Staff confirmation.
        const specialistService = require("./specialistService");
        videoConsultation = await specialistService.createConsultationForReferral(
          client,
          userId,
          req,
          referral,
          slotId
        );
        bookingPath = "PUBLISHED_SLOT";
      } else if (input.requested_start && input.requested_end) {
        // Path B: no suitable slot → availability request → Specialist response → HS final confirm.
        availabilityRequest = await createAvailabilityRequestForVideo(client, {
          referral,
          userId,
          requestedStart: input.requested_start,
          requestedEnd: input.requested_end,
        });
        bookingPath = "AVAILABILITY_REQUEST";
      } else {
        throw new HttpError(
          400,
          "Select a published video slot, or provide a requested start and end window",
          "VIDEO_BOOKING_PATH_REQUIRED"
        );
      }

      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.VIDEO_CONSULTATION_REQUESTED,
        userId,
        reason: videoNotes,
      });
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_ADVICE_SIGNED",
        recipientUserId: navigatorId,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_VIDEO_CONSULTATION_REQUESTED",
        title: "Video consultation requested",
        message: `Specialist requested video consultation for order ${order.order_code}.`,
        targetPath: `/navigator/diagnostics/${orderId}`,
        orderId,
        dedupeKey: `DIAGNOSTIC_VIDEO_REQ:${orderId}:${decisionRow.id}`,
      }).catch(() => {});
      resultExtra = {
        decision,
        video_decision_id: decisionRow.id,
        video_consultation_id: videoConsultation?.consultation_id || null,
        availability_request_id: availabilityRequest?.id || null,
        booking_path: bookingPath,
        patient_id: order.patient_id,
      };
    } else if (decision === REASSESS_DECISIONS.CLOSE) {
      const closureReason = trimText(input.closure_reason || input.reason, "Closure reason", {
        required: true,
        max: 4000,
      });
      const finalAssessment = trimText(input.final_assessment || input.findings, "Final assessment", {
        required: true,
        max: 4000,
      });
      const fields = {
        findings: finalAssessment,
        precautions: currentAdvice.precautions,
        treatmentAdvice: currentAdvice.treatment_advice,
        medicineName: currentAdvice.medicine_name,
        dosage: currentAdvice.dosage,
        durationText: currentAdvice.duration_text,
        followUp: currentAdvice.follow_up_instructions,
        reassessmentInstructions: null,
        additionalNeeded: false,
        additionalNotes: null,
        followUpRequired: false,
        followUpDueDate: null,
      };
      const advice = await insertSignedAdviceVersion(client, {
        orderId,
        patientId: order.patient_id,
        userId,
        fields,
        supersedesId: currentAdvice.id,
        closureReason,
      });
      await setWorkflowStatus(client, {
        orderId,
        fromStatusId: order.status_id,
        workflowStatus: WORKFLOW.CLOSED,
        userId,
        reason: closureReason,
        extraSets: {
          case_closed_by: userId,
          case_closed_at: new Date(),
          case_closure_reason: closureReason,
        },
      });
      // Only explicit Specialist checkbox values count as recovery confirmation.
      const recoveryConfirmed = input.recovery_confirmed === true
        || input.recovery_confirmed === "true";
      const careBridge = await bridgeCloseSpecialistCarePlans(client, {
        patientId: order.patient_id,
        specialistId: userId,
        userId,
        observations: finalAssessment,
        clinicalAssessment: closureReason,
        recoveryConfirmed,
      });
      for (const recipient of [navigatorId, order.assigned_health_worker_id]) {
        await notifyOnce(client, {
          templateCode: "DIAGNOSTIC_CASE_CLOSED",
          recipientUserId: recipient,
          patientId: order.patient_id,
          event: "DIAGNOSTIC_CASE_CLOSED",
          title: "Diagnostic follow-up case closed",
          message: `Specialist closed follow-up for order ${order.order_code}.`,
          targetPath: roleName === "NAVIGATOR"
            ? `/navigator/diagnostics/${orderId}`
            : `/health-worker/diagnostics/orders/${orderId}`,
          orderId,
          dedupeKey: `DIAGNOSTIC_CASE_CLOSED:${orderId}:${recipient}`,
        }).catch(() => {});
      }
      resultExtra = {
        advice,
        decision,
        closed: true,
        recovery_confirmed: recoveryConfirmed,
        care_plans_closed: careBridge.closed_plan_ids || [],
        care_plans_left_open: careBridge.left_open_plan_ids || [],
        care_recovery_recorded: Boolean(careBridge.recovery_recorded),
      };
    }

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_REASSESSMENT",
      resourceType: "diagnostic_order",
      resourceId: orderId,
      patientId: order.patient_id,
      metadata: { decision },
    });

    return {
      ...(await diagnosticOrderService.getOrderForUser(userId, roleName, orderId, { client })),
      ...resultExtra,
    };
  });
}

async function notifyFollowupDueForOrder(client, order) {
  const advice = await loadCurrentAdvice(client, order.id);
  if (!advice || !advice.follow_up_required || !advice.follow_up_due_date) return null;
  if (![
    WORKFLOW.SENT_TO_HEALTH_WORKER,
    WORKFLOW.PATIENT_FOLLOWUP,
    WORKFLOW.FOLLOWUP_REQUIRED,
    WORKFLOW.FOLLOWUP_RETURNED,
  ].includes(workflowOf(order))) {
    return null;
  }
  const due = new Date(advice.follow_up_due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.getTime()) || due > today) {
    return {
      follow_up_due: false,
      follow_up_overdue: false,
      follow_up_due_date: advice.follow_up_due_date,
    };
  }
  const overdue = due < today;
  const dayKey = advice.follow_up_due_date;
  const templateCode = overdue ? "DIAGNOSTIC_FOLLOWUP_OVERDUE" : "DIAGNOSTIC_FOLLOWUP_DUE";
  const event = overdue ? "DIAGNOSTIC_FOLLOWUP_OVERDUE" : "DIAGNOSTIC_FOLLOWUP_DUE";
  const title = overdue ? "Patient follow-up overdue" : "Patient follow-up due";
  const message = overdue
    ? `Follow-up for order ${order.order_code} is overdue.`
    : `Follow-up for order ${order.order_code} is due.`;
  for (const recipient of [
    order.assigned_health_worker_id,
    order.assigned_navigator_id || order.care_navigator_id,
  ]) {
    await notifyOnce(client, {
      templateCode,
      recipientUserId: recipient,
      patientId: order.patient_id,
      event,
      title,
      message,
      targetPath: `/health-worker/diagnostics/orders/${order.id}`,
      orderId: order.id,
      dedupeKey: `${event}:${order.id}:${dayKey}:${recipient}`,
    }).catch(() => {});
  }
  return {
    follow_up_due: !overdue,
    follow_up_overdue: overdue,
    follow_up_due_date: advice.follow_up_due_date,
  };
}

/**
 * Background due/overdue scan.
 * - Lock and unlock always use the same dedicated pool connection.
 * - Connection is always released in finally.
 * - One order notify failure does not stop the rest of the scan or future scans.
 * - Never updates clinical workflow statuses.
 */
async function scanDueFollowupNotifications() {
  let client = null;
  let locked = false;
  try {
    client = await pool.connect();
    const lock = await client.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [FOLLOWUP_DUE_ADVISORY_LOCK_KEY]
    );
    locked = Boolean(lock.rows[0]?.acquired);
    if (!locked) {
      return { skipped: true, scanned: 0, notified: 0, lock_held_elsewhere: true };
    }

    let orders = [];
    try {
      const { rows } = await client.query(
        `SELECT diagnostic_order.id,
                diagnostic_order.order_code,
                diagnostic_order.patient_id,
                diagnostic_order.assigned_health_worker_id,
                diagnostic_order.assigned_navigator_id,
                diagnostic_order.care_navigator_id,
                diagnostic_order.workflow_status
           FROM tbl_diagnostic_orders diagnostic_order
           JOIN tbl_diagnostic_advice advice
             ON advice.order_id = diagnostic_order.id
            AND advice.is_current IS TRUE
            AND advice.status = 'SIGNED'
          WHERE advice.follow_up_required IS TRUE
            AND advice.follow_up_due_date IS NOT NULL
            AND advice.follow_up_due_date::date <= CURRENT_DATE
            AND diagnostic_order.workflow_status = ANY($1::text[])
          ORDER BY advice.follow_up_due_date ASC, diagnostic_order.id
          LIMIT 200`,
        [[
          WORKFLOW.SENT_TO_HEALTH_WORKER,
          WORKFLOW.PATIENT_FOLLOWUP,
          WORKFLOW.FOLLOWUP_REQUIRED,
          WORKFLOW.FOLLOWUP_RETURNED,
        ]]
      );
      orders = rows;
    } catch (error) {
      if (isUndefinedTable(error) || isUndefinedColumn(error)) {
        return { skipped: false, scanned: 0, notified: 0, unavailable: true };
      }
      throw error;
    }

    let notified = 0;
    for (const order of orders) {
      try {
        // notifyFollowupDueForOrder only inserts notifications — never UPDATE workflow_status.
        const flags = await notifyFollowupDueForOrder(client, order);
        if (flags && (flags.follow_up_due || flags.follow_up_overdue)) {
          notified += 1;
        }
      } catch (notifyError) {
        console.error(
          `Follow-up due notify failed for order ${order.id}:`,
          notifyError.message
        );
      }
    }
    return { skipped: false, scanned: orders.length, notified };
  } finally {
    // Unlock and release on the same dedicated connection that acquired the lock.
    if (client) {
      if (locked) {
        try {
          await client.query(
            "SELECT pg_advisory_unlock($1)",
            [FOLLOWUP_DUE_ADVISORY_LOCK_KEY]
          );
        } catch (unlockError) {
          console.error("Follow-up due scan unlock failed:", unlockError.message);
        }
      }
      try {
        client.release();
      } catch (releaseError) {
        console.error("Follow-up due scan connection release failed:", releaseError.message);
      }
    }
  }
}

module.exports = {
  WORKFLOW,
  REASSESS_DECISIONS,
  FOLLOWUP_DUE_ADVISORY_LOCK_KEY,
  listEligibleHealthWorkers,
  assignHealthWorker,
  startCollection,
  markReportUploaded,
  verifyReports,
  forwardToHospitalStaff,
  routeToSpecialist,
  saveAdviceDraft,
  signAdvice,
  forwardAdviceToHealthWorker,
  recordPatientFollowup,
  verifyFollowupReport,
  reassessAfterFollowup,
  notifyFollowupDueForOrder,
  scanDueFollowupNotifications,
  loadCurrentAdvice,
  bridgeCloseSpecialistCarePlans,
  createAvailabilityRequestForVideo,
};
