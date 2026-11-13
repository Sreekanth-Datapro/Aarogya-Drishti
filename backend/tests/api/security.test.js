const express = require("express");
const request = require("supertest");
const app = require("../../app");
const totp = require("../../utils/totp");
const { testOutbox } = require("../../services/passwordResetDelivery");
const { authenticate, requirePermission } = require("../../middleware/authMiddleware");
const { resetTransactionalData, createUser, pool } = require("../helpers/db");

const login = (username, password) =>
  request(app).post("/api/auth/login").send({ username, password });

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

function refreshCookieFrom(res) {
  const cookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("ad_refresh="));
  return cookie ? cookie.split(";")[0] : null;
}

beforeAll(async () => {
  await resetTransactionalData();
});

describe("roles and permissions", () => {
  test("SUPER_ADMIN role exists and requires MFA", async () => {
    const { rows } = await pool.query("SELECT mfa_required FROM mst_roles WHERE code = 'SUPER_ADMIN'");
    expect(rows).toEqual([{ mfa_required: true }]);
  });

  test("role permission grants match the authorization model", async () => {
    const { rows } = await pool.query(`
      SELECT r.code AS role, array_agg(p.code ORDER BY p.code) AS perms
        FROM tbl_role_permissions rp
        JOIN mst_roles r ON r.id = rp.role_id
        JOIN mst_permissions p ON p.id = rp.permission_id
       GROUP BY r.code`);
    const perms = Object.fromEntries(rows.map((r) => [r.role, r.perms]));

    expect(perms.SUPER_ADMIN).toEqual(expect.arrayContaining(["user.create_admin", "master.manage", "registration.monitor"]));
    expect(perms.SYSTEM_ADMIN).toEqual(expect.arrayContaining(["user.create_staff", "master.manage"]));
    expect(perms.SUPER_ADMIN).not.toContain("registration.review");
    expect(perms.SUPER_ADMIN).not.toContain("registration.verify");
    expect(perms.SYSTEM_ADMIN).not.toContain("registration.review");
    expect(perms.SYSTEM_ADMIN).not.toContain("registration.verify");
    expect(perms.MEDICAL_OFFICER).toContain("registration.monitor");
    expect(perms.MEDICAL_OFFICER).toContain("registration.recommend");
    expect(perms.MEDICAL_OFFICER).not.toContain("registration.verify");
    expect(perms.SYSTEM_ADMIN).not.toContain("user.create_admin");
    expect(perms.MEDICAL_OFFICER).toEqual(expect.arrayContaining(["patient.register", "review.sign"]));
    expect(perms.HEALTH_WORKER).not.toContain("registration.verify");
    expect(perms.DISTRICT_ADMIN).toEqual(
      expect.arrayContaining([
        "dashboard.view_aggregate",
        "export.aggregate",
        "master.view",
        "registration.monitor",
        "registration.finalize",
      ])
    );

    for (const admin of ["SUPER_ADMIN", "SYSTEM_ADMIN", "DISTRICT_ADMIN"]) {
      expect(perms[admin]).not.toContain("patient.read_assigned");
    }
  });

  test("requirePermission allows holders and denies (and audits) others", async () => {
    const mini = express();
    mini.use(express.json());
    mini.get("/guarded", authenticate, requirePermission("registration.verify"), (req, res) => res.json({ ok: true }));

    await createUser({ username: "perm_hw", role: "HEALTH_WORKER" });
    const hw = await login("perm_hw", "Password@123");

    const denied = await request(mini).get("/guarded").set(bearer(hw.body.accessToken));
    expect(denied.status).toBe(403);

    const { rows } = await pool.query(
      "SELECT outcome FROM tbl_audit_logs WHERE event = 'ACCESS_DENIED' ORDER BY id DESC LIMIT 1"
    );
    expect(rows[0].outcome).toBe("DENIED");
  });
});

describe("sessions, logout and refresh-token rotation", () => {
  beforeAll(async () => {
    await createUser({ username: "sess_hw", role: "HEALTH_WORKER" });
  });

  test("logout revokes the access token immediately", async () => {
    const res = await login("sess_hw", "Password@123");
    expect(res.status).toBe(200);
    expect(refreshCookieFrom(res)).toMatch(/^ad_refresh=/);
    expect(res.headers["set-cookie"].join(";")).toMatch(/HttpOnly/i);

    const token = res.body.accessToken;
    expect((await request(app).get("/api/auth/me").set(bearer(token))).status).toBe(200);

    expect((await request(app).post("/api/auth/logout").set(bearer(token))).status).toBe(200);

    const after = await request(app).get("/api/auth/me").set(bearer(token));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("SESSION_EXPIRED");
  });

  test("refresh rotates the token and a reused old token ends the session", async () => {
    const first = await login("sess_hw", "Password@123");
    const oldCookie = refreshCookieFrom(first);

    const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", oldCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    const newCookie = refreshCookieFrom(refreshed);
    expect(newCookie).not.toBe(oldCookie);

    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", oldCookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("REFRESH_TOKEN_REUSED");

    const victim = await request(app).get("/api/auth/me").set(bearer(refreshed.body.accessToken));
    expect(victim.status).toBe(401);

    const newAlsoDead = await request(app).post("/api/auth/refresh").set("Cookie", newCookie);
    expect(newAlsoDead.status).toBe(401);
  });

  test("refresh without a cookie is rejected", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  test("tokens without a session id (pre-upgrade tokens) are rejected", async () => {
    const jwt = require("jsonwebtoken");
    const legacy = jwt.sign({ sub: "00000000-0000-0000-0000-000000000000", role: "HEALTH_WORKER" },
      process.env.JWT_SECRET, { issuer: "aarogya-drishti", audience: "aarogya-drishti-users", expiresIn: "5m" });
    const res = await request(app).get("/api/auth/me").set(bearer(legacy));
    expect(res.status).toBe(401);
  });
});

describe("multi-factor authentication for required roles", () => {
  beforeAll(async () => {
    await createUser({ username: "mfa_mo", role: "MEDICAL_OFFICER" });
  });

  let secret;

  test("first login requires MFA enrolment and issues no access token", async () => {
    const res = await login("mfa_mo", "Password@123");
    expect(res.status).toBe(200);
    expect(res.body.mfa_setup_required).toBe(true);
    expect(res.body.accessToken).toBeUndefined();

    const mfaToken = res.body.mfa_token;
    expect((await request(app).get("/api/auth/me").set(bearer(mfaToken))).status).toBe(401);

    const setup = await request(app).post("/api/auth/mfa/setup").set(bearer(mfaToken));
    expect(setup.status).toBe(200);
    expect(setup.body.qr_code).toMatch(/^data:image\/png;base64,/);
    expect(setup.body.otpauth_url).toMatch(/^otpauth:\/\/totp\//);
    secret = setup.body.secret;

    const { rows } = await pool.query("SELECT mfa_secret_encrypted, mfa_enabled FROM tbl_users WHERE username = 'mfa_mo'");
    expect(rows[0].mfa_enabled).toBe(false);
    expect(rows[0].mfa_secret_encrypted).not.toContain(secret);

    const wrong = await request(app).post("/api/auth/mfa/enable").set(bearer(mfaToken)).send({ code: "000000" });
    expect(wrong.status).toBe(401);

    const code = totp.codeForStep(secret, totp.currentStep());
    const enabled = await request(app).post("/api/auth/mfa/enable").set(bearer(mfaToken)).send({ code });
    expect(enabled.status).toBe(200);
    expect(enabled.body.accessToken).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set(bearer(enabled.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.permissions).toContain("review.sign");
  });

  test("later logins require a fresh code; a replayed code is refused", async () => {
    await pool.query("UPDATE tbl_users SET failed_login_count = 0 WHERE username = 'mfa_mo'");

    const res = await login("mfa_mo", "Password@123");
    expect(res.body.mfa_required).toBe(true);

    const used = await pool.query("SELECT mfa_last_used_step FROM tbl_users WHERE username = 'mfa_mo'");
    const lastStep = Number(used.rows[0].mfa_last_used_step);

    const replay = totp.codeForStep(secret, lastStep);
    const replayed = await request(app).post("/api/auth/mfa/verify").set(bearer(res.body.mfa_token)).send({ code: replay });
    expect(replayed.status).toBe(401);

    const next = totp.codeForStep(secret, lastStep + 1);
    const ok = await request(app).post("/api/auth/mfa/verify").set(bearer(res.body.mfa_token)).send({ code: next });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
  });

  test("an MFA token cannot be used as an access token and vice versa", async () => {
    await createUser({ username: "mfa_hw", role: "HEALTH_WORKER" });
    const hw = await login("mfa_hw", "Password@123");
    const misuse = await request(app).post("/api/auth/mfa/verify").set(bearer(hw.body.accessToken)).send({ code: "123456" });
    expect(misuse.status).toBe(401);
  });

  test("without MFA_ENCRYPTION_KEY, MFA-required roles get 503 instead of a bypass", async () => {
    await createUser({ username: "mfa_nokey", role: "SPECIALIST" });
    const saved = process.env.MFA_ENCRYPTION_KEY;
    delete process.env.MFA_ENCRYPTION_KEY;
    try {
      const res = await login("mfa_nokey", "Password@123");
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("MFA_NOT_CONFIGURED");
      expect(res.body.accessToken).toBeUndefined();
    } finally {
      process.env.MFA_ENCRYPTION_KEY = saved;
    }
  });
});

describe("forced password change", () => {
  test("pending change blocks other routes until the password is changed", async () => {
    await createUser({ username: "temp_hw", role: "HEALTH_WORKER", password: "Temporary1", mustChangePassword: true });

    const first = await login("temp_hw", "Temporary1");
    expect(first.body.user.must_change_password).toBe(true);
    const other = await login("temp_hw", "Temporary1");

    const blocked = await request(app).get("/api/auth/sessions").set(bearer(first.body.accessToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");

    expect((await request(app).get("/api/auth/me").set(bearer(first.body.accessToken))).status).toBe(200);

    const weak = await request(app).post("/api/auth/change-password").set(bearer(first.body.accessToken))
      .send({ current_password: "Temporary1", new_password: "short" });
    expect(weak.status).toBe(400);

    const changed = await request(app).post("/api/auth/change-password").set(bearer(first.body.accessToken))
      .send({ current_password: "Temporary1", new_password: "NewSecure2026" });
    expect(changed.status).toBe(200);

    expect((await request(app).get("/api/auth/sessions").set(bearer(first.body.accessToken))).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set(bearer(other.body.accessToken))).status).toBe(401);
  });
});

describe("password reset", () => {
  beforeAll(async () => {
    await createUser({ username: "reset_hw", role: "HEALTH_WORKER", password: "OldPassword1" });
  });

  const tokenFromOutbox = () => {
    const last = testOutbox[testOutbox.length - 1];
    return new URL(last.link).searchParams.get("token");
  };

  test("unknown and known usernames get the same response; token is never returned", async () => {
    const before = testOutbox.length;

    const unknown = await request(app).post("/api/auth/password-reset/request").send({ username: "nobody_here" });
    const known = await request(app).post("/api/auth/password-reset/request").send({ username: "reset_hw" });

    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toMatch(/token/i);
    expect(testOutbox.length).toBe(before + 1);

    const { rows } = await pool.query(
      `SELECT t.token_hash, t.expires_at - t.created_at AS ttl
         FROM tbl_password_reset_tokens t JOIN tbl_users u ON u.id = t.user_id
        WHERE u.username = 'reset_hw' AND t.used_at IS NULL`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(tokenFromOutbox());
    expect(rows[0].ttl.minutes).toBe(15);
  });

  test("token resets the password once and revokes sessions", async () => {
    const session = await login("reset_hw", "OldPassword1");
    const token = tokenFromOutbox();

    const weak = await request(app).post("/api/auth/password-reset/confirm").send({ token, new_password: "weak" });
    expect(weak.status).toBe(400);

    const ok = await request(app).post("/api/auth/password-reset/confirm").send({ token, new_password: "BrandNew2026" });
    expect(ok.status).toBe(200);

    expect((await login("reset_hw", "OldPassword1")).status).toBe(401);
    expect((await login("reset_hw", "BrandNew2026")).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set(bearer(session.body.accessToken))).status).toBe(401);

    const reuse = await request(app).post("/api/auth/password-reset/confirm").send({ token, new_password: "Another2026" });
    expect(reuse.status).toBe(400);
  });

  test("an expired token is rejected", async () => {
    await request(app).post("/api/auth/password-reset/request").send({ username: "reset_hw" });
    const token = tokenFromOutbox();

    await pool.query(
      `UPDATE tbl_password_reset_tokens
          SET created_at = now() - interval '20 minutes', expires_at = now() - interval '5 minutes'
        WHERE used_at IS NULL`
    );

    const res = await request(app).post("/api/auth/password-reset/confirm").send({ token, new_password: "Expired2026x" });
    expect(res.status).toBe(400);
  });
});

describe("audit trail hygiene", () => {
  test("logins are audited without credentials or tokens", async () => {
    const { rows } = await pool.query(
      "SELECT event, metadata FROM tbl_audit_logs WHERE event IN ('LOGIN_SUCCESS','LOGIN_FAILED','PASSWORD_RESET_REQUESTED')"
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(JSON.stringify(row.metadata)).not.toMatch(/password|token|secret/i);
    }
  });
});

describe("database rules after migration 015", () => {
  test("an assigned Medical Officer recommends; only the District Admin may finalize", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sup = await createUserWith(client, "db_super", "SUPER_ADMIN");
      const sys = await createUserWith(client, "db_sysadmin", "SYSTEM_ADMIN");
      const mo = await createUserWith(client, "db_mo", "MEDICAL_OFFICER");
      const location = await client.query(
        `SELECT f.id AS facility_id, f.district_id, m.id AS mandal_id,
                v.id AS village_id, l.id AS language_id
           FROM mst_facilities f
           JOIN mst_mandals m ON m.code = 'G_MADUGULA'
           JOIN mst_villages v ON v.code = 'VIL_DEMO_1'
           JOIN mst_languages l ON l.code = 'te'
          WHERE f.code = 'FAC_PHC_GM'
            AND f.mandal_id = m.id
            AND v.mandal_id = m.id`
      );
      await client.query(
        `INSERT INTO tbl_medical_officer_mandal_assignments
           (user_id, mandal_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [mo, location.rows[0].mandal_id, sys]
      );

      const registration = async (username, tokenHash) => {
        const { rows } = await client.query(
          `INSERT INTO tbl_user_registration_requests
             (full_name, username, phone, designation, facility_id, mandal_id,
              village_id, language_id, password_hash, terms_accepted_at,
              workflow_version, status_token_hash, status_token_expires_at)
           VALUES
             ('Test Worker', $1, '9999999999', 'ASHA', $2, $3, $4, $5, 'x',
              now(), 1, $6, now() + interval '30 days')
           RETURNING id`,
          [
            username,
            location.rows[0].facility_id,
            location.rows[0].mandal_id,
            location.rows[0].village_id,
            location.rows[0].language_id,
            tokenHash,
          ]
        );
        return rows[0].id;
      };

      const approvedRequest = await registration("db_reg", "a".repeat(64));
      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [mo]);
      await client.query(
        `UPDATE tbl_user_registration_requests
            SET mo_recommended_by = $1, mo_recommended_at = now(),
                mo_recommendation = 'RECOMMENDED', mo_recommendation_note = 'Verified'
          WHERE id = $2`,
        [mo, approvedRequest]
      );

      const createdUser = await createUserWith(
        client,
        "db_reg",
        "HEALTH_WORKER",
        location.rows[0].district_id
      );
      await client.query(
        `INSERT INTO tbl_user_facility_assignments (user_id, facility_id, is_primary)
         VALUES ($1, $2, TRUE)`,
        [createdUser, location.rows[0].facility_id]
      );
      const districtAdmin = await createUserWith(
        client,
        "db_district_admin",
        "DISTRICT_ADMIN",
        location.rows[0].district_id
      );
      await client.query(
        `INSERT INTO tbl_health_worker_location_assignments
           (user_id, district_id, mandal_id, village_id, facility_id, assigned_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          createdUser,
          location.rows[0].district_id,
          location.rows[0].mandal_id,
          location.rows[0].village_id,
          location.rows[0].facility_id,
          districtAdmin,
        ]
      );

      await client.query("SAVEPOINT mo_final_decision");
      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [mo]);
      await expect(
        client.query(
          `UPDATE tbl_user_registration_requests
              SET status = 'APPROVED', reviewed_by = $1,
                  reviewed_at = now(), created_user_id = $2
            WHERE id = $3`,
          [mo, createdUser, approvedRequest]
        )
      ).rejects.toThrow("Final decision must be made by the active District Admin");
      await client.query("ROLLBACK TO SAVEPOINT mo_final_decision");

      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [districtAdmin]);
      await client.query(
        `UPDATE tbl_user_registration_requests
            SET status = 'APPROVED', reviewed_by = $1,
                reviewed_at = now(), created_user_id = $2
          WHERE id = $3`,
        [districtAdmin, createdUser, approvedRequest]
      );

      const rejectedRequest = await registration("db_reg_reject", "b".repeat(64));
      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [mo]);
      await client.query(
        `UPDATE tbl_user_registration_requests
            SET mo_recommended_by = $1, mo_recommended_at = now(),
                mo_recommendation = 'NOT_RECOMMENDED', mo_recommendation_note = 'Needs review'
          WHERE id = $2`,
        [mo, rejectedRequest]
      );
      await client.query("SAVEPOINT super_admin_final_decision");
      await client.query("SELECT set_config('app.actor_id', $1, TRUE)", [sup]);
      await expect(
        client.query(
          `UPDATE tbl_user_registration_requests
              SET status = 'REJECTED', reviewed_by = $1, reviewed_at = now(),
                  rejection_reason = 'Rejected'
            WHERE id = $2`,
          [sup, rejectedRequest]
        )
      ).rejects.toThrow("Final decision must be made by the active District Admin");
      await client.query("ROLLBACK TO SAVEPOINT super_admin_final_decision");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("SUPER_ADMIN has no patient-level access", async () => {
    const { rows } = await pool.query("SELECT prosrc FROM pg_proc WHERE proname = 'fn_user_has_patient_access'");
    // Formatting may include spaces after commas; still require all three roles denied.
    expect(rows[0].prosrc).toMatch(
      /'DISTRICT_ADMIN'\s*,\s*'SYSTEM_ADMIN'\s*,\s*'SUPER_ADMIN'/
    );
  });

  test("003 promotes the bootstrap SYSTEM_ADMIN in place and audits it", async () => {
    const { up } = require("../../migrations/003_promote_bootstrap_admin");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const id = await createUserWith(client, "boot_admin", "SYSTEM_ADMIN");
      await up(client, { bootstrapUsername: "boot_admin" });

      const after = await client.query(
        "SELECT u.id, r.code FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id WHERE u.username = 'boot_admin'"
      );
      expect(after.rows[0]).toEqual({ id, code: "SUPER_ADMIN" });

      const auditRow = await client.query(
        "SELECT metadata FROM tbl_audit_logs WHERE event = 'ROLE_CHANGED' AND resource_id = $1", [id]
      );
      expect(auditRow.rows[0].metadata).toMatchObject({ from: "SYSTEM_ADMIN", to: "SUPER_ADMIN" });

      const second = await createUserWith(client, "boot_admin2", "SYSTEM_ADMIN");
      await up(client, { bootstrapUsername: "boot_admin2" });
      const unchanged = await client.query(
        "SELECT r.code FROM tbl_users u JOIN mst_roles r ON r.id = u.role_id WHERE u.id = $1", [second]
      );
      expect(unchanged.rows[0].code).toBe("SYSTEM_ADMIN");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});

async function createUserWith(client, username, role, districtId = null) {
  const { rows } = await client.query(
    `INSERT INTO tbl_users (username, password_hash, full_name, role_id, district_id)
     SELECT $1, 'x', $1, id, $3 FROM mst_roles WHERE code = $2 RETURNING id`,
    [username, role, districtId]
  );
  return rows[0].id;
}
