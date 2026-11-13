const fs = require("fs");
const path = require("path");
const { pool, resetTransactionalData } = require("../helpers/db");
const videoConsultationService = require("../../services/videoConsultationService");
const { MEETING_GRACE_MS } = require("../../services/videoMeetingService");

const LIFECYCLE_SQL = fs.readFileSync(
  path.join(__dirname, "videoLifecycleAttendance.sql"),
  "utf8"
);

describe("video lifecycle attendance (disposable PostgreSQL)", () => {
  test("SQL lifecycle rules for attendance, MISSED, reschedule link, and consent", async () => {
    await resetTransactionalData();

    const client = await pool.connect();
    let results;
    try {
      await client.query("BEGIN");
      await client.query(LIFECYCLE_SQL);
      results = (await client.query(
        "SELECT status, label, detail FROM t_vl_results ORDER BY n"
      )).rows;
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    const failures = results.filter((row) => row.status !== "PASS");
    expect(failures).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(12);
  });

  test("service finalizeExpiredVideoAttendance is idempotent on empty scan", async () => {
    await resetTransactionalData();
    const first = await videoConsultationService.finalizeExpiredVideoAttendance(new Date());
    const second = await videoConsultationService.finalizeExpiredVideoAttendance(new Date());
    expect(first).toEqual({ attended: [], missed: [] });
    expect(second).toEqual({ attended: [], missed: [] });
    expect(MEETING_GRACE_MS).toBe(15 * 60 * 1000);
  });

  test("patient FOR UPDATE serializes concurrent clients (check 7)", async () => {
    await resetTransactionalData();

    const seed = await pool.query(`
      WITH hw AS (
        INSERT INTO tbl_users (username, password_hash, full_name, role_id)
        SELECT 'zz_vl_lock_hw', 'x', 'VL Lock HW', id FROM mst_roles WHERE code = 'HEALTH_WORKER'
        RETURNING id
      ),
      assigner AS (
        INSERT INTO tbl_users (username, password_hash, full_name, role_id)
        SELECT 'zz_vl_lock_mo', 'x', 'VL Lock MO', id FROM mst_roles WHERE code = 'MEDICAL_OFFICER'
        RETURNING id
      ),
      loc AS (
        SELECT f.id AS facility_id, f.district_id, f.mandal_id, v.id AS village_id
          FROM mst_facilities f
          JOIN mst_villages v ON v.code = 'VIL_DEMO_1' AND v.mandal_id = f.mandal_id
         WHERE f.code = 'FAC_PHC_GM'
      ),
      hw_assign AS (
        INSERT INTO tbl_health_worker_location_assignments
          (user_id, district_id, mandal_id, village_id, facility_id, assigned_by)
        SELECT hw.id, loc.district_id, loc.mandal_id, loc.village_id, loc.facility_id, assigner.id
          FROM hw, assigner, loc
        RETURNING user_id
      )
      INSERT INTO tbl_patients (full_name, age_years, village_id, registered_facility_id, registered_by)
      SELECT 'VL Lock Patient', 35, loc.village_id, loc.facility_id, hw.id
        FROM hw, loc, hw_assign
      RETURNING id
    `);
    const patientId = seed.rows[0].id;

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    let clientBResolved = false;
    try {
      await clientA.query("BEGIN");
      await clientA.query("SELECT id FROM tbl_patients WHERE id = $1 FOR UPDATE", [patientId]);

      const clientBPromise = (async () => {
        await clientB.query("BEGIN");
        await clientB.query("SELECT id FROM tbl_patients WHERE id = $1 FOR UPDATE", [patientId]);
        clientBResolved = true;
        await clientB.query("COMMIT");
      })();

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(clientBResolved).toBe(false);

      await clientA.query("COMMIT");
      await clientBPromise;
      expect(clientBResolved).toBe(true);
    } finally {
      await clientA.query("ROLLBACK").catch(() => {});
      await clientB.query("ROLLBACK").catch(() => {});
      clientA.release();
      clientB.release();
    }
  });
});
