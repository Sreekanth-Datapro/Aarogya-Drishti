import { getModulesForRole, getModulesForUser, isSystemAdministrator } from "./navigation";

describe("system administrator navigation", () => {
  test("SUPER_ADMIN receives District Admin Management", () => {
    const moduleKeys = getModulesForRole("SUPER_ADMIN").map((module) => module.key);
    expect(isSystemAdministrator("SUPER_ADMIN")).toBe(true);
    expect(moduleKeys).toEqual(expect.arrayContaining(["districtAdmins", "roleManagement", "facilities"]));
    expect(moduleKeys).toContain("staffManagement");
    expect(moduleKeys).toEqual(expect.arrayContaining([
      "registrationMonitoring",
      "reports",
      "auditLogs",
      "settings",
    ]));
    expect(moduleKeys).not.toContain("patients");
    expect(moduleKeys).not.toContain("screening");
  });

  test("SYSTEM_ADMIN does not receive District Admin Management", () => {
    const moduleKeys = getModulesForRole("SYSTEM_ADMIN").map((module) => module.key);
    expect(isSystemAdministrator("SYSTEM_ADMIN")).toBe(true);
    expect(moduleKeys).toContain("roleManagement");
    expect(moduleKeys).toContain("staffManagement");
    expect(moduleKeys).not.toContain("districtAdmins");
  });

  test("non-administrator roles do not receive system administration modules", () => {
    expect(isSystemAdministrator("DISTRICT_ADMIN")).toBe(false);
    expect(getModulesForRole("DISTRICT_ADMIN").map((module) => module.key)).not.toContain(
      "roleManagement"
    );
    expect(getModulesForRole("DISTRICT_ADMIN").map((module) => module.key))
      .toContain("districtHospitalStaff");
    expect(getModulesForRole("DISTRICT_ADMIN").map((module) => module.key))
      .toContain("districtCustomAccounts");
    expect(getModulesForRole("HOSPITAL_STAFF").map((module) => module.key))
      .toEqual(["appointments", "hsDiagnostics", "hsTracking", "attendance"]);
    expect(getModulesForRole("DISTRICT_ADMIN").map((module) => module.key))
      .toContain("districtTracking");
    expect(getModulesForRole("NAVIGATOR").map((module) => module.key))
      .toContain("navTracking");
    expect(getModulesForRole("MEDICAL_OFFICER").map((module) => module.key))
      .toContain("moTracking");
  });

  test("custom roles only see modules granted by page permissions", () => {
    const modules = getModulesForUser({
      role: "CUSTOM_AUDITOR",
      permissions: ["master.view", "page.reports", "page.facilities"],
    });
    expect(modules.map((module) => module.key)).toEqual(["reports", "facilities"]);
  });

  test("falls back to ROLE_MODULES when no page permissions exist", () => {
    const modules = getModulesForUser({
      role: "HOSPITAL_STAFF",
      permissions: ["appointment.confirm"],
    });
    expect(modules.map((module) => module.key))
      .toEqual(["appointments", "hsDiagnostics", "hsTracking", "attendance"]);
  });

  test("DISTRICT_ADMIN keeps custom-account provisioning when page permissions omit it", () => {
    const modules = getModulesForUser({
      role: "DISTRICT_ADMIN",
      permissions: ["page.districtMedicalOfficers", "page.districtHospitalStaff"],
    });
    expect(modules.map((module) => module.key)).toEqual(expect.arrayContaining([
      "districtMedicalOfficers",
      "districtHospitalStaff",
      "districtCustomAccounts",
    ]));
  });
});
