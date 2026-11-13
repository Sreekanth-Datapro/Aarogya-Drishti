const request = require("supertest");
const app = require("../../app");
const { resetTransactionalData, createUser, pool } = require("../helpers/db");
const { bearer, signIn, signInWithMfa } = require("../helpers/auth");

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

let admin;      // SUPER_ADMIN token
let ids;        // master data ids from the seeded demo data

function validBody(changes = {}) {
  return {
    name_en: "Test PHC Kothapalli",
    category: "PHC",
    district_id: ids.district,
    mandal_id: ids.mandalGM,
    village_id: ids.village1,
    pin_code: "531029",
    contact_phone: "9876543210",
    email: "phc.test@example.org",
    incharge_name: "Dr Test",
    ...changes,
  };
}

const post = (body, token = admin) => request(app).post("/api/facilities").set(bearer(token)).send(body);

beforeAll(async () => {
  await resetTransactionalData();

  ids = {
    district: Number((await one("SELECT id FROM mst_districts WHERE code = 'ASR'")).id),
    mandalGM: Number((await one("SELECT id FROM mst_mandals WHERE code = 'G_MADUGULA'")).id),
    mandalPaderu: Number((await one("SELECT id FROM mst_mandals WHERE code = 'PADERU'")).id),
    village1: Number((await one("SELECT id FROM mst_villages WHERE code = 'VIL_DEMO_1'")).id),
  };

  await createUser({ username: "fac_super", role: "SUPER_ADMIN" });
  // SYSTEM_ADMIN cannot log in after migration 011 (role inactive). A second
  // SUPER_ADMIN still exercises master.manage facility creation.
  await createUser({ username: "fac_sysadmin", role: "SUPER_ADMIN" });
  // District Admins must be assigned a district or facility APIs return DISTRICT_NOT_ASSIGNED.
  await createUser({
    username: "fac_district",
    role: "DISTRICT_ADMIN",
    districtId: ids.district,
  });
  await createUser({ username: "fac_hw", role: "HEALTH_WORKER" });
  admin = await signInWithMfa("fac_super");

  // A second district with its own mandal, to test mismatched locations
  const district = await one("INSERT INTO mst_districts (code, name_en) VALUES ('MAN_D_FACTEST', 'Other District') RETURNING id");
  const mandal = await one(
    "INSERT INTO mst_mandals (district_id, code, name_en) VALUES ($1, 'MAN_SD_FACTEST', 'Other Mandal') RETURNING id",
    [district.id]
  );
  ids.otherDistrict = Number(district.id);
  ids.otherMandal = Number(mandal.id);
});

describe("migration 007 kept the demo facilities", () => {
  test("demo facilities got a category and the demo PHC got its mandal", async () => {
    const { rows } = await pool.query("SELECT code, category, mandal_id, is_active FROM mst_facilities ORDER BY id");
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));

    expect(byCode.FAC_PHC_GM).toMatchObject({ category: "PHC", mandal_id: String(ids.mandalGM), is_active: true });
    expect(byCode.FAC_AH_PADERU_DEMO.category).toBe("AREA_HOSPITAL");
    expect(byCode.FAC_RCC_DEMO.category).toBe("MEDICAL_COLLEGE");
    expect(byCode.FAC_DISTRICT_OFFICE.category).toBe("DISTRICT_OFFICE");
  });

  test("dashboard counts", async () => {
    const res = await request(app).get("/api/facilities/summary").set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 4, active: 4, inactive: 0, phc: 1, chc: 0, hospital: 2 });
  });
});

describe("role-based access", () => {
  test("health workers and anonymous users cannot use the API", async () => {
    expect((await request(app).get("/api/facilities")).status).toBe(401);

    const hw = await signIn("fac_hw");
    expect((await request(app).get("/api/facilities").set(bearer(hw))).status).toBe(403);
    expect((await post(validBody(), hw)).status).toBe(403);
    expect((await request(app).get("/api/masters/districts").set(bearer(hw))).status).toBe(403);
  });

  test("district admins can view but not change facilities", async () => {
    const token = await signInWithMfa("fac_district");
    expect((await request(app).get("/api/facilities").set(bearer(token))).status).toBe(200);
    expect((await post(validBody(), token)).status).toBe(403);
  });

  test("accounts with master.manage can create facilities", async () => {
    const token = await signInWithMfa("fac_sysadmin");
    const res = await post(validBody({ name_en: "Sub-centre by system admin", category: "SUB_CENTRE" }), token);
    expect(res.status).toBe(201);
    expect(res.body.facility.facility_type).toBe("SUB_CENTRE");
  });
});

describe("creating facilities", () => {
  test("a PHC is saved with its location and a linked mst_phcs row", async () => {
    const res = await post(validBody());

    expect(res.status).toBe(201);
    expect(res.body.facility).toMatchObject({
      name_en: "Test PHC Kothapalli",
      category: "PHC",
      district_name: "Alluri Sitharama Raju",
      mandal_name: "G. Madugula",
      village_name: "Demo Village 1",
      is_active: true,
      code: null,
    });

    const row = await one("SELECT phc_id FROM mst_facilities WHERE id = $1", [res.body.facility.id]);
    const phc = await one("SELECT mandal_id, name_en FROM mst_phcs WHERE id = $1", [row.phc_id]);
    expect(phc).toEqual({ mandal_id: String(ids.mandalGM), name_en: "Test PHC Kothapalli" });

    const auditRow = await one("SELECT resource_id FROM tbl_audit_logs WHERE event = 'FACILITY_CREATED' ORDER BY id DESC LIMIT 1");
    expect(auditRow.resource_id).toBe(String(res.body.facility.id));
  });

  test("a CHC gets a linked hospital row; codes are stored in capitals", async () => {
    const res = await post(validBody({ name_en: "CHC Test", category: "CHC", code: "chc-gm-01" }));
    expect(res.status).toBe(201);
    expect(res.body.facility.code).toBe("CHC-GM-01");

    const row = await one("SELECT hospital_id FROM mst_facilities WHERE id = $1", [res.body.facility.id]);
    const hospital = await one("SELECT level, district_id FROM mst_hospitals WHERE id = $1", [row.hospital_id]);
    expect(hospital).toEqual({ level: "CHC", district_id: String(ids.district) });
  });

  test("duplicate facility codes are refused (ignoring upper/lower case)", async () => {
    const res = await post(validBody({ name_en: "Copy", code: "Chc-Gm-01" }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_CODE");

    const demo = await post(validBody({ name_en: "Copy of demo", code: "fac_phc_gm" }));
    expect(demo.status).toBe(409);
  });

  test("required fields and formats are validated", async () => {
    const missing = await post({ category: "PHC" });
    expect(missing.status).toBe(400);
    expect(missing.body.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["name_en", "district_id", "mandal_id", "village_id"])
    );

    expect((await post(validBody({ pin_code: "12345" }))).body.message).toMatch(/PIN code/);
    expect((await post(validBody({ contact_phone: "12ab" }))).status).toBe(400);
    expect((await post(validBody({ category: "CLINIC" }))).status).toBe(400);
  });

  test("the mandal must belong to the district and the village to the mandal", async () => {
    const wrongMandal = await post(validBody({ mandal_id: ids.otherMandal }));
    expect(wrongMandal.status).toBe(400);
    expect(wrongMandal.body.message).toBe("The selected mandal does not belong to the selected district");

    const wrongVillage = await post(validBody({ mandal_id: ids.mandalPaderu }));
    expect(wrongVillage.status).toBe(400);
    expect(wrongVillage.body.message).toBe("The selected village does not belong to the selected mandal");

    const unknown = await post(validBody({ village_id: 99999999 }));
    expect(unknown.status).toBe(400);
  });

  test("the database also blocks mismatched locations", async () => {
    await expect(
      pool.query("UPDATE mst_facilities SET mandal_id = $1 WHERE code = 'FAC_PHC_GM'", [ids.otherMandal])
    ).rejects.toThrow(/does not belong to district/);
  });
});

describe("editing, status and listing", () => {
  let chc;

  beforeAll(async () => {
    chc = (await post(validBody({ name_en: "Edit Me CHC", category: "CHC", code: "EDIT-01" }))).body.facility;
  });

  test("editing keeps the id and updates the linked hospital row", async () => {
    const res = await request(app).put(`/api/facilities/${chc.id}`).set(bearer(admin))
      .send(validBody({ name_en: "Area Hospital Renamed", category: "AREA_HOSPITAL", code: "EDIT-01", incharge_name: "Dr New" }));

    expect(res.status).toBe(200);
    expect(res.body.facility).toMatchObject({ id: chc.id, name_en: "Area Hospital Renamed", category: "AREA_HOSPITAL", incharge_name: "Dr New" });

    const hospital = await one(
      "SELECT h.level, h.name_en FROM mst_hospitals h JOIN mst_facilities f ON f.hospital_id = h.id WHERE f.id = $1",
      [chc.id]
    );
    expect(hospital).toEqual({ level: "AH", name_en: "Area Hospital Renamed" });
  });

  test("a hospital cannot be turned into a PHC", async () => {
    const res = await request(app).put(`/api/facilities/${chc.id}`).set(bearer(admin)).send(validBody({ category: "PHC" }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TYPE_CHANGE_NOT_ALLOWED");
  });

  test("deactivated facilities disappear from the registration form", async () => {
    const phc = (await post(validBody({ name_en: "PHC To Deactivate" }))).body.facility;
    const listed = async () =>
      (await request(app).get("/api/masters/registration-options")).body.facilities.some((f) => Number(f.id) === phc.id);

    expect(await listed()).toBe(true);

    const off = await request(app).patch(`/api/facilities/${phc.id}/status`).set(bearer(admin)).send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.facility.is_active).toBe(false);
    expect(await listed()).toBe(false);

    const row = await one("SELECT p.is_active FROM mst_phcs p JOIN mst_facilities f ON f.phc_id = p.id WHERE f.id = $1", [phc.id]);
    expect(row.is_active).toBe(false);

    const on = await request(app).patch(`/api/facilities/${phc.id}/status`).set(bearer(admin)).send({ is_active: true });
    expect(on.body.facility.is_active).toBe(true);
    expect(await listed()).toBe(true);

    const bad = await request(app).patch(`/api/facilities/${phc.id}/status`).set(bearer(admin)).send({ is_active: "yes" });
    expect(bad.status).toBe(400);
  });

  test("the list can be searched, filtered and paged", async () => {
    const search = await request(app).get("/api/facilities?search=renamed").set(bearer(admin));
    expect(search.body.facilities.map((f) => f.name_en)).toEqual(["Area Hospital Renamed"]);

    const byCode = await request(app).get("/api/facilities?search=edit-01").set(bearer(admin));
    expect(byCode.body.total).toBe(1);

    const byType = await request(app).get("/api/facilities?category=PHC").set(bearer(admin));
    expect(byType.body.facilities.every((f) => f.category === "PHC")).toBe(true);

    const byVillage = await request(app).get(`/api/facilities?village_id=${ids.village1}`).set(bearer(admin));
    expect(byVillage.body.facilities.every((f) => f.village_id === ids.village1)).toBe(true);

    const page = await request(app).get("/api/facilities?page=1&page_size=2").set(bearer(admin));
    expect(page.body.facilities).toHaveLength(2);
    expect(page.body.total).toBeGreaterThan(2);

    const inactive = await request(app).get("/api/facilities?status=inactive").set(bearer(admin));
    expect(inactive.body.facilities.every((f) => f.is_active === false)).toBe(true);
  });

  test("details show the location names; unknown ids return 404", async () => {
    const res = await request(app).get(`/api/facilities/${chc.id}`).set(bearer(admin));
    expect(res.body.facility).toMatchObject({ district_name: "Alluri Sitharama Raju", mandal_name: "G. Madugula", village_name: "Demo Village 1" });

    expect((await request(app).get("/api/facilities/99999999").set(bearer(admin))).status).toBe(404);
    expect((await request(app).get("/api/facilities/abc").set(bearer(admin))).status).toBe(400);
  });
});

describe("location dropdown APIs", () => {
  test("district -> mandals -> villages", async () => {
    const districts = await request(app).get("/api/masters/districts").set(bearer(admin));
    expect(districts.body.districts.map((d) => d.name_en)).toContain("Alluri Sitharama Raju");

    const mandals = await request(app).get(`/api/masters/mandals?district_id=${ids.district}`).set(bearer(admin));
    expect(mandals.body.mandals.map((m) => m.name_en)).toEqual(["G. Madugula", "Hukumpeta", "Paderu"]);

    const villages = await request(app).get(`/api/masters/villages?mandal_id=${ids.mandalGM}`).set(bearer(admin));
    expect(villages.body.villages.map((v) => v.name_en)).toEqual(["Demo Village 1", "Demo Village 2"]);

    expect((await request(app).get("/api/masters/mandals").set(bearer(admin))).status).toBe(400);
  });
});
