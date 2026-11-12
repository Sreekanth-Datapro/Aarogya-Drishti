let mockHandler;
let mockRole = "SPECIALIST";
let mockPermissions = [];
const mockQueries = [];

function mockRunQuery(sql, params = []) {
  mockQueries.push({ sql, params });
  return mockHandler(sql, params);
}

jest.mock("../../db", () => {
  const client = {
    query: jest.fn(async (sql, params) => mockRunQuery(sql, params)),
    release: jest.fn(),
  };
  return {
    query: jest.fn(async (sql, params) => mockRunQuery(sql, params)),
    connect: jest.fn(async () => client),
  };
});

jest.mock("../../utils/jwt", () => ({ verifyAccessToken: jest.fn(() => ({ sub: "specialist-1", sid: "session-1" })) }));
jest.mock("../../utils/permissions", () => ({
  getRolePermissions: jest.fn(async () => mockPermissions),
  clearPermissionCache: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn(async () => {}) }));
jest.mock("../../services/privateImageStorage", () => ({
  getFile: jest.fn(async () => ({ data: Buffer.from("private-image") })),
  objectExists: jest.fn(async () => true),
}));
jest.mock("../../services/imageEnhancementService", () => ({
  enhancePhoto: jest.fn(async (_req, _screening, photo) => ({
    photo_id: photo.id,
    view: photo.view,
    model: "Real-ESRGAN",
    already_enhanced: false,
  })),
}));

const express = require("express");
const request = require("supertest");
const specialistService = require("../../services/specialistService");
const specialistRoutes = require("../../routes/specialist");
const privateImageStorage = require("../../services/privateImageStorage");
const imageEnhancementService = require("../../services/imageEnhancementService");
const audit = require("../../utils/audit").audit;
const errorMiddleware = require("../../middleware/errorMiddleware");

const REFERRAL = "44444444-4444-4444-8444-444444444444";
const PHOTO = "55555555-5555-4555-8555-555555555555";
const PATIENT = "11111111-1111-4111-8111-111111111111";

function sessionRow(role = mockRole) {
  return {
    id: "specialist-1",
    username: "specialist.one",
    full_name: "Specialist One",
    role_id: 8,
    role_name: role,
    status: "ACTIVE",
    must_change_password: false,
    mfa_enabled: false,
    mfa_required: false,
    session_id: "session-1",
    mfa_verified: true,
  };
}

function assignedReferral(overrides = {}) {
  return {
    id: REFERRAL,
    patient_id: PATIENT,
    review_id: "review-1",
    referral_code: "REF-2026-000001",
    referral_status: "SENT",
    referral_mode: "HOSPITAL_VISIT",
    referral_reason: "Clinical review requested",
    screening_consent: true,
    screening_id: "screening-1",
    teleconsult_consent_status: "NOT_GIVEN",
    teleconsult_consent_at: null,
    assessment_completed_at: null,
    ...overrides,
  };
}

function defaultHandler(overrides = {}) {
  return (sql, params) => {
    for (const [pattern, answer] of Object.entries(overrides)) {
      if (sql.includes(pattern)) return typeof answer === "function" ? answer(sql, params) : answer;
    }
    if (sql.includes("JOIN tbl_user_sessions")) return { rows: [sessionRow()] };
    if (sql.includes("FROM tbl_referrals r")) return { rows: [assignedReferral()] };
    if (sql.includes("COUNT(*)::int AS total")) return { rows: [{ total: 0 }] };
    if (sql.includes("SELECT pc.granted")) return { rows: [{ granted: true }] };
    if (sql.includes("FROM tbl_screening_findings")) return { rows: [] };
    if (sql.includes("FROM tbl_ai_assessments")) return { rows: [] };
    if (sql.includes("FROM tbl_investigation_orders")) return { rows: [] };
    if (sql.includes("FROM tbl_video_consultations")) return { rows: [] };
    if (sql.includes("FROM tbl_screening_photos")) return { rows: [] };
    if (sql.includes("FROM tbl_audit_logs ae")) return { rows: [{ exists: true }] };
    if (sql.includes("SELECT set_config")) return { rows: [] };
    if (sql.includes("MAX(version_no)")) return { rows: [{ next_version: 1 }] };
    if (sql.includes("INSERT INTO tbl_consultation_notes")) {
      return { rows: [{
        id: "note-1", consultation_id: "consultation-1", version_no: 1,
        assessment: "Clinical assessment", recommendations: "Follow up",
        next_action: "FOLLOW_UP", signed_at: "2026-05-01T10:00:00Z",
      }] };
    }
    return { rows: [] };
  };
}

const app = express();
app.use(express.json());
app.use("/api/specialist", specialistRoutes);
app.use(errorMiddleware);
const call = (method, path) => request(app)[method](path).set("Authorization", "Bearer test-access-token");

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockRole = "SPECIALIST";
  mockPermissions = [
    "referral.view",
    "patient.read_assigned",
    "image.view",
    "appointment.view",
    "consultation.note",
  ];
  mockHandler = defaultHandler();
});

describe("Specialist API permissions and assignment isolation", () => {
  test("returns dashboard counts only within the assigned Specialist scope", async () => {
    mockHandler = defaultHandler({
      "COUNT(*)::int AS assigned": {
        rows: [{ assigned: 3, pending: 2, urgent: 1, completed: 1 }],
      },
    });

    const response = await call("get", "/api/specialist/dashboard");

    expect(response.status).toBe(200);
    expect(response.body.dashboard).toEqual({
      assigned: 3,
      pending: 2,
      urgent: 1,
      completed: 1,
    });
    const dashboardQuery = mockQueries.find(({ sql }) => sql.includes("COUNT(*)::int AS assigned"));
    expect(dashboardQuery.sql).toContain("r.assigned_specialist_id = $1");
    expect(dashboardQuery.sql).toContain("fn_user_has_patient_access($1, p.id)");
    expect(dashboardQuery.sql).toContain("ca.referral_id = r.id");
    expect(dashboardQuery.sql).toContain("consent.granted IS TRUE");
    expect(dashboardQuery.params).toEqual(["specialist-1"]);
  });

  test.each(["NOT_GIVEN", "ACTIVE", "DECLINED", "WITHDRAWN"])(
    "returns the latest TELECONSULT consent status %s for the assigned Specialist",
    async (status) => {
      mockHandler = defaultHandler({
        "FROM tbl_referrals r": {
          rows: [assignedReferral({
            teleconsult_consent_status: status,
            teleconsult_consent_at: "2026-11-07T10:00:00Z",
          })],
        },
      });

      const result = await specialistService.getReferral(
        "specialist-1",
        { user: { id: "specialist-1", role_name: "SPECIALIST" } },
        REFERRAL
      );
      expect(result.teleconsult_consent).toMatchObject({
        status,
        captured_at: "2026-11-07T10:00:00Z",
      });
      const referralQuery = mockQueries.find(({ sql }) => sql.includes("teleconsult_consent_status"));
      expect(referralQuery.sql).toContain("teleconsult_consent.previously_granted");
      expect(referralQuery.sql).toContain("purpose.code = 'TELECONSULT'");
    }
  );

  test("rejects non-Specialist roles before querying referral records", async () => {
    mockRole = "NAVIGATOR";
    const response = await call("get", "/api/specialist/referrals");
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_referrals r"))).toBe(false);
  });

  test.each([
    ["referral.view", "get", "/api/specialist/referrals"],
    ["patient.read_assigned", "get", `/api/specialist/referrals/${REFERRAL}`],
    ["image.view", "get", `/api/specialist/referrals/${REFERRAL}/images/${PHOTO}/file`],
    ["image.view", "post", `/api/specialist/referrals/${REFERRAL}/images/${PHOTO}/enhance`],
    ["appointment.slot_manage", "get", "/api/specialist/availability/slots"],
    ["appointment.slot_manage", "get", "/api/specialist/availability/hospitals"],
    ["appointment.slot_manage", "post", "/api/specialist/availability/slots"],
    ["appointment.slot_manage", "delete", "/api/specialist/availability/slots/55555555-5555-4555-8555-555555555555"],
    ["appointment.view", "get", `/api/specialist/referrals/${REFERRAL}/consultation-slots`],
    ["appointment.book", "post", `/api/specialist/referrals/${REFERRAL}/consultations`],
    ["patient.read_assigned", "get", `/api/specialist/referrals/${REFERRAL}/reports/66666666-6666-4666-8666-666666666666/file`],
    ["consultation.note", "put", `/api/specialist/referrals/${REFERRAL}/assessment/draft`],
  ])("requires %s permission", async (permission, method, path) => {
    mockPermissions = [
      "referral.view",
      "patient.read_assigned",
      "image.view",
      "consultation.note",
    ].filter((code) => code !== permission);
    const response = await call(method, path).send({
      assessment: "Assessment", next_action: "FOLLOW_UP",
    });
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_referrals r"))).toBe(false);
  });

  test("list scope limits results to the assigned Specialist and active case assignment", async () => {
    mockHandler = defaultHandler({
      "COUNT(*)::int AS total": { rows: [{ total: 12 }] },
      "ORDER BY pr.priority_rank": { rows: [] },
    });
    const result = await specialistService.listReferrals("specialist-1", {
      page: 2, page_size: 5, search: "AD-001", filter: "urgent",
    });
    expect(result.pagination).toEqual({ page: 2, page_size: 5, total: 12, total_pages: 3 });
    expect(result.referrals).toEqual([]);
    const list = mockQueries.find(({ sql }) => sql.includes("ORDER BY pr.priority_rank"));
    expect(list.sql).toContain("r.assigned_specialist_id = $1");
    expect(list.sql).toContain("fn_user_has_patient_access($1, p.id)");
    expect(list.sql).toContain("ca.referral_id = r.id");
    expect(list.sql).toContain("ca.valid_to IS NULL OR ca.valid_to > now()");
    expect(list.sql).toContain("consent.granted IS TRUE");
    expect(list.sql).toContain("pr.code = 'URGENT'");
    expect(list.params).toEqual(["specialist-1", "%AD-001%", 5, 5]);
  });

  test("unassigned referral identifiers return not found", async () => {
    mockHandler = defaultHandler({ "FROM tbl_referrals r": { rows: [] } });
    await expect(specialistService.getReferral("specialist-1", {}, REFERRAL))
      .rejects.toMatchObject({ status: 404, code: "REFERRAL_NOT_FOUND" });
  });

  test("withdrawn screening consent blocks referral details and image access", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral({ screening_consent: false })] },
    });
    await expect(specialistService.getReferral("specialist-1", {}, REFERRAL))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    await expect(specialistService.getOriginalImageFile("specialist-1", {}, REFERRAL, PHOTO))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(privateImageStorage.getFile).not.toHaveBeenCalled();
  });

  test("requires active IMAGE_CAPTURE consent before retrieving a private image", async () => {
    mockHandler = defaultHandler({
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });
    await expect(specialistService.getOriginalImageFile("specialist-1", {}, REFERRAL, PHOTO))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(privateImageStorage.getFile).not.toHaveBeenCalled();
  });

  test("creates a future video slot for only the authenticated Specialist and audits it", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_consultation_slots": {
        rows: [{
          id: "slot-1",
          slot_start: "2099-12-01T10:00:00.000Z",
          slot_end: "2099-12-01T10:30:00.000Z",
          mode: "VIDEO",
          is_booked: false,
        }],
      },
    });
    const result = await specialistService.createAvailabilitySlot(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      {
        slot_start: "2099-12-01T10:00:00.000Z",
        slot_end: "2099-12-01T10:30:00.000Z",
      }
    );

    expect(result).toMatchObject({ id: "slot-1", mode: "VIDEO", is_booked: false });
    const insert = mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"));
    expect(insert.sql).toContain("SELECT $1, $2, $3, $4, 'VIDEO', $1");
    expect(insert.params).toEqual([
      "specialist-1",
      null,
      "2099-12-01T10:00:00.000Z",
      "2099-12-01T10:30:00.000Z",
    ]);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "SPECIALIST_CONSULTATION_SLOT_CREATED",
      resourceType: "consultation_slot",
    }));
  });

  test("rejects overlapping availability using the database exclusion constraint", async () => {
    mockHandler = (sql) => {
      if (sql.includes("INSERT INTO tbl_consultation_slots")) {
        const error = new Error("overlap");
        error.code = "23P01";
        throw error;
      }
      return { rows: [] };
    };
    await expect(specialistService.createAvailabilitySlot(
      "specialist-1",
      {},
      {
        slot_start: "2099-12-01T10:00:00.000Z",
        slot_end: "2099-12-01T10:30:00.000Z",
      }
    )).rejects.toMatchObject({ status: 409, code: "SLOT_OVERLAP" });
  });

  test("rejects hospital scopes that are not actively assigned to the Specialist", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_user_facility_assignments assignment": { rows: [] },
    });
    await expect(specialistService.createAvailabilitySlot(
      "specialist-1",
      {},
      {
        slot_start: "2099-12-01T10:00:00.000Z",
        slot_end: "2099-12-01T10:30:00.000Z",
        hospital_id: 23,
      }
    )).rejects.toMatchObject({ status: 400, code: "INVALID_HOSPITAL_SCOPE" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_consultation_slots"))).toBe(false);
  });

  test("rejects non-future and reversed slot times", async () => {
    await expect(specialistService.createAvailabilitySlot(
      "specialist-1",
      {},
      {
        slot_start: "2000-12-01T10:00:00.000Z",
        slot_end: "2000-12-01T10:30:00.000Z",
      }
    )).rejects.toMatchObject({ status: 400, code: "SLOT_NOT_FUTURE" });
    await expect(specialistService.createAvailabilitySlot(
      "specialist-1",
      {},
      {
        slot_start: "2099-12-01T10:30:00.000Z",
        slot_end: "2099-12-01T10:00:00.000Z",
      }
    )).rejects.toMatchObject({ status: 400, code: "INVALID_SLOT_RANGE" });
  });

  test("cancels only future unbooked slots without linked consultations", async () => {
    mockHandler = defaultHandler({
      "SELECT id, slot_start, is_booked": {
        rows: [{
          id: "slot-1",
          slot_start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          is_booked: false,
        }],
      },
    });
    const result = await specialistService.cancelAvailabilitySlot(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      "55555555-5555-4555-8555-555555555555"
    );
    expect(result).toEqual({
      id: "55555555-5555-4555-8555-555555555555",
      cancelled: true,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("DELETE FROM tbl_consultation_slots"))).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "SPECIALIST_CONSULTATION_SLOT_CANCELLED",
      resourceType: "consultation_slot",
    }));
  });

  test("does not cancel booked slots", async () => {
    mockHandler = defaultHandler({
      "SELECT id, slot_start, is_booked": {
        rows: [{
          id: "slot-1",
          slot_start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          is_booked: true,
        }],
      },
    });
    await expect(specialistService.cancelAvailabilitySlot(
      "specialist-1",
      {},
      "55555555-5555-4555-8555-555555555555"
    )).rejects.toMatchObject({ status: 409, code: "SLOT_CANCELLATION_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("DELETE FROM tbl_consultation_slots"))).toBe(false);
  });

  test("does not cancel slots linked to consultations, including inactive consultations", async () => {
    mockHandler = defaultHandler({
      "SELECT id, slot_start, is_booked": {
        rows: [{
          id: "slot-1",
          slot_start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          is_booked: false,
        }],
      },
      "SELECT 1 FROM tbl_video_consultations WHERE slot_id": { rows: [{ id: "consultation-1" }] },
    });
    await expect(specialistService.cancelAvailabilitySlot(
      "specialist-1",
      {},
      "55555555-5555-4555-8555-555555555555"
    )).rejects.toMatchObject({ status: 409, code: "SLOT_CANCELLATION_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("DELETE FROM tbl_consultation_slots"))).toBe(false);
  });

  test("requires TELECONSULT consent before listing or creating a video consultation", async () => {
    mockPermissions = [
      "referral.view",
      "patient.read_assigned",
      "appointment.view",
      "appointment.book",
      "consultation.note",
    ];
    mockHandler = defaultHandler({
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });

    await expect(specialistService.getAvailableConsultationSlots("specialist-1", REFERRAL))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    await expect(specialistService.createConsultation(
      "specialist-1", {}, REFERRAL, { slot_id: "55555555-5555-4555-8555-555555555555" }
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("blocks video slot lookup and booking when TELECONSULT consent was never recorded", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral()] },
      "SELECT pc.granted": { rows: [] },
    });

    await expect(specialistService.getAvailableConsultationSlots("specialist-1", REFERRAL))
      .rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    await expect(specialistService.createConsultation(
      "specialist-1", {}, REFERRAL, { slot_id: "55555555-5555-4555-8555-555555555555" }
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("lists only future, unbooked video slots for the assigned Specialist and referral hospital", async () => {
    mockHandler = defaultHandler({
      "SELECT r.id, r.referral_code": {
        rows: [assignedReferral({ to_hospital_id: 23 })],
      },
      "FROM tbl_consultation_slots": {
        rows: [{ id: "slot-1", slot_start: "2026-12-01T10:00:00Z", slot_end: "2026-12-01T10:30:00Z", mode: "VIDEO" }],
      },
    });
    const slots = await specialistService.getAvailableConsultationSlots("specialist-1", REFERRAL);
    expect(slots).toHaveLength(1);
    const slotQuery = mockQueries.find(({ sql }) => sql.includes("FROM tbl_consultation_slots"));
    expect(slotQuery.sql).toContain("specialist_id = $1");
    expect(slotQuery.sql).toContain("is_booked IS FALSE");
    expect(slotQuery.sql).toContain("slot_start > now()");
    expect(slotQuery.sql).toContain("mode = 'VIDEO'");
    expect(slotQuery.params).toEqual(["specialist-1", 23]);
  });

  test("creates a consultation from an available assigned-Specialist video slot and audits it", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_video_consultations vc": { rows: [] },
      "FROM tbl_consultation_slots": {
        rows: [{
          id: "55555555-5555-4555-8555-555555555555",
          slot_start: "2026-12-01T10:00:00Z",
          slot_end: "2026-12-01T10:30:00Z",
          mode: "VIDEO",
        }],
      },
      "WHERE code = 'REQUESTED'": { rows: [{ id: 1 }] },
      "INSERT INTO tbl_video_consultations": {
        rows: [{
          consultation_id: "consultation-1",
          consultation_created_at: "2026-11-09T10:00:00Z",
          attendance: "PENDING",
        }],
      },
    });
    const result = await specialistService.createConsultation(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      REFERRAL,
      { slot_id: "55555555-5555-4555-8555-555555555555" }
    );

    expect(result).toMatchObject({
      consultation_id: "consultation-1",
      consultation_status: "Requested",
      mode: "VIDEO",
      already_exists: false,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "SPECIALIST_CONSULTATION_CREATED",
      resourceType: "video_consultation",
      patientId: PATIENT,
    }));
  });

  test("rejects a slot that is not available to the Specialist", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_video_consultations vc": { rows: [] },
      "FROM tbl_consultation_slots": { rows: [] },
    });
    await expect(specialistService.createConsultation(
      "specialist-1",
      {},
      REFERRAL,
      { slot_id: "55555555-5555-4555-8555-555555555555" }
    )).rejects.toMatchObject({ status: 409, code: "CONSULTATION_SLOT_UNAVAILABLE" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("does not run enhancement before assigned referral, patient access and image consent checks", async () => {
    mockHandler = defaultHandler({
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });
    await expect(specialistService.enhanceAssignedPhoto(
      "specialist-1", {}, REFERRAL, PHOTO
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(imageEnhancementService.enhancePhoto).not.toHaveBeenCalled();
  });

  test("reuses the real enhancement service only for the authorized screening photo", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_screening_photos ph": {
        rows: [{
          id: PHOTO, screening_id: "screening-1", private_key: "originals/screening/photo.jpg",
          mime_type: "image/jpeg", view: "FRONT_VIEW",
        }],
      },
    });
    const req = { user: { id: "specialist-1", role_name: "SPECIALIST" } };
    const result = await specialistService.enhanceAssignedPhoto(
      "specialist-1", req, REFERRAL, PHOTO
    );
    expect(result).toMatchObject({ photo_id: PHOTO, view: "FRONT_VIEW" });
    expect(imageEnhancementService.enhancePhoto).toHaveBeenCalledWith(
      req,
      { id: "screening-1", patient_id: PATIENT },
      { id: PHOTO, private_key: "originals/screening/photo.jpg", view: "FRONT_VIEW" }
    );
  });

  test("retrieves only a photo linked to the assigned referral after consent checks", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_screening_photos ph": {
        rows: [{
          id: PHOTO, screening_id: "screening-1", private_key: "originals/screening/photo.jpg",
          mime_type: "image/jpeg",
        }],
      },
    });
    const file = await specialistService.getOriginalImageFile(
      "specialist-1", { user: { id: "specialist-1", role_name: "SPECIALIST" } }, REFERRAL, PHOTO
    );
    expect(file).toMatchObject({ mimeType: "image/jpeg" });
    expect(privateImageStorage.getFile).toHaveBeenCalledWith("originals/screening/photo.jpg");
    const photoQuery = mockQueries.find(({ sql }) => sql.includes("FROM tbl_screening_photos ph"));
    expect(photoQuery.params).toEqual([PHOTO, PATIENT, "screening-1"]);
  });

  test("returns 404 when an authorized enhanced image is missing", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_screening_photos ph": {
        rows: [{
          id: PHOTO, screening_id: "screening-1", private_key: "originals/screening/photo.jpg",
          mime_type: "image/jpeg",
        }],
      },
    });
    privateImageStorage.getFile.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "IMAGE_FILE_MISSING" })
    );
    await expect(specialistService.getEnhancedImageFile(
      "specialist-1", {}, REFERRAL, PHOTO
    )).rejects.toMatchObject({ status: 404, code: "IMAGE_FILE_MISSING" });
    expect(privateImageStorage.getFile).toHaveBeenCalledWith(`enhanced/screening-1/${PHOTO}.jpg`);
  });

  test("returns the independently loaded patient, screening, MO, AI and investigation data", async () => {
    const mainReferral = assignedReferral({
      patient_code: "AD-001",
      patient_name: "Synthetic Patient",
      screening_case_state: "AWAITING_CLINICIAN",
      screening_date: "2026-04-01",
      chief_complaint: "Synthetic complaint",
      screening_notes: "Synthetic screening note",
      clinical_exam_done: true,
      medical_officer_finding: "Synthetic finding",
      medical_officer_impression: "Synthetic impression",
      medical_officer_recommendations: "Synthetic recommendation",
      medical_officer_signed_at: "2026-04-02T10:00:00Z",
    });
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [mainReferral] },
      "FROM tbl_screening_findings f": {
        rows: [{ id: "finding-1", finding_kind: "SYMPTOM", symptom_name: "Synthetic symptom" }],
      },
      "FROM tbl_patient_medical_histories h": {
        rows: [{ history_kind: "CONDITION", condition_text: "Synthetic condition" }],
      },
      "FROM tbl_ai_assessments a": {
        rows: [{
          id: "ai-1",
          status: "COMPLETED",
          result_label: "SUSPICIOUS_FOR_CLINICAL_REVIEW",
          score: 0.84,
          model_provider: "mock",
          model_version: "test-v1",
          analysis_details: { classification: "ABNORMAL", observations: ["Synthetic observation"] },
        }],
      },
      "FROM tbl_investigation_orders o": {
        rows: [{
          order_id: "order-1",
          investigation_name: "Synthetic investigation",
          investigation_status: "Completed",
          report_id: "report-1",
          summary_text: "Synthetic report summary",
        }],
      },
      "FROM tbl_video_consultations vc": { rows: [] },
      "SELECT ph.id, ph.screening_id, ph.view_type": {
        rows: [{
          id: PHOTO,
          screening_id: "screening-1",
          view_type: "FRONT_VIEW",
          width_px: 1200,
          height_px: 900,
        }],
      },
    });
    const result = await specialistService.getReferral(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      REFERRAL
    );
    expect(result.referral).toMatchObject({
      patient_code: "AD-001",
      chief_complaint: "Synthetic complaint",
      medical_officer_recommendations: "Synthetic recommendation",
    });
    expect(result.teleconsult_consent).toMatchObject({ status: "NOT_GIVEN", captured_at: null });
    expect(result.findings).toHaveLength(1);
    expect(result.medical_history).toHaveLength(1);
    expect(result.ai_observations[0].analysis_details.observations).toEqual(["Synthetic observation"]);
    expect(result.investigation_orders).toHaveLength(1);
    expect(result.reports).toEqual([expect.objectContaining({ id: "report-1", summary: "Synthetic report summary" })]);
    expect(JSON.stringify(result)).not.toContain("private_key");
    expect(JSON.stringify(result)).not.toContain("report_key");
  });

  test("surfaces a section query error without discarding other available details", async () => {
    const handler = defaultHandler();
    mockHandler = (sql, params) => {
      if (sql.includes("FROM tbl_ai_assessments a")) {
        throw Object.assign(new Error("synthetic query failure"), { code: "42P01" });
      }
      return handler(sql, params);
    };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await specialistService.getReferral(
        "specialist-1",
        { user: { id: "specialist-1", role_name: "SPECIALIST" } },
        REFERRAL
      );
      expect(result.section_errors).toMatchObject({ ai_analysis: "LOAD_FAILED" });
      expect(result.referral).toBeTruthy();
      expect(result.medical_history).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  test("shows the private-storage check failure stage on an affected image", async () => {
    mockHandler = defaultHandler({
      "SELECT ph.id, ph.screening_id, ph.view_type": {
        rows: [{
          id: PHOTO,
          screening_id: "screening-1",
          view_type: "FRONT_VIEW",
          width_px: 1200,
          height_px: 900,
        }],
      },
    });
    privateImageStorage.objectExists.mockRejectedValue(
      Object.assign(new Error("storage unavailable"), {
        status: 503,
        code: "IMAGE_STORAGE_CHECK_FAILED",
      })
    );

    const result = await specialistService.getReferral(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      REFERRAL
    );

    expect(result.images[0]).toMatchObject({
      enhancement_status: "UNAVAILABLE",
      enhancement_failure_stage: "STORAGE_CHECK",
      enhancement_error_code: "IMAGE_STORAGE_CHECK_FAILED",
    });
    expect(result.image_storage_warning).toBe("PRIVATE_STORAGE_UNAVAILABLE");
  });

  test("retrieves a report file only through the referral and patient scope", async () => {
    mockHandler = defaultHandler({
      "SELECT rp.report_key": {
        rows: [{ report_key: "reports/referral/report.pdf", mime_type: "application/pdf" }],
      },
    });
    const file = await specialistService.getInvestigationReportFile(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      REFERRAL,
      "66666666-6666-4666-8666-666666666666"
    );
    expect(file).toMatchObject({ mimeType: "application/pdf" });
    expect(privateImageStorage.getFile).toHaveBeenCalledWith("reports/referral/report.pdf");
    expect(JSON.stringify(file)).not.toContain("report_key");
  });
});

describe("Specialist consultation decisions", () => {
  const signedDecision = {
    id: "decision-1",
    decision_type: "DIRECT_HOSPITAL_VISIT",
    status: "SIGNED",
  };
  const persistDecision = {
    "INSERT INTO tbl_specialist_consultation_decisions": { rows: [signedDecision] },
  };

  test.each([
    ["VIDEO_CONSULTATION", { slot_id: "55555555-5555-4555-8555-555555555555" }],
    ["DIRECT_HOSPITAL_VISIT", { hospital_id: 8 }],
    ["ADDITIONAL_INVESTIGATIONS", { investigation_type_id: 2 }],
    ["CLINICAL_FOLLOW_UP", { follow_up_date: "2099-01-01" }],
    ["EMERGENCY_HOSPITAL_REFERRAL", {}],
  ])("accepts the %s decision type", (decision_type, fields) => {
    expect(specialistService.normalizeClinicalDecision({
      decision_type, clinical_reason: "Clinical review supports this decision.", ...fields,
    })).toMatchObject({ decisionType: decision_type });
  });

  test("rejects a missing clinical reason", async () => {
    await expect(specialistService.saveAssessment(
      "specialist-1", {}, REFERRAL, { decision_type: "DIRECT_HOSPITAL_VISIT" }, false
    )).rejects.toMatchObject({ status: 400, code: "INVALID_DECISION" });
    expect(mockQueries).toHaveLength(0);
  });

  test("saves a non-video draft without requiring a consultation or TELECONSULT consent", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_specialist_consultation_decisions": {
        rows: [{ id: "decision-1", status: "DRAFT" }],
      },
      "FROM tbl_user_facility_assignments assignment": { rows: [{ id: 8 }] },
    });
    const result = await specialistService.saveAssessment(
      "specialist-1", {}, REFERRAL,
      {
        decision_type: "DIRECT_HOSPITAL_VISIT",
        clinical_reason: "Hospital review is needed.",
        hospital_id: 8,
      },
      false
    );
    expect(result).toMatchObject({ id: "decision-1", status: "DRAFT" });
    expect(mockQueries.some(({ sql }) => sql.includes("tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_referrals"))).toBe(false);
  });

  test("signs a video decision with active consent without requiring a slot or creating a consultation", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_specialist_consultation_decisions": {
        rows: [{
          id: "decision-video",
          status: "SIGNED",
          decision_type: "VIDEO_CONSULTATION",
          consultation_id: null,
        }],
      },
    });
    const result = await specialistService.saveAssessment(
      "specialist-1",
      { user: { id: "specialist-1", permissions: ["consultation.note"] } },
      REFERRAL,
      {
        decision_type: "VIDEO_CONSULTATION",
        clinical_reason: "Remote review is appropriate.",
      },
      true
    );
    expect(result).toMatchObject({
      status: "SIGNED",
      decision_type: "VIDEO_CONSULTATION",
      consultation_id: null,
    });
    expect(mockQueries.some(({ sql, params }) =>
      sql.includes("WHERE pc.patient_id = $1 AND cp.code = $2") && params[1] === "TELECONSULT"
    )).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_referrals"))).toBe(false);
    const save = mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_specialist_consultation_decisions"));
    expect(save.params[13]).toBeNull();
    expect(save.params[15]).toBe("specialist-1");
  });

  test("submits a saved direct-hospital draft and returns its signed state", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_specialist_consultation_decisions": {
        rows: [{ id: "decision-draft", status: "DRAFT" }],
      },
      "FROM tbl_user_facility_assignments assignment": { rows: [{ id: 8 }] },
      "SELECT 1 FROM mst_referral_priorities": { rows: [{ id: 3 }] },
      "INSERT INTO tbl_specialist_consultation_decisions": {
        rows: [{
          id: "decision-draft",
          status: "SIGNED",
          decision_type: "DIRECT_HOSPITAL_VISIT",
          clinical_reason: "Synthetic reason",
          clinical_recommendation: "Synthetic recommendation",
          instructions: "Synthetic coordination instructions",
          priority_id: 3,
          hospital_id: 8,
          signed_by: "specialist-1",
        }],
      },
    });

    const result = await specialistService.saveAssessment(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      REFERRAL,
      {
        decision_type: "DIRECT_HOSPITAL_VISIT",
        clinical_reason: "Synthetic reason",
        clinical_recommendation: "Synthetic recommendation",
        instructions: "Synthetic coordination instructions",
        priority_id: 3,
        hospital_id: 8,
      },
      true
    );

    expect(result).toMatchObject({ id: "decision-draft", status: "SIGNED", signed_by: "specialist-1" });
    const save = mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_specialist_consultation_decisions"));
    expect(save.params).toEqual(expect.arrayContaining([
      "DIRECT_HOSPITAL_VISIT", "SIGNED", "Synthetic reason", "Synthetic recommendation",
      "Synthetic coordination instructions", 3, 8, "specialist-1",
    ]));
  });

  test("signs an investigation decision and tracks the order status", async () => {
    mockHandler = defaultHandler({
      "SELECT 1 FROM mst_investigation_types": { rows: [{ id: 1 }] },
      "SELECT id FROM mst_investigation_statuses": { rows: [{ id: 3 }] },
      "INSERT INTO tbl_investigation_orders": { rows: [{ id: "order-1" }] },
      "INSERT INTO tbl_specialist_consultation_decisions": {
        rows: [{ id: "decision-investigation", status: "SIGNED" }],
      },
    });
    const result = await specialistService.saveAssessment(
      "specialist-1", {}, REFERRAL,
      {
        decision_type: "ADDITIONAL_INVESTIGATIONS",
        clinical_reason: "Investigation is clinically indicated.",
        investigation_type_id: 2,
        instructions: "Review result when available.",
      },
      true
    );
    expect(result).toMatchObject({ id: "decision-investigation", status: "SIGNED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_investigation_status_history"))).toBe(true);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("signs a clinical follow-up decision with a future date and no video consent requirement", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_specialist_consultation_decisions": {
        rows: [{ id: "decision-followup", status: "SIGNED", decision_type: "CLINICAL_FOLLOW_UP" }],
      },
    });
    const result = await specialistService.saveAssessment(
      "specialist-1", {}, REFERRAL,
      {
        decision_type: "CLINICAL_FOLLOW_UP",
        clinical_reason: "Follow-up is clinically indicated.",
        follow_up_date: "2099-02-01",
      },
      true
    );
    expect(result).toMatchObject({ id: "decision-followup", status: "SIGNED" });
    expect(mockQueries.some(({ sql, params }) =>
      sql.includes("WHERE pc.patient_id = $1 AND cp.code = $2") && params[1] === "TELECONSULT"
    )).toBe(false);
  });

  test("does not submit video decisions without active TELECONSULT consent", async () => {
    mockHandler = defaultHandler({
      "SELECT pc.granted": { rows: [{ granted: false }] },
    });
    await expect(specialistService.saveAssessment(
      "specialist-1",
      { user: { id: "specialist-1", permissions: ["appointment.book"] } },
      REFERRAL,
      {
        decision_type: "VIDEO_CONSULTATION",
        clinical_reason: "Review findings remotely.",
        slot_id: "55555555-5555-4555-8555-555555555555",
      },
      true
    )).rejects.toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_specialist_consultation_decisions"))).toBe(false);
  });

  test("requires active TELECONSULT consent before signing a video decision", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_referrals r": { rows: [assignedReferral()] },
      "WHERE pc.patient_id = $1 AND cp.code = $2": { rows: [{ granted: false }] },
    });
    const error = await specialistService.saveAssessment(
      "specialist-1",
      { user: { id: "specialist-1", permissions: ["appointment.book"] } },
      REFERRAL,
      {
        decision_type: "VIDEO_CONSULTATION",
        clinical_reason: "Synthetic reason",
      },
      true
    ).catch((requestError) => requestError);
    expect(error).toMatchObject({ status: 403, code: "CONSENT_REQUIRED" });
    expect(error.message).toBe("The patient has no active TELECONSULT consent");
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
  });

  test("allows an emergency decision without TELECONSULT consent or a video appointment", async () => {
    mockHandler = defaultHandler(persistDecision);
    const result = await specialistService.saveAssessment(
      "specialist-1",
      { user: { id: "specialist-1", role_name: "SPECIALIST" } },
      REFERRAL,
      { decision_type: "EMERGENCY_HOSPITAL_REFERRAL", clinical_reason: "Urgent in-person assessment." },
      true
    );
    expect(result).toMatchObject({ status: "SIGNED" });
    expect(mockQueries.some(({ sql, params }) =>
      sql.includes("WHERE pc.patient_id = $1 AND cp.code = $2") && params[1] === "TELECONSULT"
    )).toBe(false);
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "SPECIALIST_CONSULTATION_DECISION_SIGNED",
    }));
  });

  test("does not allow a second signed decision or mark the referral complete", async () => {
    mockHandler = defaultHandler({
      "FROM tbl_specialist_consultation_decisions": {
        rows: [{ id: "decision-existing", status: "SIGNED" }],
      },
    });
    await expect(specialistService.saveAssessment(
      "specialist-1", {}, REFERRAL,
      {
        decision_type: "EMERGENCY_HOSPITAL_REFERRAL",
        clinical_reason: "Urgent in-person assessment.",
      },
      true
    )).rejects.toMatchObject({ status: 409, code: "DECISION_ALREADY_SIGNED" });
    expect(mockQueries.some(({ sql }) => sql.includes("UPDATE tbl_referrals"))).toBe(false);
    expect(mockQueries.some(({ sql }) =>
      /^(INSERT|UPDATE|DELETE)\s+.*tbl_specialist_consultation_decisions/i.test(sql.trim())
    )).toBe(false);
  });

  test.each(["NAVIGATOR", "HOSPITAL_STAFF"])("%s cannot submit clinical decisions", async (role) => {
    mockRole = role;
    const response = await call("post", `/api/specialist/referrals/${REFERRAL}/assessment/sign`)
      .send({ decision_type: "EMERGENCY_HOSPITAL_REFERRAL", clinical_reason: "Urgent." });
    expect(response.status).toBe(403);
    expect(mockQueries.some(({ sql }) => sql.includes("FROM tbl_referrals r"))).toBe(false);
  });

  test("returns the backend clinical-reason validation message for an invalid sign request", async () => {
    const response = await call("post", `/api/specialist/referrals/${REFERRAL}/assessment/sign`)
      .send({
        decision_type: "DIRECT_HOSPITAL_VISIT",
        clinical_reason: "   ",
        hospital_id: 8,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: "A clinical reason of up to 4000 characters is required",
      code: "INVALID_DECISION",
    });
  });

  test("signs a video decision without appointment-book permission or an existing slot", async () => {
    mockHandler = defaultHandler({
      "INSERT INTO tbl_specialist_consultation_decisions": {
        rows: [{
          id: "decision-video",
          decision_type: "VIDEO_CONSULTATION",
          status: "SIGNED",
          consultation_id: null,
        }],
      },
    });
    const response = await call("post", `/api/specialist/referrals/${REFERRAL}/assessment/sign`)
      .send({
        decision_type: "VIDEO_CONSULTATION",
        clinical_reason: "Synthetic video reason",
      });

    expect(response.status).toBe(200);
    expect(response.body.decision).toMatchObject({
      decision_type: "VIDEO_CONSULTATION",
      status: "SIGNED",
      consultation_id: null,
    });
    expect(mockQueries.some(({ sql }) => sql.includes("INSERT INTO tbl_video_consultations"))).toBe(false);
    const save = mockQueries.find(({ sql }) => sql.includes("INSERT INTO tbl_specialist_consultation_decisions"));
    expect(save.params[13]).toBeNull();
  });
});
