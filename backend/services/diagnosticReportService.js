const crypto = require("crypto");
const path = require("path");
const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const privateImageStorage = require("./privateImageStorage");
const {
  requireUuid,
  setActor,
  withTransaction,
} = require("./medicalOfficer/scope");
const {
  buildRequiredDocuments,
  parseDocumentCategory,
  DOC_CATEGORY_PREFIX,
} = require("./diagnosticOrderService");

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_SUBMISSION = 20;
const CATEGORY_CODE_RE = /^[A-Z0-9_]{2,80}$/;

function requireMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new HttpError(400, "Upload a PDF, JPG, or PNG report", "INVALID_FILE_TYPE");
  }
  return mime;
}

function extensionForMime(mime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  return "jpg";
}

function detectContentMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer.slice(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

function assertFileContent(file, declaredMime) {
  const detected = detectContentMime(file.buffer);
  if (!detected) {
    throw new HttpError(
      400,
      `File content for "${file.originalname || "report"}" is not a valid PDF, JPG, or PNG`,
      "INVALID_FILE_CONTENT"
    );
  }
  if (detected !== declaredMime) {
    throw new HttpError(
      400,
      `File content for "${file.originalname || "report"}" does not match its type`,
      "INVALID_FILE_CONTENT"
    );
  }
  return detected;
}

function normalizeCategory(value, fallback = "GENERAL_REPORT") {
  const raw = String(value || fallback).trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!CATEGORY_CODE_RE.test(raw)) {
    throw new HttpError(400, "Invalid document category", "INVALID_DOCUMENT_CATEGORY");
  }
  return raw;
}

function encodeCategoryNotes(category, notes) {
  const prefix = `[DOC:${category}]`;
  const text = typeof notes === "string" ? notes.trim() : "";
  return text ? `${prefix} ${text}`.slice(0, 4000) : prefix;
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
      WHERE template.code = $1
        AND template.channel = 'IN_APP'
        AND template.is_active IS TRUE
      ORDER BY (language.code = 'en') DESC, template.id
      LIMIT 1`,
    [code]
  );
  if (!rows.length) {
    const fallback = await client.query(
      `SELECT template.id, template.language_id
         FROM mst_notification_templates template
         JOIN mst_languages language ON language.id = template.language_id
        WHERE template.code = 'APPT_REMINDER'
          AND template.channel = 'IN_APP'
          AND template.is_active IS TRUE
        ORDER BY (language.code = 'en') DESC, template.id
        LIMIT 1`
    );
    if (!fallback.rows.length) {
      throw new HttpError(500, "In-app notification template is not configured", "CONFIGURATION_ERROR");
    }
    return fallback.rows[0];
  }
  return rows[0];
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
  reportId,
  dedupeKey,
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
  const template = await loadTemplate(client, templateCode);
  const payload = {
    event,
    title,
    message,
    target_path: targetPath,
    diagnostic_order_id: orderId,
    report_id: reportId,
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

async function assertOrderAccess(client, userId, roleName, orderId) {
  requireUuid(orderId, "Invalid diagnostic order ID");
  const params = [userId, orderId];
  let scopeSql = "AND fn_user_has_patient_access($1, diagnostic_order.patient_id)";

  if (roleName === "NAVIGATOR") {
    scopeSql = `AND (
      referral.assigned_navigator_id = $1
      OR EXISTS (
        SELECT 1 FROM tbl_referrals open_referral
         WHERE open_referral.patient_id = diagnostic_order.patient_id
           AND open_referral.assigned_navigator_id = $1
      )
      OR EXISTS (
        SELECT 1 FROM tbl_care_plans plan
         WHERE plan.patient_id = diagnostic_order.patient_id
           AND plan.assigned_navigator_id = $1
           AND plan.status NOT IN ('CLOSED', 'SUPERSEDED')
      )
    )`;
  } else if (roleName === "MEDICAL_OFFICER") {
    scopeSql = `AND (
      diagnostic_order.prescribed_by = $1
      OR EXISTS (
        SELECT 1 FROM tbl_care_plans plan
         WHERE plan.patient_id = diagnostic_order.patient_id
           AND plan.responsible_mo_id = $1
           AND plan.status NOT IN ('CLOSED', 'SUPERSEDED')
      )
    )`;
  } else if (roleName === "SPECIALIST") {
    scopeSql = `AND (
      diagnostic_order.prescribed_by = $1
      OR EXISTS (
        SELECT 1 FROM tbl_case_assignments assignment
         WHERE assignment.patient_id = diagnostic_order.patient_id
           AND assignment.user_id = $1
           AND assignment.valid_from <= now()
           AND (assignment.valid_to IS NULL OR assignment.valid_to > now())
      )
      OR EXISTS (
        SELECT 1 FROM tbl_referrals linked_referral
         WHERE linked_referral.id = diagnostic_order.referral_id
           AND linked_referral.assigned_specialist_id = $1
      )
    )`;
  } else if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND (
      patient.registered_by = $1
      OR fn_user_has_patient_access($1, diagnostic_order.patient_id)
      OR EXISTS (
        SELECT 1 FROM tbl_diagnostic_appointments appointment
         WHERE appointment.diagnostic_order_id = diagnostic_order.id
           AND patient.registered_by = $1
      )
      OR EXISTS (
        SELECT 1 FROM tbl_care_followup_schedules schedule
         WHERE schedule.patient_id = diagnostic_order.patient_id
           AND schedule.assigned_hw_id = $1
      )
    )`;
    // Migration 039 may add assigned_health_worker_id. Probe with a SAVEPOINT so a
    // missing column does not abort the outer transaction (PostgreSQL 25P02).
    await client.query("SAVEPOINT hw_assigned_column_probe");
    try {
      await client.query("SELECT assigned_health_worker_id FROM tbl_diagnostic_orders LIMIT 0");
      await client.query("RELEASE SAVEPOINT hw_assigned_column_probe");
      scopeSql = `AND (
        diagnostic_order.assigned_health_worker_id = $1
        OR patient.registered_by = $1
        OR fn_user_has_patient_access($1, diagnostic_order.patient_id)
        OR EXISTS (
          SELECT 1 FROM tbl_diagnostic_appointments appointment
           WHERE appointment.diagnostic_order_id = diagnostic_order.id
             AND patient.registered_by = $1
        )
        OR EXISTS (
          SELECT 1 FROM tbl_care_followup_schedules schedule
           WHERE schedule.patient_id = diagnostic_order.patient_id
             AND schedule.assigned_hw_id = $1
        )
      )`;
    } catch (_error) {
      await client.query("ROLLBACK TO SAVEPOINT hw_assigned_column_probe").catch(() => {});
      // Column absent until migration 039 is applied — keep the legacy scope.
    }
  } else if (roleName === "HOSPITAL_STAFF") {
    scopeSql = `AND (
      EXISTS (
        SELECT 1 FROM tbl_user_facility_assignments assignment
         WHERE assignment.user_id = $1
           AND assignment.facility_id = diagnostic_order.facility_id
           AND assignment.valid_from <= CURRENT_DATE
           AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
      )
      OR fn_user_has_patient_access($1, diagnostic_order.patient_id)
    )`;
  } else if (!["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(roleName)) {
    throw new HttpError(403, "You cannot access this diagnostic order", "FORBIDDEN");
  }

  const { rows } = await client.query(
    `SELECT diagnostic_order.id, diagnostic_order.patient_id, diagnostic_order.order_code,
            diagnostic_order.prescribed_by, diagnostic_order.status_id,
            status.code AS status_code, patient.patient_code,
            referral.assigned_navigator_id,
            role.code AS prescribed_by_role,
            (
              SELECT plan.assigned_navigator_id
                FROM tbl_care_plans plan
               WHERE plan.patient_id = diagnostic_order.patient_id
                 AND plan.assigned_navigator_id IS NOT NULL
                 AND plan.status NOT IN ('CLOSED', 'SUPERSEDED')
               ORDER BY plan.updated_at DESC
               LIMIT 1
            ) AS care_navigator_id
       FROM tbl_diagnostic_orders diagnostic_order
       JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
       JOIN tbl_patients patient ON patient.id = diagnostic_order.patient_id
       LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
       LEFT JOIN tbl_users clinician ON clinician.id = diagnostic_order.prescribed_by
       LEFT JOIN mst_roles role ON role.id = clinician.role_id
      WHERE diagnostic_order.id = $2
        ${scopeSql}`,
    params
  );
  if (!rows.length) {
    throw new HttpError(404, "Diagnostic order not found", "NOT_FOUND");
  }
  return rows[0];
}

async function loadOrderItems(client, orderId) {
  const { rows } = await client.query(
    `SELECT item.id, item.test_id, item.clinical_reason, item.priority,
            test.code AS test_code, test.name_en AS test_name,
            category.code AS category_code, category.name_en AS category_name
       FROM tbl_diagnostic_order_items item
       JOIN mst_diagnostic_tests test ON test.id = item.test_id
       JOIN mst_diagnostic_categories category ON category.id = test.category_id
      WHERE item.order_id = $1
      ORDER BY category.sort_order, test.name_en`,
    [orderId]
  );
  return rows;
}

function publicReport(row) {
  const category = row.document_category || parseDocumentCategory(row.clinical_notes);
  const notes = category
    ? String(row.clinical_notes || "").replace(DOC_CATEGORY_PREFIX, "").trim() || null
    : row.clinical_notes;
  return {
    id: row.id,
    order_id: row.order_id,
    patient_id: row.patient_id,
    mime_type: row.mime_type,
    original_filename: row.original_filename,
    file_size_bytes: row.file_size_bytes,
    uploaded_by: row.uploaded_by,
    uploaded_by_name: row.uploaded_by_name || null,
    review_status: row.review_status,
    reviewed_by: row.reviewed_by,
    reviewed_by_name: row.reviewed_by_name || null,
    reviewed_at: row.reviewed_at,
    clinical_notes: notes,
    document_category: category,
    created_at: row.created_at,
    reused: Boolean(row.reused),
  };
}

function validateIncomingFile(file) {
  if (!file || !file.buffer) {
    throw new HttpError(400, "Report file is required", "FILE_REQUIRED");
  }
  if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
    throw new HttpError(400, "Report file must be 10 MB or smaller", "FILE_TOO_LARGE");
  }
  const mime = requireMime(file.mimetype);
  assertFileContent(file, mime);
  return mime;
}

function parseCategoriesPayload(req, fileCount) {
  const body = req.body || {};
  let categories = [];
  if (Array.isArray(body.document_categories)) {
    categories = body.document_categories;
  } else if (typeof body.document_categories === "string" && body.document_categories.trim()) {
    try {
      const parsed = JSON.parse(body.document_categories);
      categories = Array.isArray(parsed) ? parsed : [parsed];
    } catch (_error) {
      categories = body.document_categories.split(",").map((part) => part.trim());
    }
  } else if (body.document_category) {
    categories = Array.isArray(body.document_category)
      ? body.document_category
      : [body.document_category];
  }

  if (!categories.length && fileCount > 0) {
    categories = Array.from({ length: fileCount }, () => "GENERAL_REPORT");
  }
  if (categories.length !== fileCount) {
    throw new HttpError(
      400,
      "Provide one document category for each uploaded file",
      "DOCUMENT_CATEGORY_MISMATCH"
    );
  }
  return categories.map((value) => normalizeCategory(value));
}

async function listExistingReports(client, orderId) {
  const { rows } = await client.query(
    `SELECT report.id, report.order_id, report.patient_id, report.mime_type,
            report.original_filename, report.file_size_bytes, report.uploaded_by,
            report.review_status, report.reviewed_by, report.reviewed_at,
            report.clinical_notes, report.created_at, report.checksum_sha256,
            uploader.full_name AS uploaded_by_name
       FROM tbl_diagnostic_order_reports report
       JOIN tbl_users uploader ON uploader.id = report.uploaded_by
      WHERE report.order_id = $1
      ORDER BY report.created_at DESC`,
    [orderId]
  );
  return rows;
}

function requirementsSatisfied(requiredDocuments, reports) {
  const counts = {};
  for (const report of reports) {
    const category = report.document_category || parseDocumentCategory(report.clinical_notes);
    if (!category) continue;
    counts[category] = (counts[category] || 0) + 1;
  }
  const missing = [];
  for (const requirement of requiredDocuments) {
    const have = counts[requirement.code] || 0;
    if (have < (requirement.min_files || 1)) {
      missing.push({
        code: requirement.code,
        label: requirement.label,
        required: requirement.min_files || 1,
        uploaded: have,
      });
    }
  }
  return { ok: missing.length === 0, missing, counts };
}

async function persistSingleReport(client, {
  userId,
  order,
  file,
  category,
  notes,
}) {
  const mime = validateIncomingFile(file);
  const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const originalFilename = path.basename(String(file.originalname || "report")).slice(0, 200);

  const existing = await client.query(
    `SELECT report.id, report.order_id, report.patient_id, report.mime_type,
            report.original_filename, report.file_size_bytes, report.uploaded_by,
            report.review_status, report.reviewed_by, report.reviewed_at,
            report.clinical_notes, report.created_at
       FROM tbl_diagnostic_order_reports report
      WHERE report.order_id = $1
        AND report.checksum_sha256 = $2
      LIMIT 1`,
    [order.id, checksum]
  );
  if (existing.rows.length) {
    return { report: publicReport({ ...existing.rows[0], reused: true }), reused: true };
  }

  const reportId = crypto.randomUUID();
  const objectKey = `diagnostic-reports/${order.id}/${reportId}.${extensionForMime(mime)}`;

  await privateImageStorage.uploadBuffer(objectKey, file.buffer, mime, { upsert: false });

  try {
    const inserted = await client.query(
      `INSERT INTO tbl_diagnostic_order_reports
         (id, order_id, patient_id, report_key, checksum_sha256, mime_type,
          original_filename, file_size_bytes, uploaded_by, clinical_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, order_id, patient_id, mime_type, original_filename, file_size_bytes,
                 uploaded_by, review_status, reviewed_by, reviewed_at, clinical_notes, created_at`,
      [
        reportId,
        order.id,
        order.patient_id,
        objectKey,
        checksum,
        mime,
        originalFilename,
        file.buffer.length,
        userId,
        encodeCategoryNotes(category, notes),
      ]
    );
    return {
      report: publicReport({ ...inserted.rows[0], document_category: category }),
      reused: false,
      objectKey,
    };
  } catch (error) {
    try {
      await privateImageStorage.deleteObject(objectKey);
    } catch (_cleanupError) {
      // Best-effort cleanup if DB insert fails after storage upload.
    }
    throw error;
  }
}

async function finalizeUploadIfComplete(client, {
  userId,
  req,
  order,
  requiredDocuments,
  reports,
  newlyUploadedIds,
}) {
  // Never treat "no required docs loaded" as complete — that falsely notifies Navigator.
  if (!requiredDocuments?.length) {
    return {
      requirements_met: false,
      missing_requirements: [],
      workflow_advanced: false,
    };
  }

  const satisfaction = requirementsSatisfied(requiredDocuments, reports);
  if (!satisfaction.ok) {
    return {
      requirements_met: false,
      missing_requirements: satisfaction.missing,
      workflow_advanced: false,
    };
  }

  const workflow = require("./diagnosticWorkflowService");
  await workflow.markReportUploaded(client, order, userId);

  const navigatorId = order.assigned_navigator_id || order.care_navigator_id;
  const batchKey = newlyUploadedIds.slice().sort().join(",") || crypto.randomUUID();
  await notifyOnce(client, {
    templateCode: "DIAGNOSTIC_REPORT_UPLOADED",
    recipientUserId: navigatorId,
    patientId: order.patient_id,
    event: "DIAGNOSTIC_REPORT_UPLOADED",
    title: "Diagnostic report uploaded",
    message: `Reports uploaded for order ${order.order_code}. Verify before forwarding to Hospital Staff.`,
    targetPath: `/navigator/diagnostics/${order.id}`,
    orderId: order.id,
    reportId: newlyUploadedIds[0] || null,
    dedupeKey: `DIAGNOSTIC_REPORT_UPLOADED:${order.id}:${batchKey}:nav`,
  });

  await audit(req, {
    client,
    event: "DIAGNOSTIC_REPORT_UPLOADED",
    outcome: "SUCCESS",
    resourceType: "diagnostic_order_report",
    resourceId: newlyUploadedIds[0] || order.id,
    patientId: order.patient_id,
    metadata: {
      order_id: order.id,
      report_ids: newlyUploadedIds,
      file_count: newlyUploadedIds.length,
    },
  });

  return {
    requirements_met: true,
    missing_requirements: [],
    workflow_advanced: true,
  };
}

async function listReports(userId, roleName, orderId) {
  return withTransaction(pool, async (client) => {
    await assertOrderAccess(client, userId, roleName, orderId);
    const rows = await listExistingReports(client, orderId);
    return { reports: rows.map(publicReport) };
  });
}

async function uploadReport(userId, roleName, req, orderId, file) {
  const category = normalizeCategory(req.body?.document_category || "GENERAL_REPORT");
  const result = await uploadReports(
    userId,
    roleName,
    req,
    orderId,
    file ? [file] : [],
    [category]
  );
  return {
    ...result,
    report: result.reports?.[0] || null,
  };
}

async function uploadReports(userId, roleName, req, orderId, files = [], categoriesInput) {
  const fileList = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!fileList.length) {
    throw new HttpError(400, "At least one report file is required", "FILE_REQUIRED");
  }
  if (fileList.length > MAX_FILES_PER_SUBMISSION) {
    throw new HttpError(
      400,
      `Upload at most ${MAX_FILES_PER_SUBMISSION} files per submission`,
      "TOO_MANY_FILES"
    );
  }

  const categories = categoriesInput && categoriesInput.length
    ? categoriesInput.map((value) => normalizeCategory(value))
    : parseCategoriesPayload(req, fileList.length);

  if (categories.length !== fileList.length) {
    throw new HttpError(
      400,
      "Provide one document category for each uploaded file",
      "DOCUMENT_CATEGORY_MISMATCH"
    );
  }

  // Pre-validate all files before any storage write so selection can be corrected.
  for (const file of fileList) {
    validateIncomingFile(file);
  }

  const uploaded = [];
  const failed = [];
  let orderSnapshot = null;
  let requiredDocuments = [];
  let requirementsMet = false;
  let missingRequirements = [];
  let workflowAdvanced = false;

  for (let index = 0; index < fileList.length; index += 1) {
    const file = fileList[index];
    let category = categories[index];
    try {
      // Each file uses its own transaction so partial success is durable.
      // eslint-disable-next-line no-await-in-loop
      const result = await withTransaction(pool, async (client) => {
        await setActor(client, userId);
        const order = await assertOrderAccess(client, userId, roleName, orderId);
        orderSnapshot = order;
        if (["CANCELLED", "CLINICIAN_REVIEWED"].includes(order.status_code)) {
          throw new HttpError(409, "This diagnostic order cannot accept new reports", "INVALID_STATE");
        }
        if (!requiredDocuments.length) {
          const items = await loadOrderItems(client, order.id);
          requiredDocuments = buildRequiredDocuments(items);
        }
        const allowedCodes = new Set(requiredDocuments.map((item) => item.code));
        allowedCodes.add("GENERAL_REPORT");
        let resolvedCategory = category;
        if (resolvedCategory === "GENERAL_REPORT" && requiredDocuments.length) {
          const existing = (await listExistingReports(client, order.id)).map(publicReport);
          const satisfaction = requirementsSatisfied(requiredDocuments, existing);
          resolvedCategory = satisfaction.missing[0]?.code || requiredDocuments[0].code;
        }
        if (!allowedCodes.has(resolvedCategory) && requiredDocuments.length) {
          throw new HttpError(
            400,
            `Document category ${resolvedCategory} is not part of this Specialist request`,
            "INVALID_DOCUMENT_CATEGORY"
          );
        }
        category = resolvedCategory;

        return persistSingleReport(client, {
          userId,
          order,
          file,
          category: resolvedCategory,
          notes: req.body?.notes || null,
        });
      });
      uploaded.push({
        ...result.report,
        document_category: category,
        index,
        reused: result.reused,
      });
    } catch (error) {
      failed.push({
        index,
        filename: file.originalname || `file_${index + 1}`,
        document_category: category,
        status: error.status || 400,
        code: error.code || "UPLOAD_FAILED",
        message: error.message || "Upload failed",
      });
    }
  }

  if (!orderSnapshot) {
    // All files failed before access check completed; surface first failure.
    const first = failed[0];
    throw new HttpError(
      first?.status || 400,
      first?.message || "Upload failed",
      first?.code || "UPLOAD_FAILED"
    );
  }

  await withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const order = await assertOrderAccess(client, userId, roleName, orderId);
    orderSnapshot = order;
    const items = await loadOrderItems(client, order.id);
    requiredDocuments = buildRequiredDocuments(items);
    const existing = await listExistingReports(client, order.id);
    const allReports = existing.map(publicReport);
    const newlyUploadedIds = uploaded.filter((row) => !row.reused).map((row) => row.id);

    if (failed.length === 0) {
      const finalize = await finalizeUploadIfComplete(client, {
        userId,
        req,
        order,
        requiredDocuments,
        reports: allReports,
        newlyUploadedIds: newlyUploadedIds.length ? newlyUploadedIds : uploaded.map((row) => row.id),
      });
      requirementsMet = finalize.requirements_met;
      missingRequirements = finalize.missing_requirements;
      workflowAdvanced = finalize.workflow_advanced;
    } else {
      const satisfaction = requirementsSatisfied(requiredDocuments, allReports);
      requirementsMet = satisfaction.ok;
      missingRequirements = satisfaction.missing;
      workflowAdvanced = false;
    }
  });

  const response = {
    reports: uploaded,
    failed,
    required_documents: requiredDocuments,
    requirements_met: requirementsMet,
    missing_requirements: missingRequirements,
    workflow_advanced: workflowAdvanced,
    partial: failed.length > 0,
  };

  if (failed.length && !uploaded.length) {
    throw new HttpError(400, failed[0].message, failed[0].code || "UPLOAD_FAILED");
  }

  if (failed.length) {
    return {
      ...response,
      message: "Some diagnostic reports failed to upload. Successful files were kept; retry the failed ones.",
    };
  }

  if (!requirementsMet) {
    return {
      ...response,
      message: "Files saved. Upload remaining required documents before the request is marked complete.",
    };
  }

  return {
    ...response,
    message: "Diagnostic reports uploaded. Navigator was notified for verification.",
  };
}

async function getReportFile(userId, roleName, req, orderId, reportId) {
  requireUuid(reportId, "Invalid report ID");
  return withTransaction(pool, async (client) => {
    const order = await assertOrderAccess(client, userId, roleName, orderId);
    const { rows } = await client.query(
      `SELECT id, report_key, mime_type
         FROM tbl_diagnostic_order_reports
        WHERE id = $1 AND order_id = $2 AND patient_id = $3`,
      [reportId, orderId, order.patient_id]
    );
    if (!rows.length) {
      throw new HttpError(404, "Diagnostic report not found", "REPORT_NOT_FOUND");
    }
    const file = await privateImageStorage.getFile(rows[0].report_key);
    await audit(req, {
      event: "DIAGNOSTIC_REPORT_VIEWED",
      outcome: "SUCCESS",
      resourceType: "diagnostic_order_report",
      resourceId: reportId,
      patientId: order.patient_id,
      required: true,
      metadata: { order_id: orderId },
    });
    return { ...file, mimeType: rows[0].mime_type };
  });
}

/**
 * Re-tag a pending/returned report's document category (clinical_notes [DOC:…] prefix).
 * Used when HW uploaded under the wrong test type so Navigator verify can succeed.
 */
async function updateReportCategory(userId, roleName, req, orderId, reportId, input = {}) {
  requireUuid(reportId, "Invalid report ID");
  if (!["HEALTH_WORKER", "HOSPITAL_STAFF", "SYSTEM_ADMIN", "SUPER_ADMIN"].includes(roleName)) {
    throw new HttpError(
      403,
      "Only Health Worker or Hospital Staff can change report categories",
      "FORBIDDEN"
    );
  }
  const category = normalizeCategory(input.document_category);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const order = await assertOrderAccess(client, userId, roleName, orderId);
    if (["CANCELLED", "CLINICIAN_REVIEWED"].includes(order.status_code)) {
      throw new HttpError(409, "This diagnostic order cannot change report categories", "INVALID_STATE");
    }

    const items = await loadOrderItems(client, order.id);
    const requiredDocuments = buildRequiredDocuments(items);
    const allowedCodes = new Set(requiredDocuments.map((row) => row.code));
    if (!allowedCodes.has(category)) {
      throw new HttpError(
        400,
        `Document category ${category} is not part of this Specialist request`,
        "INVALID_DOCUMENT_CATEGORY"
      );
    }

    const { rows } = await client.query(
      `SELECT id, order_id, patient_id, mime_type, original_filename, file_size_bytes,
              uploaded_by, review_status, reviewed_by, reviewed_at, clinical_notes, created_at
         FROM tbl_diagnostic_order_reports
        WHERE id = $1 AND order_id = $2
        FOR UPDATE`,
      [reportId, orderId]
    );
    if (!rows.length) {
      throw new HttpError(404, "Diagnostic report not found", "REPORT_NOT_FOUND");
    }
    const existing = rows[0];
    if (!["PENDING", "RETURNED"].includes(String(existing.review_status || "").toUpperCase())) {
      throw new HttpError(
        409,
        "Only pending or returned reports can change document category",
        "INVALID_STATE"
      );
    }

    const priorCategory = parseDocumentCategory(existing.clinical_notes);
    const freeText = priorCategory
      ? String(existing.clinical_notes || "").replace(DOC_CATEGORY_PREFIX, "").trim()
      : String(existing.clinical_notes || "").trim();
    const encodedNotes = encodeCategoryNotes(category, freeText || null);

    const updated = await client.query(
      `UPDATE tbl_diagnostic_order_reports
          SET clinical_notes = $2
        WHERE id = $1
        RETURNING id, order_id, patient_id, mime_type, original_filename, file_size_bytes,
                  uploaded_by, review_status, reviewed_by, reviewed_at, clinical_notes, created_at`,
      [reportId, encodedNotes]
    );

    const allReports = (await listExistingReports(client, order.id)).map(publicReport);
    const finalize = await finalizeUploadIfComplete(client, {
      userId,
      req,
      order,
      requiredDocuments,
      reports: allReports,
      newlyUploadedIds: [reportId],
    });

    await audit(req, {
      client,
      event: "DIAGNOSTIC_REPORT_CATEGORY_UPDATED",
      outcome: "SUCCESS",
      resourceType: "diagnostic_order_report",
      resourceId: reportId,
      patientId: order.patient_id,
      metadata: {
        order_id: orderId,
        from_category: priorCategory,
        to_category: category,
        requirements_met: finalize.requirements_met,
      },
    });

    return {
      report: publicReport({ ...updated.rows[0], document_category: category }),
      required_documents: requiredDocuments,
      requirements_met: finalize.requirements_met,
      missing_requirements: finalize.missing_requirements,
      workflow_advanced: finalize.workflow_advanced,
      message: finalize.requirements_met
        ? "Document category updated. Navigator was notified for verification."
        : "Document category updated. Upload or retag remaining required documents.",
    };
  });
}

async function reviewReport(userId, roleName, req, orderId, reportId, input = {}) {
  requireUuid(reportId, "Invalid report ID");
  if (!["MEDICAL_OFFICER", "SPECIALIST", "SYSTEM_ADMIN", "SUPER_ADMIN"].includes(roleName)) {
    throw new HttpError(403, "Only clinicians can review diagnostic reports", "FORBIDDEN");
  }
  const notes = typeof input.clinical_notes === "string"
    ? input.clinical_notes.trim().slice(0, 4000)
    : null;
  if (!notes) {
    throw new HttpError(400, "Clinical review notes are required", "VALIDATION_ERROR");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const order = await assertOrderAccess(client, userId, roleName, orderId);
    const { rows } = await client.query(
      `SELECT * FROM tbl_diagnostic_order_reports
        WHERE id = $1 AND order_id = $2
        FOR UPDATE`,
      [reportId, orderId]
    );
    if (!rows.length) {
      throw new HttpError(404, "Diagnostic report not found", "REPORT_NOT_FOUND");
    }
    const currentStatus = String(rows[0].review_status || "").toUpperCase();
    if (currentStatus === "REVIEWED") {
      throw new HttpError(409, "This report was already reviewed", "ALREADY_REVIEWED");
    }
    if (!["PENDING", "VERIFIED", "RETURNED"].includes(currentStatus)) {
      throw new HttpError(409, "This report cannot be reviewed in its current state", "INVALID_STATE");
    }

    // Keep [DOC:CATEGORY] so required-document checks and UI labels still work.
    const priorCategory = parseDocumentCategory(rows[0].clinical_notes);
    const storedNotes = priorCategory ? encodeCategoryNotes(priorCategory, notes) : notes;

    const updated = await client.query(
      `UPDATE tbl_diagnostic_order_reports
          SET review_status = 'REVIEWED',
              reviewed_by = $2,
              reviewed_at = now(),
              clinical_notes = $3
        WHERE id = $1
        RETURNING id, order_id, patient_id, mime_type, original_filename, file_size_bytes,
                  uploaded_by, review_status, reviewed_by, reviewed_at, clinical_notes, created_at`,
      [reportId, userId, storedNotes]
    );

    const reviewedStatusId = await statusId(client, "CLINICIAN_REVIEWED");
    await client.query(
      `UPDATE tbl_diagnostic_orders SET status_id = $2, updated_at = now() WHERE id = $1`,
      [orderId, reviewedStatusId]
    );
    await client.query(
      `INSERT INTO tbl_diagnostic_status_history
         (order_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, order.status_id, reviewedStatusId, userId, "Clinician reviewed diagnostic report"]
    );

    await audit(req, {
      event: "DIAGNOSTIC_REPORT_REVIEWED",
      outcome: "SUCCESS",
      resourceType: "diagnostic_order_report",
      resourceId: reportId,
      patientId: order.patient_id,
      metadata: { order_id: orderId },
    });

    return { report: publicReport(updated.rows[0]) };
  });
}

module.exports = {
  ALLOWED_MIME,
  MAX_BYTES,
  MAX_FILES_PER_SUBMISSION,
  listReports,
  uploadReport,
  uploadReports,
  getReportFile,
  updateReportCategory,
  reviewReport,
  buildRequiredDocuments,
  requirementsSatisfied,
  validateIncomingFile,
  detectContentMime,
};
