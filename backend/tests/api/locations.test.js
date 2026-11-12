const request = require("supertest");
const app = require("../../app");
const lgd = require("../../services/lgdClient");
const HttpError = require("../../utils/httpError");
const { resetTransactionalData, createUser, pool } = require("../helpers/db");
const { bearer, signInWithMfa } = require("../helpers/auth");

// LGD is never called in tests. These rows copy the shape of real responses
// (Andhra Pradesh = 28, Alluri Sitharama Raju = 745, G.Madugula = 4848).
const LGD_SOURCE = "https://lgdirectory.gov.in/webservices/lgdws/test";

function mockLgd() {
  jest.spyOn(lgd, "getStates").mockResolvedValue({
    rows: [{ lgd_code: 28, name_en: "Andhra Pradesh", name_te: null }],
    sourceUrl: LGD_SOURCE,
  });
  jest.spyOn(lgd, "getDistricts").mockResolvedValue({
    rows: [
      { lgd_code: 745, name_en: "Alluri Sitharama Raju", name_te: null },
      { lgd_code: 744, name_en: "Anakapalli", name_te: null },
    ],
    sourceUrl: LGD_SOURCE,
  });
  jest.spyOn(lgd, "getSubDistricts").mockResolvedValue({
    rows: [
      { lgd_code: 4845, name_en: "Ananthagiri", name_te: null },
      { lgd_code: 4848, name_en: "G.Madugula", name_te: null },
      { lgd_code: 4847, name_en: "Paderu", name_te: null },
    ],
    sourceUrl: LGD_SOURCE,
  });
  jest.spyOn(lgd, "getVillages").mockResolvedValue({
    rows: [{ lgd_code: 584868, name_en: "A.Bandaveedhi", name_te: "ఎ.బందవీధి" }],
    sourceUrl: LGD_SOURCE,
  });
}

const idOf = async (sql, params) => Number((await pool.query(sql, params)).rows[0].id);

let token;
let asrId;

beforeAll(async () => {
  await resetTransactionalData();
  await createUser({ username: "loc_super", role: "SUPER_ADMIN" });
  await createUser({ username: "loc_sysadmin", role: "SYSTEM_ADMIN" });
  token = await signInWithMfa("loc_super");
  asrId = await idOf("SELECT id FROM mst_districts WHERE code = 'ASR'");
});

beforeEach(() => {
  jest.restoreAllMocks();
  mockLgd();
});

const get = (url) => request(app).get(url).set(bearer(token));
const post = (url, body) => request(app).post(url).set(bearer(token)).send(body);

describe("access", () => {
  test("only SUPER_ADMIN may use the location import", async () => {
    const sysToken = await signInWithMfa("loc_sysadmin");
    const res = await request(app).get("/api/locations/preview?level=district&state_code=28").set(bearer(sysToken));
    expect(res.status).toBe(403);

    const anonymous = await request(app).get("/api/locations/preview?level=district&state_code=28");
    expect(anonymous.status).toBe(401);
  });
});

describe("districts", () => {
  test("preview links the existing district by name and finds the new one", async () => {
    const res = await get("/api/locations/preview?level=district&state_code=28");

    expect(res.status).toBe(200);
    const byCode = Object.fromEntries(res.body.rows.map((row) => [row.lgd_code, row]));
    expect(byCode[745].action).toBe("link");
    expect(byCode[745].existing.id).toBe(asrId);
    expect(byCode[744].action).toBe("new");
    expect(res.body.counts).toMatchObject({ new: 1, link: 1 });
  });

  test("import requires explicit confirmation", async () => {
    const res = await post("/api/locations/import", { level: "district", state_code: 28, lgd_codes: [744] });
    expect(res.status).toBe(400);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM mst_districts WHERE lgd_code = 744");
    expect(rows[0].n).toBe(0);
  });

  test("import keeps the existing id, stores LGD codes and records the batch", async () => {
    const res = await post("/api/locations/import", {
      level: "district", state_code: 28, lgd_codes: [744, 745], confirm: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 1, linked: 1, updated: 0, skipped: 0 });

    const asr = await pool.query("SELECT id, code, lgd_code, state_lgd_code FROM mst_districts WHERE id = $1", [asrId]);
    expect(asr.rows[0]).toMatchObject({ code: "ASR", lgd_code: 745, state_lgd_code: 28 });

    const anakapalli = await pool.query("SELECT code, data_source, is_verified, state_name FROM mst_districts WHERE lgd_code = 744");
    expect(anakapalli.rows[0]).toEqual({ code: "LGD_D_744", data_source: "LGD", is_verified: false, state_name: "Andhra Pradesh" });

    const batch = await pool.query("SELECT level, source, source_url, inserted_count, linked_count FROM tbl_location_import_batches WHERE id = $1", [res.body.batch_id]);
    expect(batch.rows[0]).toEqual({ level: "DISTRICT", source: "LGD", source_url: LGD_SOURCE, inserted_count: 1, linked_count: 1 });

    const auditRow = await pool.query("SELECT outcome FROM tbl_audit_logs WHERE event = 'LOCATION_IMPORT' ORDER BY id DESC LIMIT 1");
    expect(auditRow.rows[0].outcome).toBe("SUCCESS");
  });

  test("a second preview shows the records as already imported (duplicates by LGD code)", async () => {
    const res = await get("/api/locations/preview?level=district&state_code=28");
    expect(res.body.rows.map((row) => row.action)).toEqual(["unchanged", "unchanged"]);

    const again = await post("/api/locations/import", { level: "district", state_code: 28, lgd_codes: [744], confirm: true });
    expect(again.body).toMatchObject({ inserted: 0, skipped: 1 });
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM mst_districts WHERE lgd_code = 744");
    expect(rows[0].n).toBe(1);
  });
});

describe("mandals and villages", () => {
  test("mandals are matched to sub-districts; verified records are never changed", async () => {
    await pool.query("UPDATE mst_mandals SET is_verified = TRUE WHERE code = 'PADERU'");
    const gmId = await idOf("SELECT id FROM mst_mandals WHERE code = 'G_MADUGULA'");

    const preview = await get(`/api/locations/preview?level=mandal&parent_id=${asrId}`);
    const byCode = Object.fromEntries(preview.body.rows.map((row) => [row.lgd_code, row.action]));
    expect(byCode).toEqual({ 4845: "new", 4848: "link", 4847: "protected" });
    expect(preview.body.onlyInAarogya.map((row) => row.code)).toEqual(["HUKUMPETA"]);

    const res = await post("/api/locations/import", {
      level: "mandal", parent_id: asrId, lgd_codes: [4845, 4847, 4848], confirm: true,
    });
    expect(res.body).toMatchObject({ inserted: 1, linked: 1, skipped: 1 });

    const gm = await pool.query("SELECT id, name_en, lgd_code FROM mst_mandals WHERE code = 'G_MADUGULA'");
    expect(gm.rows[0]).toEqual({ id: String(gmId), name_en: "G. Madugula", lgd_code: 4848 });

    const paderu = await pool.query("SELECT lgd_code FROM mst_mandals WHERE code = 'PADERU'");
    expect(paderu.rows[0].lgd_code).toBeNull();
  });

  test("villages are saved under their mandal without a gram panchayat and appear in registration options", async () => {
    const gmId = await idOf("SELECT id FROM mst_mandals WHERE code = 'G_MADUGULA'");
    const res = await post("/api/locations/import", {
      level: "village", parent_id: gmId, lgd_codes: [584868], confirm: true,
    });
    expect(res.body.inserted).toBe(1);

    const village = await pool.query("SELECT mandal_id, gram_panchayat_id, name_te FROM mst_villages WHERE lgd_code = 584868");
    expect(village.rows[0]).toEqual({ mandal_id: String(gmId), gram_panchayat_id: null, name_te: "ఎ.బందవీధి" });

    const options = await request(app).get("/api/masters/registration-options");
    const listed = options.body.villages.find((row) => row.name_en === "A.Bandaveedhi");
    expect(String(listed.mandal_id)).toBe(String(gmId));

    // Demo villages keep their gram panchayat and now also carry the mandal
    const demo = await pool.query("SELECT mandal_id, gram_panchayat_id FROM mst_villages WHERE code = 'VIL_DEMO_1'");
    expect(demo.rows[0].mandal_id).toBe(String(gmId));
    expect(demo.rows[0].gram_panchayat_id).not.toBeNull();
  });

  test("a parent without an LGD code must be linked first", async () => {
    const hukumpeta = await idOf("SELECT id FROM mst_mandals WHERE code = 'HUKUMPETA'");
    const res = await get(`/api/locations/preview?level=village&parent_id=${hukumpeta}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PARENT_NOT_LINKED");
  });
});

describe("errors and manual entry", () => {
  test("an LGD outage returns a clear error and saves nothing", async () => {
    lgd.getSubDistricts.mockRejectedValue(new HttpError(503, "Could not reach the LGD service.", "LGD_UNAVAILABLE"));

    const res = await get(`/api/locations/preview?level=mandal&parent_id=${asrId}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("LGD_UNAVAILABLE");
  });

  test("manual entry creates a verified record that imports will not change", async () => {
    const res = await post("/api/locations/manual", { level: "mandal", parent_id: asrId, name_en: "Test Manual Mandal" });
    expect(res.status).toBe(201);

    const { rows } = await pool.query("SELECT data_source, is_verified, lgd_code FROM mst_mandals WHERE id = $1", [res.body.record.id]);
    expect(rows[0]).toEqual({ data_source: "MANUAL", is_verified: true, lgd_code: null });

    const duplicate = await post("/api/locations/manual", { level: "mandal", parent_id: asrId, name_en: "Copy", lgd_code: 4848 });
    expect(duplicate.status).toBe(409);
  });

  test("import history lists the source and date of each import", async () => {
    const res = await get("/api/locations/imports");
    expect(res.status).toBe(200);
    expect(res.body.imports.length).toBeGreaterThanOrEqual(3);
    expect(res.body.imports[0]).toMatchObject({ source: "LGD", imported_by_name: "loc_super" });
    expect(res.body.imports[0].imported_at).toBeTruthy();
  });
});

describe("database rules from migrations 004/005", () => {
  test("a village cannot point to a gram panchayat of a different mandal", async () => {
    const paderu = await idOf("SELECT id FROM mst_mandals WHERE code = 'PADERU'");
    await expect(
      pool.query("UPDATE mst_villages SET mandal_id = $1 WHERE code = 'VIL_DEMO_1'", [paderu])
    ).rejects.toThrow(/does not match/);
  });

  test("the reporting view reads the mandal straight from the village", async () => {
    const { rows } = await pool.query("SELECT pg_get_viewdef('vw_case_facts'::regclass, true) AS def");
    expect(rows[0].def).toMatch(/m\.id = v\.mandal_id/);
  });

  test("only SUPER_ADMIN holds master.import", async () => {
    const { rows } = await pool.query(
      `SELECT r.code FROM tbl_role_permissions rp
         JOIN mst_roles r ON r.id = rp.role_id JOIN mst_permissions p ON p.id = rp.permission_id
        WHERE p.code = 'master.import'`
    );
    expect(rows.map((row) => row.code)).toEqual(["SUPER_ADMIN"]);
  });
});
