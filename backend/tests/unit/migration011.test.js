const fs = require("fs");
const path = require("path");

const migrationPath = path.join(
  __dirname,
  "..",
  "..",
  "migrations",
  "011_unify_admin_roles.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");
const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();

describe("migration 011 administrative role consolidation", () => {
  test("guards the expected role IDs, codes, and MFA requirements", () => {
    expect(normalizedSql).toMatch(
      /where id = 7 and code = 'system_admin' and mfa_required = true/
    );
    expect(normalizedSql).toMatch(
      /where id = 8 and code = 'super_admin' and mfa_required = true/
    );
    expect(normalizedSql).toContain("raise exception");
  });

  test("copies only non-decision legacy permissions and adds monitoring permissions", () => {
    expect(normalizedSql).toMatch(
      /insert into tbl_role_permissions \(role_id, permission_id\) select canonical\.id, rp\.permission_id/
    );
    expect(normalizedSql).toContain(
      "permission.code not in ('registration.review', 'registration.verify')"
    );
    expect(normalizedSql).toContain("on conflict (role_id, permission_id) do nothing");
    expect(normalizedSql).not.toMatch(/delete\s+from\s+mst_roles/);
    expect(normalizedSql).toContain("'registration.monitor'");
    expect(normalizedSql).toContain("'medical_officer' and p.code in ('registration.monitor', 'registration.verify')");
    expect(normalizedSql).toContain("p.code = 'registration.monitor' and not exists");
    expect(normalizedSql).toContain("p.code = 'registration.verify' and r.code <> 'medical_officer'");
    expect(normalizedSql).toContain("p.code = 'registration.review'");
  });

  test("audits and revokes sessions before reassigning legacy users", () => {
    const auditIndex = normalizedSql.indexOf("'011_unify_admin_roles'");
    const revokeIndex = normalizedSql.indexOf("update tbl_user_sessions");
    const reassignmentIndex = normalizedSql.indexOf("update tbl_users set role_id = 8");

    expect(auditIndex).toBeGreaterThan(-1);
    expect(revokeIndex).toBeGreaterThan(auditIndex);
    expect(reassignmentIndex).toBeGreaterThan(revokeIndex);
    expect(normalizedSql).toContain("revoke_reason = 'role_changed'");
    expect(normalizedSql).toContain("where u.role_id = 7");
  });

  test("keeps role 7, deactivates it, and validates facility-assigned Medical Officer reviewers", () => {
    expect(normalizedSql).toMatch(
      /update mst_roles set is_active = false where id = 7 and code = 'system_admin'/
    );
    expect(normalizedSql).toContain("create or replace function fn_validate_registration_reviewer()");
    expect(normalizedSql).toContain("r.code = 'medical_officer'");
    expect(normalizedSql).toContain("ufa.facility_id = new.facility_id");
    expect(normalizedSql).toContain("ufa.valid_from <= current_date");
    expect(normalizedSql).toContain("ufa.valid_to >= current_date");
    expect(normalizedSql).toContain("for share of u, r");
    expect(normalizedSql).toContain("for share;");
    expect(normalizedSql).toContain("old.status in ('approved', 'rejected')");
    expect(normalizedSql).toContain("new.status is distinct from old.status");
    expect(normalizedSql).toContain("new.reviewed_by is distinct from old.reviewed_by");
    expect(normalizedSql).toContain("new.reviewed_at is distinct from old.reviewed_at");
    expect(normalizedSql).toContain("new.facility_id is distinct from old.facility_id");
    expect(normalizedSql).toContain("old.status <> 'pending'");
    expect(normalizedSql).not.toMatch(/current_user|current_setting/);
    expect(normalizedSql).toContain("execute function fn_validate_registration_reviewer()");
    expect(normalizedSql).not.toMatch(/create or replace function fn_require_role/);
    expect(normalizedSql).toContain("ck_reg_rejection_reason_nonblank");
    expect(normalizedSql).toContain("regexp_replace(rejection_reason, '[[:space:]]', '', 'g')");
    expect(normalizedSql).toContain("not valid");
    expect(normalizedSql).toContain("'admin_role_retired'");
    expect(normalizedSql).not.toMatch(/delete\s+from\s+(mst_roles|tbl_users|tbl_audit_logs)/);
    expect(normalizedSql).not.toMatch(/(update|delete)\s+tbl_user_registration_requests/);
    expect(normalizedSql).not.toMatch(/update\s+tbl_audit_logs/);
  });

  test("uses only declared audit columns and success outcome", () => {
    expect(normalizedSql).toMatch(
      /insert into tbl_audit_logs \(actor_id, actor_role, event, outcome, resource_type, resource_id, metadata\)/
    );
    expect(normalizedSql).toContain("'success'");
    expect(normalizedSql).toContain("jsonb_build_object");
  });
});
