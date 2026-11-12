const fs = require("fs");
const path = require("path");

const proposalPath = path.join(__dirname, "../../migrations-proposed/015_two_stage_registration.sql");
const migrationPath = path.join(__dirname, "../../migrations/015_two_stage_registration.sql");
const proposal = fs.readFileSync(proposalPath, "utf8");
const controller = fs.readFileSync(
  path.join(__dirname, "../../controllers/registrationController.js"),
  "utf8"
);

// Migration 015 was approved and applied on 2026-11-07. The applied file must stay
// byte-for-byte identical to the reviewed proposal (the migrator also checks its checksum).
test("the applied two-stage registration migration is exactly the reviewed proposal", () => {
  expect(fs.existsSync(proposalPath)).toBe(true);
  expect(fs.existsSync(migrationPath)).toBe(true);
  expect(fs.readFileSync(migrationPath, "utf8")).toBe(proposal);
});

test("proposal backfills only pending requests and makes finalized rows immutable", () => {
  expect(proposal).toMatch(/UPDATE tbl_user_registration_requests[\s\S]*?WHERE status = 'PENDING'/);
  expect(proposal).toContain("IF OLD.status IN ('APPROVED', 'REJECTED')");
  expect(proposal).toContain("IF NEW IS DISTINCT FROM OLD");
});

test("proposal replaces the trigger function without dropping or recreating the existing trigger", () => {
  expect(proposal).toContain("CREATE OR REPLACE FUNCTION fn_validate_registration_reviewer()");
  expect(proposal).not.toMatch(/^\s*DROP TRIGGER/im);
  expect(proposal).not.toMatch(/^\s*CREATE TRIGGER/im);
  expect(proposal).toContain("Expected enabled row-level BEFORE INSERT OR UPDATE trigger trg_reg_reviewer_role was not found");
});

test("proposal does not duplicate the workflow_version check added by migration 010", () => {
  expect(proposal).not.toContain("ADD CONSTRAINT ck_reg_015_workflow_version");
});

test("proposal fails fast when baseline, 010, 011, or 013 schema dependencies are missing", () => {
  expect(proposal).toContain("Migration 015 prerequisites are missing columns");
  expect(proposal).toContain("'tbl_health_worker_location_assignments'");
  expect(proposal).toContain("'tbl_medical_officer_mandal_assignments'");
  expect(proposal).toContain("'ck_reg_approved'");
  expect(proposal).toContain("'ck_reg_rejected'");
  expect(proposal).toContain("'ck_reg_reviewed'");
  expect(proposal).toContain("'ck_reg_rejection_reason_nonblank'");
  expect(proposal).toContain("'ck_registration_workflow_version'");
});

test("the district variable cannot be confused with district_id columns", () => {
  expect(proposal).toContain("v_district_id BIGINT;");
  expect(proposal).not.toMatch(/=\s*district_id\b/);
  expect(proposal).not.toMatch(/INTO district_id\b/);
});

test("pending rows are backfilled before the stricter trigger function is installed", () => {
  expect(proposal.indexOf("SET workflow_version = 1")).toBeLessThan(
    proposal.indexOf("CREATE OR REPLACE FUNCTION fn_validate_registration_reviewer()")
  );
});

test("database reviewer checks bind to transaction actor context, not a supplied reviewer ID alone", () => {
  expect(controller).toContain("set_config('app.actor_id', $1, TRUE)");
  expect(proposal).toContain("current_setting('app.actor_id', TRUE)");
  expect(proposal).toContain("NEW.mo_recommended_by IS DISTINCT FROM actor_id");
  expect(proposal).toContain("NEW.reviewed_by IS DISTINCT FROM actor_id");
  expect(controller).not.toContain("req.body.actor_id");
});

test("proposal documents that app.actor_id is not an independent database authentication mechanism", () => {
  expect(proposal).toMatch(/caller-settable by a database session with sufficient\s+-- privileges/i);
  expect(proposal).toMatch(/this trigger does not authenticate callers/i);
});

test("proposal does not fabricate status tokens for legacy applicants", () => {
  expect(proposal).toMatch(/Legacy pending requests without a token cannot use applicant status lookup/i);
  expect(proposal).toMatch(/Do not derive or backfill tokens from applicant data/i);
  expect(proposal).not.toMatch(/SET\s+status_token_hash\s*=/i);
});

test("recommendation checks reject null and whitespace-only recommendation data", () => {
  expect(proposal).toContain("mo_recommendation IS NOT NULL");
  expect(proposal).toContain("mo_recommendation_note IS NOT NULL");
  expect(proposal).toMatch(/length\(regexp_replace\([\s\S]*?mo_recommendation_note[\s\S]*?\)\) > 0/);
  expect(proposal).toMatch(/NEW\.mo_recommendation IS NULL/);
  expect(proposal).toMatch(/NEW\.mo_recommendation_note IS NULL/);
});

test("token constraints and insert guard require a valid paired unexpired token", () => {
  expect(proposal).toContain("status_token_hash IS NOT NULL");
  expect(proposal).toContain("status_token_hash ~ '^[0-9a-f]{64}$'");
  expect(proposal).toContain("NEW.status_token_hash !~ '^[0-9a-f]{64}$'");
  expect(proposal).toContain("NEW.status_token_expires_at <= CURRENT_TIMESTAMP");
  expect(proposal).toContain("NEW.status_token_expires_at > CURRENT_TIMESTAMP + INTERVAL '30 days'");
});

test("same-name constraints and indexes fail for manual definition review instead of silently skipping", () => {
  expect(proposal).toContain("A Migration 015 constraint name already exists");
  expect(proposal).toContain("A Migration 015 index name already exists");
  expect(proposal).toMatch(/CREATE UNIQUE INDEX uq_reg_015_status_token_hash/);
  expect(proposal).not.toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_015_status_token_hash/);
});

test("permission grants are asserted before the migration can commit", () => {
  expect(proposal).toContain("role.code = 'MEDICAL_OFFICER'");
  expect(proposal).toContain("permission.code = 'registration.recommend'");
  expect(proposal).toContain("role.code = 'DISTRICT_ADMIN'");
  expect(proposal).toContain("permission.code = 'registration.monitor'");
  expect(proposal).toContain("permission.code = 'registration.finalize'");
  expect(proposal).toContain("Required registration permissions are missing or granted to an unauthorized role");
  expect(proposal).toContain("role.code <> 'MEDICAL_OFFICER'");
  expect(proposal).toContain("role.code <> 'DISTRICT_ADMIN'");
  expect(proposal).toContain("permission.code = 'registration.verify'");
});

test("workflow updates preserve submitted details and tokens", () => {
  expect(proposal).toContain("Submitted registration details and status token are immutable");
  expect(proposal).toContain("Token columns are deliberately not excluded from these row comparisons.");
});

test("registration submission no longer depends on the unapproved token columns", () => {
  const authController = fs.readFileSync(
    path.join(__dirname, "../../controllers/authController.js"),
    "utf8"
  );
  expect(authController).toContain("hasTwoStageRegistrationSchema(pool)");
  expect(authController).toContain("'HEALTH_WORKER', NOW(), 'PENDING', NULL");
  expect(authController).toContain("status_token_hash, status_token_expires_at");
  expect(authController).toContain("crypto.createHash(\"sha256\")");
  expect(authController).toContain("...(statusToken ? { status_token: statusToken } : {})");
});

test("recommendation values match the explicit two-stage workflow contract", () => {
  expect(proposal).toContain("mo_recommendation IN ('RECOMMENDED', 'NOT_RECOMMENDED')");
  expect(proposal).not.toContain("mo_recommendation IN ('APPROVE', 'REJECT')");
  expect(controller).toContain("[\"RECOMMENDED\", \"NOT_RECOMMENDED\"]");
});
