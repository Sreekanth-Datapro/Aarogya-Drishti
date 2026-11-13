const bcrypt = require("bcryptjs");
const pool = require("../../db");
const {
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
} = require("../../utils/testDbGuard");

// Reference data seeded by the schema/migrations, not per-test data.
const REFERENCE_TABLES = ["tbl_role_permissions"];

// Seeded demo facilities from ALL_IN_ONE / migration 007 — never delete these.
const DEMO_FACILITY_CODES = [
  "FAC_PHC_GM",
  "FAC_AH_PADERU_DEMO",
  "FAC_RCC_DEMO",
  "FAC_DISTRICT_OFFICE",
];

/*
 * Static FK inventory → mst_facilities(id) (ALL_IN_ONE + migrations):
 *   mst_screening_sites.facility_id
 *   tbl_user_registration_requests.facility_id
 *   tbl_user_facility_assignments.facility_id
 *   tbl_patients.registered_facility_id
 *   tbl_screenings.facility_id
 *   tbl_referrals.from_facility_id
 *   tbl_health_worker_location_assignments.facility_id  (013)
 *   tbl_diagnostic_orders.facility_id                   (029)
 *   tbl_diagnostic_appointments.facility_id             (030)
 *
 * Patient/clinical graphs also hit append-only triggers (fn_block_mutation),
 * so DELETEs alone cannot clear them. resetTransactionalData() TRUNCATEs
 * tbl_* (except REFERENCE_TABLES) for that reason — used first by
 * resetLocationMasters before any master DELETE.
 */

// TRUNCATE (unlike DELETE) is not blocked by the append-only row triggers.
async function resetTransactionalData() {
  assertDestructiveResetOptIn();
  await assertConnectedToTestDatabase(pool);

  const { rows } = await pool.query(
    `
    SELECT string_agg(format('%I', tablename), ', ') AS tables
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'tbl\\_%'
      AND tablename <> ALL ($1)`,
    [REFERENCE_TABLES]
  );

  if (!rows[0]?.tables) {
    return;
  }

  await pool.query(`TRUNCATE ${rows[0].tables} RESTART IDENTITY CASCADE`);
}

/**
 * Extra safety for non-tbl / residual rows that can still block facility deletes
 * after transactional truncate (e.g. mst_screening_sites).
 * Targeted DELETEs only — no additional TRUNCATE here.
 */
async function deleteNonTransactionalFacilityDependents() {
  const nonDemoFacilities = `SELECT id FROM mst_facilities
    WHERE code IS NULL OR NOT (code = ANY($1::text[]))`;

  await pool.query(
    `DELETE FROM mst_screening_sites
      WHERE facility_id IN (${nonDemoFacilities})`,
    [DEMO_FACILITY_CODES]
  );
}

/**
 * Undo facility and location tests: clear transactional dependents, remove
 * temporary masters, restore demo LGD link fields that location-import tests set.
 * Preserves demo facility/location seed rows and tbl_role_permissions.
 */
async function resetLocationMasters() {
  assertDestructiveResetOptIn();
  await assertConnectedToTestDatabase(pool);

  // Clears every tbl_* FK to mst_facilities (including append-only clinical tables).
  await resetTransactionalData();
  await deleteNonTransactionalFacilityDependents();

  await pool.query(
    `DELETE FROM mst_facilities
      WHERE code IS NULL OR NOT (code = ANY($1::text[]))`,
    [DEMO_FACILITY_CODES]
  );
  await pool.query(`DELETE FROM mst_phcs WHERE code LIKE 'AD\\_%' ESCAPE '\\'`);
  await pool.query(
    `DELETE FROM mst_hospitals WHERE code LIKE 'AD\\_%' ESCAPE '\\'`
  );
  await pool.query(`UPDATE mst_facilities SET is_active = TRUE`);

  // Villages → gram panchayats → mandals → districts (child to parent).
  await pool.query(
    `DELETE FROM mst_villages
      WHERE data_source = 'LGD'
         OR code LIKE 'MAN\\_%' ESCAPE '\\'
         OR code LIKE 'TEST\\_%' ESCAPE '\\'`
  );
  await pool.query(
    `DELETE FROM mst_gram_panchayats
      WHERE code LIKE 'MAN\\_%' ESCAPE '\\'
         OR code LIKE 'TEST\\_%' ESCAPE '\\'
         OR code LIKE 'AD\\_%' ESCAPE '\\'`
  );
  await pool.query(
    `DELETE FROM mst_mandals
      WHERE data_source = 'LGD'
         OR code LIKE 'MAN\\_%' ESCAPE '\\'
         OR code LIKE 'TEST\\_%' ESCAPE '\\'`
  );
  await pool.query(
    `DELETE FROM mst_districts
      WHERE data_source = 'LGD'
         OR code LIKE 'MAN\\_%' ESCAPE '\\'
         OR code LIKE 'TEST\\_%' ESCAPE '\\'`
  );

  // Location-import tests link demo rows (e.g. ASR → lgd_code 745) and may set
  // is_verified. Seed starts with NULL LGD fields — only clear rows that were
  // mutated, so pristine demo metadata is not rewritten unnecessarily.
  for (const table of ["mst_villages", "mst_mandals", "mst_districts"]) {
    await pool.query(
      `UPDATE ${table}
          SET lgd_code = NULL,
              is_verified = FALSE,
              lgd_synced_at = NULL,
              import_batch_id = NULL
        WHERE lgd_code IS NOT NULL
           OR is_verified IS TRUE
           OR lgd_synced_at IS NOT NULL
           OR import_batch_id IS NOT NULL`
    );
  }
  await pool.query(
    `UPDATE mst_districts
        SET state_lgd_code = NULL
      WHERE state_lgd_code IS NOT NULL`
  );
}

async function roleId(code) {
  const { rows } = await pool.query("SELECT id FROM mst_roles WHERE code = $1", [
    code,
  ]);
  if (!rows.length) throw new Error(`Role ${code} not found`);
  return rows[0].id;
}

async function createUser({
  username,
  password = "Password@123",
  role = "HEALTH_WORKER",
  fullName,
  status = "ACTIVE",
  mustChangePassword = false,
  facilityCode,
  districtId = null,
} = {}) {
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await pool.query(
    `INSERT INTO tbl_users (username, password_hash, full_name, role_id, status, must_change_password, district_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, username`,
    [
      username,
      hash,
      fullName || username,
      await roleId(role),
      status,
      mustChangePassword,
      districtId,
    ]
  );

  if (facilityCode) {
    await pool.query(
      `INSERT INTO tbl_user_facility_assignments (user_id, facility_id, is_primary)
       SELECT $1, id, TRUE FROM mst_facilities WHERE code = $2`,
      [rows[0].id, facilityCode]
    );
  }

  return { ...rows[0], password };
}

async function masterIds() {
  const one = async (sql) => (await pool.query(sql)).rows[0].id;
  return {
    districtGM: Number(
      await one(
        "SELECT d.id FROM mst_districts d JOIN mst_mandals m ON m.district_id = d.id WHERE m.code = 'G_MADUGULA'"
      )
    ),
    facilityPhc: Number(
      await one("SELECT id FROM mst_facilities WHERE code = 'FAC_PHC_GM'")
    ),
    mandalGM: Number(
      await one("SELECT id FROM mst_mandals WHERE code = 'G_MADUGULA'")
    ),
    mandalPaderu: Number(
      await one("SELECT id FROM mst_mandals WHERE code = 'PADERU'")
    ),
    village1: Number(
      await one("SELECT id FROM mst_villages WHERE code = 'VIL_DEMO_1'")
    ),
    languageTe: Number(
      await one("SELECT id FROM mst_languages WHERE code = 'te'")
    ),
  };
}

module.exports = {
  pool,
  resetTransactionalData,
  resetLocationMasters,
  createUser,
  roleId,
  masterIds,
  DEMO_FACILITY_CODES,
};
