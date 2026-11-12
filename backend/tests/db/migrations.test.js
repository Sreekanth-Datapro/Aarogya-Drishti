const { pool } = require("../helpers/db");
const { getStatus } = require("../../utils/migrator");

test("every migration file is applied to the test database", async () => {
  const status = await getStatus(pool);
  expect(status.length).toBeGreaterThan(0);
  expect(status.filter((m) => m.state !== "applied")).toEqual([]);
});

test("test guard refuses any database other than aarogya_test", () => {
  const { assertTestDatabaseUrl } = require("../../utils/testDbGuard");
  expect(() => assertTestDatabaseUrl("postgres://u:p@localhost:5432/Aarogya")).toThrow(/Refusing/);
  expect(() => assertTestDatabaseUrl(undefined)).toThrow(/TEST_DATABASE_URL/);
  expect(assertTestDatabaseUrl("postgres://u:p@localhost:5432/aarogya_test")).toBe("aarogya_test");
});
