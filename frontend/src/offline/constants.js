/** Offline access is limited to Health Workers who enabled it after online MFA. */
export const OFFLINE_ALLOWED_ROLES = ["HEALTH_WORKER"];

/** How long after the last online auth a vault may still be unlocked (24 hours). */
export const OFFLINE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Offline PIN brute-force protection (stored in IndexedDB, survives refresh).
 * After OFFLINE_PIN_MAX_ATTEMPTS failures, lockout grows: 30s → 2m → 10m → 1h.
 */
export const OFFLINE_PIN_MAX_ATTEMPTS = 5;
export const OFFLINE_PIN_LOCKOUT_STEPS_MS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
];

export const OFFLINE_DB_NAME = "aarogya-offline";
export const OFFLINE_DB_VERSION = 1;

/** Routes permitted while authMode === "offline" (no API tokens). */
export const OFFLINE_ALLOWED_PATH_PREFIXES = [
  "/dashboard",
  "/settings",
  "/health-worker/patients",
];

export const DRAFT_STATUS = {
  PENDING: "pending",
  SYNCING: "syncing",
  SYNCED: "synced",
  FAILED: "failed",
  NEEDS_CONFIRMATION: "needs_confirmation",
};

// Production uses a high iteration count; Jest uses a lighter value so suites stay fast.
export const PBKDF2_ITERATIONS =
  typeof process !== "undefined" && process.env.NODE_ENV === "test" ? 1000 : 310000;
