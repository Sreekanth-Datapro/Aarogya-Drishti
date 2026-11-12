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

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 10 * 1024 * 1024;

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
    )`;
  } else if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND (
      patient.registered_by = $1
      OR fn_user_has_patient_access($1, diagnostic_order.patient_id)
      OR EXISTS (
        SELECT 1 FROM tbl_diagnostic_appointments appointment
         WHERE appointment.order_id = diagnostic_order.id
           AND EXISTS (
             SELECT 1 FROM tbl_care_followup_schedules schedule
              WHERE schedule.patient_id = diagnostic_order.patient_id
                AND schedule.assigned_hw_id = $1
           )
      )
    )`;
  } else if (roleName === "HOSPITAL_STAFF") {
    scopeSql = `AND EXISTS (
      SELECT 1 FROM tbl_user_facility_assignments assignment
       WHERE assignment.user_id = $1
         AND assignment.facility_id = diagnostic_order.facility_id
         AND assignment.valid_from <= CURRENT_DATE
         AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
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

function publicReport(row) {
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
    clinical_notes: row.clinical_notes,
    created_at: row.created_at,
  };
}

async function listReports(userId, roleName, orderId) {
  return withTransaction(pool, async (client) => {
    await assertOrderAccess(client, userId, roleName, orderId);
    const { rows } = await client.query(
      `SELECT report.id, report.order_id, report.patient_id, report.mime_type,
              report.original_filename, report.file_size_bytes, report.uploaded_by,
              report.review_status, report.reviewed_by, report.reviewed_at,
              report.clinical_notes, report.created_at,
              uploader.full_name AS uploaded_by_name,
              reviewer.full_name AS reviewed_by_name
         FROM tbl_diagnostic_order_reports report
         JOIN tbl_users uploader ON uploader.id = report.uploaded_by
         LEFT JOIN tbl_users reviewer ON reviewer.id = report.reviewed_by
        WHERE report.order_id = $1
        ORDER BY report.created_at DESC`,
      [orderId]
    );
    return { reports: rows.map(publicReport) };
  });
}

async function uploadReport(userId, roleName, req, orderId, file) {
  if (!file || !file.buffer) {
    throw new HttpError(400, "Report file is required", "FILE_REQUIRED");
  }
  if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
    throw new HttpError(400, "Report file must be 10 MB or smaller", "FILE_TOO_LARGE");
  }
  const mime = requireMime(file.mimetype);
  const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const reportId = crypto.randomUUID();
  const objectKey = `diagnostic-reports/${orderId}/${reportId}.${extensionForMime(mime)}`;
  const originalFilename = path.basename(String(file.originalname || "report")).slice(0, 200);

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const order = await assertOrderAccess(client, userId, roleName, orderId);
    if (["CANCELLED", "CLINICIAN_REVIEWED"].includes(order.status_code)) {
      throw new HttpError(409, "This diagnostic order cannot accept new reports", "INVALID_STATE");
    }

    await privateImageStorage.uploadBuffer(objectKey, file.buffer, mime, { upsert: false });

    try {
      const inserted = await client.query(
        `INSERT INTO tbl_diagnostic_order_reports
           (id, order_id, patient_id, report_key, checksum_sha256, mime_type,
            original_filename, file_size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, order_id, patient_id, mime_type, original_filename, file_size_bytes,
                   uploaded_by, review_status, reviewed_by, reviewed_at, clinical_notes, created_at`,
        [
          reportId,
          orderId,
          order.patient_id,
          objectKey,
          checksum,
          mime,
          originalFilename,
          file.buffer.length,
          userId,
        ]
      );

      const receivedStatusId = await statusId(client, "REPORT_RECEIVED");
      if (order.status_code !== "REPORT_RECEIVED" && order.status_code !== "CLINICIAN_REVIEWED") {
        await client.query(
          `UPDATE tbl_diagnostic_orders SET status_id = $2, updated_at = now() WHERE id = $1`,
          [orderId, receivedStatusId]
        );
        await client.query(
          `UPDATE tbl_diagnostic_order_items SET status_id = $2, updated_at = now() WHERE order_id = $1`,
          [orderId, receivedStatusId]
        );
        await client.query(
          `INSERT INTO tbl_diagnostic_status_history
             (order_id, from_status_id, to_status_id, changed_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, order.status_id, receivedStatusId, userId, "Diagnostic report uploaded"]
        );
      }

      const navigatorId = order.assigned_navigator_id || order.care_navigator_id;
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_REPORT_UPLOADED",
        recipientUserId: navigatorId,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_REPORT_UPLOADED",
        title: "Diagnostic report uploaded",
        message: `Report uploaded for order ${order.order_code}. Track submission; clinicians review clinically.`,
        targetPath: `/navigator/diagnostics/${orderId}`,
        orderId,
        reportId,
        dedupeKey: `DIAGNOSTIC_REPORT_UPLOADED:${reportId}:nav`,
      });
      const clinicianPath = order.prescribed_by_role === "SPECIALIST"
        ? `/specialist/diagnostics/${orderId}`
        : `/medical-officer/diagnostics/${orderId}`;
      await notifyOnce(client, {
        templateCode: "DIAGNOSTIC_REPORT_UPLOADED",
        recipientUserId: order.prescribed_by,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_REPORT_UPLOADED",
        title: "Diagnostic report ready for review",
        message: `A diagnostic report was uploaded for order ${order.order_code} (${order.patient_code}).`,
        targetPath: clinicianPath,
        orderId,
        reportId,
        dedupeKey: `DIAGNOSTIC_REPORT_UPLOADED:${reportId}:clinician`,
      });

      await audit(req, {
        event: "DIAGNOSTIC_REPORT_UPLOADED",
        outcome: "SUCCESS",
        resourceType: "diagnostic_order_report",
        resourceId: reportId,
        patientId: order.patient_id,
        metadata: { order_id: orderId, mime_type: mime },
      });

      return { report: publicReport(inserted.rows[0]) };
    } catch (error) {
      try {
        await privateImageStorage.deleteObject(objectKey);
      } catch (_cleanupError) {
        // Best-effort cleanup if DB insert fails after storage upload.
      }
      throw error;
    }
  });
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
    if (rows[0].review_status === "REVIEWED") {
      throw new HttpError(409, "This report was already reviewed", "ALREADY_REVIEWED");
    }

    const updated = await client.query(
      `UPDATE tbl_diagnostic_order_reports
          SET review_status = 'REVIEWED',
              reviewed_by = $2,
              reviewed_at = now(),
              clinical_notes = $3
        WHERE id = $1
        RETURNING id, order_id, patient_id, mime_type, original_filename, file_size_bytes,
                  uploaded_by, review_status, reviewed_by, reviewed_at, clinical_notes, created_at`,
      [reportId, userId, notes]
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
  listReports,
  uploadReport,
  getReportFile,
  reviewReport,
};
