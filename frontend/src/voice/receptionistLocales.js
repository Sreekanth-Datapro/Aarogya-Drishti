/** Receptionist speech locales (independent of app UI language normalize). */

export const RECEPTIONIST_LOCALES = [
  { code: "en", bcp47: "en-IN", label: "English", nativeLabel: "English" },
  { code: "te", bcp47: "te-IN", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "hi", bcp47: "hi-IN", label: "Hindi", nativeLabel: "हिन्दी" },
];

export function normalizeReceptionistLocale(code) {
  const raw = String(code || "").trim().toLowerCase();
  if (raw === "te" || raw === "te-in") return "te";
  if (raw === "hi" || raw === "hi-in") return "hi";
  return "en";
}

export function receptionistBcp47(locale) {
  const code = normalizeReceptionistLocale(locale);
  return RECEPTIONIST_LOCALES.find((item) => item.code === code)?.bcp47 || "en-IN";
}

const YES_PATTERNS = [
  /^\s*(yes|yeah|yep|correct|right|ok|okay|confirm|confirmed)\s*[.!?]?\s*$/i,
  /^\s*(అవును|సరే|సరిపోయింది|ఒప్పు|కరెక్ట్)\s*[.!]?\s*$/,
  /^\s*(हाँ|हां|जी|सही|ठीक|ठीक है|صحیح)\s*[.!]?\s*$/,
];

const NO_PATTERNS = [
  /^\s*(no|nope|wrong|incorrect|not\s+correct|change|edit|correct\s+it)\s*[.!?]?\s*$/i,
  /^\s*(కాదు|తప్పు|మార్చు|సరిదిద్దు)\s*[.!]?\s*$/,
  /^\s*(नहीं|ना|गलत|सुधारो|बदलो)\s*[.!]?\s*$/,
];

const REPEAT_PATTERNS = [
  /\b(repeat|say\s+again|ask\s+again)\b/i,
  /మళ్లీ|మరొకసారి|మళ్ళీ చెప్పు/,
  /दोहराओ|फिर से|फिर से पूछो/,
];

const SKIP_PATTERNS = [
  /^\s*(skip|pass|next|none|nothing|no\s+idea)\s*[.!?]?\s*$/i,
  /^\s*(దాటవేయి|వదిలేయి|లేదు|ఏమీ లేదు)\s*[.!]?\s*$/,
  /^\s*(छोड़ो|स्किप|कुछ नहीं|नहीं है)\s*[.!]?\s*$/,
];

export function classifyConfirmation(transcript) {
  const text = String(transcript || "").trim();
  if (!text) return "empty";
  if (YES_PATTERNS.some((pattern) => pattern.test(text))) return "yes";
  if (NO_PATTERNS.some((pattern) => pattern.test(text))) return "no";
  if (REPEAT_PATTERNS.some((pattern) => pattern.test(text))) return "repeat";
  if (SKIP_PATTERNS.some((pattern) => pattern.test(text))) return "skip";
  // Soft yes/no contained in longer phrases
  if (/\b(yes|correct|right)\b/i.test(text) || /అవును|हाँ|हां/.test(text)) return "yes";
  if (/\b(no|wrong|incorrect)\b/i.test(text) || /కాదు|नहीं/.test(text)) return "no";
  return "unclear";
}

export function isSkipIntent(transcript) {
  return classifyConfirmation(transcript) === "skip"
    || SKIP_PATTERNS.some((pattern) => pattern.test(String(transcript || "").trim()));
}
