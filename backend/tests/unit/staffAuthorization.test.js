jest.mock("../../db", () => ({
  query: jest.fn(),
}));

const pool = require("../../db");
const { resolveAuthorizedDistrict } = require("../../utils/districtAuthorization");
const { getEffectivePermissions } = require("../../utils/authorizationPolicy");

beforeEach(() => {
  pool.query.mockReset();
});

test("District Admin receives staff creation permission without a broad master permission", () => {
  const permissions = getEffectivePermissions("DISTRICT_ADMIN", ["master.view"]);

  expect(permissions).toContain("user.create_staff");
  expect(permissions).not.toContain("master.manage");
});

test("District Admin staff district comes from authenticated database data", async () => {
  pool.query.mockResolvedValue({ rows: [{ district_id: 12 }] });

  await expect(resolveAuthorizedDistrict({
    user: { id: "district-admin-a", role_name: "DISTRICT_ADMIN" },
    body: { district_id: 99 },
    query: { district_id: 99 },
  })).resolves.toBe(12);

  expect(pool.query.mock.calls[0][1]).toEqual(["district-admin-a"]);
  expect(pool.query.mock.calls[0][1]).not.toContain(99);
});

test("District Admin without a valid district cannot manage staff", async () => {
  pool.query.mockResolvedValue({ rows: [] });

  await expect(resolveAuthorizedDistrict({
    user: { id: "district-admin-b", role_name: "DISTRICT_ADMIN" },
  })).rejects.toMatchObject({
    status: 403,
    code: "DISTRICT_NOT_ASSIGNED",
  });
});

test("Super Admin retains staff management scope without district resolution", () => {
  const permissions = getEffectivePermissions("SUPER_ADMIN", ["user.create_staff", "user.manage"]);

  expect(permissions).toContain("user.create_staff");
  expect(permissions).toContain("user.manage");
});
