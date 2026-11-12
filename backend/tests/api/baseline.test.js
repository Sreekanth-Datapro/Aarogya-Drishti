const request = require("supertest");
const app = require("../../app");
const { resetTransactionalData, createUser, masterIds, pool } = require("../helpers/db");

let ids;

beforeAll(async () => {
  await resetTransactionalData();
  ids = await masterIds();
});

describe("health and master data", () => {
  test("GET /api/health reports database connected", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("Connected");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  test("registration options list districts, facilities, mandals, villages and languages", async () => {
    const res = await request(app).get("/api/masters/registration-options");
    expect(res.status).toBe(200);
    expect(res.body.districts.length).toBeGreaterThan(0);
    expect(res.body.facilities.map((f) => f.code)).toEqual(["FAC_PHC_GM"]);
    expect(Number(res.body.facilities[0].district_id)).toBe(ids.districtGM);
    expect(res.body.mandals).toHaveLength(3);
    expect(Number(res.body.mandals.find((m) => Number(m.id) === ids.mandalGM).district_id)).toBe(ids.districtGM);
    expect(res.body.languages.map((l) => l.code)).toEqual(["en", "te"]);

    const gmVillages = res.body.villages.filter((v) => Number(v.mandal_id) === ids.mandalGM);
    expect(gmVillages).toHaveLength(2);
  });

  test("unknown API route returns JSON 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test("malformed JSON body returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
  });
});

describe("health worker self-registration", () => {
  const base = () => ({
    full_name: "Test Worker",
    username: "hw_selfreg",
    password: "Password@123",
    phone: "9876543210",
    designation: "ASHA",
    district_id: ids.districtGM,
    facility_id: ids.facilityPhc,
    mandal_id: ids.mandalGM,
    village_id: ids.village1,
    language_id: ids.languageTe,
    terms_accepted: true,
  });

  test.each([
    ["missing full name", { full_name: "" }],
    ["terms not accepted", { terms_accepted: false }],
    ["short password", { password: "short" }],
    ["bad phone", { phone: "12345" }],
    ["invalid designation", { designation: "DOCTOR" }],
    ["invalid username", { username: "a b" }],
  ])("rejects %s with 400", async (_, change) => {
    const res = await request(app).post("/api/auth/register").send({ ...base(), ...change });
    expect(res.status).toBe(400);
  });

  test("rejects a village outside the selected mandal", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...base(), mandal_id: ids.mandalPaderu });
    expect(res.status).toBe(400);
  });

  test("rejects an unknown facility with 400 (not 500)", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...base(), facility_id: 999999 });
    expect(res.status).toBe(400);
  });

  test("creates a PENDING request and blocks a duplicate", async () => {
    const res = await request(app).post("/api/auth/register").send(base());
    expect(res.status).toBe(201);
    expect(res.body.registration.status).toBe("PENDING");

    const { rows } = await pool.query(
      "SELECT requested_role, mandal_id, village_id FROM tbl_user_registration_requests WHERE username = 'hw_selfreg'"
    );
    expect(rows[0]).toMatchObject({ requested_role: "HEALTH_WORKER" });

    const again = await request(app).post("/api/auth/register").send(base());
    expect(again.status).toBe(409);
  });
});

describe("login and profile (no-MFA role)", () => {
  let worker;

  beforeAll(async () => {
    worker = await createUser({ username: "hw_login", role: "HEALTH_WORKER" });
  });

  test("wrong password is rejected", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "hw_login", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  test("valid login returns an access token usable on /me", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "HW_LOGIN", password: worker.password });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("HEALTH_WORKER");

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("hw_login");
    expect(me.body.user).not.toHaveProperty("district_id");
  });

  test("/me without a token is 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
