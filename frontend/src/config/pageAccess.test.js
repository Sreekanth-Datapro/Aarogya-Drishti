import {
  hasAnyPermission,
  isProtectedPagePermission,
  moduleKeyFromPagePermission,
  pagePermission,
} from "./pageAccess";

describe("pageAccess helpers", () => {
  test("builds and parses page permission codes", () => {
    expect(pagePermission("roleManagement")).toBe("page.roleManagement");
    expect(moduleKeyFromPagePermission("page.moCareLifecycle")).toBe("moCareLifecycle");
    expect(moduleKeyFromPagePermission("master.view")).toBeNull();
  });

  test("marks privileged admin pages as protected", () => {
    expect(isProtectedPagePermission("page.roleManagement")).toBe(true);
    expect(isProtectedPagePermission("page.reports")).toBe(false);
  });

  test("checks whether any listed permission is granted", () => {
    expect(hasAnyPermission(["page.reports", "master.view"], ["page.auditLogs", "page.reports"])).toBe(true);
    expect(hasAnyPermission(["master.view"], ["page.reports"])).toBe(false);
  });
});
