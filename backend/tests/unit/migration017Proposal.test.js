const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "../..");
const proposalPath = path.join(backendRoot, "migrations-proposed/017_health_worker_mandal_registration.sql");
const proposal = fs.readFileSync(proposalPath, "utf8");
const sql = proposal.replace(/--.*$/gm, "");

// 017 was approved and applied on 2026-11-07; the applied file must stay identical to the review
test("the applied 017 is exactly the reviewed proposal", () => {
  const appliedPath = path.join(backendRoot, "migrations/017_health_worker_mandal_registration.sql");
  expect(fs.existsSync(appliedPath)).toBe(true);
  expect(fs.readFileSync(appliedPath, "utf8")).toBe(proposal);
});

test("017 only replaces the two functions and changes no table, row or trigger", () => {
  expect(sql).toContain("CREATE OR REPLACE FUNCTION fn_patient_set_mandal_and_validate_hw_assignment()");
  expect(sql).toContain("CREATE OR REPLACE FUNCTION fn_user_has_patient_access(p_user UUID, p_patient UUID)");
  expect(sql).not.toMatch(/\b(ALTER|DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
  expect(sql).not.toMatch(/CREATE TRIGGER/i);
});

test("the Health Worker must still be assigned to the patient's Mandal, with an active village and facility of it", () => {
  expect(sql).toContain("a.mandal_id = v_patient_mandal");
  expect(sql).toContain("v.mandal_id = v_patient_mandal AND v.is_active IS TRUE");
  expect(sql).toContain("f.mandal_id = v_patient_mandal");
  expect(sql).toContain("f.is_active IS TRUE");
  expect(sql).toContain("NEW.mandal_id := v_patient_mandal");
});

test("new patient access is limited to the worker's own registrations in a currently assigned Mandal", () => {
  expect(sql).toContain("p.registered_by = p_user");
  expect(sql).toContain("r.code NOT IN ('DISTRICT_ADMIN', 'SYSTEM_ADMIN', 'SUPER_ADMIN')");
  expect(sql).toContain("tbl_medical_officer_mandal_assignments");
});
