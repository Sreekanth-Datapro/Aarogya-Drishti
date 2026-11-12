/**
 * Encrypted offline vault for Health Workers.
 * Stores profile + registration options. Never stores passwords, MFA secrets or tokens.
 */
import {
  OFFLINE_ALLOWED_ROLES,
  OFFLINE_PIN_LOCKOUT_STEPS_MS,
  OFFLINE_PIN_MAX_ATTEMPTS,
  OFFLINE_TTL_MS,
} from "./constants";
import {
  createPinVerifier,
  decryptJson,
  encryptJson,
  verifyPin,
} from "./crypto";
import {
  draftsDeleteByUser,
  metaDelete,
  metaGet,
  metaSet,
  wipeOfflineDb,
} from "./db";

const META_VERIFIER = "pin_verifier";
const META_VAULT = "vault_envelope";
const META_PUBLIC = "vault_public";
const META_LOCKOUT = "pin_lockout";

export function isOfflineRoleAllowed(role) {
  return OFFLINE_ALLOWED_ROLES.includes(role);
}

export async function hasOfflineVault() {
  const pub = await metaGet(META_PUBLIC);
  return Boolean(pub?.userId);
}

export async function getVaultPublic() {
  return metaGet(META_PUBLIC);
}

export function isVaultExpired(publicMeta, now = Date.now()) {
  if (!publicMeta?.lastOnlineAuthAt) return true;
  return now - Number(publicMeta.lastOnlineAuthAt) > OFFLINE_TTL_MS;
}

function emptyLockout() {
  return { failedAttempts: 0, lockedUntil: null, updatedAt: Date.now() };
}

/** Lockout state lives in IndexedDB so a page refresh cannot clear attempts. */
export async function getPinLockoutState(now = Date.now()) {
  const raw = (await metaGet(META_LOCKOUT)) || emptyLockout();
  const failedAttempts = Number(raw.failedAttempts) || 0;
  const lockedUntil = raw.lockedUntil == null ? null : Number(raw.lockedUntil);
  const activeLock = lockedUntil && lockedUntil > now;
  return {
    failedAttempts,
    lockedUntil: activeLock ? lockedUntil : null,
    remainingMs: activeLock ? lockedUntil - now : 0,
    isLocked: Boolean(activeLock),
  };
}

export function lockoutDelayMs(failedAttempts) {
  if (failedAttempts < OFFLINE_PIN_MAX_ATTEMPTS) return 0;
  const index = Math.min(
    failedAttempts - OFFLINE_PIN_MAX_ATTEMPTS,
    OFFLINE_PIN_LOCKOUT_STEPS_MS.length - 1
  );
  return OFFLINE_PIN_LOCKOUT_STEPS_MS[index];
}

async function clearPinLockout() {
  await metaSet(META_LOCKOUT, emptyLockout());
}

async function recordFailedPinAttempt(now = Date.now()) {
  const current = (await metaGet(META_LOCKOUT)) || emptyLockout();
  const failedAttempts = (Number(current.failedAttempts) || 0) + 1;
  const delay = lockoutDelayMs(failedAttempts);
  const next = {
    failedAttempts,
    lockedUntil: delay > 0 ? now + delay : null,
    updatedAt: now,
  };
  await metaSet(META_LOCKOUT, next);
  return next;
}

function lockoutError(state) {
  const error = new Error("OFFLINE_PIN_LOCKED");
  error.code = "OFFLINE_PIN_LOCKED";
  error.remainingMs = state.remainingMs || 0;
  error.failedAttempts = state.failedAttempts || 0;
  return error;
}

/**
 * Enable offline access while the user is online after MFA.
 * @param {string} pin
 * @param {{ user: object, registrationOptions: object }} snapshot
 */
export async function enableOfflineVault(pin, snapshot) {
  const user = snapshot.user;
  if (!user?.id || !isOfflineRoleAllowed(user.role)) {
    throw new Error("OFFLINE_ROLE_DENIED");
  }
  if (!pin || String(pin).length < 4 || String(pin).length > 12) {
    throw new Error("OFFLINE_PIN_INVALID");
  }

  const lastOnlineAuthAt = Date.now();
  const payload = {
    version: 1,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      role_id: user.role_id,
      role_display_name: user.role_display_name,
      permissions: user.permissions || [],
      mfa_enabled: Boolean(user.mfa_enabled),
      designation: user.designation || null,
    },
    registrationOptions: snapshot.registrationOptions || null,
    enabledAt: lastOnlineAuthAt,
    lastOnlineAuthAt,
  };

  const verifier = await createPinVerifier(pin);
  const envelope = await encryptJson(pin, payload);

  await metaSet(META_VERIFIER, verifier);
  await metaSet(META_VAULT, envelope);
  await metaSet(META_PUBLIC, {
    userId: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    lastOnlineAuthAt,
    enabledAt: lastOnlineAuthAt,
  });
  await clearPinLockout();

  return getVaultPublic();
}

/**
 * Refresh the public TTL marker after a successful online session (same user).
 * Does not require the PIN — unlock expiry is gated on vault_public only.
 */
export async function refreshVaultOnlineAuth(userId) {
  const pub = await getVaultPublic();
  if (!pub || String(pub.userId) !== String(userId)) return null;
  const lastOnlineAuthAt = Date.now();
  await metaSet(META_PUBLIC, {
    ...pub,
    lastOnlineAuthAt,
  });
  return lastOnlineAuthAt;
}

/** Re-encrypt vault payload with an updated lastOnlineAuthAt (needs PIN). */
export async function touchVaultOnlineAuth(pin, userId) {
  const pub = await getVaultPublic();
  if (!pub || String(pub.userId) !== String(userId)) return null;
  const envelope = await metaGet(META_VAULT);
  if (!envelope) return null;
  const payload = await decryptJson(pin, envelope);
  payload.lastOnlineAuthAt = Date.now();
  const nextEnvelope = await encryptJson(pin, payload, envelope.salt);
  await metaSet(META_VAULT, nextEnvelope);
  await metaSet(META_PUBLIC, {
    ...pub,
    lastOnlineAuthAt: payload.lastOnlineAuthAt,
  });
  return payload;
}

export async function unlockVault(pin) {
  const pub = await getVaultPublic();
  if (!pub) throw new Error("OFFLINE_VAULT_MISSING");
  if (isVaultExpired(pub)) throw new Error("OFFLINE_VAULT_EXPIRED");

  const lockState = await getPinLockoutState();
  if (lockState.isLocked) throw lockoutError(lockState);

  const verifier = await metaGet(META_VERIFIER);
  const ok = await verifyPin(pin, verifier);
  if (!ok) {
    const next = await recordFailedPinAttempt();
    const refreshed = await getPinLockoutState();
    if (refreshed.isLocked) throw lockoutError(refreshed);
    const error = new Error("OFFLINE_PIN_WRONG");
    error.code = "OFFLINE_PIN_WRONG";
    error.failedAttempts = next.failedAttempts;
    error.attemptsRemaining = Math.max(0, OFFLINE_PIN_MAX_ATTEMPTS - next.failedAttempts);
    throw error;
  }

  const envelope = await metaGet(META_VAULT);
  if (!envelope) throw new Error("OFFLINE_VAULT_MISSING");

  try {
    const payload = await decryptJson(pin, envelope);
    if (!isOfflineRoleAllowed(payload?.user?.role)) {
      throw new Error("OFFLINE_ROLE_DENIED");
    }
    await clearPinLockout();
    return payload;
  } catch (error) {
    if (error.message?.startsWith("OFFLINE_")) throw error;
    const next = await recordFailedPinAttempt();
    const refreshed = await getPinLockoutState();
    if (refreshed.isLocked) throw lockoutError(refreshed);
    const wrong = new Error("OFFLINE_PIN_WRONG");
    wrong.code = "OFFLINE_PIN_WRONG";
    wrong.failedAttempts = next.failedAttempts;
    wrong.attemptsRemaining = Math.max(0, OFFLINE_PIN_MAX_ATTEMPTS - next.failedAttempts);
    throw wrong;
  }
}

export async function disableOfflineVault(userId) {
  if (userId) await draftsDeleteByUser(userId);
  await wipeOfflineDb();
}

export async function wipeAllOfflineData() {
  await wipeOfflineDb();
}

export async function clearVaultMetaOnly() {
  await metaDelete(META_VERIFIER);
  await metaDelete(META_VAULT);
  await metaDelete(META_PUBLIC);
  await metaDelete(META_LOCKOUT);
}
