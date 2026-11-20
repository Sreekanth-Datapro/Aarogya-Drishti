/**
 * Pure helpers for the no-per-field-confirm conversational flow.
 * Easy to unit-test without the React hook.
 */

/** After a valid parse, the interview advances (no yes/no gate). */
export function shouldAutoAdvance(parsed, question) {
  if (!parsed) return false;
  if (parsed.skip && question?.optional) return true;
  if (parsed.skip && !question?.optional) return false;
  return parsed.ok === true;
}

/** Invalid / unclear answers stay on the same question. */
export function shouldRepeatQuestion(parsed, question) {
  if (!parsed) return true;
  if (parsed.skip && !question?.optional) return true;
  return parsed.ok !== true && !parsed.skip;
}

/**
 * Detect "change my name" / "edit age" style requests.
 * Returns a field id or null.
 */
export function detectChangeFieldIntent(transcript, questionIds = []) {
  const text = String(transcript || "").trim();
  if (!text) return null;

  const changeVerb = /\b(change|edit|correct|update|fix)\b|మార్చు|సరిదిద్దు|बदलो|सुधारो|बदलना/i.test(text)
    || /^(change|edit)\b/i.test(text);
  if (!changeVerb && !/\b(my name|my age|gender|village|address|complaint|symptoms|pain)\b/i.test(text)
      && !/పేరు|వయస|లింగం|గ్రామం|చిరునామా|नाम|उम्र|लिंग|गाँव|पता|दर्द/.test(text)) {
    // Still allow "change name" without explicit verb if pattern is clear
    if (!/\bchange\s+(my\s+)?/i.test(text) && !/మార్చు|बदलो/.test(text)) return null;
  }

  const FIELD_HINTS = [
    { id: "full_name", patterns: [/\bname\b/i, /పేరు/, /नाम/] },
    { id: "age_years", patterns: [/\bage\b/i, /వయస/, /उम्र/] },
    { id: "sex", patterns: [/\bgender\b|\bsex\b/i, /లింగం/, /लिंग/] },
    { id: "preferred_language_id", patterns: [/\blanguage\b/i, /భాష/, /भाषा/] },
    { id: "mandal_id", patterns: [/\bmandal\b/i, /మండలం/, /मंडल/] },
    { id: "village_id", patterns: [/\bvillage\b/i, /గ్రామం/, /गाँव|गांव/] },
    { id: "facility_id", patterns: [/\bfacility\b|\bphc\b|\bhospital\b/i, /కేంద్రం|సౌకర్యం/, /केंद्र|अस्पताल/] },
    { id: "habitation", patterns: [/\bhabitation\b|\bcolony\b/i, /హాబిటేషన్/, /बस्ती/] },
    { id: "address_line", patterns: [/\baddress\b/i, /చిరునామా/, /पता/] },
    { id: "consent_data", patterns: [/\bdata\s+processing\b|\bconsent\b/i, /డేటా/, /डेटा|सहमति/] },
    { id: "consent_screening", patterns: [/\bscreening\s+consent\b|\bscreening\b/i, /స్క్రీనింగ్/, /स्क्रीनिंग/] },
    { id: "consent_image", patterns: [/\bimage\b|\bphoto\b/i, /చిత్ర|ఫోటో/, /छवि|फोटो/] },
    { id: "chiefComplaint", patterns: [/\bcomplaint\b|\bproblem\b/i, /ఫిర్యాదు|సమస్య/, /शिकायत|समस्या/] },
    { id: "symptoms", patterns: [/\bsymptom/i, /లక్షణ/, /लक्षण/] },
    { id: "exposures", patterns: [/\bhabit|\btobacco|\balcohol/i, /అలవాటు|పొగాకు/, /आदत|तंबाकू|शराब/] },
    { id: "conditions", patterns: [/\bhistory\b|\bcondition/i, /చరిత్ర/, /इतिहास/] },
    { id: "pain", patterns: [/\bpain\b/i, /నొప్పి/, /दर्द/] },
    { id: "pain_location", patterns: [/\bpain\s+location\b|\blocation\b/i, /నొప్పి స్థానం/, /दर्द स्थान/] },
    { id: "pain_duration", patterns: [/\bpain\s+duration\b|\bduration\b/i, /రోజు/, /दिन/] },
    { id: "notes", patterns: [/\bnotes?\b/i, /గమనిక|నోట్స్/, /नोट्स|टिप्पणी/] },
  ];

  const allowed = new Set(questionIds);
  for (const entry of FIELD_HINTS) {
    if (allowed.size && !allowed.has(entry.id)) continue;
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      // Prefer explicit change verbs; still accept "change my name"
      if (changeVerb || /\bchange\b|మార్చు|बदलो/i.test(text)) return entry.id;
    }
  }
  return null;
}

/** Brief ack without asking for yes/no. */
export function buildOkayAck(template, displayValue) {
  return String(template || "Okay, {value}.").replace("{value}", String(displayValue ?? ""));
}
