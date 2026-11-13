const request = require("supertest");
const app = require("../../app");
const totp = require("../../utils/totp");
const config = require("../../config/config");
const { decrypt } = require("../../utils/secretBox");
const pool = require("../../db");

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const TOTP_PERIOD_MS = 30_000;
const VERIFY_WINDOW = 1;

function authFailure(step, username, res) {
  const detail = [
    `step=${step}`,
    `username=${username}`,
    `status=${res.status}`,
    `code=${res.body?.code || "-"}`,
    `message=${res.body?.message || res.body?.error || "-"}`,
  ].join(" ");
  return new Error(`Authentication helper failed (${detail})`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mfaMaterialForUser(username) {
  const key = config.getMfaEncryptionKey();
  if (!key) {
    throw new Error("MFA_ENCRYPTION_KEY is not configured for integration tests");
  }
  const { rows } = await pool.query(
    `SELECT mfa_secret_encrypted, mfa_last_used_step FROM tbl_users
      WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
    [username]
  );
  if (!rows[0]?.mfa_secret_encrypted) {
    throw new Error(`No MFA secret stored for ${username}`);
  }
  return {
    secret: decrypt(rows[0].mfa_secret_encrypted, key),
    lastUsedStep:
      rows[0].mfa_last_used_step == null ? null : Number(rows[0].mfa_last_used_step),
  };
}

/**
 * Pick a TOTP step that production verifyCode will accept: within the server
 * window and strictly after mfa_last_used_step (anti-replay). Wait for the next
 * period only when no unused candidate remains in the current window.
 */
async function freshTotpCode(secret, lastUsedStep) {
  const last = lastUsedStep == null || Number.isNaN(lastUsedStep) ? null : lastUsedStep;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const step = totp.currentStep();
    // Same acceptance window as utils/totp.verifyCode (prefer current, then +1, then -1).
    for (const offset of [0, 1, -1].filter((o) => Math.abs(o) <= VERIFY_WINDOW)) {
      const candidate = step + offset;
      if (last !== null && candidate <= last) continue;
      return totp.codeForStep(secret, candidate);
    }

    // Entire window already consumed — wait for the next unused period.
    const nextStep = (last == null ? step : last) + 1;
    const waitMs = Math.max(50, nextStep * TOTP_PERIOD_MS - Date.now() + 50);
    await sleep(Math.min(waitMs, TOTP_PERIOD_MS + 100));
  }

  throw new Error("Unable to obtain a fresh unused TOTP step for MFA verify");
}

// Sign in a user whose role does not need MFA
async function signIn(username, password = "Password@123") {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  if (!res.body?.accessToken) {
    throw authFailure("login", username, res);
  }
  return res.body.accessToken;
}

// Sign in an MFA-required role: first-time enroll, or verify when already enabled.
async function signInWithMfa(username, password = "Password@123") {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  const mfaToken = res.body?.mfa_token;
  if (!mfaToken) {
    throw authFailure("login-mfa-token", username, res);
  }

  // Already enrolled — complete the verify stage (do not call /mfa/setup).
  if (res.body.mfa_required === true && res.body.mfa_setup_required !== true) {
    const { secret, lastUsedStep } = await mfaMaterialForUser(username);
    const code = await freshTotpCode(secret, lastUsedStep);
    const verified = await request(app)
      .post("/api/auth/mfa/verify")
      .set(bearer(mfaToken))
      .send({ code });
    if (verified.status !== 200 || !verified.body?.accessToken) {
      throw authFailure("mfa-verify", username, verified);
    }
    return verified.body.accessToken;
  }

  const setup = await request(app).post("/api/auth/mfa/setup").set(bearer(mfaToken));
  if (setup.status !== 200 || !setup.body?.secret) {
    throw authFailure("mfa-setup", username, setup);
  }

  const code = totp.codeForStep(setup.body.secret, totp.currentStep());
  const enabled = await request(app)
    .post("/api/auth/mfa/enable")
    .set(bearer(mfaToken))
    .send({ code });
  if (enabled.status !== 200 || !enabled.body?.accessToken) {
    throw authFailure("mfa-enable", username, enabled);
  }
  return enabled.body.accessToken;
}

module.exports = { bearer, signIn, signInWithMfa };
