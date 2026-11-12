const crypto = require("crypto");
const pool = require("../db");
const config = require("../config/config");
const HttpError = require("../utils/httpError");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function newRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function refreshExpiry() {
  return new Date(Date.now() + config.refreshTokenTtlHours * 60 * 60 * 1000);
}

async function createSession(req, { userId, mfaVerified }, client = pool) {
  const refreshToken = newRefreshToken();
  const expiresAt = refreshExpiry();

  const { rows } = await client.query(
    `INSERT INTO tbl_user_sessions
       (user_id, refresh_token_hash, ip_address, user_agent, mfa_verified, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     RETURNING id`,
    [
      userId,
      hashToken(refreshToken),
      req.ip || null,
      (req.get("user-agent") || "").slice(0, 300),
      Boolean(mfaVerified),
      expiresAt,
    ]
  );

  return { sessionId: rows[0].id, refreshToken, expiresAt };
}

// Rotates the refresh token. Presenting an already-rotated token revokes the
// whole session (likely token theft).
async function rotateSession(refreshToken) {
  const presentedHash = hashToken(refreshToken);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT s.id, s.user_id, s.mfa_verified
         FROM tbl_user_sessions s
        WHERE s.refresh_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
        FOR UPDATE`,
      [presentedHash]
    );

    if (!current.rows.length) {
      const reused = await client.query(
        `UPDATE tbl_user_sessions
            SET revoked_at = now(), revoke_reason = 'REFRESH_TOKEN_REUSE'
          WHERE previous_refresh_token_hash = $1 AND revoked_at IS NULL
          RETURNING id, user_id`,
        [presentedHash]
      );
      await client.query("COMMIT");

      if (reused.rows.length) {
        const error = new HttpError(401, "Session ended for security reasons. Please sign in again.", "REFRESH_TOKEN_REUSED");
        error.revokedSession = reused.rows[0];
        throw error;
      }

      throw new HttpError(401, "Session expired. Please sign in again.", "SESSION_EXPIRED");
    }

    const session = current.rows[0];
    const nextToken = newRefreshToken();
    const expiresAt = refreshExpiry();

    await client.query(
      `UPDATE tbl_user_sessions
          SET previous_refresh_token_hash = refresh_token_hash,
              refresh_token_hash = $2,
              expires_at = $3,
              last_seen_at = now()
        WHERE id = $1`,
      [session.id, hashToken(nextToken), expiresAt]
    );

    await client.query("COMMIT");
    return { sessionId: session.id, userId: session.user_id, refreshToken: nextToken, expiresAt };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function revokeSession(sessionId, reason, client = pool) {
  await client.query(
    `UPDATE tbl_user_sessions
        SET revoked_at = now(), revoke_reason = $2
      WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, reason]
  );
}

async function revokeAllSessions(userId, reason, { exceptSessionId = null } = {}, client = pool) {
  const { rowCount } = await client.query(
    `UPDATE tbl_user_sessions
        SET revoked_at = now(), revoke_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [userId, reason, exceptSessionId]
  );
  return rowCount;
}

module.exports = { hashToken, createSession, rotateSession, revokeSession, revokeAllSessions };
