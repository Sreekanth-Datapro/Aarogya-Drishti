/**
 * Deterministic voice → Patient Registration field mapper.
 * Does not invent IDs. Does not touch consents. Clinical forms are out of scope.
 */

import { getLocalizedMasterName, getLocalizedField } from "../../i18n/displayLabels";

const SEX_ALIASES = [
  { value: "FEMALE", patterns: [/\bfemale\b/i, /\bwoman\b/i, /\bgirl\b/i, /మహిళ/, /స్త్రీ/, /ఆడ/, /महिला/, /स्त्री/] },
  { value: "MALE", patterns: [/\bmale\b/i, /\bman\b/i, /\bboy\b/i, /పురుషుడు/, /మగ/, /पुरुष/, /मर्द/] },
  { value: "OTHER", patterns: [/\bother\b/i, /ఇతర/, /अन्य/] },
  { value: "UNDISCLOSED", patterns: [/\bundisclosed\b/i, /\bprefer not\b/i, /వెల్లడించను/, /नहीं बताना/] },
];

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function matchSex(text) {
  for (const entry of SEX_ALIASES) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.value;
    }
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
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const age = Number(match[1]);
    if (Number.isInteger(age) && age >= 0 && age <= 120) return String(age);
  }
  return null;
}

function matchLabeledText(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*(?:is|:|-)?\\s*([\\w\\u0C00-\\u0C7F\\u0900-\\u097F .'-]{2,80})`, "i");
    const match = text.match(pattern);
    if (match?.[1]) {
      let value = match[1].trim();
      value = value.replace(/[.,;]+$/g, "").trim();
      // Stop at common next-field keywords
      value = value.split(/\b(?:age|sex|male|female|village|mandal|facility|habitation|address|వయస|లింగం|గ్రామం|మండలం)\b/i)[0].trim();
      if (value) return value.slice(0, 150);
    }
  }
  return null;
}

function optionNames(item, language, fieldPrefix) {
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

function findOption(text, options, { language, fieldPrefix, idKey = "id" } = {}) {
  const hay = text.toLowerCase();
  let best = null;
  (options || []).forEach((item) => {
    const names = optionNames(item, language, fieldPrefix);
    names.forEach((name) => {
      if (!name || name.length < 2) return;
      if (!hay.includes(name)) return;
      if (!best || name.length > best.nameLength) {
        best = {
          id: String(item[idKey] ?? item.id),
          display: names[0] || name,
          nameLength: name.length,
        };
      }
    });
  });
  return best;
}

/**
 * @param {string} transcript
 * @param {object} context
 * @param {object} context.form current form values
 * @param {array} context.mandals assigned mandals with villages/facilities
 * @param {array} context.languages language master rows
 * @param {string} context.language UI language
 */
export function parsePatientRegistrationTranscript(transcript, context = {}) {
  const text = normalizeText(transcript);
  const patches = [];
  const unclear = [];

  if (!text) {
    return { patches, unclear: [{ code: "EMPTY_TRANSCRIPT", messageKey: "voice.noPatches" }] };
  }

  const name = matchLabeledText(text, [
    "name",
    "patient name",
    "full name",
    "పేరు",
    "రోగి పేరు",
    "नाम",
    "मरीज का नाम",
  ]);
  if (name) {
    patches.push({
      field: "full_name",
      value: name,
      labelKey: "patientRegistration.fullName",
      displayValue: name,
    });
  }

  const sex = matchSex(text);
  if (sex) {
    patches.push({
      field: "sex",
      value: sex,
      labelKey: "patientRegistration.sex",
      displayValue: sex,
    });
  } else if (/\bsex\b|లింగం|लिंग/i.test(text)) {
    unclear.push({ code: "SEX_UNCLEAR", messageKey: "voice.unclearHint", detail: "sex" });
  }

  const age = matchAge(text);
  if (age != null) {
    patches.push({
      field: "age_years",
      value: age,
      labelKey: "patientRegistration.age",
      displayValue: age,
    });
  }

  const habitation = matchLabeledText(text, ["habitation", "colony", "హాబిటేషన్", "habitacion", "बस्ती"]);
  if (habitation) {
    patches.push({
      field: "habitation",
      value: habitation,
      labelKey: "patientRegistration.habitation",
      displayValue: habitation,
    });
  }

  const address = matchLabeledText(text, ["address", "చిరునామా", "पता"]);
  if (address) {
    patches.push({
      field: "address_line",
      value: address.slice(0, 500),
      labelKey: "patientRegistration.address",
      displayValue: address.slice(0, 500),
    });
  }

  const mandals = context.mandals || [];
  const language = context.language || "en";

  if (/\bmandal\b|మండలం|मंडल/i.test(text)) {
    const mandalHit = findOption(text, mandals, {
      language,
      fieldPrefix: "mandal_name",
      idKey: "mandal_id",
    });
    if (mandalHit) {
      patches.push({
        field: "mandal_id",
        value: mandalHit.id,
        labelKey: "patientRegistration.mandal",
        displayValue: mandalHit.display,
      });
    } else {
      unclear.push({ code: "MANDAL_UNCLEAR", messageKey: "voice.unclearHint", detail: "mandal" });
    }
  }

  const selectedMandalId = patches.find((item) => item.field === "mandal_id")?.value
    || context.form?.mandal_id
    || (mandals.length === 1 ? String(mandals[0].mandal_id) : "");
  const selectedMandal = mandals.find((item) => String(item.mandal_id) === String(selectedMandalId));

  if (/\bvillage\b|గ్రామం|गाँव|गांव/i.test(text)) {
    const villages = selectedMandal?.villages || [];
    const villageHit = findOption(text, villages, { language, idKey: "id" });
    if (villageHit) {
      patches.push({
        field: "village_id",
        value: villageHit.id,
        labelKey: "patientRegistration.village",
        displayValue: villageHit.display,
      });
    } else {
      unclear.push({ code: "VILLAGE_UNCLEAR", messageKey: "voice.unclearHint", detail: "village" });
    }
  }

  const villageId = patches.find((item) => item.field === "village_id")?.value || context.form?.village_id;
  if (/\bfacility\b|\bphc\b|\bhospital\b|సౌకర్యం|కేంద్రం|अस्पताल|केंद्र/i.test(text)) {
    let facilities = selectedMandal?.facilities || [];
    if (selectedMandal && villageId && selectedMandal.pairs) {
      const allowed = new Set(
        selectedMandal.pairs
          .filter((pair) => String(pair.village_id) === String(villageId))
          .map((pair) => String(pair.facility_id)),
      );
      facilities = facilities.filter((facility) => allowed.has(String(facility.id)));
    }
    const facilityHit = findOption(text, facilities, { language, idKey: "id" });
    if (facilityHit) {
      patches.push({
        field: "facility_id",
        value: facilityHit.id,
        labelKey: "patientRegistration.facility",
        displayValue: facilityHit.display,
      });
    } else {
      unclear.push({ code: "FACILITY_UNCLEAR", messageKey: "voice.unclearHint", detail: "facility" });
    }
  }

  // Prefer language mention only when explicit — do not invent.
  if (/\b(?:preferred\s+)?language\b|భాష|भाषा/i.test(text)) {
    const languages = context.languages || [];
    const lower = text.toLowerCase();
    let langHit = null;
    languages.forEach((item) => {
      const codes = [item.code, item.native_name, item.name_en].filter(Boolean).map((v) => String(v).toLowerCase());
      if (item.code === "te" && (lower.includes("telugu") || text.includes("తెలుగు"))) {
        langHit = item;
      } else if (item.code === "en" && lower.includes("english")) {
        langHit = item;
      } else if (codes.some((code) => code.length > 1 && lower.includes(code))) {
        langHit = item;
      }
    });
    if (langHit) {
      patches.push({
        field: "preferred_language_id",
        value: String(langHit.id),
        labelKey: "patientRegistration.preferredLanguage",
        displayValue: langHit.native_name || langHit.name_en || langHit.code,
      });
    } else {
      unclear.push({ code: "LANGUAGE_UNCLEAR", messageKey: "voice.unclearHint", detail: "language" });
    }
  }

  if (!patches.length && !unclear.length) {
    unclear.push({ code: "NO_MATCH", messageKey: "voice.noPatches" });
  }

  return { patches, unclear };
}

export const PATIENT_REGISTRATION_VOICE_FIELDS = [
  "full_name",
  "sex",
  "age_years",
  "preferred_language_id",
  "mandal_id",
  "village_id",
  "facility_id",
  "habitation",
  "address_line",
];
