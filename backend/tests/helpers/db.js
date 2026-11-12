const bcrypt = require("bcryptjs");
const pool = require("../../db");
const {
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
} = require("../../utils/testDbGuard");

// Reference data seeded by the schema/migrations, not per-test data.
const REFERENCE_TABLES = ["tbl_role_permissions"];

// TRUNCATE (unlike DELETE) is not blocked by the append-only row triggers.
async function resetTransactionalData() {
  assertDestructiveResetOptIn();
  await assertConnectedToTestDatabase(pool);

  const { rows } = await pool.query(`
    SELECT string_agg(format('%I', tablename), ', ') AS tables
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'tbl\\_%'
      AND tablename <> ALL ($1)`, [REFERENCE_TABLES]);

  await pool.query(`TRUNCATE ${rows[0].tables} RESTART IDENTITY CASCADE`);
}

const DEMO_FACILITY_CODES = ["FAC_PHC_GM", "FAC_AH_PADERU_DEMO", "FAC_RCC_DEMO", "FAC_DISTRICT_OFFICE"];

// Undo facility and location tests: remove rows the tests added and clear LGD links
// on the seeded demo locations, so other test files see the original master data.
async function resetLocationMasters() {
  assertDestructiveResetOptIn();
  await assertConnectedToTestDatabase(pool);

  // Facilities created by tests (and their linked PHC / hospital rows, code AD_...)
  await pool.query("DELETE FROM mst_facilities WHERE code IS NULL OR NOT (code = ANY($1))", [DEMO_FACILITY_CODES]);
  await pool.query("DELETE FROM mst_phcs WHERE code LIKE 'AD\\_%'");
  await pool.query("DELETE FROM mst_hospitals WHERE code LIKE 'AD\\_%'");
  await pool.query("UPDATE mst_facilities SET is_active = TRUE");

  for (const table of ["mst_villages", "mst_mandals", "mst_districts"]) {
    await pool.query(`DELETE FROM ${table} WHERE data_source = 'LGD' OR code LIKE 'MAN\\_%'`);
    await pool.query(
      `UPDATE ${table} SET lgd_code = NULL, is_verified = FALSE, lgd_synced_at = NULL, import_batch_id = NULL`
    );
  }
  await pool.query("UPDATE mst_districts SET state_lgd_code = NULL");
}

async function roleId(code) {
  const { rows } = await pool.query("SELECT id FROM mst_roles WHERE code = $1", [code]);
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
    [username, hash, fullName || username, await roleId(role), status, mustChangePassword, districtId]
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
    districtGM: Number(await one(
      "SELECT d.id FROM mst_districts d JOIN mst_mandals m ON m.district_id = d.id WHERE m.code = 'G_MADUGULA'"
    )),
    facilityPhc: Number(await one("SELECT id FROM mst_facilities WHERE code = 'FAC_PHC_GM'")),
    mandalGM: Number(await one("SELECT id FROM mst_mandals WHERE code = 'G_MADUGULA'")),
    mandalPaderu: Number(await one("SELECT id FROM mst_mandals WHERE code = 'PADERU'")),
    village1: Number(await one("SELECT id FROM mst_villages WHERE code = 'VIL_DEMO_1'")),
    languageTe: Number(await one("SELECT id FROM mst_languages WHERE code = 'te'")),
  };
}

module.exports = { pool, resetTransactionalData, resetLocationMasters, createUser, roleId, masterIds };
