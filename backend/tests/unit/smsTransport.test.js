const smsTransport = require("../../services/smsTransport");

const SMS_KEYS = ["SMS_PROVIDER", "SMS_API_KEY", "SMS_TEMPLATE_ID"];
let savedEnvironment;
let originalFetch;

beforeEach(() => {
  savedEnvironment = Object.fromEntries(SMS_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMS_PROVIDER: "msg91",
    SMS_API_KEY: "test-auth-key",
    SMS_TEMPLATE_ID: "approved-template",
  });
  originalFetch = global.fetch;
  global.fetch = jest.fn();
});

afterEach(() => {
  SMS_KEYS.forEach((key) => {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  });
  global.fetch = originalFetch;
});

test("uses the documented MSG91 Flow request and normalizes Indian numbers", async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ type: "success", message: "Request accepted" }),
  });
  const setupUrl = "https://app.example.test/setup-account#token=secret-token";

  await expect(smsTransport.sendSetupSms({
    phone: "09876543210",
    setupUrl,
  })).resolves.toEqual({ success: true, status: "SENT", message: "SMS sent." });

  expect(global.fetch).toHaveBeenCalledWith(
    "https://control.msg91.com/api/v5/flow",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authkey: "test-auth-key" }),
      body: JSON.stringify({
        template_id: "approved-template",
        recipients: [{ mobiles: "919876543210", VAR1: setupUrl }],
      }),
    })
  );
});

test.each([
  [{ ok: false, json: async () => ({ type: "error" }) }],
  [{ ok: true, json: async () => ({ unexpected: true }) }],
])("reports MSG91 and invalid responses safely", async (response) => {
  global.fetch.mockResolvedValue(response);
  const result = await smsTransport.sendSetupSms({
    phone: "9876543210",
    setupUrl: "https://example.test/setup",
  });
  expect(result).toMatchObject({ success: false, status: "FAILED" });
  expect(JSON.stringify(result)).not.toContain("test-auth-key");
});

test("does not call MSG91 for an invalid mobile number", async () => {
  await expect(smsTransport.sendSetupSms({
    phone: "12345",
    setupUrl: "https://example.test/setup",
  })).resolves.toMatchObject({ success: false, status: "FAILED" });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("reports an unconfigured provider without sending a request", async () => {
  process.env.SMS_PROVIDER = "none";
  await expect(smsTransport.sendSetupSms({
    phone: "9876543210",
    setupUrl: "https://example.test/setup",
  })).resolves.toMatchObject({ success: false, status: "NOT_CONFIGURED" });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("normalizes valid Indian numbers and rejects invalid ones", () => {
  expect(smsTransport.normalizeIndianMobile("+91 98765 43210")).toBe("919876543210");
  expect(smsTransport.normalizeIndianMobile("9876543210")).toBe("919876543210");
  expect(smsTransport.normalizeIndianMobile("1234567890")).toBeNull();
});
