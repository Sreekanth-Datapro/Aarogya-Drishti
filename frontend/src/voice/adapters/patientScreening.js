/**
 * Deterministic voice → Patient Screening (Step 3) field mapper.
 * Patient-reported answers only. Never maps consent, oral exam, pain score,
 * diagnosis, AI scores, clinician fields, or submission actions.
 */

import { getLocalizedMasterName } from "../../i18n/displayLabels";

const YES = "yes";
const NO = "no";

const CHIEF_LABELS = [
  "chief complaint",
  "chief complain",
  "presenting complaint",
  "complaint",
  "patient reports",
  "patient says",
  "ప్రధాన ఫిర్యాదు",
  "ఫిర్యాదు",
  "मुख्य शिकायत",
  "शिकायत",
];

const CONDITIONS_LABELS = [
  "other history",
  "other medical history",
  "medical conditions",
  "known conditions",
  "conditions",
  "ఇతర చరిత్ర",
  "ఇతర వైద్య చరిత్ర",
  "अन्य इतिहास",
  "अन्य मेडिकल इतिहास",
];

const NOTES_LABELS = [
  "screening notes",
  "additional notes",
  "notes",
  "నోట్స్",
  "గమనికలు",
  "नोट्स",
  "टिप्पणी",
];

const STOP_WORDS = [
  "symptom", "symptoms", "pain", "exposure", "habit", "habits", "tobacco", "alcohol",
  "notes", "history", "complaint", "chief", "duration", "years", "days",
  "వయస", "నొప్పి", "లక్షణ", "చరిత్ర", "फिर्याद", "दर्द", "लक्षण", "इतिहास",
];

/** Extra EN/HI aliases for master rows that only ship name_en / name_te. */
const SYMPTOM_ALIASES = {
  MOUTH_ULCER: ["mouth ulcer", "non-healing mouth ulcer", "ulcer", "मुंह का छाला", "मुँह का अल्सर", "अल्सर"],
  WHITE_PATCH: ["white patch", "white patches", "सफेद धब्बा", "सफ़ेद दाग"],
  RED_PATCH: ["red patch", "red patches", "लाल धब्बा", "लाल दाग"],
  DIFFICULTY_SWALLOWING: ["difficulty swallowing", "dysphagia", "swallowing difficulty", "निगलने में कठिनाई"],
  LIMITED_MOUTH_OPENING: ["limited mouth opening", "trismus", "cannot open mouth", "मुंह खोलने में तकलीफ", "मुँह कम खुलना"],
  BLEEDING: ["bleeding", "oral bleeding", "खून आना", "रक्तस्राव"],
  VISIBLE_GROWTH: ["visible growth", "lump", "growth", "गांठ", "गड्ढा", "ट्यूमर"],
  NECK_SWELLING: ["neck swelling", "swollen neck", "गर्दन में सूजन", "गर्दन सूजन"],
};

const EXPOSURE_ALIASES = {
  SMOKED_TOBACCO: ["smoked tobacco", "smoking", "cigarette", "cigarettes", "beedi", "bidi", "सिगरेट", "बीड़ी", "धूम्रपान"],
  SMOKELESS_TOBACCO: ["smokeless tobacco", "chewing tobacco", "chew tobacco", "खैनी", "तंबाकू चबाना"],
  GUTKHA: ["gutkha", "gutka", "गुटखा", "गुटका"],
  REVERSE_SMOKING: ["reverse smoking", "రివర్స్ స్మోకింగ్", "रिवर्स स्मोकिंग"],
  ARECA_NUT: ["areca nut", "betel quid", "betel", "paan", "supari", "पान", "सुपारी", "कुल्ला"],
  ALCOHOL: ["alcohol", "drinking", "liquor", "शराब", "मदिरा", "दारू"],
};

const CURRENT_PATTERNS = [
  /\bcurrent(?:ly)?\b/i,
  /\bstill\b/i,
  /\bnow\b/i,
  /ప్రస్తుతం/,
  /ఇప్పుడు/,
  /अभी/,
  /वर्तमान/,
  /वर्तमान में/,
];

const FORMER_PATTERNS = [
  /\bformer(?:ly)?\b/i,
  /\bprevious(?:ly)?\b/i,
  /\bpast\b/i,
  /\bquit\b/i,
  /\bstopped\b/i,
  /\bno longer\b/i,
  /\bused to\b/i,
  /మానేశా?రు/,
  /మానేసా?ను/,
  /గతంలో/,
  /पहले/,
  /छोड़ दिया/,
  /छोड़ चुका/,
  /पहले करता/,
];

const UNKNOWN_STATUS_PATTERNS = [
  /\bunknown\b/i,
  /\bnot sure\b/i,
  /\bunclear\b/i,
  /\bdon't know\b/i,
  /\bdo not know\b/i,
  /తెలియదు/,
  /స్పష్టంగా లేదు/,
  /पता नहीं/,
  /अज्ञात/,
];

const NEGATION_BEFORE = [
  /\b(?:no|not|without|denies|denied|doesn't|does not|don't|do not|never|negative)\b/i,
  /కాదు/,
  /లేదు/,
  /కాకుండా/,
  /నిరాకరించ/,
  /नहीं/,
  /ना/,
  /बिना/,
  /इनकार/,
];

const PAIN_AFFIRM = [
  /\b(?:has|have|having|with)\s+pain\b/i,
  /\bpain\s*(?:is\s+)?(?:yes|present|positive)\b/i,
  /\byes\s*,?\s*pain\b/i,
  /నొప్పి\s*(?:ఉంది|ఉన్నది|ఉన్నాయి)/,
  /నోటిలో\s*నొప్పి/,
  /दर्द\s*(?:है|होता|हो रही)/,
  /मुंह\s*में\s*दर्द/,
];

const PAIN_NEGATE = [
  /\bno\s+pain\b/i,
  /\b(?:does\s+not|doesn't|do\s+not|don't|never)\s+have\s+pain\b/i,
  /\bwithout\s+pain\b/i,
  /\bpain\s*(?:is\s+)?(?:no|absent|negative|none)\b/i,
  /నొప్పి\s*లేదు/,
  /నొప్పి\s*కాదు/,
  /दर्द\s*नहीं/,
  /कोई\s*दर्द\s*नहीं/,
];

const PROTECTED_FIELD_RE = /^(observations\.|pain\.severity$|consent|witness|authorization|diagnosis|referral|signature|ai_|medical_officer|tobacco_current)/i;

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchLabeledText(text, labels, { maxLen = 1000 } = {}) {
  for (const label of labels) {
    const pattern = new RegExp(
      `${escapeRegExp(label)}\\s*(?:is|:|-|है)?\\s*([\\w\\u0C00-\\u0C7F\\u0900-\\u097F .,'-]{2,${Math.min(maxLen, 400)}})`,
      "i",
    );
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    let value = match[1].trim();
    // Stop at sentence / clause boundaries before other screening topics.
    value = value.split(/[।.|]/)[0].trim();
    value = value.replace(/[.,;]+$/g, "").trim();
    const stop = new RegExp(`\\b(?:${STOP_WORDS.map(escapeRegExp).join("|")})\\b`, "i");
    value = value.split(stop)[0].trim();
    // Hindi/Telugu topic shifts often omit Latin word boundaries.
    value = value.split(/(?:सफेद|लाल|दर्द|नोट्स|लक्षण|తెల్లని|ఎర్రని|నొప్పి)/)[0].trim();
    if (value) return value.slice(0, maxLen);
  }
  return null;
}

function optionNames(item, aliases = []) {
  return [
    getLocalizedMasterName(item, "en"),
    getLocalizedMasterName(item, "te"),
    item?.name_en,
    item?.name_te,
    item?.code,
    ...(aliases || []),
  ].filter(Boolean).map((name) => String(name).trim().toLowerCase());
}

function findNamedHits(text, options, aliasMap = {}) {
  const hay = text.toLowerCase();
  const hits = [];
  (options || []).forEach((item) => {
    const code = item?.code;
    if (!code) return;
    const names = optionNames(item, aliasMap[code] || []);
    let bestName = "";
    names.forEach((name) => {
      if (!name || name.length < 2) return;
      if (!hay.includes(name)) return;
      if (name.length > bestName.length) bestName = name;
    });
    if (bestName) {
      const index = hay.indexOf(bestName);
      hits.push({
        code,
        display: item.name_en || bestName,
        name: bestName,
        index,
        end: index + bestName.length,
      });
    }
  });
  // Prefer longer names when overlapping (e.g. chewing tobacco vs tobacco).
  hits.sort((a, b) => b.name.length - a.name.length);
  const accepted = [];
  hits.forEach((hit) => {
    const overlaps = accepted.some((other) => !(hit.end <= other.index || hit.index >= other.end));
    if (!overlaps) accepted.push(hit);
  });
  return accepted.sort((a, b) => a.index - b.index);
}

function windowAround(text, start, end, radius = 40) {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return text.slice(from, to);
}

/** Negation must be in the same clause, immediately before or shortly after the term. */
function isNegatedAt(text, start, end) {
  const left = text.slice(Math.max(0, start - 28), start);
  const rightRaw = text.slice(end, Math.min(text.length, end + 18));
  const right = rightRaw.split(/[।.|]/)[0];
  const leftClause = left.split(/[।.|]/).pop() || left;
  return NEGATION_BEFORE.some((pattern) => pattern.test(leftClause) || pattern.test(right));
}

function exposureStatus(localText) {
  if (UNKNOWN_STATUS_PATTERNS.some((pattern) => pattern.test(localText))) return "unknown";
  if (FORMER_PATTERNS.some((pattern) => pattern.test(localText))) return "former";
  if (CURRENT_PATTERNS.some((pattern) => pattern.test(localText))) return "current";
  // Affirmative use verbs imply current; bare name / duration-only do not.
  if (/\b(?:uses?|using|chews?|chewing|smokes?|smoking|drinks?|drinking|takes?|taking)\b/i.test(localText)
      || /తాగుతా?డు|నమలు|వాడుతా?డు|पीता|चबाता|लेता/.test(localText)) {
    return "current";
  }
  if (/\b(?:yes|present|positive)\b/i.test(localText) || /ఉంది|ఉన్నాయి|है|हाँ/.test(localText)) {
    return "current";
  }
  return "unspecified";
}

function matchDurationDays(localText) {
  const patterns = [
    /(\d{1,4})\s*(?:days?|day)\b/i,
    /(\d{1,4})\s*రోజు(?:లు)?/,
    /(\d{1,4})\s*दिन/,
  ];
  for (const pattern of patterns) {
    const match = localText.match(pattern);
    if (!match) continue;
    const days = Number(match[1]);
    if (Number.isInteger(days) && days >= 0 && days <= 3650) return String(days);
  }
  return null;
}

function matchDurationYears(localText) {
  const patterns = [
    /(\d{1,3}(?:\.\d)?)\s*(?:years?|yrs?)\b/i,
    /(\d{1,3}(?:\.\d)?)\s*సం(?:వత్సరా?ల?ు?)?/,
    /(\d{1,3}(?:\.\d)?)\s*साल/,
  ];
  for (const pattern of patterns) {
    const match = localText.match(pattern);
    if (!match) continue;
    const years = Number(match[1]);
    if (!Number.isFinite(years) || years < 0 || years > 120) continue;
    if (!Number.isInteger(years * 2)) continue;
    return String(years);
  }
  return null;
}

function matchFrequencyPerDay(localText) {
  const patterns = [
    /(\d{1,3})\s*(?:times?\s*(?:a|per)\s*day|per\s*day|\/\s*day|daily)\b/i,
    /(?:రోజుకు|రోజు)\s*(\d{1,3})/,
    /(\d{1,3})\s*సార్లు/,
    /दिन\s*में\s*(\d{1,3})/,
    /(\d{1,3})\s*बार\s*(?:रोज़|दिन)/,
  ];
  for (const pattern of patterns) {
    const match = localText.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 0 && value <= 200) return String(value);
  }
  return null;
}

function pushPatch(patches, patch) {
  if (!patch?.field || PROTECTED_FIELD_RE.test(patch.field)) return;
  const existing = patches.findIndex((item) => item.field === patch.field);
  if (existing >= 0) patches[existing] = patch;
  else patches.push(patch);
}

/**
 * Flat snapshot for VoiceFormAssist / classifyPatches.
 */
export function buildScreeningVoiceForm({
  chiefComplaint = "",
  symptoms = {},
  exposures = {},
  conditions = "",
  pain = {},
  notes = "",
} = {}) {
  const form = {
    chiefComplaint: chiefComplaint || "",
    conditions: conditions || "",
    notes: notes || "",
    "pain.has_pain": pain?.has_pain === true ? YES : NO,
    "pain.location": pain?.location || "",
    "pain.duration_days": pain?.duration_days === 0 || pain?.duration_days
      ? String(pain.duration_days)
      : "",
    "pain.notes": pain?.notes || "",
  };

  Object.keys(symptoms || {}).forEach((code) => {
    form[`symptoms.${code}`] = YES;
    form[`symptoms.${code}.duration_days`] = symptoms[code]?.duration_days === 0 || symptoms[code]?.duration_days
      ? String(symptoms[code].duration_days)
      : "";
  });

  Object.keys(exposures || {}).forEach((code) => {
    form[`exposures.${code}`] = YES;
    form[`exposures.${code}.is_current`] = exposures[code]?.is_current ? YES : NO;
    form[`exposures.${code}.duration_years`] = exposures[code]?.duration_years === 0 || exposures[code]?.duration_years
      ? String(exposures[code].duration_years)
      : "";
    form[`exposures.${code}.frequency_per_day`] = exposures[code]?.frequency_per_day === 0 || exposures[code]?.frequency_per_day
      ? String(exposures[code].frequency_per_day)
      : "";
  });

  return form;
}

/**
 * Apply flat voice updates onto ScreeningFormStep state slices (pure).
 */
export function applyScreeningVoiceUpdates(current, updates = {}) {
  const next = {
    chiefComplaint: current.chiefComplaint,
    symptoms: { ...(current.symptoms || {}) },
    exposures: { ...(current.exposures || {}) },
    conditions: current.conditions,
    pain: { ...(current.pain || {}) },
    notes: current.notes,
  };

  Object.entries(updates || {}).forEach(([field, value]) => {
    if (PROTECTED_FIELD_RE.test(field)) return;
    if (field === "chiefComplaint") {
      next.chiefComplaint = value;
      return;
    }
    if (field === "conditions") {
      next.conditions = value;
      return;
    }
    if (field === "notes") {
      next.notes = value;
      return;
    }
    if (field === "pain.has_pain") {
      if (value === YES) {
        next.pain = { ...next.pain, has_pain: true };
      } else {
        next.pain = { has_pain: false, severity: "", location: "", duration_days: "", notes: "" };
      }
      return;
    }
    if (field === "pain.location") {
      next.pain = { ...next.pain, has_pain: true, location: value };
      return;
    }
    if (field === "pain.duration_days") {
      next.pain = { ...next.pain, has_pain: true, duration_days: value };
      return;
    }
    if (field === "pain.notes") {
      next.pain = { ...next.pain, has_pain: true, notes: value };
      return;
    }

    const symptomPresence = field.match(/^symptoms\.([A-Z0-9_]+)$/);
    if (symptomPresence) {
      const code = symptomPresence[1];
      if (code === "PAIN") return;
      if (value === YES) {
        next.symptoms[code] = next.symptoms[code] || { duration_days: "" };
      } else {
        delete next.symptoms[code];
      }
      return;
    }
    const symptomDuration = field.match(/^symptoms\.([A-Z0-9_]+)\.duration_days$/);
    if (symptomDuration) {
      const code = symptomDuration[1];
      if (code === "PAIN") return;
      next.symptoms[code] = { ...(next.symptoms[code] || { duration_days: "" }), duration_days: value };
      return;
    }

    const exposurePresence = field.match(/^exposures\.([A-Z0-9_]+)$/);
    if (exposurePresence) {
      const code = exposurePresence[1];
      if (value === YES) {
        next.exposures[code] = next.exposures[code] || {
          is_current: false,
          duration_years: "",
          frequency_per_day: "",
        };
      } else {
        delete next.exposures[code];
      }
      return;
    }
    const exposureCurrent = field.match(/^exposures\.([A-Z0-9_]+)\.is_current$/);
    if (exposureCurrent) {
      const code = exposureCurrent[1];
      next.exposures[code] = {
        is_current: value === YES,
        duration_years: next.exposures[code]?.duration_years ?? "",
        frequency_per_day: next.exposures[code]?.frequency_per_day ?? "",
      };
      return;
    }
    const exposureYears = field.match(/^exposures\.([A-Z0-9_]+)\.duration_years$/);
    if (exposureYears) {
      const code = exposureYears[1];
      next.exposures[code] = {
        is_current: next.exposures[code]?.is_current === true,
        duration_years: value,
        frequency_per_day: next.exposures[code]?.frequency_per_day ?? "",
      };
      return;
    }
    const exposureFreq = field.match(/^exposures\.([A-Z0-9_]+)\.frequency_per_day$/);
    if (exposureFreq) {
      const code = exposureFreq[1];
      next.exposures[code] = {
        is_current: next.exposures[code]?.is_current === true,
        duration_years: next.exposures[code]?.duration_years ?? "",
        frequency_per_day: value,
      };
    }
  });

  return next;
}

/**
 * @param {string} transcript
 * @param {object} context
 * @param {object} context.form flat voice form from buildScreeningVoiceForm
 * @param {array} context.symptoms master symptom rows
 * @param {array} context.exposures master exposure rows
 * @param {boolean} context.historyLocked REQUEST_MORE_INFO — skip exposures/conditions
 * @param {string} context.language UI language
 */
export function parsePatientScreeningTranscript(transcript, context = {}) {
  const text = normalizeText(transcript);
  const patches = [];
  const unclear = [];

  if (!text) {
    return { patches, unclear: [{ code: "EMPTY_TRANSCRIPT", messageKey: "voice.noPatches" }] };
  }

  const historyLocked = context.historyLocked === true;
  const symptoms = (context.symptoms || []).filter((item) => item?.code && item.code !== "PAIN");
  const exposures = context.exposures || [];

  const chief = matchLabeledText(text, CHIEF_LABELS, { maxLen: 1000 });
  if (chief) {
    pushPatch(patches, {
      field: "chiefComplaint",
      value: chief,
      labelKey: "screening.chiefComplaint",
      displayValue: chief,
    });
  }

  if (!historyLocked) {
    const conditions = matchLabeledText(text, CONDITIONS_LABELS, { maxLen: 1000 });
    if (conditions) {
      pushPatch(patches, {
        field: "conditions",
        value: conditions,
        labelKey: "screening.otherHistory",
        displayValue: conditions,
      });
    }
  } else if (CONDITIONS_LABELS.some((label) => text.toLowerCase().includes(String(label).toLowerCase()))
      || /medical history|habits|చరిత్ర|इतिहास/i.test(text)) {
    unclear.push({
      code: "HISTORY_LOCKED",
      messageKey: "voice.unclearHint",
      detail: "medical history unchanged for requested information",
    });
  }

  const notes = matchLabeledText(text, NOTES_LABELS, { maxLen: 2000 });
  if (notes) {
    pushPatch(patches, {
      field: "notes",
      value: notes,
      labelKey: "screening.notes",
      displayValue: notes,
    });
  }

  // Pain block (never symptoms.PAIN, never pain.severity)
  if (PAIN_NEGATE.some((pattern) => pattern.test(text))) {
    pushPatch(patches, {
      field: "pain.has_pain",
      value: NO,
      labelKey: "screening.pain",
      displayValue: NO,
    });
  } else if (PAIN_AFFIRM.some((pattern) => pattern.test(text))) {
    pushPatch(patches, {
      field: "pain.has_pain",
      value: YES,
      labelKey: "screening.pain",
      displayValue: YES,
    });
  } else if (/\bpain\b|నొప్పి|दर्द/i.test(text) && !/\bpain\s*score\b|\bseverity\b/i.test(text)) {
    // Ambiguous bare "pain" without yes/no — do not invent.
    unclear.push({ code: "PAIN_UNCLEAR", messageKey: "voice.unclearHint", detail: "pain" });
  }

  if (/\bpain\s*score\b|\bseverity\b\s*\d/i.test(text)) {
    unclear.push({
      code: "PAIN_SCORE_PROTECTED",
      messageKey: "voice.unclearHint",
      detail: "pain score (manual only)",
    });
  }

  const painLocation = matchLabeledText(text, [
    "pain location",
    "location of pain",
    "pain in",
    "నొప్పి స్థానం",
    "दर्द स्थान",
    "दर्द की जगह",
  ], { maxLen: 300 });
  if (painLocation) {
    pushPatch(patches, {
      field: "pain.has_pain",
      value: YES,
      labelKey: "screening.pain",
      displayValue: YES,
    });
    pushPatch(patches, {
      field: "pain.location",
      value: painLocation,
      labelKey: "screening.painLocation",
      displayValue: painLocation,
    });
  }

  const painDurationLocal = text.match(/(?:pain|నొప్పి|दर्द)[^.]{0,40}?(\d{1,4})\s*(?:days?|రోజు|दिन)/i);
  if (painDurationLocal) {
    const days = String(Number(painDurationLocal[1]));
    pushPatch(patches, {
      field: "pain.has_pain",
      value: YES,
      labelKey: "screening.pain",
      displayValue: YES,
    });
    pushPatch(patches, {
      field: "pain.duration_days",
      value: days,
      labelKey: "screening.painDuration",
      displayValue: days,
    });
  }

  const painNotes = matchLabeledText(text, ["pain notes", "pain details", "నొప్పి వివరాలు", "दर्द विवरण"], { maxLen: 500 });
  if (painNotes) {
    pushPatch(patches, {
      field: "pain.has_pain",
      value: YES,
      labelKey: "screening.pain",
      displayValue: YES,
    });
    pushPatch(patches, {
      field: "pain.notes",
      value: painNotes,
      labelKey: "screening.painNotes",
      displayValue: painNotes,
    });
  }

  // Patient-reported symptoms (exclude PAIN master code)
  findNamedHits(text, symptoms, SYMPTOM_ALIASES).forEach((hit) => {
    const local = windowAround(text, hit.index, hit.end);
    if (isNegatedAt(text, hit.index, hit.end)) {
      pushPatch(patches, {
        field: `symptoms.${hit.code}`,
        value: "",
        labelKey: "screening.patientReportedSymptoms",
        displayValue: `${hit.display}: no`,
      });
      return;
    }
    if (/\bunknown\b|తెలియదు|पता नहीं/i.test(local)) {
      unclear.push({ code: "SYMPTOM_UNKNOWN", messageKey: "voice.unclearHint", detail: hit.code });
      return;
    }
    pushPatch(patches, {
      field: `symptoms.${hit.code}`,
      value: YES,
      labelKey: "screening.patientReportedSymptoms",
      displayValue: hit.display,
    });
    const days = matchDurationDays(local);
    if (days != null) {
      pushPatch(patches, {
        field: `symptoms.${hit.code}.duration_days`,
        value: days,
        labelKey: "screening.days",
        displayValue: `${hit.display}: ${days}`,
      });
    }
  });

  // Exposures / habits
  if (historyLocked) {
    const exposureHits = findNamedHits(text, exposures, EXPOSURE_ALIASES);
    if (exposureHits.length) {
      unclear.push({
        code: "HISTORY_LOCKED",
        messageKey: "voice.unclearHint",
        detail: "exposures unchanged for requested information",
      });
    }
  } else {
    findNamedHits(text, exposures, EXPOSURE_ALIASES).forEach((hit) => {
      const local = windowAround(text, hit.index, hit.end, 48);
      if (isNegatedAt(text, hit.index, hit.end)) {
        pushPatch(patches, {
          field: `exposures.${hit.code}`,
          value: "",
          labelKey: "screening.medicalHistory",
          displayValue: `${hit.display}: no`,
        });
        return;
      }

      const status = exposureStatus(local);
      if (status === "unknown") {
        unclear.push({ code: "EXPOSURE_UNKNOWN", messageKey: "voice.unclearHint", detail: hit.code });
        return;
      }

      const years = matchDurationYears(local);
      const frequency = matchFrequencyPerDay(local);

      if (status === "unspecified") {
        // Duration alone (or bare name) must not invent current/former.
        if (years != null || frequency != null) {
          unclear.push({
            code: "EXPOSURE_STATUS_UNCLEAR",
            messageKey: "voice.unclearHint",
            detail: `${hit.code} status (current/former)`,
          });
          // Apply duration only if exposure already selected on the form.
          if (context.form?.[`exposures.${hit.code}`] === YES) {
            if (years != null) {
              pushPatch(patches, {
                field: `exposures.${hit.code}.duration_years`,
                value: years,
                labelKey: "screening.years",
                displayValue: `${hit.display}: ${years}`,
              });
            }
            if (frequency != null) {
              pushPatch(patches, {
                field: `exposures.${hit.code}.frequency_per_day`,
                value: frequency,
                labelKey: "screening.perDay",
                displayValue: `${hit.display}: ${frequency}`,
              });
            }
          }
        } else {
          unclear.push({
            code: "EXPOSURE_STATUS_UNCLEAR",
            messageKey: "voice.unclearHint",
            detail: `${hit.code} status (current/former)`,
          });
        }
        return;
      }

      pushPatch(patches, {
        field: `exposures.${hit.code}`,
        value: YES,
        labelKey: "screening.medicalHistory",
        displayValue: hit.display,
      });
      pushPatch(patches, {
        field: `exposures.${hit.code}.is_current`,
        value: status === "current" ? YES : NO,
        labelKey: "screening.current",
        displayValue: status === "current" ? YES : "former",
      });
      if (years != null) {
        pushPatch(patches, {
          field: `exposures.${hit.code}.duration_years`,
          value: years,
          labelKey: "screening.years",
          displayValue: `${hit.display}: ${years}`,
        });
      }
      if (frequency != null) {
        pushPatch(patches, {
          field: `exposures.${hit.code}.frequency_per_day`,
          value: frequency,
          labelKey: "screening.perDay",
          displayValue: `${hit.display}: ${frequency}`,
        });
      }
    });
  }

  // Protected clinical / oral exam mentions → unclear, never patches
  if (/\b(?:cheek lining|tongue|palate|gums|floor of mouth|oral observation|observation)\b|బుగ్గ|నాలుక|అంగిలి|గమ్|गाल|जीभ|तालु/i.test(text)
      && /observ|exam|site|lining|patch on|seen|visible on/i.test(text)) {
    unclear.push({
      code: "ORAL_EXAM_PROTECTED",
      messageKey: "voice.unclearHint",
      detail: "oral examination (manual only)",
    });
  }

  if (/\bconsent\b|\bwitness\b|\bauthorization\b|సమ్మతి|సాక్షి|सहमति|गवाह/i.test(text)) {
    unclear.push({
      code: "CONSENT_PROTECTED",
      messageKey: "voice.unclearHint",
      detail: "consent (manual only)",
    });
  }

  if (/\bdiagnos|\breferral\b|\brisk score\b|\bai\s+score\b|medical officer|clinician approval|వైద్య నిర్ధారణ|निदान/i.test(text)) {
    unclear.push({
      code: "CLINICAL_PROTECTED",
      messageKey: "voice.unclearHint",
      detail: "diagnosis/clinician fields (manual only)",
    });
  }

  // Strip any accidental protected patches
  const safePatches = patches.filter((patch) => !PROTECTED_FIELD_RE.test(patch.field)
    && patch.field !== "pain.severity"
    && !patch.field.startsWith("observations.")
    && patch.field !== "symptoms.PAIN");

  if (!safePatches.length && !unclear.length) {
    unclear.push({ code: "NO_MATCH", messageKey: "voice.noPatches" });
  }

  return { patches: safePatches, unclear };
}

export const PATIENT_SCREENING_VOICE_FIELDS = [
  "chiefComplaint",
  "conditions",
  "notes",
  "pain.has_pain",
  "pain.location",
  "pain.duration_days",
  "pain.notes",
  // Dynamic: symptoms.<CODE>, symptoms.<CODE>.duration_days,
  // exposures.<CODE>, exposures.<CODE>.is_current, duration_years, frequency_per_day
];
