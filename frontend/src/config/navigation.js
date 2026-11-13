import {
  Building,
  Activity,
  CalendarCheck,
  CalendarDays,
  Camera,
  ChartColumn,
  ClipboardList,
  FileSignature,
  FileText,
  Hospital,
  Inbox,
  ListChecks,
  ScanEye,
  UserRound,
  Map as MapIcon,
  MapPinned,
  Microscope,
  ScrollText,
  Send,
  Search,
  Settings,
  Stethoscope,
  Truck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { moduleKeyFromPagePermission, pagePermission } from "./pageAccess";

// Every module of the system. "key" points to the text in translations.js
// (modules.<key>.title and modules.<key>.text).
// "path" is the page address. Modules without a path are not built yet
// and are shown as "Soon".
export const MODULES = {
  facilities: { icon: Hospital, path: "/admin/facilities" },
  locationImport: { icon: MapPinned, path: "/admin/locations" },
  adminAccounts: { icon: UserCog },
  masterData: { icon: MapIcon },
  diagnosticTestMaster: { icon: Microscope, path: "/admin/diagnostic-tests" },
  registrations: { icon: UserCheck, path: "/medical-officer/registrations" },
  userManagement: { icon: Users },
  settings: { icon: Settings },
  roleManagement: { icon: UserCog, path: "/admin/roles" },
  districtAdmins: { icon: Users, path: "/admin/district-admins" },
  staffManagement: { icon: Users, path: "/admin/staff" },
  healthWorkerAssignments: { icon: MapPinned, path: "/admin/health-worker-assignments" },
  auditLogs: { icon: ScrollText, path: "/admin/audit" },
  patients: { icon: UserPlus },
  screening: { icon: ClipboardList, path: "/health-worker/screening" },
  imageCapture: { icon: Camera },
  followUp: { icon: CalendarDays, path: "/health-worker/followups" },
  caseReview: { icon: Stethoscope, path: "/medical-officer/queue" },
  healthWorkerPatients: { icon: UserPlus, path: "/health-worker/patients" },
  healthWorkerPatientSearch: { icon: Search, path: "/health-worker/patient-search" },
  healthWorkerAppointments: { icon: CalendarDays, path: "/health-worker/appointments" },
  clinicalDecisions: { icon: ListChecks },
  referrals: { icon: Send },
  referredCases: { icon: Hospital },
  consultations: { icon: Stethoscope },
  diagnostics: { icon: Microscope },
  appointments: { icon: CalendarDays, path: "/hospital-staff/appointments" },
  hsDiagnostics: { icon: Microscope, path: "/hospital-staff/diagnostics" },
  hsTracking: { icon: Activity, path: "/hospital-staff/tracking" },
  transport: { icon: Truck },
  attendance: { icon: Building, path: "/hospital-staff/attendance" },
  healthWorkerDiagnostics: { icon: Microscope, path: "/health-worker/diagnostics" },
  healthWorkerTracking: { icon: Activity, path: "/health-worker/tracking" },
  programme: { icon: ChartColumn },
  reports: { icon: FileText, path: "/admin/reports" },
  registrationMonitoring: { icon: UserCheck, path: "/admin/registrations" },
  accountSettings: { icon: Settings, path: "/settings" },

  // District Admin menu. "group" shows a small heading above related items.
  districtPatients: { icon: Users, path: "/district/patients" },
  districtHealthWorkers: { icon: UserRound, path: "/district/health-workers", group: "staffManagement" },
  districtMedicalOfficers: { icon: Stethoscope, path: "/district/staff/medical-officers", group: "staffManagement" },
  districtSpecialists: { icon: UserCheck, path: "/district/staff/specialists", group: "staffManagement" },
  districtNavigators: { icon: Truck, path: "/district/staff/navigators", group: "staffManagement" },
  districtHospitalStaff: { icon: Building, path: "/district/staff/hospital-staff", group: "staffManagement" },
  districtCustomAccounts: { icon: UserCog, path: "/district/custom-accounts", group: "staffManagement" },
  districtRegistrations: { icon: ClipboardList, path: "/district/registrations" },
  districtFacilities: { icon: Hospital, path: "/admin/facilities" },
  districtLocations: { icon: MapPinned, path: "/district/locations" },
  districtProgramme: { icon: ChartColumn, path: "/district/programme" },
  districtTracking: { icon: Activity, path: "/district/tracking" },
  districtReports: { icon: FileText },
  districtAuditLogs: { icon: ScrollText, path: "/district/audit" },
};

// Medical Officer menu. countKey: the sidebar shows a live count from the API
// (see useMedicalOfficerCounts).
export const MEDICAL_OFFICER_MODULES = {
  moRegistrations: { icon: UserCheck, path: "/medical-officer/registrations", countKey: "registrations" },
  moMandalPatients: { icon: Users, path: "/medical-officer/patients", group: "moPatientsGroup" },
  moScreeningQueue: { icon: ClipboardList, path: "/medical-officer/queue", countKey: "queue", group: "moPatientsGroup" },
  moClinicalReview: { icon: Stethoscope, path: "/medical-officer/review", group: "moClinicalGroup" },
  moImageReview: { icon: ScanEye, path: "/medical-officer/images", group: "moClinicalGroup" },
  moClinicalNotes: { icon: FileSignature, path: "/medical-officer/notes", group: "moClinicalGroup" },
  moReferrals: { icon: Send, path: "/medical-officer/referrals", group: "moCareGroup" },
  moFollowUp: { icon: CalendarCheck, path: "/medical-officer/followups", group: "moCareGroup" },
  moCareLifecycle: { icon: Stethoscope, path: "/medical-officer/care", group: "moCareGroup" },
  moDiagnostics: { icon: Microscope, path: "/medical-officer/diagnostics", group: "moCareGroup" },
  moTracking: { icon: Activity, path: "/medical-officer/tracking", group: "moCareGroup" },
  moReports: { icon: FileText, path: "/medical-officer/reports" },
  moProfile: { icon: UserRound, path: "/medical-officer/profile" },
};

// Patient Navigator menu. The pages explain each module until its server service is built.
export const NAVIGATOR_MODULES = {
  navPatients: { icon: Users, path: "/navigator/patients", group: "navCasesGroup" },
  navReferrals: { icon: Send, path: "/navigator/referrals", group: "navCasesGroup" },
  navAppointments: { icon: CalendarDays, path: "/navigator/appointments", group: "navVisitsGroup" },
  navVideo: { icon: Video, path: "/navigator/video", group: "navVisitsGroup" },
  navFollowUps: { icon: CalendarCheck, path: "/navigator/followups", group: "navFollowGroup" },
  navDiagnostics: { icon: Microscope, path: "/navigator/diagnostics", group: "navFollowGroup" },
  navTracking: { icon: Activity, path: "/navigator/tracking", group: "navFollowGroup" },
};

// Specialist menu
export const SPECIALIST_MODULES = {
  spReferrals: { icon: Inbox, path: "/specialist/referrals", group: "spCasesGroup" },
  spConsultations: { icon: CalendarDays, path: "/specialist/consultations", group: "spCareGroup" },
  spVideo: { icon: Video, path: "/specialist/video", group: "spCareGroup" },
  spNotes: { icon: FileSignature, path: "/specialist/notes", group: "spCareGroup" },
  spDiagnostics: { icon: Microscope, path: "/specialist/diagnostics", group: "spCareGroup" },
  spFollowUps: { icon: CalendarCheck, path: "/specialist/care", group: "spCareGroup" },
  spTracking: { icon: Activity, path: "/specialist/tracking", group: "spCareGroup" },
};

// Staff pages of the District Admin menu: address -> staff role
export const DISTRICT_STAFF_PAGES = {
  "medical-officers": "MEDICAL_OFFICER",
  specialists: "SPECIALIST",
  navigators: "NAVIGATOR",
  "hospital-staff": "HOSPITAL_STAFF",
};

// Keep roles inline in the helper so HMR/circular imports cannot hit a TDZ
// on the SYSTEM_ADMIN_ROLES binding during Sidebar/Dashboard first render.
export const SYSTEM_ADMIN_ROLES = Object.freeze(["SYSTEM_ADMIN", "SUPER_ADMIN"]);

export function isSystemAdministrator(role) {
  return role === "SYSTEM_ADMIN" || role === "SUPER_ADMIN";
}

const SYSTEM_ADMIN_MODULES = [
  "facilities",
  "adminAccounts",
  "masterData",
  "diagnosticTestMaster",
  "staffManagement",
  "registrations",
  "userManagement",
  "settings",
  "auditLogs",
  "roleManagement",
];

// Which modules each role sees, in display order.
export const ROLE_MODULES = {
  SUPER_ADMIN: [
    "districtAdmins",
    "staffManagement",
    "healthWorkerAssignments",
    "roleManagement",
    "locationImport",
    "facilities",
    "diagnosticTestMaster",
    "registrationMonitoring",
    "reports",
    "auditLogs",
    "settings",
  ],
  SYSTEM_ADMIN: SYSTEM_ADMIN_MODULES,
  DISTRICT_ADMIN: [
    "districtPatients",
    "districtHealthWorkers",
    "districtMedicalOfficers",
    "districtSpecialists",
    "districtNavigators",
    "districtHospitalStaff",
    "districtCustomAccounts",
    "healthWorkerAssignments",
    "districtRegistrations",
    "districtFacilities",
    "districtLocations",
    "districtProgramme",
    "districtTracking",
    "districtReports",
    "districtAuditLogs",
  ],
  MEDICAL_OFFICER: Object.keys(MEDICAL_OFFICER_MODULES),
  SPECIALIST: Object.keys(SPECIALIST_MODULES),
  // Photos are step 4 of the screening page, so "imageCapture" is not a separate item
  HEALTH_WORKER: [
    "healthWorkerPatientSearch",
    "healthWorkerPatients",
    "screening",
    "healthWorkerAppointments",
    "healthWorkerDiagnostics",
    "healthWorkerTracking",
    "followUp",
  ],
  NAVIGATOR: Object.keys(NAVIGATOR_MODULES),
  HOSPITAL_STAFF: ["appointments", "hsDiagnostics", "hsTracking", "attendance"],
};

function moduleDefinition(key) {
  return MODULES[key]
    || MEDICAL_OFFICER_MODULES[key]
    || NAVIGATOR_MODULES[key]
    || SPECIALIST_MODULES[key]
    || null;
}

function toModuleEntry(key) {
  const definition = moduleDefinition(key);
  if (!definition) return null;
  return {
    key,
    permission: pagePermission(key),
    ...definition,
  };
}

// Preferred display order: known role menu first, then remaining page permissions.
function orderedModuleKeys(role, permissionKeys) {
  const granted = new Set(permissionKeys);
  const preferred = ROLE_MODULES[role] || [];
  const ordered = [];
  preferred.forEach((key) => {
    if (granted.has(key)) ordered.push(key);
  });
  permissionKeys.forEach((key) => {
    if (!ordered.includes(key)) ordered.push(key);
  });
  return ordered;
}

// Returns [{ key, icon, path, permission }] for the given role (legacy role-only menus).
export function getModulesForRole(role) {
  const keys = ROLE_MODULES[role] || [];
  return keys.map((key) => toModuleEntry(key)).filter(Boolean);
}

// Permission-driven menu. Falls back to ROLE_MODULES when the account has no page.* grants
// (for example a database that has not applied migration 038 yet).
export function getModulesForUser(user) {
  const role = user?.role;
  const permissions = user?.permissions || [];
  const pageKeys = permissions
    .map((code) => moduleKeyFromPagePermission(code))
    .filter(Boolean);

  if (!pageKeys.length) {
    return getModulesForRole(role);
  }

  const keys = orderedModuleKeys(role, pageKeys);
  // District Admins can provision custom-role accounts even before page.districtCustomAccounts is seeded.
  if (role === "DISTRICT_ADMIN" && !keys.includes("districtCustomAccounts")) {
    keys.push("districtCustomAccounts");
  }
  return keys.map((key) => toModuleEntry(key)).filter(Boolean);
}

export function getPagePermissionForPath(pathname) {
  if (!pathname) return null;
  const catalogs = [MODULES, MEDICAL_OFFICER_MODULES, NAVIGATOR_MODULES, SPECIALIST_MODULES];
  for (const catalog of catalogs) {
    for (const [key, module] of Object.entries(catalog)) {
      if (module.path && (pathname === module.path || pathname.startsWith(`${module.path}/`))) {
        return pagePermission(key);
      }
    }
  }
  return null;
}
