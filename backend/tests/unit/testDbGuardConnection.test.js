const {
  assertConnectedToTestDatabase,
  TEST_DATABASE_NAME,
} = require("../../utils/testDbGuard");

function baseConfig(overrides = {}) {
  return {
    url: "postgresql://aarogya_test_user:secret@127.0.0.1:5433/aarogya_test",
    databaseName: "aarogya_test",
    host: "127.0.0.1",
    port: 5433,
    user: "aarogya_test_user",
    serverAddress: "127.0.0.1",
    ...overrides,
  };
}

function createQueryable(rowOverrides = {}) {
  const queries = [];
  const row = {
    name: "aarogya_test",
    user: "aarogya_test_user",
    // host(inet_server_addr()) result — never the /32 text form
    server_address: "127.0.0.1",
    server_port: 5433,
    restricted_database_access: true,
    restricted_role: true,
    ...rowOverrides,
  };

  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      return { rows: [row] };
    },
  };
}

describe("assertConnectedToTestDatabase server address normalization", () => {
  test("SQL uses host(inet_server_addr()) and not inet_server_addr()::text", async () => {
    const client = createQueryable();
    await assertConnectedToTestDatabase(client, baseConfig());
    const sql = client.queries[0].sql;
    expect(sql).toMatch(/host\s*\(\s*inet_server_addr\s*\(\s*\)\s*\)/i);
    expect(sql).not.toMatch(/inet_server_addr\s*\(\s*\)\s*::\s*text/i);
    expect(client.queries[0].params).toEqual([TEST_DATABASE_NAME]);
  });

  test("127.0.0.1 from host() matches expected 127.0.0.1 (passes)", async () => {
    const client = createQueryable({ server_address: "127.0.0.1" });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig({ serverAddress: "127.0.0.1" }))
    ).resolves.toBeUndefined();
  });

  test("documents that host() strips CIDR so 127.0.0.1/32 is not compared raw", async () => {
    // PostgreSQL host(inet) yields '127.0.0.1' even when ::text would be '127.0.0.1/32'.
    // The guard must receive the host()-normalized value from SQL.
    const client = createQueryable({ server_address: "127.0.0.1" });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig({ serverAddress: "127.0.0.1" }))
    ).resolves.toBeUndefined();
    expect(client.queries[0].sql).toMatch(/host\s*\(\s*inet_server_addr/i);
  });

  test("wrong server address fails", async () => {
    const client = createQueryable({ server_address: "10.0.0.1" });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig({ serverAddress: "127.0.0.1" }))
    ).rejects.toThrow(/Refusing test database access/);
  });

  test("missing/null server address fails safely", async () => {
    const client = createQueryable({ server_address: null });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig())
    ).rejects.toThrow(/Refusing test database access/);

    const empty = createQueryable({ server_address: "" });
    await expect(
      assertConnectedToTestDatabase(empty, baseConfig())
    ).rejects.toThrow(/Refusing test database access/);
  });

  test("wrong database name still fails", async () => {
    const client = createQueryable({ name: "Aarogya" });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig())
    ).rejects.toThrow(/Refusing test database access/);
  });

  test("wrong user still fails", async () => {
    const client = createQueryable({ user: "postgres" });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig())
    ).rejects.toThrow(/Refusing test database access/);
  });

  test("unrestricted role still fails", async () => {
    const client = createQueryable({ restricted_role: false });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig())
    ).rejects.toThrow(/Refusing test database access/);
  });

  test("broad CONNECT privilege still fails", async () => {
    const client = createQueryable({ restricted_database_access: false });
    await expect(
      assertConnectedToTestDatabase(client, baseConfig())
    ).rejects.toThrow(/Refusing test database access/);
  });
});
