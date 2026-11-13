const {
  hasRole,
  hasAllPermissions,
  hasAnyPermission,
  getEffectivePermissions,
  assertSystemAdmin,
  assertSuperAdmin,
} = require("../../utils/authorizationPolicy");
const { createAuthorizationGuards } = require("../../middleware/authorizationGuards");

const audit = jest.fn().mockResolvedValue(undefined);
const { requirePermission, requireAnyPermission, allowRoles } = createAuthorizationGuards(audit);

function createRequest(user = undefined) {
  return {
    method: "GET",
    baseUrl: "/api",
    path: "/resource",
    user,
  };
}

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function expectForbiddenResponse(res) {
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: "You are not authorized to access this resource",
    code: "FORBIDDEN",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  audit.mockResolvedValue(undefined);
});

describe("authorization policy", () => {
  test("matches role names exactly", () => {
    expect(hasRole({ role_name: "SYSTEM_ADMIN" }, ["SYSTEM_ADMIN"])).toBe(true);
    expect(hasRole({ role_name: "system_admin" }, ["SYSTEM_ADMIN"])).toBe(false);
    expect(hasRole(undefined, ["SYSTEM_ADMIN"])).toBe(false);
  });

  test("requires all listed permissions and preserves empty-list behavior", () => {
    expect(hasAllPermissions(["master.view", "master.manage"], ["master.view", "master.manage"])).toBe(true);
    expect(hasAllPermissions(["master.view"], ["master.view", "master.manage"])).toBe(false);
    expect(hasAllPermissions([], [])).toBe(true);
    expect(hasAllPermissions(undefined, ["master.view"])).toBe(false);
  });

  test("requires any listed permission and preserves empty-list behavior", () => {
    expect(hasAnyPermission(["master.manage"], ["master.view", "master.manage"])).toBe(true);
    expect(hasAnyPermission(["registration.verify"], ["master.view", "master.manage"])).toBe(false);
    expect(hasAnyPermission([], [])).toBe(false);
    expect(hasAnyPermission(undefined, ["master.view"])).toBe(false);
  });

  test.each(["SYSTEM_ADMIN", "SUPER_ADMIN"])(
    "assertSystemAdmin accepts %s with an ID",
    (role_name) => {
      expect(() => assertSystemAdmin({ id: "admin-1", role_name })).not.toThrow();
    }
  );

  test("assertSuperAdmin accepts only SUPER_ADMIN", () => {
    expect(() => assertSuperAdmin({ id: "super-1", role_name: "SUPER_ADMIN" })).not.toThrow();
    expect(() => assertSuperAdmin({ id: "system-1", role_name: "SYSTEM_ADMIN" }))
      .toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
    expect(() => assertSuperAdmin({ id: "district-1", role_name: "DISTRICT_ADMIN" }))
      .toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
  });

  test("adds role-specific effective administration permissions", () => {
    expect(getEffectivePermissions("SUPER_ADMIN", ["master.view"])).toEqual([
      "master.view",
      "role.manage",
      "district_admin.manage",
    ]);
    expect(getEffectivePermissions("SYSTEM_ADMIN", [])).toEqual(["role.manage"]);
    expect(getEffectivePermissions("SYSTEM_ADMIN", ["role.manage"])).toEqual(["role.manage"]);
    expect(getEffectivePermissions("SYSTEM_ADMIN", ["master.view"])).toEqual([
      "master.view",
      "role.manage",
    ]);
    expect(getEffectivePermissions("DISTRICT_ADMIN", [])).toEqual(["user.create_staff"]);
  });

  test.each([
    ["a different role", { id: "user-1", role_name: "DISTRICT_ADMIN" }],
    ["a missing actor", undefined],
    ["a missing actor ID", { role_name: "SYSTEM_ADMIN" }],
  ])("assertSystemAdmin rejects %s with the existing error", (_description, actor) => {
    let thrown;
    try {
      assertSystemAdmin(actor);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      status: 403,
      message: "Only a system administrator can perform this action",
      code: "FORBIDDEN",
    });
  });
});

describe("authorization guards", () => {
  test.each(["SYSTEM_ADMIN", "SUPER_ADMIN"])(
    "allowRoles permits %s for the shared admin route",
    async (role_name) => {
      const req = createRequest({ role_name });
      const res = createResponse();
      const next = jest.fn();

      await allowRoles("SYSTEM_ADMIN", "SUPER_ADMIN")(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["missing user", undefined],
    ["different role", { role_name: "DISTRICT_ADMIN" }],
    ["case-mismatched role", { role_name: "system_admin" }],
  ])("allowRoles denies %s and audits the denial", async (_description, user) => {
    const req = createRequest(user);
    const res = createResponse();
    const next = jest.fn();

    await allowRoles("SYSTEM_ADMIN")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expectForbiddenResponse(res);
    expect(audit).toHaveBeenCalledWith(req, {
      event: "ACCESS_DENIED",
      outcome: "DENIED",
      resourceType: "api",
      resourceId: "GET /api/resource",
      metadata: { required: ["SYSTEM_ADMIN"] },
    });
  });

  test("requirePermission allows a user with every required permission", async () => {
    const req = createRequest({ permissions: ["master.view", "master.manage"] });
    const res = createResponse();
    const next = jest.fn();

    await requirePermission("master.view", "master.manage")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  test("requirePermission denies and audits when a required permission is missing", async () => {
    const req = createRequest({ permissions: ["master.view"] });
    const res = createResponse();
    const next = jest.fn();

    await requirePermission("master.view", "master.manage")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expectForbiddenResponse(res);
    expect(audit).toHaveBeenCalledWith(req, {
      event: "ACCESS_DENIED",
      outcome: "DENIED",
      resourceType: "api",
      resourceId: "GET /api/resource",
      metadata: { required: ["master.view", "master.manage"] },
    });
  });

  test("requirePermission allows an empty permission list, matching current behavior", async () => {
    const req = createRequest({ permissions: [] });
    const res = createResponse();
    const next = jest.fn();

    await requirePermission()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });

  test("requireAnyPermission allows a user with at least one requested permission", async () => {
    const req = createRequest({ permissions: ["master.manage"] });
    const res = createResponse();
    const next = jest.fn();

    await requireAnyPermission("master.view", "master.manage")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  test("requireAnyPermission denies and audits when none of the requested permissions are present", async () => {
    const req = createRequest({ permissions: ["registration.verify"] });
    const res = createResponse();
    const next = jest.fn();

    await requireAnyPermission("master.view", "master.manage")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expectForbiddenResponse(res);
    expect(audit).toHaveBeenCalledWith(req, {
      event: "ACCESS_DENIED",
      outcome: "DENIED",
      resourceType: "api",
      resourceId: "GET /api/resource",
      metadata: { required: ["master.view", "master.manage"] },
    });
  });

  test("requireAnyPermission denies an empty permission list, matching current behavior", async () => {
    const req = createRequest({ permissions: [] });
    const res = createResponse();
    const next = jest.fn();

    await requireAnyPermission()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expectForbiddenResponse(res);
    expect(audit).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        event: "ACCESS_DENIED",
        outcome: "DENIED",
        metadata: { required: [] },
      })
    );
  });
});
