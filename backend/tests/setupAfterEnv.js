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
  // Location / facility fixtures mutate master data; restore demo seed before the
  // next file. Do NOT pool.end() here: jest.integration.config uses maxWorkers:1
  // and a shared db.js Pool — ending after the first file breaks every later suite.
  // Connections are released when the Jest worker process exits (forceExit).
  await resetLocationMasters();
});
