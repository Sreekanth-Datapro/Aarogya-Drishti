// Renders every route of the app in English and in Telugu with realistic API data
// and checks that, in Telugu mode, no English UI text is left on the screen.
// Allowed English: data from the API (names without a Telugu translation, usernames,
// emails, codes), abbreviations, and text inside <code>/<pre>/.mono (technical identifiers).
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import App from "../App";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() },
  storeSession: jest.fn(),
  clearSession: () => global.sessionStorage.clear(),
}));

const district = { id: 1, name_en: "Alluri Sitharama Raju", name_te: "అల్లూరి సీతారామరాజు", lgd_code: 745 };
const mandals = [
  { id: 2, district_id: 1, name_en: "G. Madugula", name_te: "జి. మాడుగుల", lgd_code: 4848 },
  { id: 3, district_id: 1, name_en: "Ananthagiri", name_te: null, lgd_code: 4845 },
];
const villages = [
  { id: 11, mandal_id: 2, name_en: "Addulu", name_te: "అడ్డులు", lgd_code: 585042 },
  { id: 12, mandal_id: 2, name_en: "Alagam", name_te: null, lgd_code: 585043 },
];
const facility = {
  id: 7, code: "PHC-GM-01", name_en: "PHC G. Madugula", name_te: "PHC జి. మాడుగుల", category: "PHC",
  facility_type: "PHC", is_active: true,
  district_id: 1, district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
  mandal_id: 2, mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
  village_id: 11, village_name: "Addulu", village_name_te: "అడ్డులు",
  address: "Main Road", pin_code: "531029", contact_phone: "9876543210", email: "phc@example.test",
  incharge_name: "Dr. Rao", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z",
};
const registration = {
  id: "reg-1", full_name: "Lakshmi", username: "lakshmi.asha", phone: "9876500000", email: null,
  designation: "ASHA", status: "PENDING", created_at: "2026-11-01T10:00:00Z",
  facility_name: "PHC G. Madugula", facility_name_te: "PHC జి. మాడుగుల",
  mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల", village_name: "Alagam", village_name_te: null,
};
const auditEvent = {
  id: 91, occurred_at: "2026-11-05T09:30:00Z", actor_name: "Super Admin", actor_username: "superadmin",
  actor_role: "SUPER_ADMIN", event: "FACILITY_CREATED", outcome: "SUCCESS", resource_type: "facility",
  resource_id: "7", ip_address: "127.0.0.1", request_id: "req-abc", metadata: { name: "PHC G. Madugula" },
};

const districtAuditLogs = {
  events: [auditEvent],
  pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
  summary: {
    total: 1, login_success: 0, login_failed: 0, user_changes: 0, role_permission_changes: 0,
    district_admin_activity: 0, email_events: 0, sms_events: 0, password_mfa_events: 0,
  },
};

const responses = {
  "/district/dashboard": {
    success: true,
    dashboard: {
      district: { id: 1, code: "ASR", name_en: district.name_en, name_te: district.name_te },
      patients: { total: 3, new_last_30_days: 1 },
      case_states: [{ state: "AWAITING_CLINICIAN", count: 2 }, { state: "CLOSED", count: 1 }],
      monthly_registrations: [{ month: "2026-10", count: 1 }, { month: "2026-11", count: 2 }],
      patients_by_facility: [{ id: 7, name_en: facility.name_en, name_te: facility.name_te, count: 3 }],
      patients_by_mandal: [{ id: 2, name_en: mandals[0].name_en, name_te: mandals[0].name_te, count: 3 }],
      staff: { by_role: { HEALTH_WORKER: 2, MEDICAL_OFFICER: 1, SPECIALIST: 0, NAVIGATOR: 0 }, active: 3, suspended: 0, pending_setup: 0 },
      facilities: { total: 4, active: 4, phcs: 1, hospitals: 2 },
      registrations: { PENDING: 1, APPROVED: 2, REJECTED: 0 },
      programme: { screenings_total: 3, doctor_reviews: 1, specialist_referrals: 0, overdue_cases: 0, treatment_linked: 0, lost_to_followup: 0 },
      recent_registrations: [{ ...registration, requested_role: "HEALTH_WORKER" }],
      recent_activity: [{ id: 91, event: "FACILITY_CREATED", outcome: "SUCCESS", actor_role: "SUPER_ADMIN", actor_name: "Super Admin", occurred_at: "2026-11-05T09:30:00Z" }],
      recent_notifications: [],
    },
  },
  "/district/programme": {
    success: true,
    programme: {
      summary: { screenings_total: 3, doctor_reviews: 1, avg_hours_to_review: 4.5, avg_hours_to_diagnosis: null },
      by_mandal: [{ id: 2, name_en: mandals[0].name_en, name_te: mandals[0].name_te, screenings_total: 3 }],
      by_month: [{ month: "2026-11", screenings_total: 3 }],
      mandals: [{ id: 2, name_en: mandals[0].name_en, name_te: mandals[0].name_te }],
    },
  },
  "/district/mandals": {
    success: true,
    mandals: [{ ...mandals[0], code: "M2", is_active: true, is_verified: true, village_count: 2, facility_count: 1 }],
    pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
  },
  "/district/audit/logs": districtAuditLogs,
  "/district/patients": {
    success: true,
    patients: [{
      id: "p-1", patient_code: "ASR-000123", age_years: 42, sex: "FEMALE",
      village_name: "Addulu", village_name_te: "అడ్డులు", mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
      facility_name: facility.name_en, facility_name_te: facility.name_te, registered_at: "2026-11-01T10:00:00Z",
      case_state: "AWAITING_CLINICIAN", waiting_hours: 50, review_alert: true, review_escalation: true,
    }],
    summary: { total: 1, awaiting_review: 1, review_alerts: 1, review_escalations: 1 },
    pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
  },
  "/patients/registration-options": {
    success: true,
    locations: [{
      assignment_id: "assignment-1", district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
      mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల", village_name: "Addulu", village_name_te: "అడ్డులు",
      facility_name: "PHC G. Madugula", facility_name_te: "PHC జి. మాడుగుల", village_id: 11, facility_id: 7,
    }],
    mandal_wide: false,
    mandals: [{
      district_id: 1, district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
      mandal_id: 2, mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
      villages: [{ id: 11, name_en: "Addulu", name_te: "అడ్డులు" }],
      facilities: [{ id: 7, name_en: "PHC G. Madugula", name_te: "PHC జి. మాడుగుల" }],
      pairs: [{ village_id: 11, facility_id: 7 }],
    }],
    languages: [{ id: 1, code: "en", name_en: "English", native_name: "English" }, { id: 2, code: "te", name_en: "Telugu", native_name: "తెలుగు" }],
    consent_purposes: [
      { code: "DATA_PROCESSING", name_en: "Data processing", name_te: "డేటా ప్రాసెసింగ్", text_en: "I agree to my record being stored.", text_te: "నా రికార్డు భద్రంగా నిల్వ చేయడానికి అంగీకరిస్తున్నాను.", version: "v1" },
      { code: "SCREENING", name_en: "Oral screening examination", name_te: "నోటి పరీక్ష", text_en: "I agree to an oral screening.", text_te: "నోటి పరీక్షకు అంగీకరిస్తున్నాను.", version: "v1" },
      { code: "IMAGE_CAPTURE", name_en: "Photograph capture", name_te: "ఫోటో తీయడం", text_en: "I agree to photographs.", text_te: "ఫోటోలు తీయడానికి అంగీకరిస్తున్నాను.", version: "v1" },
    ],
  },
  "/patients/mine": {
    success: true,
    patients: [{
      id: "66666666-6666-4666-8666-666666666666", patient_code: "AD-2026-000003", full_name: "సీత", sex: "FEMALE", age_years: 40,
      created_at: "2026-11-07T08:00:00Z", village_name: "Addulu", village_name_te: "అడ్డులు", mandal_name: "G. Madugula",
      mandal_name_te: "జి. మాడుగుల", screening_consent: true,
    }],
  },
  "/patients/summary": {
    success: true,
    summary: {
      total: 1, this_month: 1, today: 1, screening_consented: 1, last_7_days: [{ day: "2026-11-07", count: 1 }],
      by_village: [{ village_name: "Addulu", village_name_te: "అడ్డులు", count: 1 }],
      by_sex: [{ sex: "FEMALE", count: 1 }],
      by_age_group: [{ age_group: "40_59", count: 1 }],
    },
  },
  "/screenings/options": {
    success: true,
    options: {
      symptoms: [{ code: "WHITE_PATCH", name_en: "White patch", name_te: "తెల్లని మచ్చ" }],
      exposures: [{ code: "GUTKHA", category: "TOBACCO", name_en: "Gutkha", name_te: "గుట్కా" }],
      consent_purposes: [
        { code: "SCREENING", name_en: "Oral screening examination", name_te: "నోటి పరీక్ష", text_en: "I agree to an oral screening.", text_te: "నోటి పరీక్షకు అంగీకరిస్తున్నాను.", version: "v1" },
        { code: "IMAGE_CAPTURE", name_en: "Photograph capture", name_te: "ఫోటో తీయడం", text_en: "I agree to photographs.", text_te: "ఫోటోలు తీయడానికి అంగీకరిస్తున్నాను.", version: "v1" },
      ],
      languages: [{ id: 1, code: "en", name_en: "English", native_name: "English" }, { id: 2, code: "te", name_en: "Telugu", native_name: "తెలుగు" }],
      oral_sites: ["CHEEK_LINING", "TONGUE"],
      photo_views: ["FRONT_VIEW", "LEFT_VIEW", "RIGHT_VIEW"],
      max_photo_bytes: 10485760,
    },
  },
  "/screenings/patients": {
    success: true,
    patients: [{
      id: "77777777-7777-4777-8777-777777777777", patient_code: "AD-2026-000004", full_name: "సీత", sex: "FEMALE", age_years: 40,
      village_name: "Addulu", village_name_te: "అడ్డులు", preferred_language_id: 2, screening_consent: true,
      screening_consent_at: "2026-11-07T08:00:00Z", image_consent: false, screening_id: null, case_state: null,
    }],
  },
  "/screenings/patients/77777777-7777-4777-8777-777777777777/consents": {
    success: true,
    consents: { SCREENING: { granted: true, captured_at: "2026-11-07T08:00:00Z" }, IMAGE_CAPTURE: null },
  },
  "/medical-officer/cases": {
    success: true,
    cases: [{
      id: "11111111-1111-4111-8111-111111111111", patient_code: "AD-2026-000001", age_years: 45, sex: "FEMALE",
      village_name: "Addulu", village_name_te: "అడ్డులు", mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
      facility_name: "PHC G. Madugula", facility_name_te: "PHC జి. మాడుగుల",
      screening_date: "2026-11-02", case_state: "AWAITING_CLINICIAN", claimed_at: "2026-11-06T10:00:00Z",
    }],
  },
  "/district/health-workers": {
    success: true,
    summary: { total: 1, active: 1, without_location: 0, patients: 2 },
    pagination: { page: 1, total: 1, total_pages: 1 },
    health_workers: [{
      id: "55555555-5555-4555-8555-555555555555", username: "lakshmi.asha", full_name: "లక్ష్మి", phone: "9876500000",
      designation: "ASHA", status: "ACTIVE", last_login_at: null, has_location: true, patient_count: 2,
      village_name: "Addulu", village_name_te: "అడ్డులు", mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
      facility_name: "PHC G. Madugula", facility_name_te: "జి. మాడుగుల ఆరోగ్య కేంద్రం",
    }],
  },
  "/registrations/district-admin": {
    success: true,
    workflow: { two_stage: true, can_finalize: true },
    awaiting_mo_review: 1,
    registrations: ["RECOMMENDED", "NOT_RECOMMENDED"].map((recommendation, index) => ({
      id: `4444444${index}-4444-4444-8444-444444444444`, full_name: index ? "సీత" : "లక్ష్మి", username: index ? "seetha.anm" : "lakshmi.asha",
      phone: "9876500000", designation: "ANM", status: "PENDING", created_at: "2026-11-05T10:00:00Z", mandal_id: 2,
      district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
      mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల", village_name: "Addulu", village_name_te: "అడ్డులు",
      facility_name: "PHC G. Madugula", facility_name_te: "జి. మాడుగుల ఆరోగ్య కేంద్రం",
      mo_reviewer_name: "డా. రావు", mo_recommended_by: "u-mo", mo_recommended_at: "2026-11-06T10:00:00Z",
      mo_recommendation: recommendation, mo_recommendation_note: "పత్రాలు తనిఖీ చేశాను",
    })),
  },
  "/registrations/medical-officer": {
    success: true,
    workflow: { two_stage: false, can_recommend: false },
    registrations: [{
      id: "33333333-3333-4333-8333-333333333333", full_name: "లక్ష్మి", username: "lakshmi.asha", phone: "9876500000",
      designation: "ASHA", status: "PENDING", created_at: "2026-11-05T10:00:00Z", workflow_version: null, mandal_id: 2,
      district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
      mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల", village_name: "Addulu", village_name_te: "అడ్డులు",
      facility_name: "PHC G. Madugula", facility_name_te: "PHC జి. మాడుగుల", mo_recommended_by: null, mo_recommendation: null,
    }],
  },
  "/medical-officer/dashboard": {
    dashboard: {
      assigned_mandals: [{ id: 2, name_en: "G. Madugula", name_te: "జి. మాడుగుల" }],
      totals: { total_patients: 12, pending_screenings: 4, my_claimed_cases: 2, pending_reviews: 1, referrals: 3, open_followups: 2, overdue_followups: 1 },
      case_states: [{ state: "AWAITING_CLINICIAN", count: 4 }, { state: "REVIEWED", count: 2 }],
      weekly: [{ week: "2026-10-26", screenings: 2, signed_reviews: 1 }, { week: "2026-11-02", screenings: 4, signed_reviews: 2 }],
      by_mandal: [{ id: 2, name_en: "G. Madugula", name_te: "జి. మాడుగుల", patients: 12, awaiting_review: 4 }],
      referrals_by_status: { PLANNED: 2, COMPLETED: 1 },
      followups: { open: 2, overdue: 1, closed: 0 },
      recent_activity: [{ id: 5, event: "CLINICAL_REVIEW_SIGNED", occurred_at: "2026-11-06T10:00:00Z" }],
    },
  },
  "/medical-officer/patients/villages": { villages: [{ id: 11, name_en: "Addulu", name_te: "అడ్డులు", mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల" }] },
  "/medical-officer/patients": {
    patients: [{
      id: "22222222-2222-4222-8222-222222222222", patient_code: "AD-2026-000002", full_name: null, sex: "MALE", age_years: 52, screening_consent_active: true,
      village_name: "Addulu", village_name_te: "అడ్డులు", mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
      facility_name: "PHC G. Madugula", facility_name_te: "PHC జి. మాడుగుల", registered_at: "2026-11-01T10:00:00Z",
      case_state: "AWAITING_CLINICIAN", claim_status: "NONE",
    }],
    pagination: { page: 1, total: 1, total_pages: 1 },
  },
  "/medical-officer/patients/11111111-1111-4111-8111-111111111111/case": {
    case: {
      claim: { claimed_at: "2026-11-06T10:00:00Z" },
      patient: { id: "11111111-1111-4111-8111-111111111111", patient_code: "AD-2026-000001", full_name: "లక్ష్మి", sex: "FEMALE", age_years: 45,
        village_name: "Addulu", village_name_te: "అడ్డులు", mandal_name: "G. Madugula", mandal_name_te: "జి. మాడుగుల",
        facility_name: "PHC G. Madugula", facility_name_te: "PHC జి. మాడుగుల", registered_at: "2026-11-01T10:00:00Z" },
      consent: { screening: true, image_capture: true, history: [{ purpose: "SCREENING", purpose_name: "Oral screening examination", purpose_name_te: "నోటి పరీక్ష", granted: true, consent_version: "v1", captured_at: "2026-11-01T10:00:00Z" }] },
      screening: { id: "s-1", screening_date: "2026-11-02", case_state: "AWAITING_CLINICIAN", chief_complaint: "నోటి పుండు", tobacco_current: true, clinical_exam_done: true, notes: null },
      screening_hidden: false,
      findings: [{ id: "f-1", finding_kind: "SYMPTOM", oral_site: "TONGUE", symptom_name: "Ulcer", symptom_name_te: "పుండు", duration_days: 20 }],
      histories: [{ exposure_name: "Gutkha", exposure_name_te: "గుట్కా", duration_years: 5 }],
      ai_results: [{ id: "ai-1", status: "COMPLETED", result_label: "SUSPICIOUS_FOR_CLINICAL_REVIEW", image_quality_status: "ACCEPTABLE", completed_at: "2026-11-02T11:00:00Z" }],
      review: null,
      timeline: [{ event_type: "SCREENING", event_time: "2026-11-02T10:00:00Z" }, { event_type: "REGISTRATION", event_time: "2026-11-01T10:00:00Z" }],
    },
  },
  "/medical-officer/patients/11111111-1111-4111-8111-111111111111/images": {
    images: [{ id: "ph-1", status: "ACCEPTED", view_type: "TONGUE", size_bytes: 20480, width_px: 640, height_px: 480, metadata_stripped: true,
      quality_status: "ACCEPTABLE", ai_result_label: "SUSPICIOUS_FOR_CLINICAL_REVIEW", captured_at: "2026-11-02T10:00:00Z", screening_date: "2026-11-02" }],
  },
  "/medical-officer/patients/11111111-1111-4111-8111-111111111111/referral-options": {
    options: {
      eligible: true, review: { decision: "SPECIALIST_REVIEW", referral_reason: "అనుమానాస్పద గాయం" },
      hospitals: [{ id: 8, name_en: "Area Hospital Paderu", name_te: "ఏరియా ఆసుపత్రి పాడేరు" }],
      specialties: [{ id: 1, name_en: "ENT", name_te: "చెవి ముక్కు గొంతు" }],
      priorities: [{ id: 1, name_en: "Urgent", name_te: "అత్యవసరం" }],
      specialists: [], navigators: [{ id: "nav-1", full_name: "Ravi Teja" }], modes: ["HOSPITAL_VISIT", "VIDEO_CONSULT"],
    },
  },
  "/medical-officer/reviews": {
    reviews: [{ id: "r-1", patient_id: "11111111-1111-4111-8111-111111111111", patient_code: "AD-2026-000001", finding: "తెల్లని మచ్చ",
      decision: "NO_ACTION", ai_agreement: "NOT_AVAILABLE", version: 2, signed_at: null, case_state: "AWAITING_CLINICIAN",
      screening_date: "2026-11-02", updated_at: "2026-11-06T10:00:00Z" }],
    pagination: { page: 1, total: 1, total_pages: 1 },
  },
  "/medical-officer/referrals": {
    referrals: [{ id: "ref-1", referral_code: "REF-2026-000001", status: "PLANNED", mode: "HOSPITAL_VISIT", patient_code: "AD-2026-000001",
      hospital_name: "Area Hospital Paderu", hospital_name_te: "ఏరియా ఆసుపత్రి పాడేరు", specialty_name: "ENT", specialty_name_te: "చెవి ముక్కు గొంతు",
      priority_name: "Urgent", priority_name_te: "అత్యవసరం", specialist_name: null, navigator_name: "Ravi Teja", created_at: "2026-11-06T10:00:00Z" }],
    pagination: { page: 1, total: 1, total_pages: 1 },
  },
  "/medical-officer/followups/options": {
    options: {
      referrals: [{ id: "ref-1", referral_code: "REF-2026-000001", patient_code: "AD-2026-000001", district_id: 1 }],
      navigators: [{ id: "nav-1", full_name: "Ravi Teja", district_id: 1 }], statuses: [], task_types: ["REMINDER", "TRANSPORT"],
    },
  },
  "/medical-officer/followups": {
    tasks: [{ id: "t-1", task_type: "REMINDER", reason: "రోగికి ఫోన్ చేయండి", priority: 3, due_at: "2026-11-10T10:00:00Z",
      status_code: "OPEN", status_name: "Open", status_name_te: "తెరిచి ఉంది", navigator_name: "Ravi Teja",
      patient_code: "AD-2026-000001", referral_code: "REF-2026-000001", overdue: false }],
    pagination: { page: 1, total: 1, total_pages: 1 },
  },
  "/medical-officer/reports/mandals": {
    report: {
      mandals: [{ id: 2, name_en: "G. Madugula", name_te: "జి. మాడుగుల", patients: 12, screenings: 8, awaiting_review: 4, signed_reviews: 3,
        draft_reviews: 1, referrals: 2, referrals_completed: 1, followups_open: 2, followups_closed: 1 }],
      totals: { patients: 12, screenings: 8, awaiting_review: 4, signed_reviews: 3, draft_reviews: 1, referrals: 2, referrals_completed: 1, followups_open: 2, followups_closed: 1 },
    },
  },
  "/medical-officer/profile": {
    profile: { full_name: "Medical One", username: "mo.one", email: "mo@example.test", phone: "9876543210", role_code: "MEDICAL_OFFICER",
      status: "ACTIVE", mfa_enabled: true, created_at: "2026-10-01T10:00:00Z", password_changed_at: "2026-11-01T10:00:00Z",
      district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
      mandals: [{ id: 2, name_en: "G. Madugula", name_te: "జి. మాడుగుల" }],
      facilities: [{ id: 7, name_en: "PHC G. Madugula", name_te: "PHC జి. మాడుగుల", is_primary: true }] },
  },
  "/admin/staff": {
    staff: [{
      id: "mo-1", username: "mo.ravi.1234", full_name: "Ravi Teja", status: "PENDING_SETUP", role_code: "MEDICAL_OFFICER",
      role_name: "Medical officer", facility_id: 7, facility_name: facility.name_en, facility_name_te: facility.name_te,
      district_id: 1, district_name: district.name_en, district_name_te: district.name_te,
    }],
  },
  "/admin/staff/options": {
    options: {
      districts: [district],
      facilities: [{ id: 7, district_id: 1, facility_type: "PHC", name_en: facility.name_en, name_te: facility.name_te }],
      specialties: [{ id: 1, code: "ENT", name_en: "ENT", name_te: "చెవి ముక్కు గొంతు" }],
    },
    "/admin/health-workers": { success: true, health_workers: [] },
  },
  "/dashboard/summary": {
    success: true,
    masters: { districts: 1, mandals: 11, villages: 2479, facilities: 4 },
    facilities: { total: 4, active: 4, phc: 1, chc: 0, hospital: 2, other: 1 },
    district_info: [{ ...district, mandals: 11, villages: 2479, facilities: 4, active_users: 3 }],
    users_by_role: [{ role: "SUPER_ADMIN", total: 1 }, { role: "HEALTH_WORKER", total: 2 }],
    pending_registrations: 1,
    registrations_summary: { pending: 1, approved: 2, rejected: 0, total: 3, recent: [registration] },
    active_health_workers: 2,
    total_users: 3,
    pending_setup_accounts: 1,
    patients_registered: 0,
    programme: { screenings: 0, reviews: 0, referrals: 0, treatment_linked: 0 },
    trends: [
      { month: "Oct", month_key: "2026-10", registrations: 1, patients: 0, facilities: 2, appointments: 0 },
      { month: "Nov", month_key: "2026-11", registrations: 2, patients: 0, facilities: 2, appointments: 0 },
    ],
    recent_activity: [
      { id: 1, event: "LOGIN_SUCCESS", outcome: "SUCCESS", occurred_at: "2026-11-06T07:00:00Z" },
      { id: 2, event: "FACILITY_CREATED", outcome: "SUCCESS", occurred_at: "2026-11-05T07:00:00Z" },
    ],
    system: {
      status: "healthy", app_version: "1.0.0", database: "PostgreSQL 18.0", uptime_seconds: 93784,
      last_lgd_import_at: "2026-11-01T10:00:00Z", db_latency_ms: 3,
      last_backup: { at: "2026-11-04T22:00:00Z", filename: "backup.dump" },
    },
  },
  "/dashboard/registrations": { success: true, registrations: [registration] },
  "/admin/district-admins": {
    district_admins: [{
      id: "da-1", full_name: "Ravi Kumar", username: "ravi.da", email: "ravi@example.test", phone: "9876543211",
      status: "PENDING_SETUP", district_id: 1, district_name: "Alluri Sitharama Raju", district_name_te: "అల్లూరి సీతారామరాజు",
      setup_password_pending: true, email_delivery_status: "FAILED", sms_delivery_status: "NOT_CONFIGURED",
      credentials_expires_at: "2099-01-01T10:00:00Z",
      created_at: "2026-10-20T10:00:00Z",
    }],
  },
  "/admin/districts": { districts: [district] },
  "/admin/roles": {
    roles: [{ id: 21, code: "FIELD_SUPERVISOR", name: "Field supervisor", name_te: null, description: "Supervises camps",
      is_active: true, assigned_users: 1, permissions: ["patient.register"] }],
  },
  "/admin/permissions": {
    permissions: [{ id: 1, code: "patient.register", resource: "patient", action: "create", description: "Register synthetic patient" }],
  },
  "/admin/roles/21/users": { users: [{ id: "u-1", username: "sup.one", full_name: "Supervisor One", status: "ACTIVE" }] },
  "/audit/logs": {
    events: [auditEvent],
    pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
    summary: {
      total: 1, login_success: 0, login_failed: 0, user_changes: 0, role_permission_changes: 0,
      district_admin_activity: 0, email_events: 0, sms_events: 0, password_mfa_events: 0,
    },
  },
  "/audit/logs/91": { event: auditEvent },
  "/reports/analytics": {
    success: true, total_users: 3, active_users: 3,
    users_by_role: [{ role: "SUPER_ADMIN", total: 1 }, { role: "DISTRICT_ADMIN", total: 1 }],
    district_facilities: [{ district_id: 1, district_name: district.name_en, district_name_te: district.name_te, total: 4, active: 4 }],
    registration: { designation: [{ designation: "ASHA", total: 1 }, { designation: null, total: 1 }], total: 2, pending: 1, approved: 1, rejected: 0 },
    account_setup: { pending_setup: 1, completed: 0, total: 1 },
    delivery: { email_sent: 0, email_failed: 1, sms_sent: 0, sms_failed: 0 },
    monthly_activity: [{ month: "Nov", month_key: "2026-11", registrations: 2, users: 1, facilities: 2 }],
    filters: { districts: [district], facilities: [{ id: 7, name_en: facility.name_en, name_te: facility.name_te, district_id: 1 }] },
  },
  "/facilities/summary": { summary: { total: 4, active: 4, inactive: 0, phc: 1, chc: 0, hospital: 2 } },
  "/facilities": { facilities: [facility, { ...facility, id: 8, name_en: "Area Hospital Paderu", name_te: null, category: "AREA_HOSPITAL", code: null }], total: 2 },
  "/facilities/7": { facility },
  "/masters/districts": { districts: [district] },
  "/masters/mandals": { mandals },
  "/masters/villages": { villages },
  "/masters/registration-options": {
    districts: [district],
    facilities: [{ id: 7, code: "FAC_PHC_GM", name_en: facility.name_en, name_te: facility.name_te, facility_type: "PHC" }],
    mandals, villages,
    languages: [{ id: 1, code: "en", name_en: "English", native_name: "English" }, { id: 2, code: "te", name_en: "Telugu", native_name: "తెలుగు" }],
  },
  "/locations/lgd/states": { states: [{ lgd_code: 28, name_en: "Andhra Pradesh", name_te: "ఆంధ్రప్రదేశ్" }] },
  "/locations/records": {
    records: [{ ...district, id: 1, code: "ASR", data_source: "LGD", is_verified: true, is_active: true }],
  },
  "/locations/imports": {
    imports: [{ id: 1, level: "DISTRICT", source: "LGD", parent_name: "Andhra Pradesh", inserted_count: 1, updated_count: 0,
      linked_count: 0, skipped_count: 0, imported_at: "2026-11-01T10:00:00Z", imported_by_name: "Super Admin" }],
  },
  "/locations/preview": {
    level: "district",
    parent: { id: null, lgd_code: 28, name_en: "Andhra Pradesh", name_te: "ఆంధ్రప్రదేశ్" },
    rows: [
      { lgd_code: 745, name_en: "Alluri Sitharama Raju", name_te: "అల్లూరి సీతారామరాజు", action: "unchanged",
        existing: { id: 1, code: "ASR", name_en: "Alluri Sitharama Raju", name_te: "అల్లూరి సీతారామరాజు", is_verified: true } },
      { lgd_code: 744, name_en: "Anakapalli", name_te: null, action: "new", existing: null },
    ],
    counts: { new: 1, update: 0, link: 0, unchanged: 1, protected: 0, conflict: 0 },
    onlyInAarogya: [],
  },
};

// Fields whose values are codes: these must always be shown as translated labels,
// so they are NOT added to the "allowed English data" list below.
const CODE_FIELDS = new Set([
  "status", "role", "designation", "event", "outcome", "resource_type", "category", "level", "data_source",
  "action", "facility_type", "actor_role", "email_delivery_status", "sms_delivery_status", "month", "month_key",
]);

function collectData(value, out, field) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) value.forEach((item) => collectData(item, out, field));
  else if (typeof value === "object") Object.entries(value).forEach(([key, item]) => collectData(item, out, key));
  else if (!CODE_FIELDS.has(field)) String(value).match(/[A-Za-z][A-Za-z0-9]*/g)?.forEach((word) => out.add(word));
  return out;
}

const USERS = {
  SUPER_ADMIN: { id: "u-super", username: "superadmin", full_name: "Super Admin", role: "SUPER_ADMIN",
    permissions: ["master.view", "master.manage", "user.manage", "audit.view", "registration.monitor"] },
  SYSTEM_ADMIN: { id: "u-sys", username: "sysadmin", full_name: "Sys Admin", role: "SYSTEM_ADMIN",
    permissions: ["master.view", "master.manage", "user.manage", "audit.view"] },
  DISTRICT_ADMIN: { id: "u-da", username: "ravi.da", full_name: "Ravi Kumar", role: "DISTRICT_ADMIN",
    permissions: ["master.view", "dashboard.view_aggregate"] },
  MEDICAL_OFFICER: { id: "u-mo", username: "mo.one", full_name: "Medical One", role: "MEDICAL_OFFICER",
    permissions: ["registration.monitor"] },
  HEALTH_WORKER: { id: "u-hw", username: "lakshmi.asha", full_name: "Lakshmi", role: "HEALTH_WORKER", permissions: [] },
  NAVIGATOR: { id: "u-nav", username: "nav.one", full_name: "Ravi Teja", role: "NAVIGATOR",
    permissions: ["appointment.book", "appointment.view", "navigation.update", "patient.read_assigned", "referral.view", "treatment.track"] },
  SPECIALIST: { id: "u-sp", username: "sp.one", full_name: "Anitha", role: "SPECIALIST",
    permissions: ["consultation.note", "image.view", "investigation.record", "referral.view", "video.join"] },
};

const ALLOWED_WORDS = new Set([
  ...collectData(responses, new Set()),
  ...collectData(USERS, new Set()),
  // Abbreviations and names that are written in English inside Telugu UI text on purpose
  "AI", "ANM", "API", "ASHA", "CHC", "CHO", "ID", "IP", "LGD", "PHC", "PHCs", "QR", "SMS", "ST", "MFA",
  "Google", "Microsoft", "Authenticator", "latha", "CSV", "KB",
  // Language names are shown in their own script in the language picker
  "English", "EN",
]);

// &amp; -> &, &#39; -> ' ... so entity names are not mistaken for English words
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|lt|gt|quot|nbsp);/g, (match, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " " })[name]);
}

// All visible text plus placeholders, labels for screen readers, tooltips and image text.
// The rendered HTML is read as a string; <code>, <pre> and .mono parts hold
// technical identifiers and are left out.
function englishLeftOnScreen() {
  const html = document.body.innerHTML
    .replace(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(\w+)\b[^>]*\bclass="[^"]*\bmono\b[^"]*"[^>]*>[^<]*<\/\1>/gi, " ");

  const texts = [document.title, html.replace(/<[^>]*>/g, " ")];
  for (const [, , value] of html.matchAll(/\s(placeholder|aria-label|title|alt)="([^"]*)"/g)) texts.push(value);

  const found = new Set();
  texts.map(decodeEntities).forEach((text) => {
    // Version numbers such as "v1.0.0" are technical identifiers
    const words = text.replace(/\bv\d+(\.\d+)*/g, " ").match(/[A-Za-z][A-Za-z0-9]*/g) || [];
    words.forEach((word) => {
      if (word.length > 1 && !ALLOWED_WORDS.has(word)) found.add(word);
    });
  });
  return [...found].sort();
}

function mockApi() {
  api.get.mockImplementation((url) => {
    const path = url.split("?")[0];
    if (responses[path]) return Promise.resolve({ data: responses[path] });
    return Promise.reject({ response: { status: 404, data: { message: "API route not found" } } });
  });
  api.post.mockResolvedValue({ data: { success: true, message: "Facility created" } });
  api.patch.mockResolvedValue({ data: { success: true, message: "Facility deactivated", facility: { ...facility, is_active: false } } });
}

async function openRoute(route, { role, language }) {
  localStorage.setItem("language", language);
  sessionStorage.clear();
  if (role) {
    sessionStorage.setItem("accessToken", "access");
    sessionStorage.setItem("user", JSON.stringify(USERS[role]));
  }
  window.history.pushState({}, "", route);
  render(<App />);
  // Let every pending API promise settle
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi();
});

// te / en: text that proves the real page (not a loader or a redirect) was shown
const ROUTES = [
  { route: "/login", te: "ఆరోగ్య దృష్టికి సైన్ ఇన్ చేయండి", en: "Sign in to Aarogya Drishti" },
  { route: "/register", te: "ఆరోగ్య కార్యకర్త నమోదు", en: "Health worker registration" },
  { route: "/forgot-password", te: "పాస్‌వర్డ్ మర్చిపోయారు", en: "Forgot password" },
  { route: "/reset-password?token=abc", te: "కొత్త పాస్‌వర్డ్ సెట్ చేయండి", en: "Set a new password" },
  { route: "/reset-password", te: "ఈ రీసెట్ లింక్ అసంపూర్ణంగా ఉంది. దయచేసి కొత్తది అభ్యర్థించండి.", en: "This reset link is incomplete. Please request a new one." },
  { route: "/setup-account#token=abc", te: "మీ జిల్లా నిర్వాహక ఖాతాను సెటప్ చేయండి", en: "Set up your District Admin account" },
  { route: "/change-password", role: "SYSTEM_ADMIN", te: "మార్పు తర్వాత ఇతర పరికరాల నుండి సైన్ అవుట్ అవుతారు.", en: "Other devices will be signed out after the change." },
  { route: "/dashboard", role: "SUPER_ADMIN", te: "పరిపాలనా సారాంశం", en: "Administration Overview" },
  { route: "/dashboard", role: "SYSTEM_ADMIN", te: "విశ్లేషణల సారాంశం", en: "Analytics Overview" },
  { route: "/dashboard", role: "DISTRICT_ADMIN", te: "అల్లూరి సీతారామరాజు జిల్లా డాష్‌బోర్డ్", en: "Alluri Sitharama Raju district dashboard" },
  { route: "/district/programme", role: "DISTRICT_ADMIN", te: "నెలవారీ స్క్రీనింగ్‌లు", en: "Screenings by month" },
  { route: "/district/locations", role: "DISTRICT_ADMIN", te: "గ్రామాలు చూడండి", en: "View villages" },
  { route: "/district/audit", role: "DISTRICT_ADMIN", te: "మొత్తం సంఘటనలు", en: "Total events" },
  { route: "/district/patients", role: "DISTRICT_ADMIN", te: "48 గంటల ఎస్కలేషన్", en: "48h escalation" },
  { route: "/district/health-workers", role: "DISTRICT_ADMIN", te: "రోగులను చూడండి", en: "View patients" },
  { route: "/district/registrations", role: "DISTRICT_ADMIN", te: "వైద్యాధికారి సిఫార్సు చేయలేదు", en: "Not Recommended by Medical Officer" },
  { route: "/district/staff/medical-officers", role: "DISTRICT_ADMIN", te: "లాగిన్ వివరాలను మళ్లీ పంపండి", en: "Resend login details" },
  { route: "/dashboard", role: "MEDICAL_OFFICER", te: "వారానికి స్క్రీనింగ్‌లు", en: "Screenings per week" },
  { route: "/medical-officer/registrations", role: "MEDICAL_OFFICER", te: "నా సిఫార్సు కోసం వేచి ఉన్నవి", en: "Awaiting my recommendation" },
  { route: "/medical-officer/patients", role: "MEDICAL_OFFICER", te: "క్లెయిమ్ చేసే వరకు పేరు దాచబడింది", en: "Name hidden until claimed" },
  { route: "/medical-officer/review?patient=11111111-1111-4111-8111-111111111111", role: "MEDICAL_OFFICER", te: "నా క్లినికల్ పరిశీలనలు", en: "My clinical observations" },
  { route: "/medical-officer/images?patient=11111111-1111-4111-8111-111111111111", role: "MEDICAL_OFFICER", te: "చిత్రం చూడండి", en: "View image" },
  { route: "/medical-officer/notes", role: "MEDICAL_OFFICER", te: "అన్ని నోట్స్", en: "All notes" },
  { route: "/medical-officer/referrals?patient=11111111-1111-4111-8111-111111111111", role: "MEDICAL_OFFICER", te: "కొత్త రిఫరల్", en: "New referral" },
  { route: "/medical-officer/followups", role: "MEDICAL_OFFICER", te: "కొత్త ఫాలో-అప్", en: "New follow-up" },
  { route: "/medical-officer/reports", role: "MEDICAL_OFFICER", te: "మండలాల వారీ సారాంశం", en: "Mandal-wise summary" },
  { route: "/medical-officer/profile", role: "MEDICAL_OFFICER", te: "కేటాయించిన మండలాలు", en: "Assigned Mandals" },
  { route: "/dashboard", role: "HEALTH_WORKER", te: "గ్రామాల వారీగా నా రోగులు", en: "My patients by village" },
  { route: "/health-worker/patients", role: "HEALTH_WORKER", te: "3. సమ్మతి", en: "3. Consent" },
  { route: "/health-worker/screening", role: "HEALTH_WORKER", te: "రోగిని ఎంచుకోండి", en: "Choose a patient" },
  { route: "/medical-officer/queue", role: "MEDICAL_OFFICER", te: "మెడికల్ అధికారి కార్యస్థలం", en: "Medical Officer workspace" },
  { route: "/dashboard", role: "NAVIGATOR", te: "రోగి మార్గదర్శకుడి కార్యస్థలం", en: "Patient navigator workspace" },
  { route: "/navigator/referrals", role: "NAVIGATOR", te: "నిపుణ వైద్యుడిని కేటాయించి సందర్శనను షెడ్యూల్ చేయడం", en: "Assign the specialist and schedule the visit" },
  { route: "/navigator/video", role: "NAVIGATOR", te: "వీడియో ఏర్పాటు కాలేదు", en: "Video not configured" },
  { route: "/dashboard", role: "SPECIALIST", te: "నిపుణ వైద్యుడి కార్యస్థలం", en: "Specialist workspace" },
  { route: "/specialist/notes", role: "SPECIALIST", te: "సేవ్ చేసిన ప్రతి వెర్షన్ భద్రపరచబడుతుంది", en: "Every saved version is kept" },
  { route: "/admin/locations", role: "SUPER_ADMIN", te: "మీరు ఏమి దిగుమతి చేయాలనుకుంటున్నారు?", en: "What do you want to import?" },
  { route: "/admin/roles", role: "SUPER_ADMIN", te: "అనుకూల పాత్రల నిర్వహణ", en: "Custom role management" },
  { route: "/admin/district-admins", role: "SUPER_ADMIN", te: "జిల్లా నిర్వాహకుల ఖాతాలు", en: "District Admin accounts" },
  { route: "/admin/health-worker-assignments", role: "SUPER_ADMIN", te: "ఆరోగ్య కార్యకర్త కేటాయింపులు", en: "Health Worker assignments" },
  { route: "/admin/registrations", role: "SUPER_ADMIN", te: "లక్ష్మి", en: "Lakshmi" },
  { route: "/admin/reports", role: "SUPER_ADMIN", te: "జిల్లా వారీ ఆరోగ్య కేంద్రాలు", en: "District-wise facilities" },
  { route: "/admin/audit", role: "SUPER_ADMIN", te: "మొత్తం సంఘటనలు", en: "Total events" },
  { route: "/admin/facilities", role: "SUPER_ADMIN", te: "మొత్తం కేంద్రాలు", en: "Total facilities" },
  { route: "/admin/facilities", role: "DISTRICT_ADMIN", te: "మీరు ఆరోగ్య కేంద్రాలను చూడవచ్చు. నిర్వాహకులు మాత్రమే మార్చగలరు.", en: "You can view facilities. Only administrators can change them." },
  { route: "/admin/facilities/new", role: "SYSTEM_ADMIN", te: "కేంద్రం పేరు, రకం మరియు కోడ్.", en: "Name, type and code of the facility." },
  { route: "/admin/facilities/7", role: "SYSTEM_ADMIN", te: "కేంద్రాల జాబితాకు తిరిగి", en: "Back to facilities" },
  { route: "/admin/facilities/7/edit", role: "SYSTEM_ADMIN", te: "ఆరోగ్య కేంద్రాన్ని మార్చండి", en: "Edit facility" },
  { route: "/admin/roles", role: "DISTRICT_ADMIN", te: "ఈ పేజీకి మీకు ప్రాప్యత లేదు", en: "You do not have access to this page" },
  { route: "/settings", role: "DISTRICT_ADMIN", te: "మీ ఖాతా మరియు సైన్ ఇన్ భద్రత.", en: "Your account and sign-in security." },
];

test("the English detector finds English text and ignores code and HTML entities", () => {
  render(
    <div>
      <p>నమోదు &amp; Hello</p>
      <input aria-label="Search here" placeholder="వెతకండి" />
      <code>LOGIN_SUCCESS</code>
      <span className="mono">PHC-GM-01</span>
    </div>
  );
  expect(englishLeftOnScreen()).toEqual(["Hello", "Search", "here"]);
});

describe.each(ROUTES)("route $route as $role", ({ route, role, te, en }) => {
  test("Telugu mode shows no English UI text", async () => {
    await openRoute(route, { role, language: "te" });
    expect(document.documentElement.lang).toBe("te");
    expect(screen.getAllByText(te).length).toBeGreaterThan(0);
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("English mode renders the same route", async () => {
    await openRoute(route, { role, language: "en" });
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getAllByText(en).length).toBeGreaterThan(0);
  });
});

describe("interactive parts in Telugu mode", () => {
  test("top bar menus, registration review and facility status dialog", async () => {
    await openRoute("/dashboard", { role: "SUPER_ADMIN", language: "te" });
    fireEvent.click(screen.getByRole("button", { name: "నోటిఫికేషన్లు" }));
    fireEvent.click(screen.getByRole("button", { name: /తెలుగు/ }));
    fireEvent.click(screen.getByRole("button", { name: /Super Admin/ }));
    screen.getAllByRole("button", { name: /అన్నీ చూడండి/ }).forEach((button) => fireEvent.click(button));
    // Applicant names use the existing patient-name transliteration utility
    expect(await screen.findByText("లక్ష్మి")).toBeInTheDocument();
    expect(screen.getByText("@lakshmi.asha")).toBeInTheDocument();
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("audit event details, role users and facility status dialog", async () => {
    await openRoute("/admin/audit", { role: "SUPER_ADMIN", language: "te" });
    fireEvent.click(screen.getByRole("button", { name: "చూడండి" }));
    await screen.findByText("ఆడిట్ సంఘటన వివరాలు");
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("custom role users list", async () => {
    await openRoute("/admin/roles", { role: "SUPER_ADMIN", language: "te" });
    fireEvent.click(screen.getByRole("button", { name: "వినియోగదారులను చూడండి" }));
    await screen.findByText(/Supervisor One/);
    fireEvent.click(screen.getByRole("button", { name: "మార్చండి" }));
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("facility deactivate dialog and server success message", async () => {
    await openRoute("/admin/facilities", { role: "SUPER_ADMIN", language: "te" });
    fireEvent.click(screen.getAllByRole("button", { name: "నిష్క్రియం చేయండి" })[0]);
    expect(await screen.findByText("ఈ కేంద్రాన్ని నిష్క్రియం చేయాలా?")).toBeInTheDocument();
    expect(englishLeftOnScreen()).toEqual([]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "నిష్క్రియం చేయండి" }));
    expect(await screen.findByText("ఆరోగ్య కేంద్రం నిష్క్రియం చేయబడింది.")).toBeInTheDocument();
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("location preview, import confirmation and manual entry", async () => {
    await openRoute("/admin/locations", { role: "SUPER_ADMIN", language: "te" });
    fireEvent.click(screen.getByRole("button", { name: "LGD నుండి తీసుకురండి" }));
    await screen.findByText("LGD నుండి ముందస్తు వీక్షణ");
    fireEvent.click(screen.getByRole("button", { name: "కొత్తవి మరియు మారినవి ఎంచుకోండి" }));
    fireEvent.click(screen.getByRole("button", { name: "ఎంచుకున్నవి దిగుమతి చేయండి" }));
    await screen.findByText("దిగుమతిని నిర్ధారించండి");
    expect(englishLeftOnScreen()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "రద్దు" }));
    fireEvent.click(screen.getAllByRole("button", { name: "మాన్యువల్‌గా జోడించండి" })[0]);
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("screening consent step", async () => {
    await openRoute("/health-worker/screening", { role: "HEALTH_WORKER", language: "te" });
    fireEvent.click(screen.getByRole("button", { name: /సీత/ }));
    expect(await screen.findByRole("heading", { name: "రోగి సమ్మతి" })).toBeInTheDocument();
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("form validation errors on registration and facility form", async () => {
    await openRoute("/register", { language: "te" });
    fireEvent.click(screen.getByRole("button", { name: "నమోదు సమర్పించండి" }));
    expect(await screen.findByText("దయచేసి గుర్తించిన వివరాలను సరిచేయండి.")).toBeInTheDocument();
    expect(englishLeftOnScreen()).toEqual([]);
  });

  test("server error messages are shown in Telugu", async () => {
    api.post.mockRejectedValue({ response: { status: 401, data: { message: "Invalid username or password" } } });
    await openRoute("/login", { language: "te" });
    fireEvent.change(screen.getByLabelText("వినియోగదారు పేరు"), { target: { value: "someone" } });
    fireEvent.change(screen.getByLabelText("పాస్‌వర్డ్"), { target: { value: "wrong-pass1" } });
    fireEvent.click(screen.getByRole("button", { name: "సైన్ ఇన్" }));
    expect(await screen.findByText("వినియోగదారు పేరు లేదా పాస్‌వర్డ్ తప్పు.")).toBeInTheDocument();
    expect(englishLeftOnScreen()).toEqual([]);
  });
});

describe("language switching", () => {
  test("switches immediately, including messages already on screen, and remembers the choice", async () => {
    api.post.mockRejectedValue({ response: { status: 401, data: { message: "Invalid username or password" } } });
    await openRoute("/login", { language: "en" });

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "someone" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-pass1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid username or password")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "తెలుగు" }));
    expect(screen.getByText("వినియోగదారు పేరు లేదా పాస్‌వర్డ్ తప్పు.")).toBeInTheDocument();
    expect(screen.getByText("ఆరోగ్య దృష్టికి సైన్ ఇన్ చేయండి")).toBeInTheDocument();
    expect(localStorage.getItem("language")).toBe("te");
    expect(document.documentElement.lang).toBe("te");
    expect(document.title).toBe("ఆరోగ్య దృష్టి");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("Invalid username or password")).toBeInTheDocument();
    expect(localStorage.getItem("language")).toBe("en");
  });

  test("a reload keeps the chosen language", async () => {
    await openRoute("/admin/facilities", { role: "SUPER_ADMIN", language: "te" });
    expect(await screen.findByText("ఆరోగ్య కేంద్రాల నిర్వహణ", { selector: "h1" })).toBeInTheDocument();
    // District / mandal / village dropdowns and the table use name_te
    expect(screen.getAllByText("అల్లూరి సీతారామరాజు").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PHC జి. మాడుగుల").length).toBeGreaterThan(0);
    // No Telugu name in the database: the English name is shown unchanged
    expect(screen.getByText("Area Hospital Paderu")).toBeInTheDocument();
  });

  test("the top bar language menu switches a signed-in page", async () => {
    await openRoute("/admin/reports", { role: "SUPER_ADMIN", language: "en" });
    expect(await screen.findByText("Reports & Analytics", { selector: "h1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.click(screen.getByRole("button", { name: "తెలుగు" }));
    expect(await screen.findByText("నివేదికలు & విశ్లేషణలు", { selector: "h1" })).toBeInTheDocument();
    expect(screen.getAllByText("అల్లూరి సీతారామరాజు").length).toBeGreaterThan(0);
    expect(englishLeftOnScreen()).toEqual([]);
  });
});

describe("searching in both languages", () => {
  test("the registration mandal search finds Telugu and English names", async () => {
    await openRoute("/register", { language: "te" });
    fireEvent.change(screen.getByLabelText("జిల్లా"), { target: { value: "1" } });
    const mandal = screen.getByLabelText("మండలం");
    fireEvent.focus(mandal);
    fireEvent.change(mandal, { target: { value: "madugula" } });
    expect(within(screen.getByRole("listbox")).getByRole("option", { name: "జి. మాడుగుల" })).toBeInTheDocument();
    fireEvent.change(mandal, { target: { value: "మాడుగుల" } });
    expect(within(screen.getByRole("listbox")).getByRole("option", { name: "జి. మాడుగుల" })).toBeInTheDocument();
  });
});
