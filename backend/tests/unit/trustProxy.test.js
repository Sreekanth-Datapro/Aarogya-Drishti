const { resolveTrustProxy } = require("../../utils/trustProxy");

describe("resolveTrustProxy", () => {
  test("defaults to loopback in non-production", () => {
    expect(resolveTrustProxy({}, { isProduction: false })).toBe("loopback");
  });

  test("defaults to one hop in production (Render edge)", () => {
    expect(resolveTrustProxy({}, { isProduction: true })).toBe(1);
  });

  test("accepts an explicit hop count", () => {
    expect(resolveTrustProxy({ TRUST_PROXY: "1" }, { isProduction: true })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: "2" }, { isProduction: false })).toBe(2);
  });

  test("can disable trust proxy", () => {
    expect(resolveTrustProxy({ TRUST_PROXY: "false" }, { isProduction: true })).toBe(false);
  });
});
