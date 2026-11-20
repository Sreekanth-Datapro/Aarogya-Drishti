/**
 * Build a spoken page explanation for Health Worker routes.
 * Combines static purpose text with safe, visible page content.
 * Never reads patient names, phone numbers, or clinical PHI.
 */

import { getHwPagePurposeText } from "./voicePageGuide";

const SKIP_BUTTON = /^(voice\s*on|voice\s*off|voice\s*command|en|తెలుగు|english|open menu|open notifications|show password|hide password|refresh|back|stop|mute|unmute|repeat question|speak answer|use typed answer)$/i;
const PATIENT_CODE = /\bAD-\d{4}-\d+\b/i;
const PHONE_LIKE = /(\+?\d[\d\s-]{8,}\d)/;
const PATIENT_ROW = /·\s*\d{1,3}\s*·|screening consent|awaiting|recapture/i;
const SKIP_HEADING = /^(aarogya drishti|coming next)$/i;

function visibleText(el) {
  if (!el || el.closest?.("[aria-hidden='true']")) return "";
  const style = typeof window !== "undefined" && window.getComputedStyle
    ? window.getComputedStyle(el)
    : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return "";
  return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

function looksLikePhi(text) {
  const t = String(text || "");
  if (!t) return true;
  if (PATIENT_CODE.test(t)) return true;
  if (PHONE_LIKE.test(t)) return true;
  if (PATIENT_ROW.test(t) && t.length > 24) return true;
  // Long person-like "Name Age Sex Village" rows
  if (/\b(male|female|other)\b/i.test(t) && /\d{1,3}/.test(t) && t.includes("·")) return true;
  return false;
}

function uniquePush(list, value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < 2) return;
  if (looksLikePhi(text)) return;
  if (list.some((item) => item.toLowerCase() === text.toLowerCase())) return;
  if (list.length >= max) return;
  list.push(text);
}

function findMainRoot(doc) {
  return doc.querySelector("main")
    || doc.querySelector(".app-content")
    || doc.querySelector(".page-content")
    || doc.querySelector("#root")
    || doc.body;
}

/**
 * Collect safe visible snippets from the current document.
 */
export function collectVisiblePageHints(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) {
    return { title: "", subtitle: "", headings: [], stats: [], fields: [], actions: [] };
  }

  const root = findMainRoot(doc);
  const title = visibleText(root.querySelector(".page-title"))
    || visibleText(root.querySelector("h1.scr-step-title"))
    || "";
  // Prefer page-title; avoid reading personalised greeting with full name when possible.
  let safeTitle = title;
  if (/namaste|నమస్తే|नमस्ते/i.test(safeTitle)) {
    safeTitle = "";
  }

  const subtitle = visibleText(root.querySelector(".page-subtitle"));

  const headings = [];
  root.querySelectorAll("h2, h3, .district-card-title, .scr-step-title").forEach((el) => {
    const text = visibleText(el);
    if (SKIP_HEADING.test(text)) return;
    if (el.closest(".global-voice-header, .global-voice-session, .sidebar, nav, header")) return;
    uniquePush(headings, text, 8);
  });

  const stats = [];
  root.querySelectorAll(".stat-card").forEach((card) => {
    const label = visibleText(card.querySelector(".stat-label"));
    const value = visibleText(card.querySelector(".stat-value"));
    if (!label || !value) return;
    if (looksLikePhi(label) || looksLikePhi(value)) return;
    // Values should be numeric / short counts only
    if (!/^[\d.,%]+$/.test(value.replace(/\s/g, ""))) return;
    uniquePush(stats, `${label}: ${value}`, 8);
  });

  // Dashboard "today" chip
  const todayBox = root.querySelector(".hw-hero-today");
  if (todayBox) {
    const todayText = visibleText(todayBox);
    if (todayText && !looksLikePhi(todayText) && /\d/.test(todayText)) {
      uniquePush(stats, todayText, 8);
    }
  }

  const fields = [];
  root.querySelectorAll("legend, label.scr-label, .scr-section legend").forEach((el) => {
    if (el.closest(".global-voice-session, .voice-receptionist")) return;
    const text = visibleText(el);
    if (!text || text.length > 80) return;
    uniquePush(fields, text, 10);
  });
  // Required markers on labels
  root.querySelectorAll("label").forEach((el) => {
    if (el.closest(".global-voice-session, .voice-receptionist, .sidebar, nav, header")) return;
    const text = visibleText(el);
    if (!text || text.length > 60) return;
    if (!/\*|required|తప్పనిసరి|आवश्यक/i.test(text)) return;
    uniquePush(fields, text, 10);
  });

  const actions = [];
  root.querySelectorAll("a.btn, button.btn, button.btn-primary, a.btn-primary").forEach((el) => {
    if (el.closest(".global-voice-header, .global-voice-session, .sidebar, nav.topbar, header.topbar")) return;
    const text = visibleText(el);
    if (!text || SKIP_BUTTON.test(text)) return;
    if (looksLikePhi(text)) return;
    uniquePush(actions, text, 8);
  });

  return {
    title: safeTitle && !looksLikePhi(safeTitle) ? safeTitle : "",
    subtitle: subtitle && !looksLikePhi(subtitle) ? subtitle : "",
    headings,
    stats,
    fields,
    actions,
  };
}

function joinLocaleParts(locale, parts) {
  const code = String(locale || "en").startsWith("te") ? "te" : (String(locale || "").startsWith("hi") ? "hi" : "en");
  const filtered = parts.filter(Boolean);
  if (code === "te") return filtered.join(" ");
  if (code === "hi") return filtered.join(" ");
  return filtered.join(" ");
}

/**
 * Full spoken explanation for the current Health Worker page.
 */
export function buildHwPageExplanation(pathname, locale, doc = typeof document !== "undefined" ? document : null) {
  const purpose = getHwPagePurposeText(pathname, locale);
  if (!purpose) return null;

  const hints = collectVisiblePageHints(doc);
  const parts = [purpose.text];

  if (hints.title && !purpose.text.toLowerCase().includes(hints.title.toLowerCase().slice(0, 12))) {
    parts.push(locale?.startsWith?.("te") || locale === "te"
      ? `పేజీ శీర్షిక: ${hints.title}.`
      : locale === "hi"
        ? `पेज शीर्षक: ${hints.title}.`
        : `Page title: ${hints.title}.`);
  }

  if (hints.subtitle) {
    parts.push(hints.subtitle.endsWith(".") ? hints.subtitle : `${hints.subtitle}.`);
  }

  if (hints.stats.length) {
    const label = locale === "te" || locale?.startsWith?.("te")
      ? "కనిపించే గణాంకాలు:"
      : locale === "hi"
        ? "दिखाई देने वाले आँकड़े:"
        : "Visible statistics:";
    parts.push(`${label} ${hints.stats.join(". ")}.`);
  }

  if (hints.headings.length) {
    const label = locale === "te" || locale?.startsWith?.("te")
      ? "ముఖ్య విభాగాలు:"
      : locale === "hi"
        ? "मुख्य खंड:"
        : "Main sections:";
    parts.push(`${label} ${hints.headings.slice(0, 6).join("; ")}.`);
  }

  if (hints.fields.length) {
    const label = locale === "te" || locale?.startsWith?.("te")
      ? "ఫారం ఫీల్డులు:"
      : locale === "hi"
        ? "फ़ॉर्म फ़ील्ड:"
        : "Form fields on this page:";
    parts.push(`${label} ${hints.fields.slice(0, 8).join("; ")}.`);
  }

  if (hints.actions.length) {
    const label = locale === "te" || locale?.startsWith?.("te")
      ? "అందుబాటులో ఉన్న చర్యలు:"
      : locale === "hi"
        ? "उपलब्ध क्रियाएँ:"
        : "Available actions:";
    parts.push(`${label} ${hints.actions.slice(0, 6).join("; ")}.`);
  }

  const text = joinLocaleParts(locale, parts).replace(/\s+/g, " ").trim();
  return {
    id: purpose.id,
    text,
    hints,
  };
}

/** Detect "read this page again" style commands. */
export function isReadPageAgainCommand(transcript) {
  const text = String(transcript || "").trim();
  if (!text) return false;
  if (/\b(read|explain|describe)\s+(this\s+)?page(\s+again)?\b/i.test(text)) return true;
  if (/\bread\s+(the\s+)?page\s+again\b/i.test(text)) return true;
  if (/\bexplain\s+(this\s+)?page\b/i.test(text)) return true;
  if (/పేజీ\s*(ని\s*)?(మళ్లీ\s*)?చదువు|మళ్లీ\s*చదువు|పేజీ\s*వివరించు/.test(text)) return true;
  if (/पेज\s*(फिर\s*)?पढ़ो|फिर\s*से\s*पढ़ो|पेज\s*समझाओ/.test(text)) return true;
  return false;
}
