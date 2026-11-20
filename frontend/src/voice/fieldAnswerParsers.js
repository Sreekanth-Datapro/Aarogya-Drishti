/**
 * Parse a single spoken answer for one known receptionist field.
 * Reuses the same value shapes as existing registration / screening forms.
 */

import { getLocalizedMasterName, getLocalizedField } from "../i18n/displayLabels";
import { classifyConfirmation, isSkipIntent } from "./receptionistLocales";

const SEX_ALIASES = [
  { value: "FEMALE", patterns: [/\bfemale\b/i, /\bwoman\b/i, /\bgirl\b/i, /మహిళ/, /స్త్రీ/, /ఆడ/, /महिला/, /स्त्री/] },
  { value: "MALE", patterns: [/\bmale\b/i, /\bman\b/i, /\bboy\b/i, /పురుషుడు/, /మగ/, /पुरुष/, /मर्द/] },
  { value: "OTHER", patterns: [/\bother\b/i, /ఇతర/, /अन्य/] },
  { value: "UNDISCLOSED", patterns: [/\bundisclosed\b/i, /\bprefer not\b/i, /వెల్లడించను/, /చెప్పను/, /नहीं बताना/] },
];

const SYMPTOM_ALIASES = {
  MOUTH_ULCER: ["mouth ulcer", "ulcer", "పుండు", "अल्सर", "मुंह का छाला"],
  WHITE_PATCH: ["white patch", "తెల్లని మచ్చ", "सफेद धब्बा"],
  RED_PATCH: ["red patch", "ఎర్రని మచ్చ", "लाल धब्बा"],
  DIFFICULTY_SWALLOWING: ["difficulty swallowing", "dysphagia", "మింగడం", "निगलने"],
  LIMITED_MOUTH_OPENING: ["limited mouth opening", "trismus", "నోరు తెరవడం", "मुंह खोलने"],
  BLEEDING: ["bleeding", "రక్తస్రావం", "खून"],
  VISIBLE_GROWTH: ["visible growth", "lump", "గడ్డ", "गांठ"],
  NECK_SWELLING: ["neck swelling", "మెడ వాపు", "गर्दन सूजन"],
};

const EXPOSURE_ALIASES = {
  SMOKED_TOBACCO: ["smoked tobacco", "smoking", "cigarette", "beedi", "bidi", "పొగ", "सिगरेट", "बीड़ी"],
  SMOKELESS_TOBACCO: ["smokeless tobacco", "chewing tobacco", "నమలు", "खैनी"],
  GUTKHA: ["gutkha", "gutka", "గుట్కా", "गुटखा"],
  REVERSE_SMOKING: ["reverse smoking", "రివర్స్"],
  ARECA_NUT: ["areca nut", "betel", "paan", "supari", "వక్క", "पान", "सुपारी"],
  ALCOHOL: ["alcohol", "drinking", "liquor", "మద్యం", "शराब", "दारू"],
};

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripNamePrefix(text) {
  return normalizeText(text)
    .replace(/^(?:my name is|i am|i'm|name is|నా పేరు|నేను|मेरा नाम|मेरा नाम है|मैं)\s+/i, "")
    .replace(/[.,;]+$/g, "")
    .trim();
}

function matchSex(text) {
  for (const entry of SEX_ALIASES) {
    if (entry.patterns.some((pattern) => pattern.test(text))) return entry.value;
  }
  return null;
}

function matchAge(text) {
  const patterns = [
    /\bage\s*(?:is|:)?\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|years?|yrs?)\b/i,
    /వయస[ు్]?\s*(\d{1,3})/,
    /(\d{1,3})\s*సం(?:వత్సరా?ల?ు?)?/,
    /उम्र\s*(\d{1,3})/,
    /(\d{1,3})\s*साल/,
    /^\s*(\d{1,3})\s*$/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const age = Number(match[1]);
    if (Number.isInteger(age) && age >= 0 && age <= 120) return String(age);
  }
  return null;
}

function optionNames(item, fieldPrefix) {
  if (fieldPrefix) {
    return [
      getLocalizedField(item, fieldPrefix, "en"),
      getLocalizedField(item, fieldPrefix, "te"),
      item?.[fieldPrefix],
      item?.[`${fieldPrefix}_te`],
    ].filter(Boolean).map((name) => String(name).trim().toLowerCase());
  }
  return [
    getLocalizedMasterName(item, "en"),
    getLocalizedMasterName(item, "te"),
    item?.name_en,
    item?.name_te,
  ].filter(Boolean).map((name) => String(name).trim().toLowerCase());
}

function findOption(text, options, { fieldPrefix, idKey = "id" } = {}) {
  const hay = text.toLowerCase();
  let best = null;
  (options || []).forEach((item) => {
    optionNames(item, fieldPrefix).forEach((name) => {
      if (!name || name.length < 2) return;
      if (!hay.includes(name)) return;
      if (!best || name.length > best.nameLength) {
        best = {
          id: String(item[idKey] ?? item.id),
          display: name,
          nameLength: name.length,
        };
      }
    });
  });
  return best;
}

function parseYesNo(text) {
  const kind = classifyConfirmation(text);
  if (kind === "yes") return true;
  if (kind === "no") return false;
  return null;
}

function noneIntent(text) {
  return /^\s*(none|nothing|no\s+symptoms?|no\s+habits?|ఏమీ\s*లేదు|లేదు|कुछ\s*नहीं|नहीं\s*है)\s*$/i.test(text)
    || isSkipIntent(text);
}

/**
 * @returns {{ ok: boolean, value?: any, displayValue?: string, errorKey?: string, skip?: boolean }}
 */
export function parseRegistrationFieldAnswer(fieldId, transcript, context = {}) {
  const text = normalizeText(transcript);
  if (!text) return { ok: false, errorKey: "unclear" };

  const optional = fieldId === "habitation" || fieldId === "address_line";
  if (optional && isSkipIntent(text)) {
    return { ok: true, skip: true, value: "", displayValue: "" };
  }

  if (fieldId === "full_name") {
    const name = stripNamePrefix(text).slice(0, 150);
    if (name.length < 2) return { ok: false, errorKey: "requiredHint" };
    return { ok: true, value: name, displayValue: name };
  }

  if (fieldId === "sex") {
    const sex = matchSex(text);
    if (!sex) return { ok: false, errorKey: "sexHint" };
    return { ok: true, value: sex, displayValue: sex };
  }

  if (fieldId === "age_years") {
    const age = matchAge(text);
    if (age == null) return { ok: false, errorKey: "ageHint" };
    return { ok: true, value: age, displayValue: age };
  }

  if (fieldId === "preferred_language_id") {
    const languages = context.languages || [];
    const lower = text.toLowerCase();
    let hit = null;
    languages.forEach((item) => {
      if (item.code === "te" && (lower.includes("telugu") || text.includes("తెలుగు") || lower.includes("तेलुगु"))) {
        hit = item;
      } else if (item.code === "en" && (lower.includes("english") || text.includes("ఇంగ్లీష్") || lower.includes("अंग्रेज़ी") || lower.includes("अंग्रेजी"))) {
        hit = item;
      } else if (item.code === "hi" && (lower.includes("hindi") || text.includes("हिन्दी") || text.includes("हिंदी"))) {
        hit = item;
      }
    });
    if (!hit) return { ok: false, errorKey: "unclear" };
    return {
      ok: true,
      value: String(hit.id),
      displayValue: hit.native_name || hit.name_en || hit.code,
    };
  }

  if (fieldId === "mandal_id") {
    const hit = findOption(text, context.mandals || [], { fieldPrefix: "mandal_name", idKey: "mandal_id" });
    if (!hit) return { ok: false, errorKey: "unclear" };
    return { ok: true, value: hit.id, displayValue: hit.display };
  }

  if (fieldId === "village_id") {
    const mandals = context.mandals || [];
    const mandalId = context.answers?.mandal_id || context.form?.mandal_id;
    const mandal = mandals.find((item) => String(item.mandal_id) === String(mandalId)) || mandals[0];
    const hit = findOption(text, mandal?.villages || [], { idKey: "id" });
    if (!hit) return { ok: false, errorKey: "unclear" };
    return { ok: true, value: hit.id, displayValue: hit.display };
  }

  if (fieldId === "facility_id") {
    const mandals = context.mandals || [];
    const mandalId = context.answers?.mandal_id || context.form?.mandal_id;
    const villageId = context.answers?.village_id || context.form?.village_id;
    const mandal = mandals.find((item) => String(item.mandal_id) === String(mandalId)) || mandals[0];
    let facilities = mandal?.facilities || [];
    if (mandal && villageId && mandal.pairs) {
      const allowed = new Set(
        mandal.pairs
          .filter((pair) => String(pair.village_id) === String(villageId))
          .map((pair) => String(pair.facility_id)),
      );
      facilities = facilities.filter((facility) => allowed.has(String(facility.id)));
    }
    const hit = findOption(text, facilities, { idKey: "id" });
    if (!hit) return { ok: false, errorKey: "unclear" };
    return { ok: true, value: hit.id, displayValue: hit.display };
  }

  if (fieldId === "habitation" || fieldId === "address_line") {
    const value = text.slice(0, fieldId === "address_line" ? 500 : 150);
    return { ok: true, value, displayValue: value };
  }

  if (fieldId === "consent_data" || fieldId === "consent_screening" || fieldId === "consent_image") {
    const yn = parseYesNo(text);
    if (yn === null) return { ok: false, errorKey: "yesNoHint" };
    if (fieldId === "consent_data") {
      if (!yn) return { ok: false, errorKey: "requiredHint" };
      return { ok: true, value: true, displayValue: "yes" };
    }
    return { ok: true, value: yn, displayValue: yn ? "yes" : "no" };
  }

  return { ok: false, errorKey: "unclear" };
}

/**
 * Screening single-field parse. Returns form patches shaped for applyScreeningVoiceUpdates
 * plus a display string.
 */
export function parseScreeningFieldAnswer(fieldId, transcript, context = {}) {
  const text = normalizeText(transcript);
  if (!text) return { ok: false, errorKey: "unclear" };

  if (fieldId === "chiefComplaint") {
    const value = text.slice(0, 1000);
    return {
      ok: true,
      value,
      displayValue: value,
      updates: { chiefComplaint: value },
    };
  }

  if (fieldId === "symptoms") {
    if (noneIntent(text)) {
      return {
        ok: true,
        value: {},
        displayValue: "none",
        updates: {},
        clearSymptoms: true,
      };
    }
    const symptoms = (context.symptoms || []).filter((item) => item?.code && item.code !== "PAIN");
    const hay = text.toLowerCase();
    const updates = {};
    const names = [];
    symptoms.forEach((item) => {
      const aliases = SYMPTOM_ALIASES[item.code] || [];
      const labels = [
        getLocalizedMasterName(item, "en"),
        getLocalizedMasterName(item, "te"),
        item.name_en,
        item.name_te,
        ...aliases,
      ].filter(Boolean).map((name) => String(name).toLowerCase());
      if (labels.some((name) => name.length > 1 && hay.includes(name))) {
        updates[`symptoms.${item.code}`] = "yes";
        names.push(item.name_en || item.code);
      }
    });
    if (!names.length) return { ok: false, errorKey: "unclear" };
    return {
      ok: true,
      value: updates,
      displayValue: names.join(", "),
      updates,
    };
  }

  if (fieldId === "exposures") {
    if (context.historyLocked) {
      return { ok: true, skip: true, value: null, displayValue: "" };
    }
    if (noneIntent(text)) {
      return {
        ok: true,
        value: {},
        displayValue: "none",
        updates: {},
        clearExposures: true,
      };
    }
    const exposures = context.exposures || [];
    const hay = text.toLowerCase();
    const updates = {};
    const names = [];
    const isFormer = /\bformer|past|quit|stopped|గతంలో|पहले|छोड़/.test(text);
    const isCurrent = /\bcurrent|still|now|ప్రస్తుతం|अभी|वर्तमान/.test(text) || !isFormer;
    exposures.forEach((item) => {
      const aliases = EXPOSURE_ALIASES[item.code] || [];
      const labels = [
        getLocalizedMasterName(item, "en"),
        getLocalizedMasterName(item, "te"),
        item.name_en,
        item.name_te,
        ...aliases,
      ].filter(Boolean).map((name) => String(name).toLowerCase());
      if (labels.some((name) => name.length > 1 && hay.includes(name))) {
        updates[`exposures.${item.code}`] = "yes";
        updates[`exposures.${item.code}.is_current`] = isCurrent ? "yes" : "no";
        names.push(item.name_en || item.code);
      }
    });
    if (!names.length) return { ok: false, errorKey: "unclear" };
    return {
      ok: true,
      value: updates,
      displayValue: `${names.join(", ")} (${isCurrent ? "current" : "former"})`,
      updates,
    };
  }

  if (fieldId === "conditions") {
    if (context.historyLocked) {
      return { ok: true, skip: true, value: null, displayValue: "" };
    }
    if (noneIntent(text) || isSkipIntent(text)) {
      return { ok: true, value: "", displayValue: "none", updates: { conditions: "" }, skip: true };
    }
    const value = text.slice(0, 1000);
    return { ok: true, value, displayValue: value, updates: { conditions: value } };
  }

  if (fieldId === "pain") {
    const yn = parseYesNo(text);
    if (yn === null) {
      // allow "I have pain" / "no pain"
      if (/\bno\s+pain\b|నొప్పి\s*లేదు|दर्द\s*नहीं/i.test(text)) {
        return {
          ok: true,
          value: false,
          displayValue: "no",
          updates: { "pain.has_pain": "no" },
        };
      }
      if (/\bpain\b|నొప్పి|दर्द/i.test(text)) {
        return {
          ok: true,
          value: true,
          displayValue: "yes",
          updates: { "pain.has_pain": "yes" },
        };
      }
      return { ok: false, errorKey: "yesNoHint" };
    }
    return {
      ok: true,
      value: yn,
      displayValue: yn ? "yes" : "no",
      updates: { "pain.has_pain": yn ? "yes" : "no" },
    };
  }

  if (fieldId === "pain_location") {
    const value = text.slice(0, 300);
    return {
      ok: true,
      value,
      displayValue: value,
      updates: { "pain.has_pain": "yes", "pain.location": value },
    };
  }

  if (fieldId === "pain_duration") {
    const match = text.match(/(\d{1,4})/);
    if (!match) return { ok: false, errorKey: "unclear" };
    const days = String(Number(match[1]));
    if (Number(days) < 0 || Number(days) > 3650) return { ok: false, errorKey: "unclear" };
    return {
      ok: true,
      value: days,
      displayValue: days,
      updates: { "pain.has_pain": "yes", "pain.duration_days": days },
    };
  }

  if (fieldId === "notes") {
    if (isSkipIntent(text) || noneIntent(text)) {
      return { ok: true, skip: true, value: "", displayValue: "", updates: { notes: "" } };
    }
    const value = text.slice(0, 2000);
    return { ok: true, value, displayValue: value, updates: { notes: value } };
  }

  return { ok: false, errorKey: "unclear" };
}
