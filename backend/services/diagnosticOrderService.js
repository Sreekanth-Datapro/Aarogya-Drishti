const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const {
  requireUuid,
  requirePositiveId,
  requireActiveClaim,
  hasConsent,
  setActor,
  withTransaction,
  pageOptions,
  pagination,
} = require("./medicalOfficer/scope");

const PRIORITIES = new Set(["ROUTINE", "URGENT", "EMERGENCY"]);

function requirePriority(value) {
  const priority = String(value || "").toUpperCase();
  if (!PRIORITIES.has(priority)) {
    throw new HttpError(400, "Priority must be ROUTINE, URGENT or EMERGENCY", "INVALID_PRIORITY");
  }
  return priority;
}

function trimText(value, field, { required = false, max = 2000 } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) {
    throw new HttpError(400, `${field} is required`, "VALIDATION_ERROR");
  }
  if (text.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters`, "VALIDATION_ERROR");
  }
  return text || null;
}

async function statusId(client, code = "ADVISED") {
  const { rows } = await client.query(
    "SELECT id FROM mst_investigation_statuses WHERE code = $1",
    [code]
  );
  if (!rows.length) {
    throw new HttpError(500, "Diagnostic statuses are not configured", "CONFIGURATION_ERROR");
  }
  return rows[0].id;
}

async function nextOrderCode(client) {
  const { rows } = await client.query("SELECT nextval('seq_diagnostic_order_code') AS n");
  const year = new Date().getFullYear();
  return `DX-${year}-${String(rows[0].n).padStart(6, "0")}`;
}

async function loadApptReminderTemplate(client) {
  const { rows } = await client.query(
    `SELECT template.id, template.language_id
       FROM mst_notification_templates template
       JOIN mst_languages language ON language.id = template.language_id
      WHERE template.code = 'APPT_REMINDER'
        AND template.channel = 'IN_APP'
        AND template.is_active IS TRUE
      ORDER BY (language.code = 'en') DESC, template.id
      LIMIT 1`
  );
  if (!rows.length) {
    throw new HttpError(500, "In-app notification template is not configured", "CONFIGURATION_ERROR");
  }
  return rows[0];
}

async function notifyDiagnosticRecipient(client, {
  recipientUserId,
  patientId,
  orderId,
  orderCode,
  patientCode,
  event,
  title,
  message,
  targetPath,
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
  const template = await loadApptReminderTemplate(client);
  const payload = {
    event,
    diagnostic_order_id: orderId,
    order_code: orderCode,
    patient_code: patientCode,
    target_path: targetPath,
    title,
    message,
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
  };
  await client.query(
    `INSERT INTO tbl_notifications
       (recipient_user_id, patient_id, template_id, channel, language_id, status,
        payload, sent_at)
     VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, now())`,
    [recipientUserId, patientId, template.id, template.language_id, JSON.stringify(payload)]
  );
  return true;
}

async function resolveNavigatorForDiagnostic(client, patientId, referralNavigatorId = null) {
  if (referralNavigatorId) return referralNavigatorId;
  const careNav = await client.query(
    `SELECT assigned_navigator_id
       FROM tbl_care_plans
      WHERE patient_id = $1
        AND assigned_navigator_id IS NOT NULL
        AND status::text NOT IN ('CLOSED', 'SUPERSEDED')
      ORDER BY created_at DESC
      LIMIT 1`,
    [patientId]
  );
  if (careNav.rows[0]?.assigned_navigator_id) return careNav.rows[0].assigned_navigator_id;

  const openReferral = await client.query(
    `SELECT assigned_navigator_id
       FROM tbl_referrals
      WHERE patient_id = $1
        AND assigned_navigator_id IS NOT NULL
        AND status::text NOT IN ('CANCELLED', 'DECLINED')
      ORDER BY created_at DESC
      LIMIT 1`,
    [patientId]
  );
  return openReferral.rows[0]?.assigned_navigator_id || null;
}

async function notifyNavigator(client, {
  navigatorId,
  patientId,
  orderId,
  orderCode,
  patientCode,
}) {
  return notifyDiagnosticRecipient(client, {
    recipientUserId: navigatorId,
    patientId,
    orderId,
    orderCode,
    patientCode,
    event: "DIAGNOSTIC_ORDER_CREATED",
    title: "New diagnostic order",
    message: `A diagnostic order (${orderCode}) was prescribed and needs coordination.`,
    targetPath: "/navigator/diagnostics",
    dedupeKey: `DIAGNOSTIC_ORDER_CREATED:${orderId}:nav`,
  });
}

async function notifyHealthWorkerOrder(client, {
  healthWorkerId,
  patientId,
  orderId,
  orderCode,
  patientCode,
}) {
  return notifyDiagnosticRecipient(client, {
    recipientUserId: healthWorkerId,
    patientId,
    orderId,
    orderCode,
    patientCode,
    event: "DIAGNOSTIC_ORDER_CREATED",
    title: "Diagnostic order for your patient",
    message: `A diagnostic order (${orderCode}) was prescribed. Coordinate with the Navigator.`,
    targetPath: "/health-worker/diagnostics",
    dedupeKey: `DIAGNOSTIC_ORDER_CREATED:${orderId}:hw`,
  });
}

async function assertDoctorPatientAccess(client, userId, roleName, patientId, referralId = null) {
  if (roleName === "MEDICAL_OFFICER") {
    await requireActiveClaim(client, userId, patientId, { lock: true });
    // While a specialist referral is open, MO must not prescribe diagnostics for that patient.
    const openReferral = await client.query(
      `SELECT referral_code, status::text AS status
         FROM tbl_referrals
        WHERE patient_id = $1
          AND status IN ('PLANNED', 'SENT', 'ACCEPTED')
        ORDER BY created_at DESC
        LIMIT 1`,
      [patientId]
    );
    if (openReferral.rows.length) {
      throw new HttpError(
        409,
        `Patient has an active specialist referral (${openReferral.rows[0].referral_code || openReferral.rows[0].status}). `
          + "Diagnostics for referred patients are handled in the specialist/navigator workflow.",
        "REFERRAL_ACTIVE"
      );
    }
  } else if (roleName === "SPECIALIST") {
    const { rows } = await client.query(
      `SELECT patient.id
         FROM tbl_patients patient
        WHERE patient.id = $2
          AND patient.deleted_at IS NULL
          AND fn_user_has_patient_access($1, patient.id)
          AND EXISTS (
            SELECT 1
              FROM tbl_case_assignments assignment
             WHERE assignment.patient_id = patient.id
               AND assignment.user_id = $1
               AND assignment.valid_from <= now()
               AND (assignment.valid_to IS NULL OR assignment.valid_to > now())
          )
        FOR SHARE OF patient`,
      [userId, patientId]
    );
    if (!rows.length) {
      throw new HttpError(403, "You are not assigned to this patient", "FORBIDDEN");
    }
  } else {
    throw new HttpError(403, "Only Medical Officers and Specialists can prescribe diagnostics", "FORBIDDEN");
  }

  if (referralId) {
    const { rows } = await client.query(
      `SELECT referral.id, referral.assigned_navigator_id, referral.status::text AS referral_status
         FROM tbl_referrals referral
        WHERE referral.id = $1
          AND referral.patient_id = $2
        FOR SHARE OF referral`,
      [referralId, patientId]
    );
    if (!rows.length) {
      throw new HttpError(400, "Referral was not found for this patient", "INVALID_REFERRAL");
    }
    if (["CANCELLED", "DECLINED"].includes(rows[0].referral_status)) {
      throw new HttpError(409, "This referral cannot receive new diagnostic orders", "INVALID_REFERRAL");
    }
    return rows[0];
  }

  // Prefer an active referral navigator for notifications when none was supplied.
  const { rows: openReferrals } = await client.query(
    `SELECT referral.id, referral.assigned_navigator_id
       FROM tbl_referrals referral
      WHERE referral.patient_id = $1
        AND referral.status::text NOT IN ('CANCELLED', 'DECLINED')
        AND referral.assigned_navigator_id IS NOT NULL
      ORDER BY referral.created_at DESC
      LIMIT 1`,
    [patientId]
  );
  return openReferrals[0] || null;
}

async function assertFacilityActive(client, facilityId) {
  const { rows } = await client.query(
    `SELECT facility.id, facility.name_en, facility.facility_type
       FROM mst_facilities facility
      WHERE facility.id = $1
        AND facility.is_active IS TRUE
        AND facility.facility_type IN ('HOSPITAL', 'PHC')
      FOR SHARE OF facility`,
    [facilityId]
  );
  if (!rows.length) {
    throw new HttpError(400, "Select an active hospital or PHC facility", "INVALID_FACILITY");
  }
  return rows[0];
}

async function listCategories() {
  const { rows } = await pool.query(
    `SELECT id, code, name_en, name_te, sort_order
       FROM mst_diagnostic_categories
      WHERE is_active IS TRUE
      ORDER BY sort_order, name_en`
  );
  return { categories: rows };
}

async function listTests(query = {}) {
  const values = [];
  let categorySql = "";
  if (query.category_id) {
    categorySql = `AND test.category_id = $${values.push(requirePositiveId(query.category_id, "Invalid category"))}`;
  }
  const { rows } = await pool.query(
    `SELECT test.id, test.code, test.name_en, test.name_te, test.default_fasting,
            test.category_id, category.code AS category_code,
            category.name_en AS category_name, category.name_te AS category_name_te,
            test.is_active
       FROM mst_diagnostic_tests test
       JOIN mst_diagnostic_categories category ON category.id = test.category_id
      WHERE test.is_active IS TRUE
        AND category.is_active IS TRUE
        ${categorySql}
      ORDER BY category.sort_order, test.name_en`,
    values
  );
  return { tests: rows };
}

async function listAllTestsForAdmin() {
  const { rows } = await pool.query(
    `SELECT test.id, test.code, test.name_en, test.name_te, test.default_fasting,
            test.is_active, test.category_id, category.code AS category_code,
            category.name_en AS category_name
       FROM mst_diagnostic_tests test
       JOIN mst_diagnostic_categories category ON category.id = test.category_id
      ORDER BY category.sort_order, test.name_en`
  );
  return { tests: rows };
}

async function createOrUpdateTest(userId, req, input = {}, testId = null) {
  const categoryId = requirePositiveId(input.category_id, "Invalid category");
  const code = String(input.code || "").trim().toUpperCase().replace(/\s+/g, "_");
  const nameEn = trimText(input.name_en, "English name", { required: true, max: 200 });
  const nameTe = trimText(input.name_te, "Telugu name", { max: 200 });
  const defaultFasting = input.default_fasting === true || input.default_fasting === "true";
  const isActive = input.is_active === false || input.is_active === "false" ? false : true;
  if (!/^[A-Z0-9_]{2,40}$/.test(code)) {
    throw new HttpError(400, "Test code must be 2-40 letters, numbers or underscores", "INVALID_TEST_CODE");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const category = await client.query(
      "SELECT id FROM mst_diagnostic_categories WHERE id = $1 AND is_active IS TRUE",
      [categoryId]
    );
    if (!category.rows.length) {
      throw new HttpError(400, "Select an active diagnostic category", "INVALID_CATEGORY");
    }

    let row;
    if (testId) {
      const id = requirePositiveId(testId, "Invalid test ID");
      const { rows } = await client.query(
        `UPDATE mst_diagnostic_tests
            SET category_id = $2, code = $3, name_en = $4, name_te = $5,
                default_fasting = $6, is_active = $7
          WHERE id = $1
          RETURNING id, category_id, code, name_en, name_te, default_fasting, is_active`,
        [id, categoryId, code, nameEn, nameTe, defaultFasting, isActive]
      );
      if (!rows.length) throw new HttpError(404, "Diagnostic test not found", "NOT_FOUND");
      row = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO mst_diagnostic_tests
           (category_id, code, name_en, name_te, default_fasting, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, category_id, code, name_en, name_te, default_fasting, is_active`,
        [categoryId, code, nameEn, nameTe, defaultFasting, isActive]
      );
      row = rows[0];
    }

    await audit(req, {
      client,
      required: true,
      event: testId ? "DIAGNOSTIC_TEST_UPDATED" : "DIAGNOSTIC_TEST_CREATED",
      resourceType: "diagnostic_test",
      resourceId: row.id,
      metadata: { code: row.code, category_id: row.category_id },
    });
    return row;
  });
}

async function listFacilities(userId, roleName) {
  if (roleName === "SPECIALIST") {
    const { rows } = await pool.query(
      `SELECT facility.id, facility.name_en, facility.name_te, facility.facility_type
         FROM mst_facilities facility
         JOIN tbl_user_facility_assignments assignment ON assignment.facility_id = facility.id
        WHERE assignment.user_id = $1
          AND facility.is_active IS TRUE
          AND facility.facility_type IN ('HOSPITAL', 'PHC')
          AND assignment.valid_from <= CURRENT_DATE
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        ORDER BY facility.name_en`,
      [userId]
    );
    return { facilities: rows };
  }

  if (roleName === "MEDICAL_OFFICER") {
    const { rows } = await pool.query(
      `SELECT DISTINCT facility.id, facility.name_en, facility.name_te, facility.facility_type
         FROM mst_facilities facility
        WHERE facility.is_active IS TRUE
          AND facility.facility_type IN ('HOSPITAL', 'PHC')
          AND facility.district_id IN (
            SELECT DISTINCT mandal.district_id
              FROM tbl_medical_officer_mandal_assignments moa
              JOIN mst_mandals mandal ON mandal.id = moa.mandal_id
             WHERE moa.user_id = $1
               AND moa.valid_from <= CURRENT_DATE
               AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
          )
        ORDER BY facility.name_en
        LIMIT 200`,
      [userId]
    );
    return { facilities: rows };
  }

  const { rows } = await pool.query(
    `SELECT facility.id, facility.name_en, facility.name_te, facility.facility_type
       FROM mst_facilities facility
      WHERE facility.is_active IS TRUE
        AND facility.facility_type IN ('HOSPITAL', 'PHC')
      ORDER BY facility.name_en
      LIMIT 200`
  );
  return { facilities: rows };
}

const ORDER_SELECT = `
  SELECT diagnostic_order.id, diagnostic_order.order_code, diagnostic_order.patient_id,
         diagnostic_order.referral_id, diagnostic_order.facility_id,
         diagnostic_order.prescribed_by, diagnostic_order.notes,
         diagnostic_order.created_at, diagnostic_order.updated_at,
         status.code AS status_code, status.name_en AS status_name, status.name_te AS status_name_te,
         patient.patient_code, patient.full_name AS patient_name,
         referral.referral_code, referral.assigned_navigator_id,
         facility.name_en AS facility_name, facility.name_te AS facility_name_te,
         facility.facility_type,
         prescriber.full_name AS prescribed_by_name,
         role.code AS prescribed_by_role
    FROM tbl_diagnostic_orders diagnostic_order
    JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
    JOIN tbl_patients patient ON patient.id = diagnostic_order.patient_id AND patient.deleted_at IS NULL
    JOIN mst_facilities facility ON facility.id = diagnostic_order.facility_id
    JOIN tbl_users prescriber ON prescriber.id = diagnostic_order.prescribed_by
    JOIN mst_roles role ON role.id = prescriber.role_id
    LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
`;

async function loadOrderItems(clientOrPool, orderId) {
  const { rows } = await clientOrPool.query(
    `SELECT item.id, item.order_id, item.test_id, item.clinical_reason, item.priority,
            item.fasting_required, item.instructions,
            status.code AS status_code, status.name_en AS status_name, status.name_te AS status_name_te,
            test.code AS test_code, test.name_en AS test_name, test.name_te AS test_name_te,
            category.code AS category_code, category.name_en AS category_name
       FROM tbl_diagnostic_order_items item
       JOIN mst_investigation_statuses status ON status.id = item.status_id
       JOIN mst_diagnostic_tests test ON test.id = item.test_id
       JOIN mst_diagnostic_categories category ON category.id = test.category_id
      WHERE item.order_id = $1
      ORDER BY category.sort_order, test.name_en`,
    [orderId]
  );
  return rows;
}

async function createOrder(userId, req, input = {}) {
  const patientId = requireUuid(input.patient_id, "Invalid patient ID");
  const facilityId = requirePositiveId(input.facility_id, "Invalid facility ID");
  const referralId = input.referral_id
    ? requireUuid(input.referral_id, "Invalid referral ID")
    : null;
  const notes = trimText(input.notes, "Notes", { max: 2000 });
  const idempotencyKey = trimText(input.idempotency_key, "Idempotency key", { max: 100 });
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) {
    throw new HttpError(400, "Add at least one diagnostic test", "VALIDATION_ERROR");
  }
  if (items.length > 20) {
    throw new HttpError(400, "A single order may include at most 20 tests", "VALIDATION_ERROR");
  }

  const normalizedItems = items.map((item, index) => ({
    testId: requirePositiveId(item.test_id, `Invalid test ID at item ${index + 1}`),
    clinicalReason: trimText(item.clinical_reason, "Clinical reason", { required: true, max: 2000 }),
    priority: requirePriority(item.priority),
    fastingRequired: item.fasting_required === true || item.fasting_required === "true",
    instructions: trimText(item.instructions, "Instructions", { max: 2000 }),
  }));
  const uniqueTests = new Set(normalizedItems.map((item) => item.testId));
  if (uniqueTests.size !== normalizedItems.length) {
    throw new HttpError(400, "Each test may appear only once in an order", "DUPLICATE_TEST");
  }

  try {
    return await withTransaction(pool, async (client) => {
      await setActor(client, userId);
      if (!(await hasConsent(client, patientId, "DATA_PROCESSING"))) {
        throw new HttpError(403, "The patient has no active DATA_PROCESSING consent", "CONSENT_REQUIRED");
      }

      const referral = await assertDoctorPatientAccess(
        client,
        userId,
        req.user.role_name,
        patientId,
        referralId
      );
      await assertFacilityActive(client, facilityId);
      const advisedStatusId = await statusId(client, "ADVISED");

      if (idempotencyKey) {
        const existing = await client.query(
          `SELECT id, order_code FROM tbl_diagnostic_orders
            WHERE prescribed_by = $1 AND idempotency_key = $2`,
          [userId, idempotencyKey]
        );
        if (existing.rows.length) {
          const order = await getOrderForUser(userId, req.user.role_name, existing.rows[0].id, { client });
          return { ...order, idempotent_replay: true };
        }
      }

      const testIds = normalizedItems.map((item) => item.testId);
      const { rows: activeTests } = await client.query(
        `SELECT id FROM mst_diagnostic_tests
          WHERE id = ANY($1::bigint[]) AND is_active IS TRUE
          FOR SHARE`,
        [testIds]
      );
      if (activeTests.length !== testIds.length) {
        throw new HttpError(400, "One or more selected tests are inactive or missing", "INVALID_TEST");
      }

      const orderCode = await nextOrderCode(client);
      const { rows: orderRows } = await client.query(
        `INSERT INTO tbl_diagnostic_orders
           (order_code, patient_id, referral_id, facility_id, prescribed_by,
            status_id, notes, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, order_code, patient_id, referral_id, facility_id, created_at`,
        [
          orderCode,
          patientId,
          referralId || referral?.id || null,
          facilityId,
          userId,
          advisedStatusId,
          notes,
          idempotencyKey,
        ]
      );
      const order = orderRows[0];

      for (const item of normalizedItems) {
        const { rows: itemRows } = await client.query(
          `INSERT INTO tbl_diagnostic_order_items
             (order_id, test_id, clinical_reason, priority, fasting_required, instructions, status_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            order.id,
            item.testId,
            item.clinicalReason,
            item.priority,
            item.fastingRequired,
            item.instructions,
            advisedStatusId,
          ]
        );
        await client.query(
          `INSERT INTO tbl_diagnostic_status_history
             (order_id, item_id, from_status_id, to_status_id, changed_by, reason)
           VALUES ($1, $2, NULL, $3, $4, 'Diagnostic test prescribed')`,
          [order.id, itemRows[0].id, advisedStatusId, userId]
        );
      }

      await client.query(
        `INSERT INTO tbl_diagnostic_status_history
           (order_id, item_id, from_status_id, to_status_id, changed_by, reason)
         VALUES ($1, NULL, NULL, $2, $3, 'Diagnostic order created')`,
        [order.id, advisedStatusId, userId]
      );

      const { rows: patientRows } = await client.query(
        "SELECT patient_code, registered_by FROM tbl_patients WHERE id = $1",
        [patientId]
      );
      const navigatorId = await resolveNavigatorForDiagnostic(
        client,
        patientId,
        referral?.assigned_navigator_id || null
      );
      await notifyNavigator(client, {
        navigatorId,
        patientId,
        orderId: order.id,
        orderCode: order.order_code,
        patientCode: patientRows[0]?.patient_code,
      });
      await notifyHealthWorkerOrder(client, {
        healthWorkerId: patientRows[0]?.registered_by || null,
        patientId,
        orderId: order.id,
        orderCode: order.order_code,
        patientCode: patientRows[0]?.patient_code,
      });

      await audit(req, {
        client,
        required: true,
        event: "DIAGNOSTIC_ORDER_CREATED",
        resourceType: "diagnostic_order",
        resourceId: order.id,
        patientId,
        metadata: {
          order_code: order.order_code,
          facility_id: facilityId,
          item_count: normalizedItems.length,
          referral_id: order.referral_id,
        },
      });

      const itemsOut = await loadOrderItems(client, order.id);
      return {
        order: {
          ...order,
          status_code: "ADVISED",
          items: itemsOut,
        },
      };
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "This diagnostic order was already submitted", "DUPLICATE_ORDER");
    }
    throw error;
  }
}

async function getOrderForUser(userId, roleName, orderId, { client = pool } = {}) {
  const id = requireUuid(orderId, "Invalid diagnostic order ID");
  let scopeSql = "AND fn_user_has_patient_access($1, diagnostic_order.patient_id)";
  const params = [userId, id];

  if (roleName === "NAVIGATOR") {
    scopeSql += ` AND (
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
    scopeSql += ` AND (
      diagnostic_order.prescribed_by = $1
      OR EXISTS (
        SELECT 1 FROM tbl_care_plans plan
         WHERE plan.patient_id = diagnostic_order.patient_id
           AND plan.responsible_mo_id = $1
           AND plan.status NOT IN ('CLOSED', 'SUPERSEDED')
      )
    )`;
  } else if (roleName === "SPECIALIST") {
    scopeSql += ` AND (
      diagnostic_order.prescribed_by = $1
      OR EXISTS (
        SELECT 1 FROM tbl_case_assignments assignment
         WHERE assignment.patient_id = diagnostic_order.patient_id
           AND assignment.user_id = $1
           AND assignment.valid_from <= now()
           AND (assignment.valid_to IS NULL OR assignment.valid_to > now())
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
  } else if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND (
      patient.registered_by = $1
      OR fn_user_has_patient_access($1, diagnostic_order.patient_id)
    )`;
  } else if (!["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(roleName)) {
    throw new HttpError(403, "You are not allowed to view diagnostic orders", "FORBIDDEN");
  }

  const { rows } = await client.query(
    `${ORDER_SELECT}
      WHERE diagnostic_order.id = $2
        ${scopeSql}`,
    params
  );
  if (!rows.length) {
    throw new HttpError(404, "Diagnostic order not found", "NOT_FOUND");
  }
  const items = await loadOrderItems(client, id);
  const history = await client.query(
    `SELECT history.id, history.order_id, history.item_id,
            history.reason, history.changed_at,
            from_status.code AS from_status_code,
            to_status.code AS to_status_code,
            actor.full_name AS changed_by_name
       FROM tbl_diagnostic_status_history history
       JOIN mst_investigation_statuses to_status ON to_status.id = history.to_status_id
       LEFT JOIN mst_investigation_statuses from_status ON from_status.id = history.from_status_id
       JOIN tbl_users actor ON actor.id = history.changed_by
      WHERE history.order_id = $1
      ORDER BY history.changed_at, history.id`,
    [id]
  );
  let reports = [];
  try {
    const reportRows = await client.query(
      `SELECT report.id, report.mime_type, report.original_filename, report.file_size_bytes,
              report.uploaded_by, report.review_status, report.reviewed_by, report.reviewed_at,
              report.clinical_notes, report.created_at,
              uploader.full_name AS uploaded_by_name,
              reviewer.full_name AS reviewed_by_name
         FROM tbl_diagnostic_order_reports report
         JOIN tbl_users uploader ON uploader.id = report.uploaded_by
         LEFT JOIN tbl_users reviewer ON reviewer.id = report.reviewed_by
        WHERE report.order_id = $1
        ORDER BY report.created_at DESC`,
      [id]
    );
    reports = reportRows.rows;
  } catch (error) {
    // Table may not exist until migration 034 is applied.
    if (error?.code !== "42P01") throw error;
  }

  return { order: { ...rows[0], items, history: history.rows, reports } };
}

async function listOrders(userId, roleName, query = {}) {
  const { page, pageSize, offset } = pageOptions(query, 20);
  const values = [userId];
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
    scopeSql = "AND diagnostic_order.prescribed_by = $1";
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
  } else if (roleName === "HOSPITAL_STAFF") {
    scopeSql = `AND EXISTS (
      SELECT 1 FROM tbl_user_facility_assignments assignment
       WHERE assignment.user_id = $1
         AND assignment.facility_id = diagnostic_order.facility_id
         AND assignment.valid_from <= CURRENT_DATE
         AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
    )`;
  } else if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND (
      EXISTS (
        SELECT 1 FROM tbl_patients patient
         WHERE patient.id = diagnostic_order.patient_id
           AND patient.registered_by = $1
           AND patient.deleted_at IS NULL
      )
      OR fn_user_has_patient_access($1, diagnostic_order.patient_id)
    )`;
  } else if (!["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(roleName)) {
    throw new HttpError(403, "You are not allowed to list diagnostic orders", "FORBIDDEN");
  }

  if (query.patient_id) {
    scopeSql += ` AND diagnostic_order.patient_id = $${values.push(requireUuid(query.patient_id, "Invalid patient ID"))}`;
  }
  if (query.status) {
    scopeSql += ` AND status.code = $${values.push(String(query.status).toUpperCase())}`;
  }
  if (query.pending_only === "true" || query.pending_only === true) {
    scopeSql += " AND status.is_terminal IS FALSE";
  }

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM tbl_diagnostic_orders diagnostic_order
       JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
       LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
      WHERE 1=1 ${scopeSql}`,
    values
  );
  const listValues = [...values, pageSize, offset];
  const { rows } = await pool.query(
    `${ORDER_SELECT}
      WHERE 1=1 ${scopeSql}
      ORDER BY diagnostic_order.created_at DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );

  const orders = [];
  for (const row of rows) {
    orders.push({ ...row, items: await loadOrderItems(pool, row.id) });
  }
  return {
    orders,
    pagination: pagination(page, pageSize, count.rows[0].total),
  };
}

async function listEligiblePatients(userId, roleName, query = {}) {
  const { page, pageSize, offset } = pageOptions(query, 20);
  if (roleName === "MEDICAL_OFFICER") {
    // MO dropdown: claimed patients the MO still handles clinically.
    // Exclude anyone with an open specialist referral (PLANNED/SENT/ACCEPTED).
    const { rows } = await pool.query(
      `SELECT patient.id, patient.patient_code, patient.full_name,
              referral.id AS referral_id, referral.referral_code
         FROM tbl_medical_officer_case_claims claim
         JOIN tbl_patients patient ON patient.id = claim.patient_id AND patient.deleted_at IS NULL
         JOIN mst_villages village ON village.id = patient.village_id
         LEFT JOIN LATERAL (
           SELECT r.id, r.referral_code
             FROM tbl_referrals r
            WHERE r.patient_id = patient.id
              AND r.status::text NOT IN ('CANCELLED', 'DECLINED', 'PLANNED', 'SENT', 'ACCEPTED')
            ORDER BY r.created_at DESC
            LIMIT 1
         ) referral ON TRUE
        WHERE claim.medical_officer_id = $1
          AND claim.released_at IS NULL
          AND EXISTS (
            SELECT 1 FROM tbl_medical_officer_mandal_assignments moa
             WHERE moa.user_id = $1
               AND moa.mandal_id = village.mandal_id
               AND moa.valid_from <= CURRENT_DATE
               AND (moa.valid_to IS NULL OR moa.valid_to >= CURRENT_DATE)
          )
          AND NOT EXISTS (
            SELECT 1 FROM tbl_referrals open_ref
             WHERE open_ref.patient_id = patient.id
               AND open_ref.status IN ('PLANNED', 'SENT', 'ACCEPTED')
          )
        ORDER BY patient.full_name
        LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    );
    return { patients: rows };
  }

  const { rows } = await pool.query(
    `SELECT patient.id, patient.patient_code, patient.full_name,
            referral.id AS referral_id, referral.referral_code
       FROM tbl_case_assignments assignment
       JOIN tbl_patients patient ON patient.id = assignment.patient_id AND patient.deleted_at IS NULL
       LEFT JOIN tbl_referrals referral
         ON referral.id = assignment.referral_id
        AND referral.patient_id = patient.id
      WHERE assignment.user_id = $1
        AND assignment.valid_from <= now()
        AND (assignment.valid_to IS NULL OR assignment.valid_to > now())
        AND fn_user_has_patient_access($1, patient.id)
      ORDER BY patient.full_name
      LIMIT $2 OFFSET $3`,
    [userId, pageSize, offset]
  );
  return { patients: rows };
}

module.exports = {
  listCategories,
  listTests,
  listAllTestsForAdmin,
  createOrUpdateTest,
  listFacilities,
  createOrder,
  getOrderForUser,
  listOrders,
  listEligiblePatients,
};
