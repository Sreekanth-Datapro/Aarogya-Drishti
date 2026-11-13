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

  test("rejects migration rehearsal database aarogya_defer003_test", () => {
    expect(() =>
      assertTestDatabaseUrl("postgresql://test_user@127.0.0.1:5432/aarogya_defer003_test")
    ).toThrow(/Refusing/);
  });

  test("rejects Render-style database names", () => {
    expect(() =>
      assertTestDatabaseUrl("postgresql://test_user@127.0.0.1:5432/aarogya_drishti_abc123")
    ).toThrow(/Refusing/);
  });
});

describe("test database config rejects unsafe expected names", () => {
  const { getTestDatabaseConfig } = require("../../utils/testDbGuard");

  test("TEST_DB_EXPECTED_NAME must remain aarogya_test", () => {
    expect(() =>
      getTestDatabaseConfig({
        TEST_DATABASE_URL: "postgresql://test_user:pw@127.0.0.1:5432/aarogya_defer003_test",
        TEST_DB_EXPECTED_NAME: "aarogya_defer003_test",
        TEST_DB_EXPECTED_HOST: "127.0.0.1",
        TEST_DB_EXPECTED_PORT: "5432",
        TEST_DB_EXPECTED_USER: "test_user",
        TEST_DB_EXPECTED_SERVER_ADDRESS: "127.0.0.1",
      })
    ).toThrow(/TEST_DB_EXPECTED_NAME must be "aarogya_test"/);
  });
});
