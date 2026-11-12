import * as Sanscript from "@indic-transliteration/sanscript";

const CORRECTION_STORAGE_KEY = "patient_telugu_name_corrections";

const COMMON_NAME_TRANSLITERATIONS = {
  sreekanth: "శ్రీకాంత్",
  ramesh: "రమేష్",
  lakshmi: "లక్ష్మి",
  sravani: "శ్రావణి",
};

const ITRANS_WORD_OVERRIDES = {
  sreekanth: "shrIkaMtha",
  ramesh: "rameSh",
  lakshmi: "lakShmi",
  sravani: "shraavaNi",
};

function toItransWord(word) {
  if (ITRANS_WORD_OVERRIDES[word.toLowerCase()]) {
    return ITRANS_WORD_OVERRIDES[word.toLowerCase()];
  }

  let value = word.toLowerCase();
  value = value.replace(/sree/g, "shrI");
  value = value.replace(/aa/g, "A");
  value = value.replace(/ee/g, "I");
  value = value.replace(/oo/g, "U");
  value = value.replace(/th/g, "th");
  value = value.replace(/sh/g, "sh");
  return value;
}

export function transliterateEnglishNameToTelugu(name) {
  if (typeof name !== "string") return "";

  const text = name.trim();
  if (!text) return "";

  return text
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      if (!/^[A-Za-z]+$/.test(part)) return part;

      const lowerName = part.toLowerCase();
      if (COMMON_NAME_TRANSLITERATIONS[lowerName]) {
        return COMMON_NAME_TRANSLITERATIONS[lowerName];
      }

      return Sanscript.t(toItransWord(part), "itrans", "telugu");
    })
    .join("");
}

export function getPatientNameCorrection(patientId, englishName = "") {
  const key = patientId ? String(patientId) : `name:${englishName}`;
  try {
    const corrections = JSON.parse(localStorage.getItem(CORRECTION_STORAGE_KEY) || "{}");
    return corrections[key] || "";
  } catch {
    return "";
  }
}

export function savePatientNameCorrection(patientId, englishName, teluguName) {
  const key = patientId ? String(patientId) : `name:${englishName}`;
  try {
    const corrections = JSON.parse(localStorage.getItem(CORRECTION_STORAGE_KEY) || "{}");
    corrections[key] = teluguName.trim();
    localStorage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify(corrections));
    return true;
  } catch {
    return false;
  }
}

export function getPatientDisplayName({
  name,
  language,
  patientId,
  correctedTeluguName,
}) {
  if (language !== "te") return name || "";
  if (correctedTeluguName) return correctedTeluguName;
  const correction = getPatientNameCorrection(patientId, name);
  return correction || transliterateEnglishNameToTelugu(name);
}
