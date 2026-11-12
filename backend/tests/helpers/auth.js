const request = require("supertest");
const app = require("../../app");
const totp = require("../../utils/totp");

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Sign in a user whose role does not need MFA
async function signIn(username, password = "Password@123") {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  return res.body.accessToken;
}

// Sign in an MFA-required role for the first time (enrol + enable)
async function signInWithMfa(username, password = "Password@123") {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  const mfaToken = res.body.mfa_token;
  const setup = await request(app).post("/api/auth/mfa/setup").set(bearer(mfaToken));
  const code = totp.codeForStep(setup.body.secret, totp.currentStep());
  const enabled = await request(app).post("/api/auth/mfa/enable").set(bearer(mfaToken)).send({ code });
  return enabled.body.accessToken;
}

module.exports = { bearer, signIn, signInWithMfa };
