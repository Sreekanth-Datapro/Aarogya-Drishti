jest.mock("bcryptjs", () => ({
  hash: jest.fn(async () => "hashed-password"),
}));

const bcrypt = require("bcryptjs");
const {
  createIntegrationTestBootstrapAdmin,
  assertIntegrationTestEnv,
  INTEGRATION_TEST_BOOTSTRAP_USERNAME,
  BCRYPT_ROUNDS,
} = require("../helpers/integrationBootstrap");

function createBootstrapClient(options = {}) {
  const {
    databaseName = "aarogya_test",
    roleId = 7,
    existing = null,
    insertedId = "new-user-1",
  } = options;
  const queries = [];

  return {
    queries,
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });

      if (/SELECT current_database\(\)/i.test(text)) {
        return { rows: [{ name: databaseName }] };
      }
      if (/FROM mst_roles WHERE code = 'SYSTEM_ADMIN'/i.test(text)) {
        return roleId == null ? { rows: [] } : { rows: [{ id: roleId }] };
      }
      if (/FROM tbl_users u/i.test(text) && /lower\(u\.username\)/i.test(text)) {
        return existing ? { rows: [existing] } : { rows: [] };
      }
      if (/INSERT INTO tbl_users/i.test(text)) {
        return { rows: [{ id: insertedId }] };
      }
      throw new Error(`Unexpected query: ${text.slice(0, 120)}`);
    },
  };
}

describe("integrationBootstrap helper", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DESTRUCTIVE: process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET,
    PASSWORD: process.env.TEST_INTEGRATION_BOOTSTRAP_PASSWORD,
    SYSTEM_ADMIN_USERNAME: process.env.SYSTEM_ADMIN_USERNAME,
  };

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET = "true";
    process.env.TEST_INTEGRATION_BOOTSTRAP_PASSWORD = "TestBootstrap1";
    delete process.env.SYSTEM_ADMIN_USERNAME;
    bcrypt.hash.mockClear();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.NODE_ENV,
      TEST_DB_ALLOW_DESTRUCTIVE_RESET: previous.DESTRUCTIVE,
      TEST_INTEGRATION_BOOTSTRAP_PASSWORD: previous.PASSWORD,
      SYSTEM_ADMIN_USERNAME: previous.SYSTEM_ADMIN_USERNAME,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("assertIntegrationTestEnv requires NODE_ENV=test and destructive opt-in", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertIntegrationTestEnv(process.env)).toThrow(/NODE_ENV=test/);
    process.env.NODE_ENV = "test";
    process.env.TEST_DB_ALLOW_DESTRUCTIVE_RESET = "false";
    expect(() => assertIntegrationTestEnv(process.env)).toThrow(
      /TEST_DB_ALLOW_DESTRUCTIVE_RESET/
    );
  });

  test("creates allowlisted SYSTEM_ADMIN with bcrypt hash rounds matching bootstrap", async () => {
    const client = createBootstrapClient();
    const result = await createIntegrationTestBootstrapAdmin(client, process.env);

    expect(result).toEqual({
      username: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
      id: "new-user-1",
      created: true,
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("TestBootstrap1", BCRYPT_ROUNDS);
    expect(
      client.queries.some(
        (q) =>
          /INSERT INTO tbl_users/i.test(q.sql) &&
          q.params[0] === INTEGRATION_TEST_BOOTSTRAP_USERNAME &&
          q.params[1] === "hashed-password"
      )
    ).toBe(true);
  });

  test("refuses Aarogya and rehearsal database names", async () => {
    await expect(
      createIntegrationTestBootstrapAdmin(
        createBootstrapClient({ databaseName: "Aarogya" }),
        process.env
      )
    ).rejects.toThrow(/only aarogya_test is permitted/);

    await expect(
      createIntegrationTestBootstrapAdmin(
        createBootstrapClient({ databaseName: "aarogya_defer003_test" }),
        process.env
      )
    ).rejects.toThrow(/only aarogya_test is permitted/);
  });

  test("refuses weak or missing TEST_INTEGRATION_BOOTSTRAP_PASSWORD", async () => {
    process.env.TEST_INTEGRATION_BOOTSTRAP_PASSWORD = "short";
    await expect(
      createIntegrationTestBootstrapAdmin(createBootstrapClient(), process.env)
    ).rejects.toThrow(/TEST_INTEGRATION_BOOTSTRAP_PASSWORD is invalid/);

    delete process.env.TEST_INTEGRATION_BOOTSTRAP_PASSWORD;
    await expect(
      createIntegrationTestBootstrapAdmin(createBootstrapClient(), process.env)
    ).rejects.toThrow(/TEST_INTEGRATION_BOOTSTRAP_PASSWORD is invalid/);
  });

  test("refuses SYSTEM_ADMIN_USERNAME collision with integration username", async () => {
    process.env.SYSTEM_ADMIN_USERNAME = INTEGRATION_TEST_BOOTSTRAP_USERNAME;
    await expect(
      createIntegrationTestBootstrapAdmin(createBootstrapClient(), process.env)
    ).rejects.toThrow(/collides with the integration-test bootstrap username/);
  });

  test("refuses when SYSTEM_ADMIN role is missing", async () => {
    await expect(
      createIntegrationTestBootstrapAdmin(
        createBootstrapClient({ roleId: null }),
        process.env
      )
    ).rejects.toThrow(/SYSTEM_ADMIN role is missing/);
  });

  test("leaves an existing SYSTEM_ADMIN integration account unchanged", async () => {
    const client = createBootstrapClient({
      existing: { id: "existing-1", role_code: "SYSTEM_ADMIN" },
    });
    const result = await createIntegrationTestBootstrapAdmin(client, process.env);
    expect(result).toEqual({
      username: INTEGRATION_TEST_BOOTSTRAP_USERNAME,
      id: "existing-1",
      created: false,
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(client.queries.some((q) => /INSERT INTO tbl_users/i.test(q.sql))).toBe(
      false
    );
  });
});
