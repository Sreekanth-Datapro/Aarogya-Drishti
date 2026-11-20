/**
 * Static purpose text for Health Worker pages (en / te / hi).
 * Dynamic visible content is added by voicePageReader.js.
 * Never includes patient names or clinical PHI.
 */

import { normalizeReceptionistLocale } from "../receptionistLocales";

const PURPOSES = {
  dashboard: {
    en: "Welcome to Aarogya Drishti. This is your Health Worker Dashboard. Here you can view registered patients, screening consent progress, appointments and follow-up tasks. You can say Open Patient Registration, Open Screening, Open Appointments, Open Patients, Open Tracking, or Open Follow-up.",
    te: "ఆరోగ్య దృష్టికి స్వాగతం. ఇది మీ ఆరోగ్య కార్యకర్త డాష్‌బోర్డ్. ఇక్కడ నమోదైన రోగులు, స్క్రీనింగ్ సమ్మతి, అపాయింట్‌మెంట్లు మరియు ఫాలో-అప్ పనులు చూడవచ్చు. రోగి నమోదు, స్క్రీనింగ్, అపాయింట్‌మెంట్, రోగులు, ట్రాకింగ్ లేదా ఫాలో-అప్ తెరవమని చెప్పవచ్చు.",
    hi: "आरोग्य दृष्टि में आपका स्वागत है। यह आपका स्वास्थ्य कार्यकर्ता डैशबोर्ड है। यहाँ पंजीकृत मरीज़, स्क्रीनिंग सहमति, अपॉइंटमेंट और फॉलो-अप कार्य देख सकते हैं। रजिस्ट्रेशन, स्क्रीनिंग, अपॉइंटमेंट, मरीज़ खोज, ट्रैकिंग या फॉलो-अप खोलने के लिए बोलें।",
  },
  registration: {
    en: "This is the Patient Registration page. Here you can register a new patient. Please enter the patient's required details. Fields marked as required must be completed. You can fill the form manually, or use voice questions when Voice is ON.",
    te: "ఇది రోగి నమోదు పేజీ. ఇక్కడ కొత్త రోగిని నమోదు చేయవచ్చు. అవసరమైన వివరాలు నమోదు చేయండి. నిర్బంధ గుర్తు ఉన్న ఫీల్డులు తప్పనిసరిగా నింపాలి. మాన్యువల్‌గా నింపవచ్చు లేదా వాయిస్ ప్రశ్నలు వాడవచ్చు.",
    hi: "यह पेशेंट रजिस्ट्रेशन पेज है। यहाँ नया मरीज़ पंजीकृत करें। आवश्यक विवरण भरें। आवश्यक चिह्नित फ़ील्ड पूरे करें। फ़ॉर्म मैन्युअल भरें या वॉइस प्रश्न उपयोग करें।",
  },
  patientSearch: {
    en: "This is the Patients search page. Type a name or patient code to find a patient. From here you can open screening or registration when needed.",
    te: "ఇది రోగుల శోధన పేజీ. పేరు లేదా రోగి కోడ్ టైప్ చేసి వెతకండి. అవసరమైతే స్క్రీనింగ్ లేదా నమోదు తెరవవచ్చు.",
    hi: "यह मरीज़ खोज पेज है। नाम या कोड से खोजें। आवश्यकता पर स्क्रीनिंग या रजिस्ट्रेशन खोलें।",
  },
  screening: {
    en: "This is the Patient Screening page. Here you can choose a patient, record consent, enter screening details, add photos, and submit for Medical Officer review. On the screening form you can also say Start Screening by Voice.",
    te: "ఇది రోగి స్క్రీనింగ్ పేజీ. ఇక్కడ రోగిని ఎంచుకుని, సమ్మతి నమోదు చేసి, స్క్రీనింగ్ వివరాలు మరియు ఫోటోలు జోడించి వైద్య అధికారి సమీక్షకు పంపవచ్చు. ఫారంలో వాయిస్‌తో స్క్రీనింగ్ ప్రారంభించవచ్చు.",
    hi: "यह पेशेंट स्क्रीनिंग पेज है। मरीज़ चुनें, सहमति दर्ज करें, स्क्रीनिंग विवरण और फ़ोटो जोड़ें, फिर मेडिकल ऑफिसर समीक्षा के लिए भेजें। फ़ॉर्म पर वॉइस से स्क्रीनिंग शुरू कर सकते हैं।",
  },
  appointments: {
    en: "This is the Appointments page. Here you can view appointment requests, appointment dates and their current status.",
    te: "ఇది అపాయింట్‌మెంట్ల పేజీ. ఇక్కడ అపాయింట్‌మెంట్ అభ్యర్థనలు, తేదీలు మరియు ప్రస్తుత స్థితి చూడవచ్చు.",
    hi: "यह अपॉइंटमेंट पेज है। यहाँ अपॉइंटमेंट अनुरोध, तिथियाँ और वर्तमान स्थिति देख सकते हैं।",
  },
  diagnostics: {
    en: "This is the Diagnostics page. Here you can review diagnostic orders and their status when available.",
    te: "ఇది డయాగ్నస్టిక్స్ పేజీ. ఇక్కడ అందుబాటులో ఉన్న డయాగ్నస్టిక్ ఆర్డర్లు మరియు స్థితి చూడవచ్చు.",
    hi: "यह डायग्नोस्टिक्स पेज है। उपलब्ध ऑर्डर और उनकी स्थिति यहाँ देखें।",
  },
  tracking: {
    en: "This is the Patient Tracking page. Here you can search and open a patient care journey when available.",
    te: "ఇది రోగి ట్రాకింగ్ పేజీ. ఇక్కడ అందుబాటులో ఉన్న రోగి జర్నీని వెతికి తెరవవచ్చు.",
    hi: "यह मरीज़ ट्रैकिंग पेज है। उपलब्ध केयर जर्नी खोजकर खोलें।",
  },
  followups: {
    en: "This is the Follow-up page. Here you can review follow-up tasks and next steps for patients in your care.",
    te: "ఇది ఫాలో-అప్ పేజీ. ఇక్కడ మీ సంరక్షణలో ఉన్న రోగుల ఫాలో-అప్ పనులు మరియు తదుపరి అడుగులు చూడవచ్చు.",
    hi: "यह फॉलो-अप पेज है। यहाँ अपने मरीज़ों के फॉलो-अप कार्य और अगले कदम देखें।",
  },
  patientDetails: {
    en: "This is the Patient details page. Use the page actions to continue care. Say Open Screening or Open Tracking when you want to move on. Sensitive patient details are not read aloud automatically.",
    te: "ఇది రోగి వివరాల పేజీ. సంరక్షణ కొనసాగించడానికి పేజీ చర్యలు వాడండి. స్క్రీనింగ్ లేదా ట్రాకింగ్ తెరవమని చెప్పవచ్చు. సున్నితమైన వివరాలు ఆటోమేటిక్‌గా చదవబడవు.",
    hi: "यह मरीज़ विवरण पेज है। केयर जारी रखने के लिए पेज क्रियाएँ उपयोग करें। स्क्रीनिंग या ट्रैकिंग खोलने के लिए बोलें। संवेदनशील विवरण स्वतः नहीं पढ़े जाते।",
  },
  settings: {
    en: "This is Settings. Update your account settings here, or say Open Dashboard.",
    te: "ఇవి సెట్టింగ్‌లు. ఖాతా సెట్టింగ్‌లు ఇక్కడ మార్చండి. డాష్‌బోర్డ్ తెరవమని చెప్పవచ్చు.",
    hi: "यह सेटिंग्स है। खाता सेटिंग यहाँ बदलें, या डैशबोर्ड खोलने के लिए बोलें।",
  },
};

function pickLocaleText(entry, locale) {
  const code = normalizeReceptionistLocale(locale);
  return entry?.[code] || entry?.en || "";
}

/**
 * Map pathname → guide id for HEALTH_WORKER.
 */
export function resolveHwPageGuideId(pathname) {
  const path = String(pathname || "");
  if (path === "/dashboard" || path === "/") return "dashboard";
  if (path === "/health-worker/patient-search") return "patientSearch";
  if (path === "/health-worker/patients") return "registration";
  if (/^\/health-worker\/patients\/[^/]+/.test(path)) return "patientDetails";
  if (path.startsWith("/health-worker/screening")) return "screening";
  if (path.startsWith("/health-worker/appointments")) return "appointments";
  if (path.startsWith("/health-worker/diagnostics")) return "diagnostics";
  if (path.startsWith("/health-worker/tracking")) return "tracking";
  if (path.startsWith("/health-worker/followups")) return "followups";
  if (path === "/settings") return "settings";
  return null;
}

export function getHwPagePurposeText(pathname, locale) {
  const id = resolveHwPageGuideId(pathname);
  if (!id) return null;
  const text = pickLocaleText(PURPOSES[id], locale);
  if (!text) return null;
  return { id, text };
}

/** @deprecated Prefer getHwPagePurposeText + buildHwPageExplanation */
export function getHwPageGuideText(pathname, locale) {
  return getHwPagePurposeText(pathname, locale);
}

export function listHwPageGuideIds() {
  return Object.keys(PURPOSES);
}
