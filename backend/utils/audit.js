const pool = require("../db");

// Never store credentials, tokens or clinical free text in audit metadata.
const FORBIDDEN_KEYS = /pass|token|secret|otp|hash|diagnosis|finding|note/i;

function sanitize(metadata = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (value === undefined) continue;
    clean[key] = typeof value === "object" && value !== null ? JSON.stringify(value).slice(0, 500) : value;
  }
  return clean;
}

// Audit failures are logged but never break the request that triggered them.
async function audit(req, {
  event,
  outcome = "SUCCESS",
  resourceType,
  resourceId = null,
  patientId = null,
  actorId,
  actorRole,
  metadata,
  client = pool,
  required = false,
}) {
  try {
    await client.query(
      `INSERT INTO tbl_audit_logs
         (actor_id, actor_role, event, outcome, resource_type, resource_id, patient_id, ip_address, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        actorId !== undefined ? actorId : req?.user?.id || null,
        actorRole !== undefined ? actorRole : req?.user?.role_name || null,
        event,
        outcome,
        resourceType,
        resourceId ? String(resourceId) : null,
        patientId,
        req?.ip || null,
        req?.requestId || null,
        sanitize(metadata),
      ]
    );
  } catch (error) {
    if (required) throw error;
    console.error(`Audit write failed for ${event}:`, error.message);
  }
}

module.exports = { audit, sanitize };
