import { lookup, normalizeLanguage, translate } from "./translate";

// Helpers that turn values from the database / API into text for the screen.
// All the words live in translations.js (labels.*, time.*); these functions only pick
// the right one. The original API value is never changed.

function localeFor(language) {
  return normalizeLanguage(language) === "te" ? "te-IN" : "en-IN";
}

// labels.<group>.<code> in the chosen language; English if Telugu is missing;
// otherwise the fallback (by default the value itself)
function labelFor(group, value, language, fallback) {
  const raw = String(value ?? "").trim();
  const code = group === "auditModules" ? raw : raw.toUpperCase();
  const text = lookup(language, `labels.${group}.${code}`) ?? lookup("en", `labels.${group}.${code}`);
  if (typeof text === "string") return text;
  return fallback === undefined ? raw : fallback;
}

function readableCodeFallback(value, language, lowercase = false) {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!words) return translate(language, "common.notAvailable");
  const readable = words.toLowerCase();
  return lowercase ? readable : readable.charAt(0).toUpperCase() + readable.slice(1);
}

// Name of a district / mandal / village / facility / role row:
// name_te in Telugu mode (if the database has one), otherwise name_en.
export function getLocalizedMasterName(item, language) {
  if (!item || typeof item !== "object") return "";
  const english = String(item.name_en || "").trim();
  const telugu = String(item.name_te || "").trim();
  return normalizeLanguage(language) === "te" ? telugu || english : english || telugu;
}

// Same as getLocalizedMasterName for API rows that send a pair of fields,
// e.g. getLocalizedField(row, "district_name", "te") uses district_name_te, then district_name
export function getLocalizedField(row, field, language) {
  if (!row) return "";
  return getLocalizedMasterName({ name_en: row[field], name_te: row[`${field}_te`] }, language);
}

// Text a searchable list can match on, so both English and Telugu names can be typed
export function getMasterSearchText(item) {
  return [item?.name_en, item?.name_te].filter(Boolean).join(" ");
}

export function getDesignationLabel(value, language) {
  return labelFor("designations", value, language);
}

export function getRoleLabel(value, language) {
  return labelFor("roles", value, language, readableCodeFallback(value, language));
}

export function getRegistrationStatusLabel(value, language) {
  return labelFor("registrationStatuses", value, language);
}

export function getAccountStatusLabel(value, language) {
  return labelFor("accountStatuses", value, language, readableCodeFallback(value, language));
}

// Any code list under labels.<group> (e.g. reviewDecisions, referralStatuses)
export function getCodeLabel(group, value, language) {
  return labelFor(group, value, language);
}

// Patient sex (sex_type values of tbl_patients)
export function getSexLabel(value, language) {
  return labelFor("sexes", value, language);
}

// Patient case stages (case_state values of tbl_screenings)
export function getCaseStateLabel(value, language) {
  return labelFor("caseStates", value, language);
}

export function getAuditStatusLabel(value, language) {
  return labelFor("auditStatuses", value, language);
}

export function getDeliveryStatusLabel(value, language) {
  return labelFor("deliveryStatuses", value, language);
}

export function getDeliveryChannelLabel(value, language) {
  return labelFor("deliveryChannels", value, language);
}

// Unknown events are shown as readable words, e.g. NEW_CUSTOM_EVENT -> "new custom event"
export function getAuditActionLabel(value, language) {
  const code = value === null || value === undefined ? "" : String(value).trim().toUpperCase();
  return labelFor("auditActions", code, language, readableCodeFallback(value, language, true));
}

// resource_type of an audit event, e.g. "registration_request" -> "Registration request"
export function getAuditModuleLabel(value, language) {
  return labelFor("auditModules", value, language);
}

// Codes that have a label, for building dropdowns (e.g. every known role)
export function getLabelCodes(group) {
  return Object.keys(lookup("en", `labels.${group}`) || {});
}

export function formatLocalizedNumber(value, language) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(localeFor(language)) : String(value ?? "");
}

export function formatLocalizedDate(value, language, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeFor(language), options || {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

// The Telugu locale writes the time with the English "AM" / "PM".
// dayPeriod gives Telugu words instead ("ఉదయం", "మధ్యాహ్నం", "రాత్రి"...).
// dayPeriod cannot be combined with dateStyle/timeStyle, so those are spelled out.
function teluguTimeOptions(options) {
  const chosen = { ...options };
  if (chosen.timeStyle) {
    delete chosen.timeStyle;
    chosen.hour = "numeric";
    chosen.minute = "2-digit";
    if (chosen.dateStyle) {
      delete chosen.dateStyle;
      Object.assign(chosen, { year: "numeric", month: "short", day: "numeric" });
    }
  }
  if (chosen.hour && chosen.hour12 !== false && !chosen.hourCycle) chosen.dayPeriod = "short";
  return chosen;
}

export function formatLocalizedDateTime(value, language, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const chosen = options || {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  };
  const isTelugu = normalizeLanguage(language) === "te";
  return new Intl.DateTimeFormat(localeFor(language), isTelugu ? teluguTimeOptions(chosen) : chosen).format(date);
}

// "May" (as sent by the API) -> "May" / "మే"
export function formatLocalizedMonth(monthValue, language) {
  const month = String(monthValue || "").trim();
  return labelFor("months", month.slice(0, 3), language, month);
}

export function formatLocalizedRelativeTime(value, language, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSeconds < 60) return translate(language, "time.justNow");

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return translate(language, "time.minutesAgo", { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(language, "time.hoursAgo", { count: hours });

  const days = Math.floor(hours / 24);
  if (days === 1) return translate(language, "time.yesterday");
  return translate(language, "time.daysAgo", { count: days });
}

// 93784 seconds -> "1d 2h 3m"
export function formatLocalizedUptime(seconds, language) {
  const total = Math.max(0, Number(seconds) || 0);
  return translate(language, "dashboard.uptimeValue", {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
  });
}
