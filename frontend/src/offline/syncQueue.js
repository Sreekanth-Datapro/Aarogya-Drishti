/**
 * Sync encrypted offline registration drafts to POST /patients.
 * Runs only when the user has a real online session (access token present).
 */
import api from "../services/api";
import { DRAFT_STATUS } from "./constants";
import {
  listRegistrationDrafts,
  loadDraftPayload,
  removeDraft,
  toRegistrationApiBody,
  updateDraftStatus,
} from "./drafts";
import { wipeAllOfflineData } from "./vault";

let syncing = false;

function hasOnlineToken() {
  return Boolean(sessionStorage.getItem("accessToken"));
}

/**
 * @param {{ pin: string, userId: string|number, confirmMap?: Record<string, string[]> }} options
 */
export async function syncPendingRegistrations({ pin, userId, confirmMap = {} }) {
  if (!pin || !userId) {
    return { synced: 0, failed: 0, needsConfirmation: 0, skipped: true, reason: "missing_pin_or_user" };
  }
  if (!hasOnlineToken()) {
    return { synced: 0, failed: 0, needsConfirmation: 0, skipped: true, reason: "not_online_authenticated" };
  }
  if (syncing) {
    return { synced: 0, failed: 0, needsConfirmation: 0, skipped: true, reason: "already_syncing" };
  }

  syncing = true;
  const summary = { synced: 0, failed: 0, needsConfirmation: 0, skipped: false, errors: [] };

  try {
    const drafts = await listRegistrationDrafts(userId);
    for (const draft of drafts) {
      if (draft.status === DRAFT_STATUS.SYNCED) continue;

      await updateDraftStatus(draft.idempotency_key, DRAFT_STATUS.SYNCING);
      try {
        const loaded = await loadDraftPayload(pin, draft.idempotency_key);
        if (!loaded) {
          summary.failed += 1;
          continue;
        }

        const confirmIds = confirmMap[draft.idempotency_key] || [];
        const confirm = confirmIds.length > 0 || draft.status === DRAFT_STATUS.NEEDS_CONFIRMATION;

        if (!confirm) {
          const dupe = await api.post("/patients/duplicate-check", toRegistrationApiBody(loaded.payload));
          const matches = dupe.data?.matches || dupe.data?.duplicates || [];
          if (Array.isArray(matches) && matches.length > 0) {
            await updateDraftStatus(
              draft.idempotency_key,
              DRAFT_STATUS.NEEDS_CONFIRMATION,
              "Possible duplicate patients found. Confirm online to continue."
            );
            summary.needsConfirmation += 1;
            continue;
          }
        }

        const body = toRegistrationApiBody(loaded.payload, {
          confirm_possible_duplicate: confirm,
          confirmed_duplicate_ids: confirmIds,
        });
        const response = await api.post("/patients", body);
        const patient = response.data?.patient;
        const syncedOk =
          response.status === 201
          || response.status === 200
          || patient?.already_registered
          || response.data?.success;
        if (syncedOk) {
          await removeDraft(draft.idempotency_key);
          summary.synced += 1;
        } else {
          await updateDraftStatus(draft.idempotency_key, DRAFT_STATUS.FAILED, "Unexpected server response");
          summary.failed += 1;
        }
      } catch (error) {
        const status = error?.response?.status;
        const code = error?.response?.data?.code || error?.response?.data?.error;
        const message =
          error?.response?.data?.message ||
          error?.message ||
          "Sync failed";

        if (status === 401 || status === 403) {
          summary.errors.push(message);
          summary.failed += 1;
          await updateDraftStatus(draft.idempotency_key, DRAFT_STATUS.FAILED, message);
          if (status === 403 && /inactive|revok|forbidden|LOCATION_NOT_ASSIGNED/i.test(`${code} ${message}`)) {
            // Access revoked — wipe local vault so offline data cannot be reused.
            if (/inactive|revok|account/i.test(`${code} ${message}`)) {
              await wipeAllOfflineData();
            }
          }
          break;
        }

        if (status === 409 || code === "POSSIBLE_DUPLICATES") {
          await updateDraftStatus(
            draft.idempotency_key,
            DRAFT_STATUS.NEEDS_CONFIRMATION,
            message
          );
          summary.needsConfirmation += 1;
          continue;
        }

        // Idempotent unique conflict: treat as already synced
        if (status === 409 || code === "DUPLICATE_SUBMISSION") {
          await removeDraft(draft.idempotency_key);
          summary.synced += 1;
          continue;
        }

        await updateDraftStatus(draft.idempotency_key, DRAFT_STATUS.FAILED, message);
        summary.failed += 1;
        summary.errors.push(message);
      }
    }
  } finally {
    syncing = false;
  }

  return summary;
}

export function isSyncInProgress() {
  return syncing;
}
