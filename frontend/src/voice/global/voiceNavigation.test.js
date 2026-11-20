import { resolveVoiceNavigation } from "./voiceNavigation";
import { getHwPageGuideText, resolveHwPageGuideId } from "./voicePageGuide";

describe("resolveVoiceNavigation", () => {
  test("resolves English registration for health worker", () => {
    expect(resolveVoiceNavigation("Open Patient Registration", { role: "HEALTH_WORKER" }))
      .toEqual({ id: "registration", path: "/health-worker/patients" });
  });

  test("resolves Open Patients to patient search", () => {
    expect(resolveVoiceNavigation("Open Patients", { role: "HEALTH_WORKER" }))
      .toEqual({ id: "patients", path: "/health-worker/patient-search" });
  });

  test("resolves Telugu screening", () => {
    expect(resolveVoiceNavigation("స్క్రీనింగ్ తెరువు", { role: "HEALTH_WORKER" }))
      .toEqual({ id: "screening", path: "/health-worker/screening" });
  });

  test("resolves diagnostics, tracking, follow-up for health worker", () => {
    expect(resolveVoiceNavigation("Open Diagnostics", { role: "HEALTH_WORKER" }))
      .toEqual({ id: "diagnostics", path: "/health-worker/diagnostics" });
    expect(resolveVoiceNavigation("Open Tracking", { role: "HEALTH_WORKER" }))
      .toEqual({ id: "tracking", path: "/health-worker/tracking" });
    expect(resolveVoiceNavigation("Open Follow-up", { role: "HEALTH_WORKER" }))
      .toEqual({ id: "followups", path: "/health-worker/followups" });
  });

  test("denies registration for non health worker", () => {
    expect(resolveVoiceNavigation("Open Patient Registration", { role: "MEDICAL_OFFICER" }))
      .toEqual({ denied: true, id: "registration" });
  });

  test("denies reports for health worker", () => {
    expect(resolveVoiceNavigation("Open Reports", { role: "HEALTH_WORKER" }))
      .toEqual({ denied: true, id: "reports" });
  });

  test("opens dashboard for any role", () => {
    expect(resolveVoiceNavigation("go to dashboard", { role: "SUPER_ADMIN" }))
      .toEqual({ id: "dashboard", path: "/dashboard" });
  });

  test("returns null for unknown command", () => {
    expect(resolveVoiceNavigation("play music", { role: "HEALTH_WORKER" })).toBeNull();
  });
});

describe("voicePageGuide", () => {
  test("returns registration and screening guides", () => {
    expect(resolveHwPageGuideId("/health-worker/patients")).toBe("registration");
    expect(getHwPageGuideText("/dashboard", "en")?.id).toBe("dashboard");
    expect(getHwPageGuideText("/health-worker/screening", "te")?.text).toMatch(/స్క్రీనింగ్/);
  });
});
