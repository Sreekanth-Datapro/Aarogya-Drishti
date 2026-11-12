/**
 * Encrypted offline patient registration drafts (outbox).
 * Never claims the server accepted a registration until sync confirms it.
 */
import { DRAFT_STATUS } from "./constants";
import { decryptJson, encryptJson } from "./crypto";
import {
  draftDelete,
  draftGet,
  draftPut,
  draftsByUser,
} from "./db";

function requirePin(pin) {
  if (!pin) throw new Error("OFFLINE_PIN_REQUIRED");
}

/**
 * Save or update a registration draft for a Health Worker.
 * `payload` is the same shape sent to POST /patients (plus UI helpers stripped later).
 */
export async function saveRegistrationDraft({ pin, userId, payload, status = DRAFT_STATUS.PENDING, errorMessage = "" }) {
  requirePin(pin);
  if (!userId) throw new Error("OFFLINE_USER_REQUIRED");
  const idempotencyKey = payload.idempotency_key;
  if (!idempotencyKey) throw new Error("OFFLINE_IDEMPOTENCY_REQUIRED");

  const existing = await draftGet(idempotencyKey);
  const clientCreatedAt = payload.client_created_at || existing?.client_created_at || new Date().toISOString();
  const consentCapturedAt = payload.consent_captured_at || existing?.consent_captured_at || new Date().toISOString();

  const body = {
    ...payload,
    idempotency_key: idempotencyKey,
    client_created_at: clientCreatedAt,
    consent_captured_at: consentCapturedAt,
  };

  const envelope = await encryptJson(pin, body);
  const record = {
    idempotency_key: idempotencyKey,
    user_id: String(userId),
    status,
    error_message: errorMessage || "",
    client_created_at: clientCreatedAt,
    consent_captured_at: consentCapturedAt,
    updated_at: new Date().toISOString(),
    envelope,
    // Non-sensitive label for list UI without decrypting
    display_name: String(payload.full_name || "").slice(0, 150),
  };
  await draftPut(record);
  return record;
}

export async function listRegistrationDrafts(userId) {
  const rows = await draftsByUser(String(userId));
  return rows
    .filter((row) => row.status !== DRAFT_STATUS.SYNCED)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function countPendingDrafts(userId) {
  const rows = await draftsByUser(String(userId));
  return rows.filter((row) =>
    [DRAFT_STATUS.PENDING, DRAFT_STATUS.FAILED, DRAFT_STATUS.NEEDS_CONFIRMATION, DRAFT_STATUS.SYNCING].includes(row.status)
  ).length;
}

export async function loadDraftPayload(pin, idempotencyKey) {
  requirePin(pin);
  const row = await draftGet(idempotencyKey);
  if (!row) return null;
  const payload = await decryptJson(pin, row.envelope);
  return { record: row, payload };
}

export async function updateDraftStatus(idempotencyKey, status, errorMessage = "") {
  const row = await draftGet(idempotencyKey);
  if (!row) return null;
  const next = {
    ...row,
    status,
    error_message: errorMessage || "",
    updated_at: new Date().toISOString(),
  };
  await draftPut(next);
  return next;
}

export async function removeDraft(idempotencyKey) {
  await draftDelete(idempotencyKey);
}

/** Build the API body for POST /patients from a decrypted draft payload. */
export function toRegistrationApiBody(payload, extras = {}) {
  return {
    full_name: payload.full_name,
    sex: payload.sex,
    age_years: payload.age_years === "" || payload.age_years == null ? null : Number(payload.age_years),
    date_of_birth: payload.date_of_birth || null,
    preferred_language_id: payload.preferred_language_id,
    village_id: Number(payload.village_id),
    facility_id: Number(payload.facility_id),
    habitation: payload.habitation || "",
    address_line: payload.address_line || "",
    consents: payload.consents,
    consent_method: payload.consent_method,
    witness_name: payload.witness_name || "",
    idempotency_key: payload.idempotency_key,
    // Client-claimed offline times (server validates and stores separately from created_at)
    client_created_at: payload.client_created_at || null,
    consent_captured_at: payload.consent_captured_at || null,
    confirm_possible_duplicate: Boolean(extras.confirm_possible_duplicate),
    confirmed_duplicate_ids: extras.confirmed_duplicate_ids || [],
  };
}
