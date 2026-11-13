const crypto = require("crypto");
const HttpError = require("../utils/httpError");

const JOIN_EARLY_MS = 10 * 60 * 1000;
const MEETING_GRACE_MS = 15 * 60 * 1000;
const ACCESS_TICKET_TTL_MS = 15 * 60 * 1000;
const TIME_ZONE = "Asia/Kolkata";
const DEFAULT_PUBLIC_DOMAIN = "meet.jit.si";

function readConfig() {
  const provider = String(process.env.VIDEO_PROVIDER || "").trim().toLowerCase();
  const domain = String(process.env.JITSI_DOMAIN || "").trim() || DEFAULT_PUBLIC_DOMAIN;
  return { provider, domain };
}

function isVideoProviderConfigured() {
  const { provider, domain } = readConfig();
  // Public Jitsi (meet.jit.si) needs only the provider flag and a domain.
  // No JITSI_APP_ID / JITSI_APP_SECRET — those are for self-hosted JWT rooms.
  return provider === "jitsi" && Boolean(domain);
}

function requireVideoProviderConfigured() {
  if (!isVideoProviderConfigured()) {
    throw new HttpError(
      503,
      "Video meetings are not configured. Set VIDEO_PROVIDER=jitsi and JITSI_DOMAIN=meet.jit.si on the server, then retry meeting provisioning.",
      "VIDEO_PROVIDER_NOT_CONFIGURED"
    );
  }
  return readConfig();
}

/**
 * Opaque room name only. Never put patient name, phone, ID, or clinical text here.
 * Random bytes make the room hard to guess; the same consultation reuses room_ref from DB.
 */
function opaqueRoomRef() {
  const room = `ad-${crypto.randomBytes(16).toString("hex")}`;
  if (/^(https?:)?\/\//i.test(room)) {
    throw new HttpError(500, "Invalid meeting room reference", "MEETING_ROOM_INVALID");
  }
  return room;
}

function meetingExpiresAt(slotEnd) {
  const end = new Date(slotEnd);
  if (Number.isNaN(end.getTime())) {
    throw new HttpError(500, "Consultation slot end time is invalid", "CONFIGURATION_ERROR");
  }
  return new Date(end.getTime() + MEETING_GRACE_MS);
}

function deriveLifecycle({
  statusCode,
  isActive,
  slotStart,
  slotEnd,
  meetingExpiresAt: expiresAt,
  attendance = null,
  now = new Date(),
}) {
  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  const expiry = expiresAt ? new Date(expiresAt) : new Date(end.getTime() + MEETING_GRACE_MS);
  if (statusCode === "MISSED" || attendance === "NO_SHOW") {
    return {
      lifecycle_status: "MISSED",
      can_join: false,
      join_blocked_reason: "MISSED",
    };
  }
  if (isActive === false || statusCode === "CANCELLED") {
    const replaced = statusCode === "RESCHEDULED";
    return {
      lifecycle_status: replaced ? "RESCHEDULED" : "CANCELLED",
      can_join: false,
      join_blocked_reason: replaced ? "RESCHEDULED" : "CANCELLED",
    };
  }
  if (statusCode === "COMPLETED" || attendance === "ATTENDED") {
    return {
      lifecycle_status: "COMPLETED",
      can_join: false,
      join_blocked_reason: "COMPLETED",
    };
  }
  if (!(statusCode === "CONFIRMED" || statusCode === "RESCHEDULED")) {
    return {
      lifecycle_status: "UNAVAILABLE",
      can_join: false,
      join_blocked_reason: "NOT_CONFIRMED",
    };
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      lifecycle_status: "UNAVAILABLE",
      can_join: false,
      join_blocked_reason: "INVALID_SCHEDULE",
    };
  }
  if (now.getTime() > expiry.getTime()) {
    return {
      lifecycle_status: "EXPIRED",
      can_join: false,
      join_blocked_reason: "EXPIRED",
    };
  }
  if (now.getTime() < start.getTime() - JOIN_EARLY_MS) {
    return {
      lifecycle_status: "SCHEDULED",
      can_join: false,
      join_blocked_reason: "TOO_EARLY",
    };
  }
  if (now.getTime() <= end.getTime() || now.getTime() <= expiry.getTime()) {
    const inProgress = now.getTime() >= start.getTime();
    return {
      lifecycle_status: inProgress ? "IN_PROGRESS" : "SCHEDULED",
      can_join: true,
      join_blocked_reason: null,
    };
  }
  return {
    lifecycle_status: "EXPIRED",
    can_join: false,
    join_blocked_reason: "EXPIRED",
  };
}

function formatInKolkata(value, language = "en") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function kolkataDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Public meet.jit.si access payload for the React IFrame API.
 * No Jitsi JWT — room access is gated by our authenticated join API only.
 * Limitation: anyone who learns the room name can attempt to join on meet.jit.si.
 */
function issuePublicMeetingAccess({
  roomRef,
  userId,
  displayName,
  moderator = false,
}) {
  const config = requireVideoProviderConfigured();
  const accessTicket = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + ACCESS_TICKET_TTL_MS);
  return {
    provider: "jitsi",
    domain: config.domain,
    room_ref: roomRef,
    display_name: displayName || "Participant",
    user_id: String(userId),
    moderator: moderator === true,
    // Kept for audit in tbl_video_join_tokens; never a Jitsi JWT.
    jwt: null,
    token_hash: hashToken(accessTicket),
    expires_at: expiresAt,
    join_url: `https://${config.domain}/${encodeURIComponent(roomRef)}`,
    public_room_warning: true,
  };
}

/**
 * Idempotent meeting provision: sets provider/room_ref/meeting_expires_at when missing.
 * Reuses the stored room_ref so reconnects join the same room.
 */
async function ensureMeetingProvisioned(client, consultation, slot) {
  if (!consultation?.id) {
    throw new HttpError(500, "Consultation is required to provision a meeting", "CONFIGURATION_ERROR");
  }
  if (["CANCELLED"].includes(consultation.status_code) || consultation.is_active === false) {
    throw new HttpError(409, "Cancelled consultations cannot receive a meeting", "MEETING_NOT_ALLOWED");
  }

  if (consultation.provider && consultation.room_ref) {
    return {
      provisioned: true,
      already_existed: true,
      provider: consultation.provider,
      room_ref: consultation.room_ref,
      meeting_expires_at: consultation.meeting_expires_at,
    };
  }

  requireVideoProviderConfigured();
  const roomRef = opaqueRoomRef();
  const expiresAt = meetingExpiresAt(slot.slot_end || consultation.slot_end);

  const { rows } = await client.query(
    `UPDATE tbl_video_consultations
        SET provider = COALESCE(provider, 'jitsi'),
            room_ref = COALESCE(room_ref, $2),
            meeting_expires_at = COALESCE(meeting_expires_at, $3)
      WHERE id = $1
        AND is_active IS TRUE
        AND (provider IS NULL OR room_ref IS NULL)
      RETURNING id, provider, room_ref, meeting_expires_at`,
    [consultation.id, roomRef, expiresAt]
  );

  if (!rows.length) {
    const existing = await client.query(
      `SELECT id, provider, room_ref, meeting_expires_at
         FROM tbl_video_consultations
        WHERE id = $1`,
      [consultation.id]
    );
    if (existing.rows[0]?.provider && existing.rows[0]?.room_ref) {
      return {
        provisioned: true,
        already_existed: true,
        provider: existing.rows[0].provider,
        room_ref: existing.rows[0].room_ref,
        meeting_expires_at: existing.rows[0].meeting_expires_at,
      };
    }
    throw new HttpError(409, "The consultation changed before the meeting could be created", "MEETING_PROVISION_CONFLICT");
  }

  return {
    provisioned: true,
    already_existed: false,
    provider: rows[0].provider,
    room_ref: rows[0].room_ref,
    meeting_expires_at: rows[0].meeting_expires_at,
  };
}

module.exports = {
  TIME_ZONE,
  JOIN_EARLY_MS,
  MEETING_GRACE_MS,
  DEFAULT_PUBLIC_DOMAIN,
  isVideoProviderConfigured,
  requireVideoProviderConfigured,
  opaqueRoomRef,
  meetingExpiresAt,
  deriveLifecycle,
  formatInKolkata,
  kolkataDateKey,
  hashToken,
  issuePublicMeetingAccess,
  ensureMeetingProvisioned,
  readConfig,
};
