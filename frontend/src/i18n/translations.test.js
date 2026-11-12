import fs from "fs";
import path from "path";
import translations from "./translations";
import { SERVER_MESSAGES_TE, SERVER_MESSAGE_PATTERNS_TE } from "./serverMessages";
import { lookup, translateMessage, translateServerMessage } from "./translate";

const SRC = path.join(__dirname, "..");
const BACKEND = path.join(__dirname, "..", "..", "..", "backend");

// Words that may appear inside Telugu text: abbreviations, product names and
// technical identifiers that are written the same way in Telugu UI text.
const ALLOWED_IN_TELUGU = new Set([
  "AI", "ANM", "API", "ASHA", "CHC", "CHO", "CT", "ENT", "HTTP", "ID", "IP", "LGD", "MFA", "MRI",
  "MSG91", "OTP", "PHC", "PHCs", "PIN", "QR",   "SMS", "SMTP", "ST", "HTTPS", "Google", "Microsoft", "Authenticator", "latha",
  "GM", // part of the example facility code PHC-GM-01
  "JPG", "PNG", "WEBP", "MB", "KB", // photo file formats and sizes, as shown on the phone
]);

function flatten(node, prefix = "", out = {}) {
  Object.entries(node).forEach(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  });
  return out;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ["node_modules", "tests"].includes(entry.name) ? [] : sourceFiles(full);
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const en = flatten(translations.en);
const te = flatten(translations.te);

test("English and Telugu have exactly the same keys", () => {
  const missingInTelugu = Object.keys(en).filter((key) => !(key in te));
  const missingInEnglish = Object.keys(te).filter((key) => !(key in en));
  expect(missingInTelugu).toEqual([]);
  expect(missingInEnglish).toEqual([]);
});

test("no Telugu text is empty or contains stray English words", () => {
  const problems = [];
  Object.entries(te).forEach(([key, text]) => {
    if (typeof text !== "string" || !text.trim()) problems.push(`${key}: empty`);
    const words = String(text).replace(/\{\w+\}/g, "").match(/[A-Za-z][A-Za-z0-9]*/g) || [];
    const stray = words.filter((word) => !ALLOWED_IN_TELUGU.has(word));
    // Abbreviation-only labels (e.g. "SMS", "API") are the same in both languages on purpose
    if (stray.length) problems.push(`${key}: ${stray.join(", ")}`);
  });
  expect(problems).toEqual([]);
});

test("every translation key written in the source code exists", () => {
  const namespaces = Object.keys(translations.en).join("|");
  const keyPattern = new RegExp(`["'\`]((?:${namespaces})\\.[A-Za-z0-9_.]+?)(\\.?\\$\\{|["'\`])`, "g");
  const missing = [];

  sourceFiles(SRC).forEach((file) => {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(keyPattern)) {
      const [, key, end] = match;
      const found = lookup("en", key);
      // `facilities.types.${type}` -> the prefix must be a group of texts
      const ok = end.startsWith(".$") || end === "${" ? found && typeof found === "object" : typeof found === "string";
      if (!ok) missing.push(`${path.relative(SRC, file)}: ${key}`);
    }
  });

  expect(missing).toEqual([]);
});

test("every fixed message the backend sends has a Telugu translation", () => {
  if (!fs.existsSync(BACKEND)) return;

  const messagePattern = /(?:HttpError\(\s*\d+,\s*|message:\s*|limiter\(\d+,\s*|return\s+"|result\(\w+,\s*"[A-Z_]+",\s*|failure\("[A-Z_]+",\s*|error:\s*)"([^"]{6,})"/g;
  const missing = new Set();

  sourceFiles(BACKEND).forEach((file) => {
    const text = fs.readFileSync(file, "utf8");
    for (const [, message] of text.matchAll(messagePattern)) {
      if (!/^[A-Z]/.test(message) || /^[A-Z_]+$/.test(message)) continue;
      if (translateServerMessage("te", message) === message) missing.add(message);
    }
  });

  expect([...missing]).toEqual([]);
});

test("server messages with a changing part keep that part unchanged", () => {
  expect(translateServerMessage("te", "Username 'asha.worker' is already in use by another user account"))
    .toContain("'asha.worker'");
  expect(translateServerMessage("te", "LGD service error (HTTP 503)")).toContain("503");
  expect(SERVER_MESSAGE_PATTERNS_TE.length).toBeGreaterThan(0);
});

test("messages are shown in the current language and unknown server text is kept", () => {
  expect(translateMessage("en", "Facility not found")).toBe("Facility not found");
  expect(translateMessage("te", "Facility not found")).toBe(SERVER_MESSAGES_TE["Facility not found"]);
  expect(translateMessage("en", "facilities.saveFailed")).toBe("Could not save the facility.");
  expect(translateMessage("te", "facilities.saveFailed")).toBe("ఆరోగ్య కేంద్రాన్ని సేవ్ చేయలేకపోయాం.");
  expect(translateMessage("te", { key: "roleManagement.created", values: { code: "NURSE" } })).toContain("NURSE");
  expect(translateMessage("te", "Some brand new server error")).toBe("Some brand new server error");
});
