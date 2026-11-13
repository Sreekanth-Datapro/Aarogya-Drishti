
const crypto = require("crypto");
const pool = require("../db");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const config = require("../config/config");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const { checkPassword } = require("../utils/passwordPolicy");
const { validateRegistration } = require("../utils/registrationValidation");
const { encrypt, decrypt } = require("../utils/secretBox");
const totp = require("../utils/totp");
const { getRolePermissions, clearPermissionCache } = require("../utils/permissions");
const { getEffectivePermissions } = require("../utils/authorizationPolicy");
const { readRefreshCookie, setRefreshCookie, clearRefreshCookie } = require("../utils/cookies");
const { generateAccessToken, generateMfaToken, verifyMfaToken } = require("../utils/jwt");
const sessions = require("../services/sessionService");
const { deliverResetLink } = require("../services/passwordResetDelivery");
const { hasTwoStageRegistrationSchema } = require("../utils/registrationWorkflowSchema");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const USER_SELECT = `
  SELECT
    u.id, u.username, u.password_hash, u.full_name, u.phone, u.email,
    u.designation, u.role_id, u.status, u.failed_login_count, u.locked_until,
    u.must_change_password, u.mfa_enabled, u.mfa_secret_encrypted, u.mfa_last_used_step,
    r.code AS role_name, r.name_en AS role_display_name, r.mfa_required
  FROM tbl_users u
  JOIN mst_roles r ON r.id = u.role_id`;

function publicUser(user, permissions) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    designation: user.designation,
    role_id: user.role_id,
    role: user.role_name,
    role_display_name: user.role_display_name,
    must_change_password: user.must_change_password,
    mfa_enabled: Boolean(user.mfa_enabled),
    permissions: getEffectivePermissions(user.role_name, permissions),
  };
}

function mfaRequiredFor(user) {
  return Boolean(user.mfa_required || user.mfa_enabled);
}

async function recordFailedAttempt(user) {
  const failedCount = Number(user.failed_login_count || 0) + 1;
  const lockedUntil = failedCount >= MAX_FAILED_ATTEMPTS
    ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
    : null;

  await pool.query(
    `UPDATE tbl_users SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
    [lockedUntil ? MAX_FAILED_ATTEMPTS : failedCount, lockedUntil, user.id]
  );
}

function canEnrollMfaForPendingDistrictAdmin(user) {
  return user.status === "PENDING_SETUP"
    && ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "SPECIALIST"].includes(user.role_name)
    && !user.must_change_password
    && user.mfa_required
    && !user.mfa_enabled;
}

// Accounts issued a temporary password can only continue by choosing a new password.
// Includes clinical staff, District Admin setup, and custom-role accounts created by admins.
function isTemporaryPasswordLogin(user) {
  if (user.status !== "PENDING_SETUP" || !user.must_change_password) return false;
  if (["SUPER_ADMIN", "SYSTEM_ADMIN", "MIGRATION"].includes(user.role_name)) return false;
  return Boolean(user.role_name);
}

// The temporary password works for 24 hours; the limit is kept in the open
// tbl_district_admin_setup_tokens row (revoked when new details are sent).
async function hasValidTemporaryPassword(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT id FROM tbl_district_admin_setup_tokens
      WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

const TEMPORARY_PASSWORD_EXPIRED = () => new HttpError(
  401,
  "Your temporary password has expired. Ask the Super Admin to resend your login details.",
  "TEMPORARY_PASSWORD_EXPIRED"
);

// allowPendingSetupStep: a PENDING_SETUP District Admin may take the next setup step
// (temporary password change, or MFA enrollment after the password was changed)
function accountBlocked(user, allowPendingSetupStep = false) {
  if (
    user.status !== "ACTIVE"
    && !(allowPendingSetupStep
      && (canEnrollMfaForPendingDistrictAdmin(user) || isTemporaryPasswordLogin(user)))
  ) {
    return new HttpError(403, "Your account is not active. Contact the administrator.", "ACCOUNT_INACTIVE");
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return new HttpError(423, "Account temporarily locked. Try again later.", "ACCOUNT_LOCKED");
  }
  return null;
}

// Final step of every successful login: server-side session, rotating refresh
// cookie, short-lived access token bound to that session.
async function completeLogin(req, res, user, { mfaVerified, event = "LOGIN_SUCCESS" }) {
  const session = await sessions.createSession(req, { userId: user.id, mfaVerified });

  await pool.query(
    `UPDATE tbl_users
        SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
      WHERE id = $1`,
    [user.id]
  );

  setRefreshCookie(res, session.refreshToken, session.expiresAt);

  await audit(req, {
    event,
    actorId: user.id,
    actorRole: user.role_name,
    resourceType: "session",
    resourceId: session.sessionId,
    metadata: { mfa: Boolean(mfaVerified) },
  });

  clearPermissionCache();
  const permissions = await getRolePermissions(user.role_id);

  return res.status(200).json({
    success: true,
    message: "Login successful",
    accessToken: generateAccessToken(user, session.sessionId),
    user: publicUser(user, permissions),
  });
}

async function loadUserFromMfaToken(req, expectedStage) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    throw new HttpError(401, "MFA session token required", "MFA_TOKEN_REQUIRED");
  }

  let decoded;
  try {
    decoded = verifyMfaToken(header.slice(7));
  } catch {
    throw new HttpError(401, "MFA session expired. Please sign in again.", "MFA_TOKEN_INVALID");
  }

  if (decoded.stage !== expectedStage) {
    throw new HttpError(400, "This MFA step is not available for your account", "MFA_STAGE_MISMATCH");
  }

  const { rows } = await pool.query(`${USER_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL`, [decoded.sub]);
  if (!rows.length) throw new HttpError(401, "Account is unavailable", "ACCOUNT_UNAVAILABLE");

  const blocked = accountBlocked(
    rows[0],
    (expectedStage === "enroll" && canEnrollMfaForPendingDistrictAdmin(rows[0]))
      || (expectedStage === "password" && isTemporaryPasswordLogin(rows[0]))
  );
  if (blocked) throw blocked;

  return rows[0];
}

function requireMfaKey() {
  const key = config.getMfaEncryptionKey();
  if (!key) {
    throw new HttpError(
      503,
      "Multi-factor authentication is not configured on the server. Contact the administrator.",
      "MFA_NOT_CONFIGURED"
    );
  }
  return key;
}

// ==========================================
// HEALTH WORKER REGISTRATION
// Registration request goes to PENDING status
// ==========================================

exports.register = async (req, res, next) => {
  try {
    const {
      username,
      password,
      full_name,
      phone,
      email,
      designation,
      district_id,
      employee_ref,
      facility_id,
      mandal_id,
      village_id,
      language_id,
      terms_accepted,
    } = req.body;

    const validation = validateRegistration(req.body);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const {
      normalizedUsername,
      normalizedDesignation,
      districtId,
      facilityId,
      mandalId,
      villageId,
      languageId,
    } = validation;

    const locationCheck = await pool.query(
      `SELECT 1
         FROM mst_facilities f
         JOIN mst_mandals m ON m.id = $2
        WHERE f.id = $1
          AND f.district_id = $3
          AND m.district_id = $3
          AND f.mandal_id = m.id
          AND f.is_active = TRUE
          AND f.facility_type IN ('PHC', 'SCREENING_SITE')
        LIMIT 1`,
      [facilityId, mandalId, districtId]
    );
    if (!locationCheck.rows.length) {
      return res.status(400).json({
        success: false,
        message: "Selected district, facility and mandal must match",
      });
    }

    // Village must belong to the selected mandal
    const villageCheck = await pool.query(
      `SELECT v.id
       FROM mst_villages v
       WHERE v.id = $1
       AND v.mandal_id = $2
       AND v.is_active = TRUE
       LIMIT 1`,
      [villageId, mandalId]
    );

    if (!villageCheck.rows.length) {
      return res.status(400).json({
        success: false,
        message: "Selected village does not belong to the selected mandal",
      });
    }

    // Usernames stay reserved after soft delete (unique index covers deleted users)
    const existingUser = await pool.query(
      `SELECT id
       FROM tbl_users
       WHERE lower(username) = $1
       LIMIT 1`,
      [normalizedUsername]
    );

    if (existingUser.rows.length) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Check existing pending request
    const existingRequest = await pool.query(
      `SELECT id
       FROM tbl_user_registration_requests
       WHERE lower(username) = $1
       AND status = 'PENDING'
       LIMIT 1`,
      [normalizedUsername]
    );

    if (existingRequest.rows.length) {
      return res.status(409).json({
        success: false,
        message: "Registration request is already pending",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const twoStageWorkflowEnabled = await hasTwoStageRegistrationSchema(pool);
    const statusToken = twoStageWorkflowEnabled
      ? crypto.randomBytes(32).toString("hex")
      : null;

    const client = await pool.connect();
    let transactionStarted = false;
    let registration;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const requestValues = [
        full_name.trim(),
        normalizedUsername,
        phone,
        email?.trim() || null,
        normalizedDesignation,
        employee_ref?.trim() || null,
        facilityId,
        mandalId,
        villageId,
        languageId,
        passwordHash,
      ];
      const result = twoStageWorkflowEnabled
        ? await client.query(
          `INSERT INTO tbl_user_registration_requests (
            full_name, username, phone, email, designation, employee_ref,
            facility_id, mandal_id, village_id, language_id, password_hash,
            requested_role, terms_accepted_at, status, workflow_version,
            status_token_hash, status_token_expires_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            'HEALTH_WORKER', NOW(), 'PENDING', 1, $12, NOW() + INTERVAL '14 days'
          )
          RETURNING id, full_name, username, designation, status, created_at`,
          [...requestValues, crypto.createHash("sha256").update(statusToken).digest("hex")]
        )
        : await client.query(
          `INSERT INTO tbl_user_registration_requests (
            full_name, username, phone, email, designation, employee_ref,
            facility_id, mandal_id, village_id, language_id, password_hash,
            requested_role, terms_accepted_at, status, workflow_version
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            'HEALTH_WORKER', NOW(), 'PENDING', NULL
          )
          RETURNING id, full_name, username, designation, status, created_at`,
          requestValues
        );
      registration = result.rows[0];
      await audit(req, {
        client,
        required: true,
        actorId: null,
        actorRole: null,
        event: "REGISTRATION_SUBMITTED",
        resourceType: "registration_request",
        resourceId: registration.id,
        metadata: { designation: normalizedDesignation, district_id: districtId, facility_id: facilityId },
      });
      await client.query("COMMIT");
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const message = statusToken
      ? "Registration submitted successfully. Your request is pending review. Save your private status token to check progress."
      : "Registration submitted successfully. Your request is pending review. Applicant status tracking is temporarily unavailable.";
    return res.status(201).json({
      success: true,
      message,
      registration,
      ...(statusToken ? { status_token: statusToken } : {}),
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Username already exists or registration is pending",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Invalid facility, mandal, village or language selection",
      });
    }

    next(error);
  }
};


// ==========================================
// COMMON LOGIN FOR ALL ROLES
// ==========================================

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const result = await pool.query(
      `${USER_SELECT}
      WHERE lower(u.username) = lower($1)
        AND u.deleted_at IS NULL
        AND r.is_active = TRUE
      LIMIT 1`,
      [username.trim()]
    );

    if (!result.rows.length) {
      await audit(req, {
        event: "LOGIN_FAILED",
        outcome: "DENIED",
        actorId: null,
        actorRole: null,
        resourceType: "session",
        metadata: { reason: "unknown_user" },
      });

      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = result.rows[0];

    const blocked = accountBlocked(user, true);
    if (blocked) throw blocked;

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      await recordFailedAttempt(user);
      await audit(req, {
        event: "LOGIN_FAILED",
        outcome: "DENIED",
        actorId: user.id,
        actorRole: user.role_name,
        resourceType: "session",
        metadata: { reason: "invalid_credentials" },
      });

      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // First sign-in of a new District Admin: the temporary password must still be
    // valid, and the only next step is choosing a new password (no session yet).
    if (isTemporaryPasswordLogin(user)) {
      if (!(await hasValidTemporaryPassword(user.id))) {
        await audit(req, {
          event: "LOGIN_FAILED",
          outcome: "DENIED",
          actorId: user.id,
          actorRole: user.role_name,
          resourceType: "session",
          metadata: { reason: "temporary_password_expired" },
        });
        throw TEMPORARY_PASSWORD_EXPIRED();
      }
      requireMfaKey();
      return res.status(200).json({
        success: true,
        message: "Choose a new password to continue",
        password_change_required: true,
        password_change_token: generateMfaToken(user.id, "password"),
      });
    }

    if (!mfaRequiredFor(user)) {
      return completeLogin(req, res, user, { mfaVerified: false });
    }

    requireMfaKey();

    const stage = user.mfa_enabled ? "verify" : "enroll";

    return res.status(200).json({
      success: true,
      message: stage === "verify"
        ? "Enter the 6-digit code from your authenticator app"
        : "Set up multi-factor authentication to continue",
      mfa_required: stage === "verify",
      mfa_setup_required: stage === "enroll",
      mfa_token: generateMfaToken(user.id, stage),
    });
  } catch (error) {
    next(error);
  }
};


// ==========================================
// MULTI-FACTOR AUTHENTICATION (TOTP)
// ==========================================

exports.mfaSetup = async (req, res, next) => {
  try {
    const key = requireMfaKey();
    const user = await loadUserFromMfaToken(req, "enroll");

    if (user.mfa_enabled) {
      throw new HttpError(409, "Multi-factor authentication is already enabled", "MFA_ALREADY_ENABLED");
    }

    const secret = totp.generateSecret();
    await pool.query(
      "UPDATE tbl_users SET mfa_secret_encrypted = $1, mfa_last_used_step = NULL WHERE id = $2",
      [encrypt(secret, key), user.id]
    );

    const otpauthUrl = totp.otpauthUrl({ secret, accountName: user.username });

    return res.status(200).json({
      success: true,
      secret,
      otpauth_url: otpauthUrl,
      qr_code: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }),
    });
  } catch (error) {
    next(error);
  }
};

async function verifyUserCode(req, user, code, key) {
  if (!user.mfa_secret_encrypted) {
    throw new HttpError(400, "Start multi-factor setup first", "MFA_NOT_STARTED");
  }

  const secret = decrypt(user.mfa_secret_encrypted, key);
  const step = totp.verifyCode(secret, code, { lastUsedStep: user.mfa_last_used_step });

  if (step === null) {
    await recordFailedAttempt(user);
    await audit(req, {
      event: "MFA_FAILED",
      outcome: "DENIED",
      actorId: user.id,
      actorRole: user.role_name,
      resourceType: "session",
    });
    throw new HttpError(401, "Invalid or already used authentication code", "MFA_CODE_INVALID");
  }

  return step;
}

exports.mfaEnable = async (req, res, next) => {
  try {
    const key = requireMfaKey();
    const user = await loadUserFromMfaToken(req, "enroll");

    if (user.mfa_enabled) {
      throw new HttpError(409, "Multi-factor authentication is already enabled", "MFA_ALREADY_ENABLED");
    }

    const step = await verifyUserCode(req, user, req.body?.code, key);

    const activation = await pool.query(
      `UPDATE tbl_users
          SET mfa_enabled = TRUE, mfa_enrolled_at = now(), mfa_last_used_step = $1,
              status = CASE WHEN status = 'PENDING_SETUP' THEN 'ACTIVE' ELSE status END
        WHERE id = $2 AND mfa_enabled = FALSE
          AND (
            status = 'ACTIVE'
            OR (
              status = 'PENDING_SETUP'
              AND must_change_password = FALSE
              AND EXISTS (
                SELECT 1 FROM mst_roles
                 WHERE mst_roles.id = tbl_users.role_id
                   AND mst_roles.code IN ('DISTRICT_ADMIN', 'MEDICAL_OFFICER', 'SPECIALIST')
                   AND mst_roles.mfa_required = TRUE
              )
            )
          )
        RETURNING status`,
      [step, user.id]
    );
    if (!activation.rows.length) {
      throw new HttpError(409, "Account setup changed. Sign in again to continue.", "ACCOUNT_SETUP_CHANGED");
    }

    await audit(req, {
      event: "MFA_ENABLED",
      actorId: user.id,
      actorRole: user.role_name,
      resourceType: "user",
      resourceId: user.id,
    });

    return completeLogin(
      req,
      res,
      { ...user, status: activation.rows[0].status, mfa_enabled: true },
      { mfaVerified: true }
    );
  } catch (error) {
    next(error);
  }
};

exports.mfaVerify = async (req, res, next) => {
  try {
    const key = requireMfaKey();
    const user = await loadUserFromMfaToken(req, "verify");

    const step = await verifyUserCode(req, user, req.body?.code, key);

    await pool.query("UPDATE tbl_users SET mfa_last_used_step = $1 WHERE id = $2", [step, user.id]);

    return completeLogin(req, res, user, { mfaVerified: true });
  } catch (error) {
    next(error);
  }
};


// ==========================================
// FIRST SIGN-IN: REPLACE THE TEMPORARY PASSWORD
// Needs the short-lived token from /login ("password" stage). Afterwards the
// temporary password no longer works and MFA enrollment is the next step;
// the account becomes ACTIVE only when /mfa/enable succeeds.
// ==========================================

exports.changeTemporaryPassword = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const user = await loadUserFromMfaToken(req, "password");
    if (user.mfa_required && !user.mfa_enabled) requireMfaKey();
    const newPassword = req.body?.new_password;

    const policyError = checkPassword(newPassword, { username: user.username });
    if (policyError) throw new HttpError(400, policyError, "PASSWORD_POLICY");

    if (await bcrypt.compare(newPassword, user.password_hash)) {
      throw new HttpError(400, "New password must be different from the current password", "PASSWORD_REUSED");
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await client.query("BEGIN");
    const credentials = await client.query(
      `SELECT id FROM tbl_district_admin_setup_tokens
        WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [user.id]
    );
    if (!credentials.rows.length) throw TEMPORARY_PASSWORD_EXPIRED();

    const updated = await client.query(
      `UPDATE tbl_users
          SET password_hash = $1, password_changed_at = now(), must_change_password = FALSE,
              failed_login_count = 0, locked_until = NULL
        WHERE id = $2 AND status = 'PENDING_SETUP' AND must_change_password = TRUE
        RETURNING id`,
      [newHash, user.id]
    );
    if (!updated.rows.length) {
      throw new HttpError(409, "Account setup changed. Sign in again to continue.", "ACCOUNT_SETUP_CHANGED");
    }

    await client.query(
      "UPDATE tbl_district_admin_setup_tokens SET used_at = now(), encrypted_token = NULL WHERE id = $1",
      [credentials.rows[0].id]
    );
    await sessions.revokeAllSessions(user.id, "PASSWORD_CHANGED", {}, client);
    await audit(req, {
      client,
      required: true,
      event: "PASSWORD_CHANGED",
      actorId: user.id,
      actorRole: user.role_name,
      resourceType: "user",
      resourceId: user.id,
      metadata: { temporary_password: true },
    });
    await client.query("COMMIT");

    if (!user.mfa_required && !user.mfa_enabled) {
      const activated = await pool.query(
        `UPDATE tbl_users SET status = 'ACTIVE'
          WHERE id = $1 AND status = 'PENDING_SETUP'
          RETURNING status`,
        [user.id]
      );
      if (!activated.rows.length) {
        throw new HttpError(409, "Account setup changed. Sign in again to continue.", "ACCOUNT_SETUP_CHANGED");
      }
      return completeLogin(
        req,
        res,
        { ...user, status: activated.rows[0].status, must_change_password: false },
        { mfaVerified: false }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Password changed. Set up two-step verification to finish activating your account.",
      mfa_setup_required: true,
      mfa_token: generateMfaToken(user.id, "enroll"),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};


// ==========================================
// SESSION REFRESH / LOGOUT
// ==========================================

exports.refresh = async (req, res, next) => {
  try {
    const presented = readRefreshCookie(req);
    if (!presented) {
      throw new HttpError(401, "Session expired. Please sign in again.", "SESSION_EXPIRED");
    }

    let rotated;
    try {
      rotated = await sessions.rotateSession(presented);
    } catch (error) {
      clearRefreshCookie(res);
      if (error.code === "REFRESH_TOKEN_REUSED") {
        await audit(req, {
          event: "REFRESH_TOKEN_REUSED",
          outcome: "DENIED",
          actorId: error.revokedSession.user_id,
          actorRole: null,
          resourceType: "session",
          resourceId: error.revokedSession.id,
        });
      }
      throw error;
    }

    const { rows } = await pool.query(
      `${USER_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [rotated.userId]
    );

    if (!rows.length || rows[0].status !== "ACTIVE") {
      await sessions.revokeSession(rotated.sessionId, "ACCOUNT_UNAVAILABLE");
      clearRefreshCookie(res);
      throw new HttpError(401, "Account is unavailable", "ACCOUNT_UNAVAILABLE");
    }

    const user = rows[0];
    setRefreshCookie(res, rotated.refreshToken, rotated.expiresAt);

    return res.status(200).json({
      success: true,
      accessToken: generateAccessToken(user, rotated.sessionId),
      user: publicUser(user, await getRolePermissions(user.role_id)),
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    await sessions.revokeSession(req.user.session_id, "LOGOUT");
    clearRefreshCookie(res);

    await audit(req, {
      event: "LOGOUT",
      resourceType: "session",
      resourceId: req.user.session_id,
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};

exports.logoutAll = async (req, res, next) => {
  try {
    const revoked = await sessions.revokeAllSessions(req.user.id, "LOGOUT_ALL");
    clearRefreshCookie(res);

    await audit(req, {
      event: "LOGOUT_ALL",
      resourceType: "user",
      resourceId: req.user.id,
      metadata: { sessions_revoked: revoked },
    });

    return res.status(200).json({ success: true, message: "Signed out of all devices" });
  } catch (error) {
    next(error);
  }
};


// ==========================================
// LOGGED-IN USER PROFILE / SESSIONS
// ==========================================

exports.me = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      full_name: req.user.full_name,
      role_id: req.user.role_id,
      role_name: req.user.role_name,
      role: req.user.role,
      role_display_name: req.user.role_display_name,
      status: req.user.status,
      must_change_password: req.user.must_change_password,
      mfa_enabled: req.user.mfa_enabled,
      session_id: req.user.session_id,
      permissions: req.user.permissions,
    },
  });
};

exports.sessions = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_agent, issued_at, last_seen_at, expires_at, (id = $2) AS current
         FROM tbl_user_sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY issued_at DESC`,
      [req.user.id, req.user.session_id]
    );

    return res.status(200).json({ success: true, sessions: rows });
  } catch (error) {
    next(error);
  }
};


// ==========================================
// PASSWORD CHANGE
// ==========================================

exports.changePassword = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};

    const { rows } = await client.query(
      "SELECT password_hash FROM tbl_users WHERE id = $1",
      [req.user.id]
    );

    if (!currentPassword || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      throw new HttpError(400, "Current password is incorrect", "CURRENT_PASSWORD_INVALID");
    }

    const policyError = checkPassword(newPassword, { username: req.user.username });
    if (policyError) throw new HttpError(400, policyError, "PASSWORD_POLICY");

    if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
      throw new HttpError(400, "New password must be different from the current password", "PASSWORD_REUSED");
    }

    await client.query("BEGIN");
    await client.query(
      `UPDATE tbl_users
          SET password_hash = $1, password_changed_at = now(), must_change_password = FALSE
        WHERE id = $2`,
      [await bcrypt.hash(newPassword, 12), req.user.id]
    );
    const revoked = await sessions.revokeAllSessions(
      req.user.id,
      "PASSWORD_CHANGED",
      { exceptSessionId: req.user.session_id },
      client
    );
    await audit(req, {
      client,
      required: true,
      event: "PASSWORD_CHANGED",
      resourceType: "user",
      resourceId: req.user.id,
      metadata: { other_sessions_revoked: revoked },
    });
    await client.query("COMMIT");

    return res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};


// ==========================================
// PASSWORD RESET (single-use token, 15 minutes)
// ==========================================

const GENERIC_RESET_MESSAGE =
  "If the account exists, password reset instructions have been sent.";

exports.requestPasswordReset = async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();

    if (!username) {
      throw new HttpError(400, "Username is required", "USERNAME_REQUIRED");
    }

    const { rows } = await pool.query(
      `SELECT id, username, status FROM tbl_users
        WHERE lower(username) = $1 AND deleted_at IS NULL`,
      [username]
    );

    const user = rows[0];

    if (user && user.status === "ACTIVE") {
      const token = crypto.randomBytes(32).toString("base64url");

      await pool.query(
        `UPDATE tbl_password_reset_tokens SET used_at = now()
          WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      );
      await pool.query(
        `INSERT INTO tbl_password_reset_tokens (user_id, token_hash, requested_ip, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
        [user.id, sessions.hashToken(token), req.ip || null, config.passwordResetTtlMinutes]
      );

      const link = `${config.frontendUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
      await deliverResetLink({ user, link });

      await audit(req, {
        event: "PASSWORD_RESET_REQUESTED",
        actorId: user.id,
        actorRole: null,
        resourceType: "user",
        resourceId: user.id,
      });
    }

    return res.status(200).json({ success: true, message: GENERIC_RESET_MESSAGE });
  } catch (error) {
    next(error);
  }
};

exports.confirmPasswordReset = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { token, new_password: newPassword } = req.body || {};

    if (!token || typeof token !== "string") {
      throw new HttpError(400, "Reset link is invalid or has expired", "RESET_TOKEN_INVALID");
    }

    await client.query("BEGIN");

    const found = await client.query(
      `SELECT t.id, t.user_id, u.username, u.status
         FROM tbl_password_reset_tokens t
         JOIN tbl_users u ON u.id = t.user_id
        WHERE t.token_hash = $1
          AND t.used_at IS NULL
          AND t.expires_at > now()
          AND u.deleted_at IS NULL
        FOR UPDATE OF t`,
      [sessions.hashToken(token)]
    );

    if (!found.rows.length || found.rows[0].status !== "ACTIVE") {
      throw new HttpError(400, "Reset link is invalid or has expired", "RESET_TOKEN_INVALID");
    }

    const { id: tokenId, user_id: userId, username } = found.rows[0];

    const policyError = checkPassword(newPassword, { username });
    if (policyError) throw new HttpError(400, policyError, "PASSWORD_POLICY");

    await client.query("UPDATE tbl_password_reset_tokens SET used_at = now() WHERE id = $1", [tokenId]);
    await client.query(
      `UPDATE tbl_users
          SET password_hash = $1, password_changed_at = now(), must_change_password = FALSE,
              failed_login_count = 0, locked_until = NULL
        WHERE id = $2`,
      [await bcrypt.hash(newPassword, 12), userId]
    );
    await sessions.revokeAllSessions(userId, "PASSWORD_RESET", {}, client);
    await audit(req, {
      client,
      required: true,
      event: "PASSWORD_RESET_COMPLETED",
      actorId: userId,
      actorRole: null,
      resourceType: "user",
      resourceId: userId,
    });
    await client.query("COMMIT");

    return res.status(200).json({ success: true, message: "Password has been reset. Please sign in." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
};
