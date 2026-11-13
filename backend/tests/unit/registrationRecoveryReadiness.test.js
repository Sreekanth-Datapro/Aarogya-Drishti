const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "../..");
const activeMigrationsPath = path.join(backendRoot, "migrations");
const proposedMigrationsPath = path.join(backendRoot, "migrations-proposed");
const readinessDocument = fs.readFileSync(
  path.join(backendRoot, "db-verification/MIGRATION_015_READINESS.md"),
  "utf8"
);
const workflowProposal = fs.readFileSync(
  path.join(proposedMigrationsPath, "015_two_stage_registration.sql"),
  "utf8"
);
const controller = fs.readFileSync(
  path.join(backendRoot, "controllers/registrationController.js"),
  "utf8"
);

test("recovery design requires scoped staff authorization and independent identity and channel verification", () => {
  expect(readinessDocument).toMatch(/dedicated recovery permission/i);
  expect(readinessDocument).toMatch(/Medical Officers only for assigned\s+Mandals/i);
  expect(readinessDocument).toMatch(/District Admins only for their district/i);
  expect(readinessDocument).toMatch(/independently verified/i);
  expect(readinessDocument).toMatch(/channel-verification challenge/i);
  expect(readinessDocument).toMatch(/Do not disclose request status or applicant\s+details/i);
  expect(readinessDocument).toMatch(/never by applicant-submitted username, phone, or email/i);
});

test("recovery design requires hashed, expiring, single-use tokens and audited outcomes", () => {
  expect(workflowProposal).toMatch(/short-lived, single-use challenge tokens/i);
  expect(workflowProposal).toMatch(/atomically/i);
  expect(readinessDocument).toMatch(/Store only its cryptographic hash and expiry/i);
  expect(readinessDocument).toMatch(/atomic conditional consume/i);
  expect(readinessDocument).toMatch(/audit[\s\S]*?delivery outcome/i);
});

test("reviewer identity is derived from the authenticated request actor, not caller input", () => {
  expect(controller).toContain("set_config('app.actor_id', $1, TRUE)");
  expect(controller).not.toContain("req.body.actor_id");
});

test("migration numbering has no active history edits or proposed numeric collisions", () => {
  const active = fs.readdirSync(activeMigrationsPath)
    .filter((name) => /^\d{3}_[a-z0-9_]+\.(sql|js)$/.test(name))
    .sort();
  const proposed = fs.readdirSync(proposedMigrationsPath)
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const proposedPrefixes = proposed.map((name) => name.slice(0, 3));

  expect(active).toContain("013_explicit_mandal_medical_officer_workflow.sql");
  // 015 was approved and applied on 2026-11-07, unchanged from the reviewed proposal; 014 is still a proposal
  expect(active.some((name) => name.startsWith("014_"))).toBe(false);
  expect(active.filter((name) => name.startsWith("015_"))).toEqual(["015_two_stage_registration.sql"]);
  expect(fs.readFileSync(path.join(activeMigrationsPath, "015_two_stage_registration.sql"), "utf8")).toBe(workflowProposal);
  expect(new Set(proposedPrefixes).size).toBe(proposedPrefixes.length);
  // Proposed folder currently holds 014–017 plus 019 (not yet promoted to migrations/).
  expect(proposed).toEqual([
    "014_district_admin_staff_permission.sql",
    "015_two_stage_registration.sql",
    "016_user_specialties.sql",
    "017_health_worker_mandal_registration.sql",
    "019_prevent_repeated_active_screenings.sql",
  ]);
  expect(fs.existsSync(path.join(proposedMigrationsPath, "superseded_two_stage_registration_v1.sql"))).toBe(true);
});

test("legacy status lookup remains token-only and requires an unexpired token", () => {
  expect(controller).toContain("status_token_expires_at > NOW()");
  expect(controller).toMatch(/WHERE status_token_hash = \$1[\s\S]*status_token_expires_at > NOW\(\)/);
});
