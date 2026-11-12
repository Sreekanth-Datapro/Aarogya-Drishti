const { assertTestDatabaseUrl } = require("../../utils/testDbGuard");

describe("test database URL guard", () => {
  test("accepts only the dedicated test database name", () => {
    expect(assertTestDatabaseUrl("postgresql://test_user@localhost:5432/aarogya_test"))
      .toBe("aarogya_test");
  });

  test("rejects the production database", () => {
    expect(() => assertTestDatabaseUrl("postgresql://test_user@localhost:5432/Aarogya"))
      .toThrow(/Refusing/);
  });

  test("rejects a missing URL", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/TEST_DATABASE_URL/);
  });

  test("rejects a malformed URL", () => {
    expect(() => assertTestDatabaseUrl("not-a-database-url")).toThrow(/valid connection URL/);
  });
});
