/**
 * Parse global voice navigation intents (en / te / hi).
 * Returns a target id or null — never invents unauthorized routes.
 */

const TARGETS = [
  {
    id: "dashboard",
    path: "/dashboard",
    patterns: [
      /\b(open|go\s+to|show)\s+(the\s+)?dashboard\b/i,
      /డాష్‌?బోర్డ్|డాష్బోర్డ్/,
      /डैशबोर्ड|डैश बोर्ड/,
    ],
  },
  {
    id: "registration",
    path: "/health-worker/patients",
    roles: ["HEALTH_WORKER"],
    patterns: [
      /\b(open|go\s+to|start|show)\s+(patient\s+)?registration\b/i,
      /\bregister\s+(a\s+)?patient\b/i,
      /పేషెంట్\s*రిజిస్ట్రేషన్|రోగి\s*నమోదు|రిజిస్ట్రేషన్\s*తెరువు/,
      /पेशेंट\s*रजिस्ट्रेशन|रोगी\s*पंजीकरण|रजिस्ट्रेशन\s*खोलो/,
    ],
  },
  {
    id: "patients",
    path: "/health-worker/patient-search",
    roles: ["HEALTH_WORKER"],
    patterns: [
      /\b(open|go\s+to|show)\s+patients?\b/i,
      /\b(open|go\s+to|show)\s+(patient\s+)?search\b/i,
      /\bsearch\s+patients?\b/i,
      /రోగులు\s*తెరువు|రోగి\s*శోధన|పేషెంట్\s*సెర్చ్/,
      /मरीज़\s*खोलो|मरीज\s*खोजो|पेशेंट\s*सर्च|रोगी\s*खोज/,
    ],
  },
  {
    id: "screening",
    path: "/health-worker/screening",
    roles: ["HEALTH_WORKER"],
    patterns: [
      /\b(open|go\s+to|start|show)\s+(oral\s+)?screening\b/i,
      /స్క్రీనింగ్|పరీక్ష\s*తెరువు/,
      /स्क्रीनिंग|जांच\s*खोलो/,
    ],
  },
  {
    id: "appointments",
    pathByRole: {
      HEALTH_WORKER: "/health-worker/appointments",
      HOSPITAL_STAFF: "/hospital-staff/appointments",
      NAVIGATOR: "/navigator/appointments",
    },
    roles: ["HEALTH_WORKER", "HOSPITAL_STAFF", "NAVIGATOR"],
    patterns: [
      /\b(open|go\s+to|show)\s+(my\s+)?appointments?\b/i,
      /అపాయింట్‌?మెంట్/,
      /अपॉइंटमेंट|मुलाकात/,
    ],
  },
  {
    id: "diagnostics",
    path: "/health-worker/diagnostics",
    roles: ["HEALTH_WORKER"],
    patterns: [
      /\b(open|go\s+to|show)\s+diagnostics?\b/i,
      /డయాగ్నస్టిక్స్|డయాగ్నస్టిక్/,
      /डायग्नोस्टिक्स|डायग्नोस्टिक/,
    ],
  },
  {
    id: "tracking",
    path: "/health-worker/tracking",
    roles: ["HEALTH_WORKER"],
    patterns: [
      /\b(open|go\s+to|show)\s+(patient\s+)?tracking\b/i,
      /ట్రాకింగ్|రోగి\s*ట్రాకింగ్/,
      /ट्रैकिंग|मरीज़\s*ट्रैकिंग/,
    ],
  },
  {
    id: "followups",
    path: "/health-worker/followups",
    roles: ["HEALTH_WORKER"],
    patterns: [
      /\b(open|go\s+to|show)\s+follow[-\s]?ups?\b/i,
      /ఫాలో[-\s]?అప్|ఫాలోఅప్/,
      /फॉलो[-\s]?अप|फॉलोअप/,
    ],
  },
  {
    id: "reports",
    pathByRole: {
      SUPER_ADMIN: "/admin/reports",
      SYSTEM_ADMIN: "/admin/reports",
      DISTRICT_ADMIN: "/district/programme",
      MEDICAL_OFFICER: "/medical-officer/reports",
    },
    roles: ["SUPER_ADMIN", "SYSTEM_ADMIN", "DISTRICT_ADMIN", "MEDICAL_OFFICER"],
    patterns: [
      /\b(open|go\s+to|show)\s+reports?\b/i,
      /రిపోర్ట్/,
      /रिपोर्ट/,
    ],
  },
];

export function resolveVoiceNavigation(transcript, { role } = {}) {
  const text = String(transcript || "").trim();
  if (!text) return null;

  for (const target of TARGETS) {
    if (!target.patterns.some((pattern) => pattern.test(text))) continue;
    if (target.roles && role && !target.roles.includes(role)) {
      return { denied: true, id: target.id };
    }
    const path = target.path
      || (target.pathByRole && role ? target.pathByRole[role] : null);
    if (!path) return { denied: true, id: target.id };
    return { id: target.id, path };
  }
  return null;
}

export function listVoiceNavTargets() {
  return TARGETS.map(({ id, path, pathByRole, roles }) => ({
    id,
    path,
    pathByRole,
    roles,
  }));
}
