import {
  formatLocalizedRelativeTime,
  formatLocalizedMonth,
  getAccountStatusLabel,
  getAuditActionLabel,
  getAuditStatusLabel,
  getDesignationLabel,
  getLocalizedMasterName,
  getRegistrationStatusLabel,
  getRoleLabel,
} from "./displayLabels";

describe("shared display localization helpers", () => {
  test("uses master Telugu names and falls back to English", () => {
    expect(getLocalizedMasterName({ name_en: "Paderu", name_te: "పాడేరు" }, "te")).toBe("పాడేరు");
    expect(getLocalizedMasterName({ name_en: "Anakapalli", name_te: null }, "te")).toBe("Anakapalli");
    expect(getLocalizedMasterName({ name_en: "Paderu", name_te: "పాడేరు" }, "en")).toBe("Paderu");
  });

  test("maps designations, roles, registration and account statuses", () => {
    expect(getDesignationLabel("ASHA", "te")).toBe("ఆశా కార్యకర్త");
    expect(getRoleLabel("SUPER_ADMIN", "te")).toBe("సూపర్ అడ్మిన్");
    expect(getRoleLabel("SUPER_ADMIN", "en")).toBe("Super administrator");
    expect(getRegistrationStatusLabel("APPROVED", "te")).toBe("ఆమోదించబడింది");
    expect(getAccountStatusLabel("ACTIVE", "te")).toBe("క్రియాశీలం");
  });

  test("uses readable fallbacks for unknown role and account-status codes", () => {
    expect(getRoleLabel("FIELD_SUPERVISOR", "en")).toBe("Field supervisor");
    expect(getRoleLabel("customRole", "te")).toBe("Custom role");
    expect(getAccountStatusLabel("WAITING_FOR_REVIEW", "en")).toBe("Waiting for review");
    expect(getAccountStatusLabel("FUTURE_STATUS", "te")).toBe("Future status");
    expect(getRoleLabel(null, "en")).toBe("Not available");
    expect(getRoleLabel(undefined, "te")).toBe("అందుబాటులో లేదు");
    expect(getAccountStatusLabel(null, "te")).toBe("అందుబాటులో లేదు");
    expect(getAccountStatusLabel(undefined, "en")).toBe("Not available");
  });

  test("maps audit actions and preserves unknown values as a readable fallback", () => {
    expect(getAuditActionLabel("LOGIN_FAILED", "te")).toBe("సైన్ ఇన్ విఫల ప్రయత్నం");
    expect(getAuditActionLabel("NEW_CUSTOM_EVENT", "en")).toBe("new custom event");
    expect(getAuditActionLabel("NewCustomEvent", "te")).toBe("new custom event");
    expect(getAuditActionLabel(null, "en")).toBe("Not available");
    expect(getAuditActionLabel(undefined, "te")).toBe("అందుబాటులో లేదు");
    expect(getAuditStatusLabel("SUCCESS", "te")).toBe("విజయం");
  });

  test("formats English and Telugu relative times", () => {
    const now = new Date("2026-11-06T10:30:00+05:30");
    expect(formatLocalizedRelativeTime("2026-11-06T10:20:00+05:30", "en", now)).toBe("10 min ago");
    expect(formatLocalizedRelativeTime("2026-11-06T10:20:00+05:30", "te", now)).toBe("10 నిమిషాల క్రితం");
    expect(formatLocalizedRelativeTime("2026-11-05T10:30:00+05:30", "te", now)).toBe("నిన్న");
  });

  test("formats English and Telugu month abbreviations", () => {
    expect(formatLocalizedMonth("May", "en")).toBe("May");
    expect(formatLocalizedMonth("May", "te")).toBe("మే");
    expect(formatLocalizedMonth("Nov", "te")).toBe("నవం");
  });
});
