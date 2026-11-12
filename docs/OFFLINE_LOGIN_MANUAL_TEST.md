# Offline Login + Patient Registration — Manual Test Checklist

Use a Health Worker account that can complete MFA. Chrome DevTools → Application / Network as noted.

## 1. Online MFA → enable offline PIN

1. Sign in online and complete MFA.
2. Open **Settings**.
3. Under **Offline access**, set a 4–12 digit PIN and confirm.
4. Confirm status shows **Enabled on this device**.
5. Application → IndexedDB → `aarogya-offline`: `meta` has `pin_verifier`, `vault_envelope`, `vault_public`. No password/token fields.

## 2. Offline PIN unlock (no `/auth/login`)

1. Sign out (or clear `sessionStorage` access token).
2. DevTools → Network → Offline.
3. Reload the app (SPA shell from SW `aarogya-drishti-v7` should load).
4. On Login, open **Unlock with offline PIN**, enter PIN.
5. Confirm Network has **no** `/api/auth/login` call.
6. Land on registration or dashboard offline CTA; banner shows **OFFLINE MODE**.

## 3. Offline draft + refresh

1. While offline-unlocked, open **Register patient**.
2. Complete a valid form and submit → **Save draft (Pending Sync)**.
3. Confirm draft appears under **Pending Sync** (not as a server patient code).
4. Refresh the page → unlock with PIN again → draft still listed.
5. Confirm IndexedDB `drafts` store has an encrypted `envelope` (no plaintext PHI in `meta`).

## 4. Reconnect + sync → PostgreSQL

1. Go online; sign in online + MFA (same HW).
2. Settings or Patient Registration → **Sync now** (enter PIN if prompted).
3. Confirm draft disappears after success.
4. Confirm patient appears in **My patients** / DB via `POST /api/patients` (201 or idempotent 200).
5. Repeat sync with the same draft key → no second patient (idempotency).

## 5. Logout / expiry / role gate

1. With pending drafts, attempt logout → warning with count; confirm wipes vault + drafts.
2. Enable offline again; set `vault_public.lastOnlineAuthAt` older than 24h (or wait) → unlock shows expired; online MFA renews TTL.
3. Non–Health Worker: Settings has no enable control / enable API path rejects `OFFLINE_ROLE_DENIED`.

## 6. Service worker inspection

1. Application → Cache Storage → `aarogya-drishti-v7`.
2. Confirm only shell/static/icons; **no** `/api/*`, tokens, or patient payloads.
3. Cold offline navigation serves `index.html` shell (not only `offline.html`).
4. After deploy of v7 over an older SW: activate should drop v3–v6 Cache Storage keys; IndexedDB drafts must remain.

## 7. PIN lockout (refresh-safe)

1. Offline-unlock with a wrong PIN four times → attempts remaining decreases.
2. Fifth wrong PIN → locked (≈30s); correct PIN also rejected while locked.
3. Hard-refresh the page during lockout → lockout still active (IndexedDB `meta.pin_lockout`).
4. After delay, correct PIN unlocks; `pin_lockout.failedAttempts` resets to 0.
5. Confirm IndexedDB never stores the PIN in plaintext.

## 8. Offline registration timestamps after sync

1. Save an offline draft; note draft `client_created_at` / `consent_captured_at` in the encrypted payload after unlock+inspect via sync request body.
2. Go online, MFA, sync.
3. In DB (synthetic patient only): `tbl_patients.client_created_at` matches the client claim; `tbl_patients.created_at` is server receipt time (may differ).
4. `tbl_patient_consents.captured_at` matches client `consent_captured_at` (claim only — not legal proof of consent).
5. Replay the same idempotency key → no duplicate patient.
