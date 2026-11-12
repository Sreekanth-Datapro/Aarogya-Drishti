jest.mock("../../controllers/authController", () => ({
  register: jest.fn((_req, res) => res.status(201).json({ success: true })),
  login: jest.fn((_req, res) => res.status(401).json({ success: false })),
  changeTemporaryPassword: jest.fn((_req, res) => res.status(400).json({ success: false })),
  mfaSetup: jest.fn(),
  mfaEnable: jest.fn(),
  mfaVerify: jest.fn(),
  refresh: jest.fn(),
  requestPasswordReset: jest.fn(),
  confirmPasswordReset: jest.fn(),
  me: jest.fn(),
  changePassword: jest.fn(),
  logout: jest.fn(),
  sessions: jest.fn(),
  logoutAll: jest.fn(),
}));
jest.mock("../../controllers/systemAdminController", () => ({
  completeDistrictAdminSetup: jest.fn(),
}));
jest.mock("../../middleware/authMiddleware", () => ({
  authenticate: (_req, _res, next) => next(),
  authenticateAllowPasswordChange: (_req, _res, next) => next(),
}));

const express = require("express");
const request = require("supertest");
const router = require("../../routes/auth");
const { register } = require("../../controllers/authController");

const app = express();
app.use(express.json());
app.use(router);

test("public registration is rate limited after 20 attempts per 15 minutes", async () => {
  const previousTestRateLimit = process.env.TEST_RATE_LIMIT;
  process.env.TEST_RATE_LIMIT = "1";

  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app).post("/register");
      expect(response.status).toBe(201);
    }

    const limited = await request(app).post("/register");
    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/Too many registration attempts/);
    expect(register).toHaveBeenCalledTimes(20);
  } finally {
    if (previousTestRateLimit === undefined) delete process.env.TEST_RATE_LIMIT;
    else process.env.TEST_RATE_LIMIT = previousTestRateLimit;
  }
});

test("the temporary password change shares the login limit of 10 attempts per 15 minutes", async () => {
  const previousTestRateLimit = process.env.TEST_RATE_LIMIT;
  process.env.TEST_RATE_LIMIT = "1";

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(app).post("/login")).status).toBe(401);
      expect((await request(app).post("/temporary-password/change")).status).toBe(400);
    }

    const limitedChange = await request(app).post("/temporary-password/change");
    expect(limitedChange.status).toBe(429);
    expect(limitedChange.body.message).toMatch(/Too many login attempts/);
    expect((await request(app).post("/login")).status).toBe(429);
  } finally {
    if (previousTestRateLimit === undefined) delete process.env.TEST_RATE_LIMIT;
    else process.env.TEST_RATE_LIMIT = previousTestRateLimit;
  }
});
