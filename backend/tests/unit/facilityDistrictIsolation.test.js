jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const pool = require("../../db");
const facilityService = require("../../services/facilityService");

describe("facility district isolation", () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
  });

  test("District A summary is scoped to district A", async () => {
    pool.query.mockResolvedValue({
      rows: [{ total: "2", active: "1", inactive: "1", phc: "1", chc: "1", hospital: "0" }],
    });

    await facilityService.summary(101);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE f.district_id = $1"),
      [101]
    );
  });

  test("frontend district_id cannot replace the trusted district scope", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await facilityService.list({ district_id: 202, page: 1, page_size: 20 }, 101);

    expect(pool.query.mock.calls[0][0]).toContain("f.district_id = $1");
    expect(pool.query.mock.calls[0][1]).toContain(101);
    expect(pool.query.mock.calls[0][1]).not.toContain(202);
  });

  test("facility detail lookup adds a district ownership condition", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(facilityService.getById(7, pool, 101)).rejects.toMatchObject({
      status: 404,
    });

    expect(pool.query.mock.calls[0][0]).toContain("AND f.district_id = $2");
    expect(pool.query.mock.calls[0][1]).toEqual([7, 101]);
  });

  test("Super Admin global lookup does not add a district condition", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(facilityService.getById(7, pool, null)).rejects.toMatchObject({
      status: 404,
    });

    expect(pool.query.mock.calls[0][0]).not.toContain("district_id = $2");
    expect(pool.query.mock.calls[0][1]).toEqual([7]);
  });

  test("retired facility.manage migration is not present and write routes use master.manage only", () => {
    const fs = require("fs");
    const path = require("path");
    const migrationPath = path.join(
      __dirname,
      "../../migrations/013_facility_management_permission.sql"
    );
    const routeSource = fs.readFileSync(
      path.join(__dirname, "../../routes/facilities.js"),
      "utf8"
    );

    expect(fs.existsSync(migrationPath)).toBe(false);
    expect(routeSource).not.toContain("facility.manage");
    expect(routeSource).toContain('requirePermission("master.manage")');
  });
});
