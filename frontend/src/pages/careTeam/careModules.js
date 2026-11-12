import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Send,
  Stethoscope,
  UserX,
  Users,
  Video,
} from "lucide-react";
import { NAVIGATOR_MODULES, SPECIALIST_MODULES } from "../../config/navigation";

// Settings for the Navigator and Specialist dashboards.
// stats: the summary cards. They stay empty ("Not connected yet") until the
// server service for this role is built, so no number is ever guessed.
// steps: the care pathway; "mine" marks the steps done by this role.
export const CARE_ROLES = {
  NAVIGATOR: {
    eyebrowKey: "care.navEyebrow",
    heroTextKey: "care.navHeroText",
    modules: NAVIGATOR_MODULES,
    mySteps: ["care.stepNavigator", "care.stepFollowUp"],
    rules: ["care.navRule1", "care.navRule2", "care.navRule3"],
    stats: [
      { labelKey: "care.navStatAssigned", icon: Users, tone: "green" },
      { labelKey: "care.navStatNewReferrals", icon: Inbox, tone: "blue" },
      { labelKey: "care.navStatPendingReferrals", icon: Send, tone: "amber" },
      { labelKey: "care.navStatAppointments", icon: CalendarDays, tone: "violet" },
      { labelKey: "care.navStatTodayConsultations", icon: Video, tone: "blue" },
      { labelKey: "care.navStatFollowUpsDue", icon: CalendarClock, tone: "amber" },
      { labelKey: "care.navStatMissed", icon: UserX, tone: "rose" },
      { labelKey: "care.navStatCompleted", icon: CheckCircle2, tone: "green" },
    ],
  },
  SPECIALIST: {
    eyebrowKey: "care.spEyebrow",
    heroTextKey: "care.spHeroText",
    modules: SPECIALIST_MODULES,
    mySteps: ["care.stepSpecialist"],
    rules: ["care.spRule1", "care.spRule2", "care.spRule3"],
    stats: [
      { labelKey: "care.spStatAssigned", icon: ClipboardList, tone: "green" },
      { labelKey: "care.spStatNew", icon: Inbox, tone: "blue" },
      { labelKey: "care.spStatPending", icon: Stethoscope, tone: "amber" },
      { labelKey: "care.spStatToday", icon: CalendarDays, tone: "violet" },
      { labelKey: "care.spStatVideo", icon: Video, tone: "blue" },
      { labelKey: "care.spStatCompleted", icon: CheckCircle2, tone: "green" },
      { labelKey: "care.spStatFollowUps", icon: CalendarCheck, tone: "amber" },
    ],
  },
};

// The care pathway from screening to follow-up, in order
export const CARE_STEPS = [
  "care.stepHealthWorker",
  "care.stepMedicalOfficer",
  "care.stepNavigator",
  "care.stepSpecialist",
  "care.stepFollowUp",
];

// What each module page will do once connected (from the approved design).
// video: the page shows the "Video not configured" card.
// ruleKey: an extra safety note shown on the page.
export const CARE_PAGES = {
  navPatients: { features: ["care.navPatientsF1", "care.navPatientsF2", "care.navPatientsF3"] },
  navReferrals: {
    features: ["care.navReferralsF1", "care.navReferralsF2", "care.navReferralsF3"],
    ruleKey: "care.navReferralsRule",
  },
  navAppointments: { features: ["care.navAppointmentsF1", "care.navAppointmentsF2", "care.navAppointmentsF3"] },
  navVideo: { features: ["care.navVideoF1", "care.navVideoF2", "care.navVideoF3"], video: true },
  navFollowUps: { features: ["care.navFollowUpsF1", "care.navFollowUpsF2", "care.navFollowUpsF3"] },
  navDiagnostics: {
    features: ["care.navDiagnosticsF1", "care.navDiagnosticsF2", "care.navDiagnosticsF3"],
    ruleKey: "care.navRule3",
  },
  spReferrals: {
    features: ["care.spReferralsF1", "care.spReferralsF2", "care.spReferralsF3"],
    ruleKey: "care.spRule2",
  },
  spConsultations: { features: ["care.spConsultationsF1", "care.spConsultationsF2", "care.spConsultationsF3"] },
  spVideo: { features: ["care.spVideoF1", "care.spVideoF2", "care.spVideoF3"], video: true },
  spNotes: {
    features: ["care.spNotesF1", "care.spNotesF2", "care.spNotesF3"],
    ruleKey: "care.spRule1",
  },
  spDiagnostics: { features: ["care.spDiagnosticsF1", "care.spDiagnosticsF2", "care.spDiagnosticsF3"] },
  spFollowUps: { features: ["care.spFollowUpsF1", "care.spFollowUpsF2", "care.spFollowUpsF3"] },
};

// Permission codes sent by the server for the signed-in user -> readable label
export const PERMISSION_LABELS = {
  "patient.read_assigned": "care.permReadAssigned",
  "referral.view": "care.permReferralView",
  "appointment.book": "care.permAppointmentBook",
  "appointment.view": "care.permAppointmentView",
  "navigation.update": "care.permNavigationUpdate",
  "treatment.track": "care.permTreatmentTrack",
  "image.view": "care.permImageView",
  "video.join": "care.permVideoJoin",
  "consultation.note": "care.permConsultationNote",
  "investigation.record": "care.permInvestigationRecord",
  "pathology.review": "care.permPathologyReview",
  "classification.set": "care.permClassificationSet",
  "treatment.link": "care.permTreatmentLink",
};
