const pool = require("../db");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const {
  requireUuid,
  requirePositiveId,
  hasConsent,
  setActor,
  withTransaction,
  pageOptions,
  pagination,
} = require("./medicalOfficer/scope");
const { createInAppNotifications } = require("./notificationService");

const CONTACT_STATUSES = new Set(["NOT_CONTACTED", "INFORMED", "REACHED", "UNREACHABLE"]);
const ATTENDANCE_VALUES = new Set(["ATTENDED", "NO_SHOW"]);

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

function futureDateTime(value, label = "Date and time") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${label} is invalid`, "INVALID_DATETIME");
  }
  if (date.getTime() <= Date.now() - 60_000) {
    throw new HttpError(400, `${label} must be in the future`, "INVALID_DATETIME");
  }
  return date.toISOString();
}

async function appointmentStatusId(client, code) {
  const { rows } = await client.query(
    "SELECT id FROM mst_appointment_statuses WHERE code = $1",
    [code]
  );
  if (!rows.length) {
    throw new HttpError(500, "Appointment statuses are not configured", "CONFIGURATION_ERROR");
  }
  return rows[0].id;
}

async function investigationStatusId(client, code) {
  const { rows } = await client.query(
    "SELECT id FROM mst_investigation_statuses WHERE code = $1",
    [code]
  );
  if (!rows.length) {
    throw new HttpError(500, "Diagnostic statuses are not configured", "CONFIGURATION_ERROR");
  }
  return rows[0].id;
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

async function notifyUsers(client, {
  recipients,
  patientId,
  event,
  title,
  message,
  targetPath,
  appointmentId,
  orderId,
  dedupeKey,
}) {
  if (!recipients.length) return;
  const template = await loadApptReminderTemplate(client);
  const unique = [...new Set(recipients.filter(Boolean))];
  for (const recipientUserId of unique) {
    const key = dedupeKey ? `${dedupeKey}:${recipientUserId}` : null;
    if (key) {
      const existing = await client.query(
        `SELECT 1
           FROM tbl_notifications
          WHERE recipient_user_id = $1
            AND payload->>'event' = $2
            AND payload->>'dedupe_key' = $3
          LIMIT 1`,
        [recipientUserId, event, key]
      );
      if (existing.rows.length) continue;
    }
    const payload = {
      event,
      title,
      message,
      target_path: targetPath,
      diagnostic_appointment_id: appointmentId,
      diagnostic_order_id: orderId,
      ...(key ? { dedupe_key: key } : {}),
    };
    await client.query(
      `INSERT INTO tbl_notifications
         (recipient_user_id, patient_id, template_id, channel, language_id, status,
          payload, sent_at)
       VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, now())`,
      [recipientUserId, patientId, template.id, template.language_id, JSON.stringify(payload)]
    );
  }
}

async function facilityStaffUserIds(client, facilityId, excludeUserId = null) {
  const { rows } = await client.query(
    `SELECT DISTINCT staff.id
       FROM tbl_users staff
       JOIN mst_roles role ON role.id = staff.role_id
       JOIN tbl_user_facility_assignments assignment ON assignment.user_id = staff.id
      WHERE role.code = 'HOSPITAL_STAFF'
        AND role.is_active IS TRUE
        AND staff.status = 'ACTIVE'
        AND staff.deleted_at IS NULL
        AND assignment.facility_id = $1
        AND assignment.valid_from <= CURRENT_DATE
        AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        AND ($2::uuid IS NULL OR staff.id <> $2::uuid)`,
    [facilityId, excludeUserId]
  );
  return rows.map((row) => row.id);
}

async function patientHealthWorkerId(client, patientId) {
  const { rows } = await client.query(
    `SELECT patient.registered_by AS health_worker_id, role.code AS role_code
       FROM tbl_patients patient
       LEFT JOIN tbl_users registrar ON registrar.id = patient.registered_by
       LEFT JOIN mst_roles role ON role.id = registrar.role_id
      WHERE patient.id = $1`,
    [patientId]
  );
  if (rows[0]?.role_code === "HEALTH_WORKER") return rows[0].health_worker_id;
  return null;
}

async function assertNoActiveBooking(client, orderId, excludeId = null) {
  const { rows } = await client.query(
    `SELECT appointment.id
       FROM tbl_diagnostic_appointments appointment
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
      WHERE appointment.diagnostic_order_id = $1
        AND status.is_terminal IS FALSE
        AND ($2::uuid IS NULL OR appointment.id <> $2)
      LIMIT 1
      FOR UPDATE OF appointment`,
    [orderId, excludeId]
  );
  if (rows.length) {
    throw new HttpError(409, "An active diagnostic appointment already exists for this order", "DUPLICATE_BOOKING");
  }
}

async function assertNoFacilityConflict(client, facilityId, whenIso, excludeId = null) {
  const { rows } = await client.query(
    `SELECT appointment.id
       FROM tbl_diagnostic_appointments appointment
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
      WHERE appointment.facility_id = $1
        AND COALESCE(appointment.confirmed_at_time, appointment.requested_at) = $2::timestamptz
        AND status.code IN ('REQUESTED', 'CONFIRMED')
        AND ($3::uuid IS NULL OR appointment.id <> $3)
      LIMIT 1`,
    [facilityId, whenIso, excludeId]
  );
  if (rows.length) {
    throw new HttpError(409, "Another active diagnostic appointment uses this facility time", "APPOINTMENT_TIME_CONFLICT");
  }
}

async function assertFacilityActive(client, facilityId) {
  const { rows } = await client.query(
    `SELECT id, name_en, facility_type, hospital_id
       FROM mst_facilities
      WHERE id = $1
        AND is_active IS TRUE
        AND facility_type IN ('HOSPITAL', 'PHC')
      FOR SHARE`,
    [facilityId]
  );
  if (!rows.length) {
    throw new HttpError(400, "Select an active hospital or PHC facility", "INVALID_FACILITY");
  }
  return rows[0];
}

async function assertNavigatorOrderAccess(client, userId, orderId) {
  const { rows } = await client.query(
    `SELECT diagnostic_order.id, diagnostic_order.order_code, diagnostic_order.patient_id,
            diagnostic_order.facility_id, diagnostic_order.referral_id,
            status.code AS order_status_code, status.is_terminal AS order_is_terminal,
            referral.assigned_navigator_id,
            patient.patient_code, patient.full_name AS patient_name
       FROM tbl_diagnostic_orders diagnostic_order
       JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
       JOIN tbl_patients patient ON patient.id = diagnostic_order.patient_id AND patient.deleted_at IS NULL
       LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
      WHERE diagnostic_order.id = $2
        AND (
          referral.assigned_navigator_id = $1
          OR EXISTS (
            SELECT 1 FROM tbl_referrals open_referral
             WHERE open_referral.patient_id = diagnostic_order.patient_id
               AND open_referral.assigned_navigator_id = $1
          )
        )
      FOR UPDATE OF diagnostic_order`,
    [userId, orderId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Diagnostic order not found for coordination", "NOT_FOUND");
  }
  if (rows[0].order_is_terminal) {
    throw new HttpError(409, "This diagnostic order can no longer be scheduled", "ORDER_NOT_SCHEDULABLE");
  }
  return rows[0];
}

const APPT_SELECT = `
  SELECT appointment.id, appointment.diagnostic_order_id, appointment.patient_id,
         appointment.facility_id, appointment.requested_at, appointment.confirmed_at_time,
         appointment.status_id, status.code AS status_code, status.name_en AS status_name,
         status.name_te AS status_name_te, status.is_terminal,
         appointment.attendance::text AS attendance,
         appointment.patient_informed, appointment.patient_informed_at,
         appointment.contact_status, appointment.contact_notes,
         appointment.coordination_notes, appointment.location_note,
         appointment.cancel_reason, appointment.missed_reason_text,
         appointment.booked_by, appointment.confirmed_by, appointment.confirmed_at,
         appointment.rescheduled_from_id, appointment.created_at, appointment.updated_at,
         diagnostic_order.order_code, diagnostic_order.notes AS order_notes,
         patient.patient_code, patient.full_name AS patient_name,
         facility.name_en AS facility_name, facility.name_te AS facility_name_te,
         facility.facility_type,
         booker.full_name AS booked_by_name,
         confirmer.full_name AS confirmed_by_name,
         referral.assigned_navigator_id, referral.referral_code
    FROM tbl_diagnostic_appointments appointment
    JOIN mst_appointment_statuses status ON status.id = appointment.status_id
    JOIN tbl_diagnostic_orders diagnostic_order ON diagnostic_order.id = appointment.diagnostic_order_id
    JOIN tbl_patients patient ON patient.id = appointment.patient_id AND patient.deleted_at IS NULL
    JOIN mst_facilities facility ON facility.id = appointment.facility_id
    JOIN tbl_users booker ON booker.id = appointment.booked_by
    LEFT JOIN tbl_users confirmer ON confirmer.id = appointment.confirmed_by
    LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
`;

async function loadOrderItems(client, orderId) {
  const { rows } = await client.query(
    `SELECT item.id, item.priority, item.fasting_required, item.instructions, item.clinical_reason,
            test.code AS test_code, test.name_en AS test_name, test.name_te AS test_name_te,
            category.name_en AS category_name
       FROM tbl_diagnostic_order_items item
       JOIN mst_diagnostic_tests test ON test.id = item.test_id
       JOIN mst_diagnostic_categories category ON category.id = test.category_id
      WHERE item.order_id = $1
      ORDER BY category.sort_order, test.name_en`,
    [orderId]
  );
  return rows;
}

async function loadAppointmentHistory(client, appointmentId) {
  const { rows } = await client.query(
    `SELECT history.id, history.reason, history.changed_at,
            from_status.code AS from_status_code,
            to_status.code AS to_status_code,
            actor.full_name AS changed_by_name
       FROM tbl_diagnostic_appointment_history history
       JOIN mst_appointment_statuses to_status ON to_status.id = history.to_status_id
       LEFT JOIN mst_appointment_statuses from_status ON from_status.id = history.from_status_id
       JOIN tbl_users actor ON actor.id = history.changed_by
      WHERE history.appointment_id = $1
      ORDER BY history.changed_at, history.id`,
    [appointmentId]
  );
  return rows;
}

async function markOrderScheduled(client, order, userId) {
  if (order.order_status_code !== "ADVISED") return;
  const scheduledStatusId = await investigationStatusId(client, "SCHEDULED");
  await client.query(
    `UPDATE tbl_diagnostic_orders
        SET status_id = $2
      WHERE id = $1`,
    [order.id || order.diagnostic_order_id, scheduledStatusId]
  );
  await client.query(
    `UPDATE tbl_diagnostic_order_items
        SET status_id = $2
      WHERE order_id = $1`,
    [order.id || order.diagnostic_order_id, scheduledStatusId]
  );
  await client.query(
    `INSERT INTO tbl_diagnostic_status_history
       (order_id, item_id, from_status_id, to_status_id, changed_by, reason)
     VALUES ($1, NULL, $2, $3, $4, 'Diagnostic appointment confirmed')`,
    [order.id || order.diagnostic_order_id, order.status_id || null, scheduledStatusId, userId]
  );
}

async function createScheduleRequest(userId, req, orderId, input = {}) {
  const id = requireUuid(orderId, "Invalid diagnostic order ID");
  const requestedAt = futureDateTime(input.requested_at, "Preferred date and time");
  const facilityId = requirePositiveId(input.facility_id, "Invalid facility ID");
  const coordinationNotes = trimText(input.coordination_notes, "Coordination notes", { max: 2000 });
  const locationNote = trimText(input.location_note, "Location note", { max: 500 });
  const idempotencyKey = trimText(input.idempotency_key, "Idempotency key", { max: 100 });

  try {
    return await withTransaction(pool, async (client) => {
      await setActor(client, userId);
      const order = await assertNavigatorOrderAccess(client, userId, id);
      if (!(await hasConsent(client, order.patient_id, "DATA_PROCESSING"))) {
        throw new HttpError(403, "The patient has no active DATA_PROCESSING consent", "CONSENT_REQUIRED");
      }
      await assertFacilityActive(client, facilityId);

      if (idempotencyKey) {
        const existing = await client.query(
          `SELECT id FROM tbl_diagnostic_appointments
            WHERE booked_by = $1 AND idempotency_key = $2`,
          [userId, idempotencyKey]
        );
        if (existing.rows.length) {
          return { ...(await getAppointmentForUser(userId, req.user.role_name, existing.rows[0].id, { client })), idempotent_replay: true };
        }
      }

      await assertNoActiveBooking(client, order.id);
      await assertNoFacilityConflict(client, facilityId, requestedAt);
      const requestedStatusId = await appointmentStatusId(client, "REQUESTED");
      const { rows } = await client.query(
        `INSERT INTO tbl_diagnostic_appointments
           (diagnostic_order_id, patient_id, facility_id, requested_at, status_id,
            coordination_notes, location_note, booked_by, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, requested_at, diagnostic_order_id, patient_id`,
        [
          order.id,
          order.patient_id,
          facilityId,
          requestedAt,
          requestedStatusId,
          coordinationNotes,
          locationNote,
          userId,
          idempotencyKey,
        ]
      );
      const appointment = rows[0];
      await client.query(
        `INSERT INTO tbl_diagnostic_appointment_history
           (appointment_id, from_status_id, to_status_id, changed_by, reason)
         VALUES ($1, NULL, $2, $3, 'Navigator requested diagnostic appointment')`,
        [appointment.id, requestedStatusId, userId]
      );

      const staffIds = await facilityStaffUserIds(client, facilityId, userId);
      await notifyUsers(client, {
        recipients: staffIds,
        patientId: order.patient_id,
        event: "DIAGNOSTIC_APPOINTMENT_REQUESTED",
        title: "Diagnostic scheduling request",
        message: `A diagnostic appointment was requested for ${order.patient_code} (${order.order_code}).`,
        targetPath: `/hospital-staff/diagnostics/${appointment.id}`,
        appointmentId: appointment.id,
        orderId: order.id,
        dedupeKey: `DIAGNOSTIC_APPOINTMENT_REQUESTED:${appointment.id}`,
      });

      await audit(req, {
        client,
        required: true,
        event: "DIAGNOSTIC_APPOINTMENT_REQUESTED",
        resourceType: "diagnostic_appointment",
        resourceId: appointment.id,
        patientId: order.patient_id,
        metadata: { order_code: order.order_code, facility_id: facilityId },
      });

      return getAppointmentForUser(userId, "NAVIGATOR", appointment.id, { client });
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "This scheduling request was already submitted", "DUPLICATE_BOOKING");
    }
    throw error;
  }
}

async function lockHospitalStaffAppointment(client, userId, appointmentId) {
  const { rows } = await client.query(
    `${APPT_SELECT}
      WHERE appointment.id = $2
        AND EXISTS (
          SELECT 1
            FROM tbl_user_facility_assignments assignment
           WHERE assignment.user_id = $1
             AND assignment.facility_id = appointment.facility_id
             AND assignment.valid_from <= CURRENT_DATE
             AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
        )
      FOR UPDATE OF appointment`,
    [userId, appointmentId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Diagnostic appointment not found", "NOT_FOUND");
  }
  return rows[0];
}

async function confirmAppointment(userId, req, appointmentId, input = {}) {
  const id = requireUuid(appointmentId, "Invalid appointment ID");
  const confirmedAtTime = input.confirmed_at_time
    ? futureDateTime(input.confirmed_at_time, "Confirmed date and time")
    : null;
  const locationNote = trimText(input.location_note, "Location note", { max: 500 });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockHospitalStaffAppointment(client, userId, id);
    if (!["REQUESTED", "RESCHEDULED"].includes(appointment.status_code)) {
      throw new HttpError(409, "Only requested diagnostic appointments can be confirmed", "INVALID_TRANSITION");
    }
    const whenIso = confirmedAtTime || appointment.requested_at;
    await assertNoFacilityConflict(client, appointment.facility_id, whenIso, appointment.id);
    const confirmedId = await appointmentStatusId(client, "CONFIRMED");
    const { rows } = await client.query(
      `UPDATE tbl_diagnostic_appointments
          SET status_id = $2,
              confirmed_by = $3,
              confirmed_at = now(),
              confirmed_at_time = COALESCE($4::timestamptz, requested_at),
              location_note = COALESCE($5, location_note),
              version = version + 1
        WHERE id = $1
        RETURNING id`,
      [appointment.id, confirmedId, userId, confirmedAtTime, locationNote]
    );
    await client.query(
      `INSERT INTO tbl_diagnostic_appointment_history
         (appointment_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, 'Diagnostic appointment confirmed by Hospital Staff')`,
      [appointment.id, appointment.status_id, confirmedId, userId]
    );

    const order = await client.query(
      `SELECT diagnostic_order.id, diagnostic_order.status_id, status.code AS order_status_code,
              diagnostic_order.patient_id, diagnostic_order.order_code, diagnostic_order.referral_id,
              referral.assigned_navigator_id, patient.patient_code
         FROM tbl_diagnostic_orders diagnostic_order
         JOIN mst_investigation_statuses status ON status.id = diagnostic_order.status_id
         JOIN tbl_patients patient ON patient.id = diagnostic_order.patient_id
         LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
        WHERE diagnostic_order.id = $1
        FOR UPDATE OF diagnostic_order`,
      [appointment.diagnostic_order_id]
    );
    await markOrderScheduled(client, order.rows[0], userId);

    const hwId = await patientHealthWorkerId(client, appointment.patient_id);
    await notifyUsers(client, {
      recipients: [appointment.assigned_navigator_id || order.rows[0].assigned_navigator_id, hwId].filter(Boolean),
      patientId: appointment.patient_id,
      event: "DIAGNOSTIC_APPOINTMENT_CONFIRMED",
      title: "Diagnostic appointment confirmed",
      message: `Diagnostic appointment for ${order.rows[0].patient_code} (${order.rows[0].order_code}) was confirmed.`,
      targetPath: appointment.assigned_navigator_id
        ? `/navigator/diagnostics/appointments/${rows[0].id}`
        : `/health-worker/diagnostics/${rows[0].id}`,
      appointmentId: rows[0].id,
      orderId: appointment.diagnostic_order_id,
      dedupeKey: `DIAGNOSTIC_APPOINTMENT_CONFIRMED:${rows[0].id}`,
    });
    // Also notify HW with their own path when both exist
    if (hwId && appointment.assigned_navigator_id) {
      await notifyUsers(client, {
        recipients: [hwId],
        patientId: appointment.patient_id,
        event: "DIAGNOSTIC_APPOINTMENT_CONFIRMED",
        title: "Diagnostic appointment confirmed",
        message: `Diagnostic appointment for ${order.rows[0].patient_code} (${order.rows[0].order_code}) was confirmed.`,
        targetPath: `/health-worker/diagnostics/${rows[0].id}`,
        appointmentId: rows[0].id,
        orderId: appointment.diagnostic_order_id,
        dedupeKey: `DIAGNOSTIC_APPOINTMENT_CONFIRMED:${rows[0].id}:hw`,
      });
    }

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_APPOINTMENT_CONFIRMED",
      resourceType: "diagnostic_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
    });
    return getAppointmentForUser(userId, "HOSPITAL_STAFF", appointment.id, { client });
  });
}

async function suggestAlternative(userId, req, appointmentId, input = {}) {
  const id = requireUuid(appointmentId, "Invalid appointment ID");
  const suggestedAt = futureDateTime(input.suggested_at, "Suggested date and time");
  const reason = trimText(input.reason, "Reason", { required: true, max: 1000 });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockHospitalStaffAppointment(client, userId, id);
    if (appointment.status_code !== "REQUESTED") {
      throw new HttpError(409, "Only requested appointments can receive an alternative time", "INVALID_TRANSITION");
    }
    await assertNoFacilityConflict(client, appointment.facility_id, suggestedAt, appointment.id);
    const { rows } = await client.query(
      `UPDATE tbl_diagnostic_appointments
          SET requested_at = $2,
              coordination_notes = COALESCE($3, coordination_notes),
              version = version + 1
        WHERE id = $1
        RETURNING id`,
      [appointment.id, suggestedAt, reason]
    );
    await client.query(
      `INSERT INTO tbl_diagnostic_appointment_history
         (appointment_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, $2, $2, $3, $4)`,
      [appointment.id, appointment.status_id, userId, `Alternative time suggested: ${reason}`]
    );
    await notifyUsers(client, {
      recipients: [appointment.assigned_navigator_id].filter(Boolean),
      patientId: appointment.patient_id,
      event: "DIAGNOSTIC_APPOINTMENT_ALTERNATIVE",
      title: "Alternative diagnostic time suggested",
      message: `Hospital Staff suggested a new time for ${appointment.order_code}.`,
      targetPath: `/navigator/diagnostics/appointments/${rows[0].id}`,
      appointmentId: rows[0].id,
      orderId: appointment.diagnostic_order_id,
      dedupeKey: `DIAGNOSTIC_APPOINTMENT_ALTERNATIVE:${rows[0].id}:${suggestedAt}`,
    });
    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_APPOINTMENT_ALTERNATIVE",
      resourceType: "diagnostic_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
    });
    return getAppointmentForUser(userId, "HOSPITAL_STAFF", appointment.id, { client });
  });
}

async function rescheduleAppointment(userId, req, appointmentId, input = {}) {
  const id = requireUuid(appointmentId, "Invalid appointment ID");
  const scheduledAt = futureDateTime(input.scheduled_at, "New date and time");
  const reason = trimText(input.reason, "Reschedule reason", { required: true, max: 1000 });

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockHospitalStaffAppointment(client, userId, id);
    if (!["REQUESTED", "CONFIRMED"].includes(appointment.status_code)
      || appointment.attendance !== "PENDING") {
      throw new HttpError(409, "This diagnostic appointment cannot be rescheduled", "INVALID_TRANSITION");
    }
    await assertNoFacilityConflict(client, appointment.facility_id, scheduledAt, appointment.id);
    const rescheduledId = await appointmentStatusId(client, "RESCHEDULED");
    const confirmedId = await appointmentStatusId(client, "CONFIRMED");
    await client.query(
      `UPDATE tbl_diagnostic_appointments
          SET status_id = $2, cancel_reason = $3, version = version + 1
        WHERE id = $1`,
      [appointment.id, rescheduledId, reason]
    );
    await client.query(
      `INSERT INTO tbl_diagnostic_appointment_history
         (appointment_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [appointment.id, appointment.status_id, rescheduledId, userId, reason]
    );
    const { rows } = await client.query(
      `INSERT INTO tbl_diagnostic_appointments
         (diagnostic_order_id, patient_id, facility_id, requested_at, confirmed_at_time,
          status_id, coordination_notes, location_note, booked_by, confirmed_by, confirmed_at,
          rescheduled_from_id)
       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$8,now(),$9)
       RETURNING id`,
      [
        appointment.diagnostic_order_id,
        appointment.patient_id,
        appointment.facility_id,
        scheduledAt,
        confirmedId,
        appointment.coordination_notes,
        appointment.location_note,
        userId,
        appointment.id,
      ]
    );
    await client.query(
      `INSERT INTO tbl_diagnostic_appointment_history
         (appointment_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, NULL, $2, $3, $4)`,
      [rows[0].id, confirmedId, userId, reason]
    );

    const hwId = await patientHealthWorkerId(client, appointment.patient_id);
    await notifyUsers(client, {
      recipients: [appointment.assigned_navigator_id, hwId].filter(Boolean),
      patientId: appointment.patient_id,
      event: "DIAGNOSTIC_APPOINTMENT_RESCHEDULED",
      title: "Diagnostic appointment rescheduled",
      message: `Diagnostic appointment ${appointment.order_code} was rescheduled.`,
      targetPath: `/navigator/diagnostics/appointments/${rows[0].id}`,
      appointmentId: rows[0].id,
      orderId: appointment.diagnostic_order_id,
      dedupeKey: `DIAGNOSTIC_APPOINTMENT_RESCHEDULED:${rows[0].id}`,
    });
    if (hwId) {
      await notifyUsers(client, {
        recipients: [hwId],
        patientId: appointment.patient_id,
        event: "DIAGNOSTIC_APPOINTMENT_RESCHEDULED",
        title: "Diagnostic appointment rescheduled",
        message: `Diagnostic appointment ${appointment.order_code} was rescheduled.`,
        targetPath: `/health-worker/diagnostics/${rows[0].id}`,
        appointmentId: rows[0].id,
        orderId: appointment.diagnostic_order_id,
        dedupeKey: `DIAGNOSTIC_APPOINTMENT_RESCHEDULED:${rows[0].id}:hw`,
      });
    }

    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_APPOINTMENT_RESCHEDULED",
      resourceType: "diagnostic_appointment",
      resourceId: rows[0].id,
      patientId: appointment.patient_id,
      metadata: { previous_appointment_id: appointment.id },
    });
    return getAppointmentForUser(userId, "HOSPITAL_STAFF", rows[0].id, { client });
  });
}

async function cancelAppointment(userId, req, appointmentId, input = {}) {
  const id = requireUuid(appointmentId, "Invalid appointment ID");
  const reason = trimText(input.reason, "Cancellation reason", { required: true, max: 1000 });
  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const appointment = await lockHospitalStaffAppointment(client, userId, id);
    if (!["REQUESTED", "CONFIRMED"].includes(appointment.status_code)) {
      throw new HttpError(409, "This diagnostic appointment cannot be cancelled", "INVALID_TRANSITION");
    }
    const cancelledId = await appointmentStatusId(client, "CANCELLED");
    await client.query(
      `UPDATE tbl_diagnostic_appointments
          SET status_id = $2, cancel_reason = $3, version = version + 1
        WHERE id = $1`,
      [appointment.id, cancelledId, reason]
    );
    await client.query(
      `INSERT INTO tbl_diagnostic_appointment_history
         (appointment_id, from_status_id, to_status_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [appointment.id, appointment.status_id, cancelledId, userId, reason]
    );
    const hwId = await patientHealthWorkerId(client, appointment.patient_id);
    await notifyUsers(client, {
      recipients: [appointment.assigned_navigator_id, hwId].filter(Boolean),
      patientId: appointment.patient_id,
      event: "DIAGNOSTIC_APPOINTMENT_CANCELLED",
      title: "Diagnostic appointment cancelled",
      message: `Diagnostic appointment ${appointment.order_code} was cancelled.`,
      targetPath: `/navigator/diagnostics/appointments/${appointment.id}`,
      appointmentId: appointment.id,
      orderId: appointment.diagnostic_order_id,
      dedupeKey: `DIAGNOSTIC_APPOINTMENT_CANCELLED:${appointment.id}`,
    });
    await audit(req, {
      client,
      required: true,
      event: "DIAGNOSTIC_APPOINTMENT_CANCELLED",
      resourceType: "diagnostic_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
    });
    return { id: appointment.id, status_code: "CANCELLED" };
  });
}

async function updateHealthWorkerFollowup(userId, req, appointmentId, input = {}) {
  const id = requireUuid(appointmentId, "Invalid appointment ID");
  const contactStatus = String(input.contact_status || "").toUpperCase();
  if (contactStatus && !CONTACT_STATUSES.has(contactStatus)) {
    throw new HttpError(400, "Invalid contact status", "INVALID_CONTACT_STATUS");
  }
  const contactNotes = trimText(input.contact_notes, "Contact notes", { max: 2000 });
  const patientInformed = input.patient_informed === true || input.patient_informed === "true";
  const attendance = input.attendance ? String(input.attendance).toUpperCase() : null;
  if (attendance && !ATTENDANCE_VALUES.has(attendance)) {
    throw new HttpError(400, "Attendance must be ATTENDED or NO_SHOW", "INVALID_ATTENDANCE");
  }
  const missedReason = trimText(input.missed_reason_text, "Missed reason", { max: 1000 });
  if (attendance === "NO_SHOW" && !missedReason) {
    throw new HttpError(400, "A reason is required when the patient does not attend", "INVALID_ATTENDANCE");
  }

  return withTransaction(pool, async (client) => {
    await setActor(client, userId);
    const { rows } = await client.query(
      `${APPT_SELECT}
        WHERE appointment.id = $2
          AND patient.registered_by = $1
          AND fn_user_has_patient_access($1, appointment.patient_id)
        FOR UPDATE OF appointment`,
      [userId, id]
    );
    if (!rows.length) {
      throw new HttpError(404, "Diagnostic appointment not found", "NOT_FOUND");
    }
    const appointment = rows[0];

    if (attendance) {
      if (appointment.status_code !== "CONFIRMED" || appointment.attendance !== "PENDING") {
        throw new HttpError(409, "Attendance can only be recorded once for a confirmed appointment", "INVALID_ATTENDANCE");
      }
      const nextStatus = attendance === "ATTENDED" ? "COMPLETED" : "MISSED";
      const nextStatusId = await appointmentStatusId(client, nextStatus);
      await client.query(
        `UPDATE tbl_diagnostic_appointments
            SET status_id = $2,
                attendance = $3,
                attended_at = CASE WHEN $3 = 'ATTENDED' THEN now() ELSE NULL END,
                missed_reason_text = $4,
                version = version + 1
          WHERE id = $1`,
        [appointment.id, nextStatusId, attendance, missedReason]
      );
      await client.query(
        `INSERT INTO tbl_diagnostic_appointment_history
           (appointment_id, from_status_id, to_status_id, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [appointment.id, appointment.status_id, nextStatusId, userId, missedReason || `Attendance: ${attendance}`]
      );
      await notifyUsers(client, {
        recipients: [appointment.assigned_navigator_id].filter(Boolean),
        patientId: appointment.patient_id,
        event: "DIAGNOSTIC_APPOINTMENT_ATTENDANCE",
        title: "Diagnostic attendance recorded",
        message: `Attendance for ${appointment.order_code} was recorded as ${attendance}.`,
        targetPath: `/navigator/diagnostics/appointments/${appointment.id}`,
        appointmentId: appointment.id,
        orderId: appointment.diagnostic_order_id,
        dedupeKey: `DIAGNOSTIC_APPOINTMENT_ATTENDANCE:${appointment.id}:${attendance}`,
      });
      if (attendance === "ATTENDED") {
        const prescriber = await client.query(
          `SELECT diagnostic_order.prescribed_by, role.code AS prescribed_by_role
             FROM tbl_diagnostic_orders diagnostic_order
             JOIN tbl_users prescriber ON prescriber.id = diagnostic_order.prescribed_by
             JOIN mst_roles role ON role.id = prescriber.role_id
            WHERE diagnostic_order.id = $1
              AND prescriber.deleted_at IS NULL
              AND prescriber.status = 'ACTIVE'`,
          [appointment.diagnostic_order_id]
        );
        if (prescriber.rows[0]?.prescribed_by_role === "MEDICAL_OFFICER") {
          await createInAppNotifications(client, {
            recipients: [prescriber.rows[0].prescribed_by],
            patientId: appointment.patient_id,
            event: "DIAGNOSTIC_REPORT_FOR_MO",
            title: "Diagnostic attendance completed",
            message: `Diagnostic appointment ${appointment.order_code} was attended. Review the order and clinical next steps.`,
            targetPath: `/medical-officer/diagnostics/${appointment.diagnostic_order_id}`,
            dedupeKey: `DIAGNOSTIC_REPORT_FOR_MO:${appointment.id}`,
            extraPayload: {
              diagnostic_order_id: appointment.diagnostic_order_id,
              diagnostic_appointment_id: appointment.id,
            },
          });
        }
      }
    } else {
      await client.query(
        `UPDATE tbl_diagnostic_appointments
            SET contact_status = COALESCE($2, contact_status),
                contact_notes = COALESCE($3, contact_notes),
                patient_informed = CASE WHEN $4 THEN TRUE ELSE patient_informed END,
                patient_informed_at = CASE WHEN $4 AND patient_informed IS FALSE THEN now()
                                           WHEN $4 THEN COALESCE(patient_informed_at, now())
                                           ELSE patient_informed_at END,
                version = version + 1
          WHERE id = $1`,
        [appointment.id, contactStatus || null, contactNotes, patientInformed]
      );
      await client.query(
        `INSERT INTO tbl_diagnostic_appointment_history
           (appointment_id, from_status_id, to_status_id, changed_by, reason)
         VALUES ($1, $2, $2, $3, $4)`,
        [
          appointment.id,
          appointment.status_id,
          userId,
          `Health Worker follow-up: ${contactStatus || (patientInformed ? "INFORMED" : "UPDATED")}`,
        ]
      );
      // HW update → Navigator first; Navigator then coordinates with Medical Officer.
      await notifyUsers(client, {
        recipients: [appointment.assigned_navigator_id].filter(Boolean),
        patientId: appointment.patient_id,
        event: "DIAGNOSTIC_HW_FOLLOWUP",
        title: "Health Worker diagnostic update",
        message: `Health Worker updated diagnostic follow-up for ${appointment.order_code}.`,
        targetPath: `/navigator/diagnostics/appointments/${appointment.id}`,
        appointmentId: appointment.id,
        orderId: appointment.diagnostic_order_id,
        dedupeKey: `DIAGNOSTIC_HW_FOLLOWUP:${appointment.id}:${contactStatus || "INFORMED"}:${Date.now()}`,
      });
    }

    await audit(req, {
      client,
      required: true,
      event: attendance ? "DIAGNOSTIC_APPOINTMENT_ATTENDANCE" : "DIAGNOSTIC_APPOINTMENT_CONTACT",
      resourceType: "diagnostic_appointment",
      resourceId: appointment.id,
      patientId: appointment.patient_id,
      metadata: { attendance, contact_status: contactStatus || null },
    });
    return getAppointmentForUser(userId, "HEALTH_WORKER", appointment.id, { client });
  });
}

async function getAppointmentForUser(userId, roleName, appointmentId, { client = pool } = {}) {
  const id = requireUuid(appointmentId, "Invalid appointment ID");
  let scopeSql = "";
  if (roleName === "NAVIGATOR") {
    scopeSql = `AND (
      referral.assigned_navigator_id = $1
      OR EXISTS (
        SELECT 1 FROM tbl_referrals open_referral
         WHERE open_referral.patient_id = appointment.patient_id
           AND open_referral.assigned_navigator_id = $1
      )
    )`;
  } else if (roleName === "HOSPITAL_STAFF") {
    scopeSql = `AND EXISTS (
      SELECT 1 FROM tbl_user_facility_assignments assignment
       WHERE assignment.user_id = $1
         AND assignment.facility_id = appointment.facility_id
         AND assignment.valid_from <= CURRENT_DATE
         AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
    )`;
  } else if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND patient.registered_by = $1 AND fn_user_has_patient_access($1, appointment.patient_id)`;
  } else if (!["SYSTEM_ADMIN", "SUPER_ADMIN", "MEDICAL_OFFICER", "SPECIALIST"].includes(roleName)) {
    throw new HttpError(403, "You are not allowed to view diagnostic appointments", "FORBIDDEN");
  }

  const { rows } = await client.query(
    `${APPT_SELECT}
      WHERE appointment.id = $2
        ${scopeSql || "AND fn_user_has_patient_access($1, appointment.patient_id)"}`,
    [userId, id]
  );
  if (!rows.length) throw new HttpError(404, "Diagnostic appointment not found", "NOT_FOUND");
  const items = await loadOrderItems(client, rows[0].diagnostic_order_id);
  const history = await loadAppointmentHistory(client, id);
  return { appointment: { ...rows[0], items, history } };
}

async function listAppointments(userId, roleName, query = {}) {
  const { page, pageSize, offset } = pageOptions(query, 20);
  const values = [userId];
  let scopeSql = "";

  if (roleName === "NAVIGATOR") {
    scopeSql = `AND (
      referral.assigned_navigator_id = $1
      OR EXISTS (
        SELECT 1 FROM tbl_referrals open_referral
         WHERE open_referral.patient_id = appointment.patient_id
           AND open_referral.assigned_navigator_id = $1
      )
    )`;
  } else if (roleName === "HOSPITAL_STAFF") {
    scopeSql = `AND EXISTS (
      SELECT 1 FROM tbl_user_facility_assignments assignment
       WHERE assignment.user_id = $1
         AND assignment.facility_id = appointment.facility_id
         AND assignment.valid_from <= CURRENT_DATE
         AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
    )`;
  } else if (roleName === "HEALTH_WORKER") {
    scopeSql = `AND patient.registered_by = $1 AND fn_user_has_patient_access($1, appointment.patient_id)`;
  } else {
    throw new HttpError(403, "You are not allowed to list diagnostic appointments", "FORBIDDEN");
  }

  if (query.status) {
    scopeSql += ` AND status.code = $${values.push(String(query.status).toUpperCase())}`;
  }
  if (query.pending_only === "true" || query.pending_only === true) {
    scopeSql += " AND status.is_terminal IS FALSE";
  }
  if (query.order_id) {
    scopeSql += ` AND appointment.diagnostic_order_id = $${values.push(requireUuid(query.order_id, "Invalid order ID"))}`;
  }
  if (query.missed_only === "true" || query.missed_only === true) {
    scopeSql += " AND status.code = 'MISSED'";
  }

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM tbl_diagnostic_appointments appointment
       JOIN mst_appointment_statuses status ON status.id = appointment.status_id
       JOIN tbl_diagnostic_orders diagnostic_order ON diagnostic_order.id = appointment.diagnostic_order_id
       JOIN tbl_patients patient ON patient.id = appointment.patient_id AND patient.deleted_at IS NULL
       LEFT JOIN tbl_referrals referral ON referral.id = diagnostic_order.referral_id
      WHERE 1=1 ${scopeSql}`,
    values
  );
  const listValues = [...values, pageSize, offset];
  const { rows } = await pool.query(
    `${APPT_SELECT}
      WHERE 1=1 ${scopeSql}
      ORDER BY COALESCE(appointment.confirmed_at_time, appointment.requested_at) DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );

  const appointments = [];
  for (const row of rows) {
    appointments.push({
      ...row,
      items: await loadOrderItems(pool, row.diagnostic_order_id),
    });
  }
  return {
    appointments,
    pagination: pagination(page, pageSize, count.rows[0].total),
  };
}

async function listFacilitiesForNavigator(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT facility.id, facility.name_en, facility.name_te, facility.facility_type
       FROM mst_facilities facility
       JOIN tbl_referrals referral
         ON (
           (facility.facility_type = 'HOSPITAL' AND facility.hospital_id = referral.to_hospital_id)
           OR facility.facility_type = 'PHC'
         )
      WHERE referral.assigned_navigator_id = $1
        AND facility.is_active IS TRUE
        AND facility.facility_type IN ('HOSPITAL', 'PHC')
      ORDER BY facility.name_en
      LIMIT 200`,
    [userId]
  );
  // Fallback: all active hospital/PHC if navigator has no linked referral facilities yet
  if (!rows.length) {
    const all = await pool.query(
      `SELECT facility.id, facility.name_en, facility.name_te, facility.facility_type
         FROM mst_facilities facility
        WHERE facility.is_active IS TRUE
          AND facility.facility_type IN ('HOSPITAL', 'PHC')
        ORDER BY facility.name_en
        LIMIT 200`
    );
    return { facilities: all.rows };
  }
  return { facilities: rows };
}

module.exports = {
  createScheduleRequest,
  confirmAppointment,
  suggestAlternative,
  rescheduleAppointment,
  cancelAppointment,
  updateHealthWorkerFollowup,
  getAppointmentForUser,
  listAppointments,
  listFacilitiesForNavigator,
};
