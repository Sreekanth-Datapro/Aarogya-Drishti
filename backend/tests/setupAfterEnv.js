const pool = require("../db");
const {
  assertDestructiveResetOptIn,
  assertConnectedToTestDatabase,
} = require("../utils/testDbGuard");
const { resetLocationMasters } = require("./helpers/db");

beforeAll(async () => {
  assertDestructiveResetOptIn();
  await assertConnectedToTestDatabase(pool);
});

afterAll(async () => {
  // Location import tests change master data; put it back before the next test file
  try {
    await resetLocationMasters();
  } finally {
    await pool.end();
  }
});
