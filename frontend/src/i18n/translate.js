import translations from "./translations";
import { SERVER_MESSAGES_TE, SERVER_MESSAGE_PATTERNS_TE } from "./serverMessages";

// The one place where text is looked up. LanguageContext (t, tm) and
// displayLabels both use these functions, so there is no second copy of the logic.

export function normalizeLanguage(language) {
  return language === "te" ? "te" : "en";
}

// Looks up "login.title" inside { login: { title: "..." } }
export function lookup(language, key) {
  if (typeof key !== "string" || !key) return undefined;
  return key
    .split(".")
    .reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), translations[normalizeLanguage(language)]);
}

// Replaces {name} placeholders: fillIn("Hello {name}", { name: "Asha" }) -> "Hello Asha"
export function fillIn(text, values) {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined || values[name] === null ? match : String(values[name])));
}

// Text for a translation key in the given language.
// Missing Telugu falls back to English; a missing key returns the key itself.
export function translate(language, key, values) {
  const found = lookup(language, key);
  const text = typeof found === "string" ? found : lookup("en", key);
  return typeof text === "string" ? fillIn(text, values) : key;
}

// Server messages arrive in English. In Telugu mode a known message is
// replaced by its Telugu text; unknown messages are shown unchanged.
export function translateServerMessage(language, message) {
  const text = String(message || "");
  if (normalizeLanguage(language) !== "te") return text;
  if (SERVER_MESSAGES_TE[text]) return SERVER_MESSAGES_TE[text];

  for (const { pattern, te } of SERVER_MESSAGE_PATTERNS_TE) {
    const match = text.match(pattern);
    if (match) return te(...match.slice(1));
  }
  return text;
}

// For messages kept in component state. A message can be:
//   a translation key            "facilities.saveFailed"
//   a key with values            { key: "roleManagement.created", values: { code: "NURSE" } }
//   a message from the server    "Facility not found"
// It is turned into text only when shown, so switching language also
// switches messages that are already on screen.
export function translateMessage(language, message, values) {
  if (!message) return "";
  if (typeof message === "object") return translate(language, message.key, message.values);
  if (typeof lookup("en", message) === "string") return translate(language, message, values);
  return translateServerMessage(language, message);
}

// The server's message for a failed request, or a translation key to show instead.
// Keep the result in state and show it with tm(...).
export function apiMessage(error, fallbackKey) {
  return error?.response?.data?.message || fallbackKey;
}
