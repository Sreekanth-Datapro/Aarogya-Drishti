import { questionText, REGISTRATION_QUESTIONS, SCREENING_QUESTIONS } from "./receptionistCopy";
import { parseRegistrationFieldAnswer, parseScreeningFieldAnswer } from "./fieldAnswerParsers";

/** True when the visible registration form already has a usable value for this field. */
export function isRegistrationFieldFilled(fieldId, form = {}) {
  const consents = form.consents || {};
  switch (fieldId) {
    case "full_name":
      return Boolean(String(form.full_name || "").trim());
    case "sex":
      return Boolean(form.sex);
    case "age_years":
      return (form.age_years !== "" && form.age_years != null)
        || Boolean(form.date_of_birth);
    case "preferred_language_id":
      return Boolean(form.preferred_language_id);
    case "mandal_id":
      return Boolean(form.mandal_id);
    case "village_id":
      return Boolean(form.village_id);
    case "facility_id":
      return Boolean(form.facility_id);
    case "habitation":
      return Boolean(String(form.habitation || "").trim());
    case "address_line":
      return Boolean(String(form.address_line || "").trim());
    case "consent_data":
      return consents.DATA_PROCESSING === true;
    case "consent_screening":
      return consents.SCREENING === true || consents.SCREENING === false;
    case "consent_image":
      return consents.IMAGE_CAPTURE === true || consents.IMAGE_CAPTURE === false;
    default:
      return false;
  }
}

/** Build registration question list from live form context (existing fields only). */
export function buildRegistrationQuestions(context = {}) {
  const mandals = context.mandals || [];
  const form = context.form || {};

  const wrapAsk = (id, optional, extraShouldAsk) => (ctx) => {
    const liveForm = ctx?.form || form;
    // Do not re-ask fields the user (or a prior answer) already filled.
    if (isRegistrationFieldFilled(id, liveForm)) return false;
    if (typeof extraShouldAsk === "function" && !extraShouldAsk(ctx)) return false;
    // Required-only progression: skip empty optional fields in auto voice flow.
    if (optional) return false;
    return true;
  };

  const questions = [
    {
      id: "full_name",
      optional: false,
      shouldAsk: wrapAsk("full_name", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "full_name", locale),
    },
    {
      id: "sex",
      optional: false,
      shouldAsk: wrapAsk("sex", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "sex", locale),
    },
    {
      id: "age_years",
      optional: false,
      shouldAsk: wrapAsk("age_years", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "age_years", locale),
    },
    {
      id: "preferred_language_id",
      optional: false,
      shouldAsk: wrapAsk("preferred_language_id", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "preferred_language_id", locale),
    },
    {
      id: "mandal_id",
      optional: false,
      shouldAsk: wrapAsk("mandal_id", false, () => mandals.length > 1),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "mandal_id", locale),
    },
    {
      id: "village_id",
      optional: false,
      shouldAsk: wrapAsk("village_id", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "village_id", locale),
    },
    {
      id: "facility_id",
      optional: false,
      shouldAsk: wrapAsk("facility_id", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "facility_id", locale),
    },
    {
      id: "habitation",
      optional: true,
      shouldAsk: wrapAsk("habitation", true),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "habitation", locale),
    },
    {
      id: "address_line",
      optional: true,
      shouldAsk: wrapAsk("address_line", true),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "address_line", locale),
    },
    {
      id: "consent_data",
      optional: false,
      shouldAsk: wrapAsk("consent_data", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "consent_data", locale),
    },
    {
      id: "consent_screening",
      optional: false,
      shouldAsk: wrapAsk("consent_screening", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "consent_screening", locale),
    },
    {
      id: "consent_image",
      optional: false,
      shouldAsk: wrapAsk("consent_image", false),
      prompt: (locale) => questionText(REGISTRATION_QUESTIONS, "consent_image", locale),
    },
  ];
  return questions;
}

export function parseRegistrationAnswer(fieldId, transcript, context) {
  return parseRegistrationFieldAnswer(fieldId, transcript, context);
}

/** Map confirmed receptionist answers onto the existing registration form shape. */
export function registrationAnswersToFormPatch(answers, context = {}) {
  const patch = {};
  const filled = [];

  if (answers.full_name) {
    patch.full_name = answers.full_name;
    filled.push("full_name");
  }
  if (answers.sex) {
    patch.sex = answers.sex;
    filled.push("sex");
  }
  if (answers.age_years != null && answers.age_years !== "") {
    patch.age_years = String(answers.age_years);
    filled.push("age_years");
  }
  if (answers.preferred_language_id) {
    patch.preferred_language_id = String(answers.preferred_language_id);
    filled.push("preferred_language_id");
  }

  const mandalId = answers.mandal_id
    || (context.mandals?.length === 1 ? String(context.mandals[0].mandal_id) : "");
  if (mandalId) {
    patch.mandal_id = String(mandalId);
    filled.push("mandal_id");
  }
  if (answers.village_id) {
    patch.village_id = String(answers.village_id);
    filled.push("village_id");
  }
  if (answers.facility_id) {
    patch.facility_id = String(answers.facility_id);
    filled.push("facility_id");
  }
  if (answers.habitation != null) {
    patch.habitation = answers.habitation;
    filled.push("habitation");
  }
  if (answers.address_line != null) {
    patch.address_line = answers.address_line;
    filled.push("address_line");
  }

  const consents = { ...(context.form?.consents || {}) };
  let consentsTouched = false;
  if (answers.consent_data === true) {
    consents.DATA_PROCESSING = true;
    consentsTouched = true;
  }
  if (answers.consent_screening === true || answers.consent_screening === false) {
    consents.SCREENING = answers.consent_screening;
    consentsTouched = true;
  }
  if (answers.consent_image === true || answers.consent_image === false) {
    consents.IMAGE_CAPTURE = answers.consent_image;
    consentsTouched = true;
  }
  if (consentsTouched) {
    patch.consents = consents;
  }

  return { patch, filled };
}

export function buildScreeningQuestions(context = {}) {
  const historyLocked = context.historyLocked === true;
  return [
    {
      id: "chiefComplaint",
      optional: false,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "chiefComplaint", locale),
    },
    {
      id: "symptoms",
      optional: true,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "symptoms", locale),
    },
    {
      id: "exposures",
      optional: true,
      shouldAsk: () => !historyLocked,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "exposures", locale),
    },
    {
      id: "conditions",
      optional: true,
      shouldAsk: () => !historyLocked,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "conditions", locale),
    },
    {
      id: "pain",
      optional: false,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "pain", locale),
    },
    {
      id: "pain_location",
      optional: true,
      shouldAsk: (ctx) => ctx.answers?.pain === true,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "pain_location", locale),
    },
    {
      id: "pain_duration",
      optional: true,
      shouldAsk: (ctx) => ctx.answers?.pain === true,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "pain_duration", locale),
    },
    {
      id: "notes",
      optional: true,
      prompt: (locale) => questionText(SCREENING_QUESTIONS, "notes", locale),
    },
  ];
}

export function parseScreeningAnswer(fieldId, transcript, context) {
  return parseScreeningFieldAnswer(fieldId, transcript, context);
}

/**
 * Flatten receptionist screening answers into updates for applyScreeningVoiceUpdates.
 */
export function screeningAnswersToUpdates(answers) {
  const updates = {};
  let clearSymptoms = false;
  let clearExposures = false;

  Object.keys(answers || {}).forEach((key) => {
    if (key.startsWith("__meta_")) {
      const meta = answers[key];
      if (meta?.updates) Object.assign(updates, meta.updates);
      if (meta?.clearSymptoms) clearSymptoms = true;
      if (meta?.clearExposures) clearExposures = true;
      return;
    }
    const meta = answers[`__meta_${key}`];
    if (meta?.updates) {
      Object.assign(updates, meta.updates);
    }
    if (meta?.clearSymptoms) clearSymptoms = true;
    if (meta?.clearExposures) clearExposures = true;
  });

  // Direct fields without meta updates
  if (answers.chiefComplaint && !updates.chiefComplaint) {
    updates.chiefComplaint = answers.chiefComplaint;
  }
  if (answers.conditions != null && updates.conditions === undefined) {
    updates.conditions = answers.conditions;
  }
  if (answers.notes != null && updates.notes === undefined) {
    updates.notes = answers.notes;
  }
  if (answers.pain === true) updates["pain.has_pain"] = "yes";
  if (answers.pain === false) updates["pain.has_pain"] = "no";
  if (answers.pain_location) {
    updates["pain.has_pain"] = "yes";
    updates["pain.location"] = answers.pain_location;
  }
  if (answers.pain_duration) {
    updates["pain.has_pain"] = "yes";
    updates["pain.duration_days"] = String(answers.pain_duration);
  }

  return { updates, clearSymptoms, clearExposures };
}
