const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildDatabaseSslConfig } = require("../../utils/dbSsl");

describe("buildDatabaseSslConfig", () => {
  test("returns undefined for local / disabled SSL", () => {
    expect(buildDatabaseSslConfig({})).toBeUndefined();
    expect(buildDatabaseSslConfig({ DB_SSL: "disable" })).toBeUndefined();
    expect(buildDatabaseSslConfig({ DB_SSL: "false" })).toBeUndefined();
    expect(buildDatabaseSslConfig({ DB_SSL: "0" })).toBeUndefined();
    expect(buildDatabaseSslConfig({ DB_SSL: "off" })).toBeUndefined();
  });

  test("enables TLS with certificate verification", () => {
    const ssl = buildDatabaseSslConfig({ DB_SSL: "require" });
    expect(ssl).toEqual({ rejectUnauthorized: true });
    expect(ssl.rejectUnauthorized).not.toBe(false);

    const verifyFull = buildDatabaseSslConfig({ DB_SSL: "verify-full" });
    expect(verifyFull).toEqual({ rejectUnauthorized: true });
  });

  test("loads a CA certificate for verification", () => {
    const caPath = path.join(os.tmpdir(), `aarogya-test-ca-${Date.now()}.pem`);
    const pem = "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n";
    fs.writeFileSync(caPath, pem, "utf8");
    try {
      const ssl = buildDatabaseSslConfig({
        DB_SSL: "verify-full",
        DB_SSL_CA_FILE: caPath,
      });
      expect(ssl.rejectUnauthorized).toBe(true);
      expect(ssl.ca).toContain("BEGIN CERTIFICATE");
    } finally {
      fs.unlinkSync(caPath);
    }
  });

  test("rejects unknown DB_SSL modes", () => {
    expect(() => buildDatabaseSslConfig({ DB_SSL: "skip-verify" })).toThrow(/Unsupported DB_SSL/);
  });
});
