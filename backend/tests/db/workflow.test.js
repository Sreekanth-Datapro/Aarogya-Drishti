const fs = require("fs");
const path = require("path");
const { pool, resetTransactionalData } = require("../helpers/db");

const WORKFLOW_SQL = fs.readFileSync(path.join(__dirname, "workflow.sql"), "utf8");

test("clinical workflow and database safety rules (rolled back)", async () => {
  await resetTransactionalData();

  const client = await pool.connect();
  let results;

  try {
    await client.query("BEGIN");
    await client.query(WORKFLOW_SQL);
    results = (await client.query("SELECT status, label, detail FROM t_results ORDER BY n")).rows;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }

  const failures = results.filter((r) => r.status !== "PASS");
  expect(failures).toEqual([]);
  expect(results.length).toBeGreaterThanOrEqual(100);
});
