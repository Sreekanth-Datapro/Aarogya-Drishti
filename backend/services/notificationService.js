const pool = require("../db");
const HttpError = require("../utils/httpError");

const NOTIFICATION_LIMIT = 50;

/**
 * Create IN_APP inbox rows for one or more recipients.
 * Reuses existing mst_notification_templates and dedupe_key payload keys.
 * Does not introduce new notification tables.
 */
async function createInAppNotifications(client, {
  recipients = [],
  patientId = null,
  event,
  title,
  message,
  targetPath,
  dedupeKey = null,
  extraPayload = {},
} = {}) {
  const unique = [...new Set((recipients || []).filter(Boolean))];
  if (!unique.length || !event || !title || !message) return 0;

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
  if (!template.rows.length) return 0;

  let created = 0;
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
      ...(key ? { dedupe_key: key } : {}),
      ...extraPayload,
    };

    await client.query(
      `INSERT INTO tbl_notifications
         (recipient_user_id, patient_id, template_id, channel, language_id, status, payload, sent_at)
       VALUES ($1, $2, $3, 'IN_APP', $4, 'SENT', $5::jsonb, now())`,
      [
        recipientUserId,
        patientId,
        template.rows[0].id,
        template.rows[0].language_id,
        JSON.stringify(payload),
      ]
    );
    created += 1;
  }
  return created;
}

async function listActiveMedicalOfficersForPatient(client, patientId) {
  if (!patientId) return [];
  const { rows } = await client.query(
    `SELECT DISTINCT officer.id
       FROM tbl_patients patient
       LEFT JOIN mst_villages village ON village.id = patient.village_id
       JOIN tbl_medical_officer_mandal_assignments assignment
         ON assignment.mandal_id = COALESCE(patient.mandal_id, village.mandal_id)
        AND assignment.valid_from <= CURRENT_DATE
        AND (assignment.valid_to IS NULL OR assignment.valid_to >= CURRENT_DATE)
       JOIN tbl_users officer ON officer.id = assignment.user_id
       JOIN mst_roles role ON role.id = officer.role_id
      WHERE patient.id = $1
        AND patient.deleted_at IS NULL
        AND officer.deleted_at IS NULL
        AND officer.status = 'ACTIVE'
        AND role.code = 'MEDICAL_OFFICER'
        AND role.is_active IS TRUE`,
    [patientId]
  );
  return rows.map((row) => row.id);
}

function notificationTarget(payload = {}) {
  if (typeof payload.target_path === "string" && payload.target_path.startsWith("/")) {
    return payload.target_path;
  }
  const requestId = payload.request_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || "")) {
    return null;
  }
  if (payload.event === "SPECIALIST_AVAILABILITY_REQUEST") {
    return `/specialist/referrals#availability-request-${requestId}`;
  }
  if ([
    "SPECIALIST_AVAILABILITY_RESPONSE",
    "SPECIALIST_AVAILABILITY_ALTERNATIVE",
    "SPECIALIST_AVAILABILITY_UNAVAILABLE",
    "NAVIGATOR_VIDEO_PREFERRED_TIME",
    "HOSPITAL_VIDEO_REQUEST_DECLINED",
    "HOSPITAL_VIDEO_REQUEST_RESCHEDULED",
  ].includes(payload.event)) {
    return payload.target_path
      || `/hospital-staff/appointments#video-availability-request-${requestId}`;
  }
  // Absolute app paths are already returned above. External or unrecognized
  // payloads must not become navigation links.
  if (payload.event === "VIDEO_APPOINTMENT_CONFIRMED" || payload.event === "TRACKING_NEXT_ACTION") {
    return null;
  }
  return null;
}

async function listForUser(userId) {
  const [notifications, unread] = await Promise.all([
    pool.query(
      `SELECT notification.id, notification.created_at,
              notification.status::text AS delivery_status,
              notification.payload, template.subject, template.body,
              notification.payload->>'read_at' IS NOT NULL AS is_read
         FROM tbl_notifications notification
         JOIN mst_notification_templates template ON template.id = notification.template_id
        WHERE notification.recipient_user_id = $1
          AND notification.channel = 'IN_APP'
          AND notification.status <> 'CANCELLED'
        ORDER BY notification.created_at DESC
        LIMIT $2`,
      [userId, NOTIFICATION_LIMIT]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS unread_count
         FROM tbl_notifications notification
        WHERE notification.recipient_user_id = $1
          AND notification.channel = 'IN_APP'
          AND notification.status NOT IN ('CANCELLED', 'FAILED')
          AND notification.payload->>'read_at' IS NULL`,
      [userId]
    ),
  ]);

  return {
    unread_count: unread.rows[0]?.unread_count || 0,
    notifications: notifications.rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      delivery_status: row.delivery_status,
      is_read: row.is_read,
      event_type: row.payload?.event || null,
      title: row.payload?.title || row.subject || "",
      message: row.payload?.message || row.body || "",
      target_path: notificationTarget(row.payload),
    })),
  };
}

async function markRead(userId, notificationId) {
  const { rows } = await pool.query(
    `UPDATE tbl_notifications
        SET payload = jsonb_set(
          COALESCE(payload, '{}'::jsonb),
          '{read_at}',
          to_jsonb(now()::text),
          TRUE
        )
      WHERE id = $1
        AND recipient_user_id = $2
        AND channel = 'IN_APP'
      RETURNING id, payload->>'read_at' AS read_at`,
    [notificationId, userId]
  );
  if (!rows.length) {
    throw new HttpError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
  }
  return rows[0];
}

module.exports = {
  listForUser,
  markRead,
  notificationTarget,
  createInAppNotifications,
  listActiveMedicalOfficersForPatient,
};
