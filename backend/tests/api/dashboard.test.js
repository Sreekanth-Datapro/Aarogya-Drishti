const request = require("supertest");
const app = require("../../app");
const { resetTransactionalData, createUser, pool } = require("../helpers/db");
const { bearer, signIn, signInWithMfa } = require("../helpers/auth");

let districtAId;
let districtBId;
let facilityAId;
let facilityBId;

// Seed uses 4 demo facilities + 2 TEST_FACILITY_* rows created below.
const EXPECTED_TOTAL_FACILITIES = 6;

beforeAll(async () => {
  await resetTransactionalData();
  await createUser({ username: "dash_hw", role: "HEALTH_WORKER" });
  // Migration 011 retires SYSTEM_ADMIN (is_active=false); login requires an active role.
  // Platform admin dashboard coverage uses SUPER_ADMIN (unified admin).
  await createUser({ username: "dash_admin", role: "SUPER_ADMIN" });
  await createUser({ username: "dash_admin2", role: "SUPER_ADMIN" });

  const districtA = await pool.query(
    `INSERT INTO mst_districts (code, name_en, name_te)
     VALUES ('TEST_DISTRICT_A', 'Test District A', 'పరీక్ష జిల్లా ఎ')
     ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_te = EXCLUDED.name_te
     RETURNING id`,
  );
  districtAId = Number(districtA.rows[0].id);

  const districtB = await pool.query(
    `INSERT INTO mst_districts (code, name_en, name_te)
     VALUES ('TEST_DISTRICT_B', 'Test District B', 'పరీక్ష జిల్లా బి')
     ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_te = EXCLUDED.name_te
     RETURNING id`,
  );
  districtBId = Number(districtB.rows[0].id);

  await createUser({ username: "dash_district_a", role: "DISTRICT_ADMIN", districtId: districtAId });
  await createUser({ username: "dash_district_b", role: "DISTRICT_ADMIN", districtId: districtBId });
  await createUser({ username: "dash_health_a", role: "HEALTH_WORKER", districtId: districtAId });
  await createUser({ username: "dash_health_b", role: "HEALTH_WORKER", districtId: districtBId });
  await createUser({ username: "dash_super", role: "SUPER_ADMIN" });

  const insertLocation = async (districtId, suffix) => {
    const mandal = await pool.query(
      `INSERT INTO mst_mandals (district_id, code, name_en, name_te)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET district_id = EXCLUDED.district_id
       RETURNING id`,
      [districtId, `TEST_MANDAL_${suffix}`, `Test Mandal ${suffix}`, `పరీక్ష మండలం ${suffix}`]
    );
    const panchayat = await pool.query(
      `INSERT INTO mst_gram_panchayats (mandal_id, code, name_en, name_te)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET mandal_id = EXCLUDED.mandal_id
       RETURNING id`,
      [mandal.rows[0].id, `TEST_GP_${suffix}`, `Test Panchayat ${suffix}`, `పరీక్ష పంచాయతీ ${suffix}`]
    );
    const village = await pool.query(
      `INSERT INTO mst_villages (gram_panchayat_id, code, name_en, name_te)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET gram_panchayat_id = EXCLUDED.gram_panchayat_id
       RETURNING id`,
      [panchayat.rows[0].id, `TEST_VILLAGE_${suffix}`, `Test Village ${suffix}`, `పరీక్ష గ్రామం ${suffix}`]
    );
    const facility = await pool.query(
      `INSERT INTO mst_facilities
         (district_id, facility_type, category, code, name_en, name_te, mandal_id, village_id, is_active)
       VALUES ($1, 'DISTRICT_OFFICE', 'DISTRICT_OFFICE', $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (code) DO UPDATE
         SET district_id = EXCLUDED.district_id, mandal_id = EXCLUDED.mandal_id,
             village_id = EXCLUDED.village_id, is_active = TRUE
       RETURNING id`,
      [districtId, `TEST_FACILITY_${suffix}`, `Test Facility ${suffix}`, `పరీక్ష సౌకర్యం ${suffix}`, mandal.rows[0].id, village.rows[0].id]
    );
    return { mandalId: mandal.rows[0].id, villageId: village.rows[0].id, facilityId: facility.rows[0].id };
  };

  const aLocation = await insertLocation(districtAId, "A");
  const bLocation = await insertLocation(districtBId, "B");
  facilityAId = Number(aLocation.facilityId);
  facilityBId = Number(bLocation.facilityId);

  const language = await pool.query("SELECT id FROM mst_languages WHERE code = 'en'");
  const languageId = language.rows[0].id;

  for (const registration of [
    { suffix: "A", username: "dash_registration_a", facilityId: facilityAId, mandalId: aLocation.mandalId, villageId: aLocation.villageId },
    { suffix: "B", username: "dash_registration_b", facilityId: facilityBId, mandalId: bLocation.mandalId, villageId: bLocation.villageId },
  ]) {
    await pool.query(
      `INSERT INTO tbl_user_registration_requests
         (full_name, username, phone, designation, facility_id, mandal_id, village_id,
          language_id, password_hash, status, terms_accepted_at, workflow_version,
          status_token_hash, status_token_expires_at)
       VALUES ($1, $2, '9876543210', 'ASHA', $3, $4, $5, $6,
               '$2b$04$test-placeholder-not-a-real-password', 'PENDING', now(),
               1, $7, now() + interval '30 days')`,
      [`Test Registration ${registration.suffix}`, registration.username, registration.facilityId,
       registration.mandalId, registration.villageId, languageId,
       registration.suffix === "A" ? "a".repeat(64) : "b".repeat(64)]
    );
  }
});

afterAll(async () => {
  // Clear registration_requests and other tbl_* before setupAfterEnv location cleanup.
  await resetTransactionalData();
});

describe("GET /api/dashboard/summary", () => {
  test("requires sign-in", async () => {
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  test("a health worker sees master data counts only", async () => {
    const token = await signIn("dash_hw");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.masters).toEqual({
      districts: expect.any(Number),
      mandals: expect.any(Number),
      villages: expect.any(Number),
      facilities: expect.any(Number),
    });
    expect(res.body.masters.mandals).toBeGreaterThan(0);
    expect(res.body.users_by_role).toBeUndefined();
    expect(res.body.pending_registrations).toBeUndefined();
    expect(res.body.programme).toBeUndefined();
    expect(res.body.facilities).toBeUndefined();
    expect(res.body.patients_registered).toBeUndefined();
    expect(res.body.recent_activity).toBeUndefined();
    expect(res.body.system).toBeUndefined();
  });

  test("admins also get facility counts, recent activity and system information", async () => {
    const token = await signInWithMfa("dash_admin2");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));

    expect(res.status).toBe(200);
    // 4 demo seed facilities + TEST_FACILITY_A/B from beforeAll.
    expect(res.body.facilities).toEqual({
      total: EXPECTED_TOTAL_FACILITIES,
      active: EXPECTED_TOTAL_FACILITIES,
      phc: 1,
      chc: 0,
      hospital: 2,
      other: 3,
    });
    expect(res.body.patients_registered).toBe(0);

    // The admin's own sign-in is the newest event; only event/outcome/time are returned
    expect(res.body.recent_activity[0]).toEqual({
      id: expect.any(Number),
      event: "LOGIN_SUCCESS",
      outcome: "SUCCESS",
      occurred_at: expect.any(String),
    });

    expect(res.body.system).toMatchObject({
      status: "healthy",
      app_version: expect.any(String),
      database: expect.stringMatching(/^PostgreSQL \d+/),
      uptime_seconds: expect.any(Number),
    });
  });

  test("a system admin also sees users by role and pending registrations", async () => {
    const token = await signInWithMfa("dash_admin");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));

    expect(res.status).toBe(200);
    const healthWorkers = res.body.users_by_role.find((row) => row.role === "HEALTH_WORKER");
    expect(healthWorkers.total).toBe(3);
    expect(res.body.pending_registrations).toBe(2);
    expect(res.body.programme).toBeUndefined();
  });

  test("District A admin sees only District A facilities and user counts", async () => {
    const token = await signInWithMfa("dash_district_a");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.programme).toEqual({
      screenings: expect.any(Number),
      reviews: expect.any(Number),
      referrals: expect.any(Number),
      treatment_linked: expect.any(Number),
    });
    expect(res.body.users_by_role).toBeUndefined();
    expect(res.body.facilities.total).toBe(1);
    expect(res.body.masters.facilities).toBe(1);
    expect(res.body.district_info).toHaveLength(1);
    expect(Number(res.body.district_info[0].id)).toBe(districtAId);
    expect(res.body.district_info[0].facilities).toBe(1);
    expect(res.body.district_info[0].active_users).toBeGreaterThanOrEqual(1);
    expect(res.body.recent_activity).toBeUndefined();
  });

  test("District B admin sees only District B facilities and user counts", async () => {
    const token = await signInWithMfa("dash_district_b");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.facilities.total).toBe(1);
    expect(res.body.masters.facilities).toBe(1);
    expect(res.body.district_info).toHaveLength(1);
    expect(Number(res.body.district_info[0].id)).toBe(districtBId);
    expect(res.body.district_info[0].facilities).toBe(1);
    expect(res.body.district_info[0].active_users).toBeGreaterThanOrEqual(1);
  });

  test("frontend district_id cannot change a District Admin dashboard scope", async () => {
    const token = await signInWithMfa("dash_district_a");
    const res = await request(app)
      .get("/api/dashboard/summary")
      .query({ district_id: districtBId })
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.facilities.total).toBe(1);
    expect(Number(res.body.district_info[0].id)).toBe(districtAId);
  });

  test("SUPER_ADMIN retains system-wide dashboard access", async () => {
    const token = await signInWithMfa("dash_super");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.facilities.total).toBe(EXPECTED_TOTAL_FACILITIES);
    expect(res.body.masters.facilities).toBe(EXPECTED_TOTAL_FACILITIES);
    expect(res.body.pending_registrations).toBe(2);
    expect(res.body.district_info.length).toBeGreaterThanOrEqual(2);
  });

  test("the response never contains personal fields", async () => {
    const token = await signIn("dash_hw");
    const res = await request(app).get("/api/dashboard/summary").set(bearer(token));
    expect(JSON.stringify(res.body)).not.toMatch(/username|full_name|phone|email|patient/i);
  });
});
