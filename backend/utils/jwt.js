const jwt = require("jsonwebtoken");
const config = require("../config/config");

const ISSUER = "aarogya-drishti";
const ACCESS_AUDIENCE = "aarogya-drishti-users";
const MFA_AUDIENCE = "aarogya-drishti-mfa";

// Access tokens are bound to a server-side session (sid) so they can be revoked.
function generateAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user.id,
      sid: sessionId,
      role_id: user.role_id,
      role: user.role_name,
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
  });
}

// Short-lived token proving the password step passed; only accepted by MFA endpoints.
function generateMfaToken(userId, stage) {
  return jwt.sign({ sub: userId, stage }, config.jwtSecret, {
    expiresIn: config.mfaTokenTtl,
    issuer: ISSUER,
    audience: MFA_AUDIENCE,
  });
}

function verifyMfaToken(token) {
  return jwt.verify(token, config.jwtSecret, {
    issuer: ISSUER,
    audience: MFA_AUDIENCE,
  });
}

module.exports = { generateAccessToken, verifyAccessToken, generateMfaToken, verifyMfaToken };
