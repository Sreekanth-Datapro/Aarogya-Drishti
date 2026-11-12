const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const emailTransport = require("../../services/emailTransport");
const nodemailer = require("nodemailer");

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
];
let savedEnvironment;

beforeEach(() => {
  savedEnvironment = Object.fromEntries(SMTP_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "test-user",
    SMTP_PASSWORD: "test-password",
    SMTP_FROM: "Aarogya Drishti <no-reply@example.test>",
  });
  mockSendMail.mockReset().mockResolvedValue({});
});

afterEach(() => {
  SMTP_KEYS.forEach((key) => {
    if (savedEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnvironment[key];
  });
});

test("sends a setup link with an escaped name and 24-hour expiry notice", async () => {
  const result = await emailTransport.sendSetupEmail({
    user: { full_name: "A & B", email: "admin@example.test" },
    setupUrl: "https://app.example.test/setup-account#token=secret-token",
  });

  expect(result).toEqual({ success: true, status: "SENT", message: "Email sent." });
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
    host: "smtp.example.test",
    port: 587,
    secure: false,
  }));
  expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
    to: "admin@example.test",
    html: expect.stringContaining("A &amp; B"),
  }));
  const email = mockSendMail.mock.calls[0][0];
  expect(email.text).toContain("expires in 24 hours");
  expect(email.html).toContain("expires in 24 hours");
});

test("sends the username, temporary password, login page and 24-hour notice, escaped in HTML", async () => {
  const result = await emailTransport.sendTemporaryCredentialsEmail({
    user: { full_name: "A & B", email: "admin@example.test" },
    username: "da.ravi.4821",
    temporaryPassword: "Ab3#<Kq9!xZp7m",
    loginUrl: "https://app.example.test/login",
  });

  expect(result).toEqual({ success: true, status: "SENT", message: "Email sent." });
  // Port 587 without implicit TLS: STARTTLS must be required, not optional
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true }));
  const email = mockSendMail.mock.calls[0][0];
  expect(email.to).toBe("admin@example.test");
  expect(email.text).toContain("Username: da.ravi.4821");
  expect(email.text).toContain("Temporary password: Ab3#<Kq9!xZp7m");
  expect(email.text).toContain("https://app.example.test/login");
  expect(email.text).toContain("expires in 24 hours");
  expect(email.html).toContain("A &amp; B");
  expect(email.html).toContain("Ab3#&lt;Kq9!xZp7m");
});

test("does not expose the temporary password or SMTP details when sending fails", async () => {
  mockSendMail.mockRejectedValue(new Error("secret SMTP server detail"));
  const result = await emailTransport.sendTemporaryCredentialsEmail({
    user: { full_name: "Admin", email: "admin@example.test" },
    username: "da.admin.1234",
    temporaryPassword: "Secret#Temp12ab",
    loginUrl: "https://app.example.test/login",
  });
  expect(result).toMatchObject({ success: false, status: "FAILED" });
  expect(JSON.stringify(result)).not.toContain("Secret#Temp12ab");
  expect(JSON.stringify(result)).not.toContain("secret SMTP server detail");
});

test("reports missing SMTP configuration without attempting delivery", async () => {
  delete process.env.SMTP_PASSWORD;
  await expect(emailTransport.sendSetupEmail({
    user: { full_name: "Admin", email: "admin@example.test" },
    setupUrl: "https://example.test/setup",
  })).resolves.toMatchObject({ success: false, status: "NOT_CONFIGURED" });
  expect(mockSendMail).not.toHaveBeenCalled();
});

test("does not expose SMTP error details", async () => {
  mockSendMail.mockRejectedValue(new Error("secret SMTP server detail"));
  const result = await emailTransport.sendSetupEmail({
    user: { full_name: "Admin", email: "admin@example.test" },
    setupUrl: "https://example.test/setup",
  });
  expect(result).toMatchObject({ success: false, status: "FAILED" });
  expect(JSON.stringify(result)).not.toContain("secret SMTP server detail");
});
