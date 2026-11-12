jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));

const pool = require("../../db");
const { audit } = require("../../utils/audit");
const care = require("../../services/careLifecycleService");

function mockClient(handlers = []) {
  let call = 0;
  const client = {
    query: jest.fn(async (sql, params) => {
      const handler = handlers[call];
      call += 1;
      if (typeof handler === "function") return handler(sql, params);
      if (handler) return handler;
      return { rows: [], rowCount: 0 };
    }),
  };
  return client;
}

describe("careLifecycleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createMoCarePlan rejects empty medicines", async () => {
    await expect(
      care.createMoCarePlan("mo-1", { user: { id: "mo-1" } }, "11111111-1111-4111-8111-111111111111", {
        navigator_id: "22222222-2222-4222-8222-222222222222",
        clinical_summary: "Plan",
        medicines: [],
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_CARE" });
  });

  test("sendSpecialistReviewToNavigator is idempotent when plan already exists", async () => {
    const referralId = "33333333-3333-4333-8333-333333333333";
    const specialistId = "44444444-4444-4444-8444-444444444444";
    const planId = "55555555-5555-4555-8555-555555555555";

    const client = mockClient([
      { rows: [] }, // setActor configs may be one query
      {
        rows: [{
          id: referralId,
          patient_id: "66666666-6666-4666-8666-666666666666",
          referral_status: "ACCEPTED",
          assigned_specialist_id: specialistId,
          assigned_navigator_id: "77777777-7777-4777-8777-777777777777",
          assessment_completed_at: null,
          screening_id: "88888888-8888-4888-8888-888888888888",
          responsible_mo_id: "99999999-9999-4999-8999-999999999999",
          case_state: "APPOINTED",
          decision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          decision_status: "SIGNED",
          clinical_recommendation: "Use mouthwash",
          instructions: "Twice daily",
          additional_notes: null,
          decision_type: "CLINICAL_FOLLOW_UP",
        }],
      },
      { rows: [{ id: planId }] }, // existing active plan
      // loadPlanDetail queries
      {
        rows: [{
          id: planId,
          screening_id: "88888888-8888-4888-8888-888888888888",
          patient_id: "66666666-6666-4666-8666-666666666666",
          referral_id: referralId,
          source: "SPECIALIST",
          status: "AWAITING_NAVIGATOR",
          plan_version: 1,
          clinical_summary: "Use mouthwash",
          precautions: null,
          treatment_start_date: null,
          expected_end_date: null,
          responsible_mo_id: "99999999-9999-4999-8999-999999999999",
          assigned_navigator_id: "77777777-7777-4777-8777-777777777777",
          closed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          patient_code: "P-1",
          patient_name: "Test",
          medical_officer_name: "MO",
          navigator_name: "Nav",
          case_state: "APPOINTED",
        }],
      },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);

    // setActor does two set_config in one query - adjust: first query is setActor
    client.query = jest.fn(async (sql) => {
      if (String(sql).includes("set_config")) return { rows: [] };
      if (String(sql).includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: referralId,
            patient_id: "66666666-6666-4666-8666-666666666666",
            referral_status: "ACCEPTED",
            assigned_specialist_id: specialistId,
            assigned_navigator_id: "77777777-7777-4777-8777-777777777777",
            assessment_completed_at: null,
            screening_id: "88888888-8888-4888-8888-888888888888",
            responsible_mo_id: "99999999-9999-4999-8999-999999999999",
            case_state: "APPOINTED",
            decision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            decision_status: "SIGNED",
            clinical_recommendation: "Use mouthwash",
            instructions: "Twice daily",
            additional_notes: null,
            decision_type: "CLINICAL_FOLLOW_UP",
          }],
        };
      }
      if (String(sql).includes("SELECT id FROM tbl_care_plans") && String(sql).includes("referral_id")) {
        return { rows: [{ id: planId }] };
      }
      if (String(sql).includes("FROM tbl_care_plans plan") && String(sql).includes("JOIN tbl_patients")) {
        return {
          rows: [{
            id: planId,
            screening_id: "88888888-8888-4888-8888-888888888888",
            patient_id: "66666666-6666-4666-8666-666666666666",
            referral_id: referralId,
            source: "SPECIALIST",
            status: "AWAITING_NAVIGATOR",
            plan_version: 1,
            clinical_summary: "Use mouthwash",
            precautions: null,
            treatment_start_date: null,
            expected_end_date: null,
            responsible_mo_id: "99999999-9999-4999-8999-999999999999",
            assigned_navigator_id: "77777777-7777-4777-8777-777777777777",
            closed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            patient_code: "P-1",
            patient_name: "Test",
            medical_officer_name: "MO",
            navigator_name: "Nav",
            case_state: "APPOINTED",
          }],
        };
      }
      return { rows: [] };
    });

    pool.connect.mockResolvedValue({
      ...client,
      release: jest.fn(),
      query: async (...args) => {
        const sql = String(args[0] || "");
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        return client.query(...args);
      },
    });

    const result = await care.sendSpecialistReviewToNavigator(
      specialistId,
      { user: { id: specialistId } },
      referralId,
      {}
    );

    expect(result.id).toBe(planId);
    expect(result.status).toBe("AWAITING_NAVIGATOR");
    // Must not push screening back to MO clinician queue.
    const stateUpdates = client.query.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes("UPDATE tbl_screenings SET case_state"));
    expect(stateUpdates.some((sql) => sql.includes("AWAITING_CLINICIAN"))).toBe(false);
  });

  test("getCarePlanForNavigator returns 403 for unassigned navigator", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      care.getCarePlanForNavigator("nav-other", "55555555-5555-4555-8555-555555555555")
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  test("closeCarePlan requires final recovery confirmation", async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes("set_config") || sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }
        if (String(sql).includes("FROM tbl_care_plans plan")) {
          return {
            rows: [{
              id: "55555555-5555-4555-8555-555555555555",
              status: "FINAL_CHECKUP_PENDING",
              screening_id: "88888888-8888-4888-8888-888888888888",
              patient_id: "66666666-6666-4666-8666-666666666666",
              final_decision: null,
              recovery_confirmed: false,
            }],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);

    await expect(
      care.closeCarePlan("mo-1", { user: { id: "mo-1" } }, "55555555-5555-4555-8555-555555555555")
    ).rejects.toMatchObject({ status: 400, code: "FINAL_REVIEW_REQUIRED" });
  });

  test("reportDiscomfort rejects invalid issue type", async () => {
    await expect(
      care.reportDiscomfort("hw-1", { user: { id: "hw-1" } }, "55555555-5555-4555-8555-555555555555", {
        issue_type: "INVALID",
        severity: "MILD",
        description: "Pain",
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_CARE" });
  });

  test("exports expected clinical safety constants", () => {
    expect(care.ACTIVE_PLAN_STATUSES).toContain("AWAITING_NAVIGATOR");
    expect(care.ACTIVE_PLAN_STATUSES).not.toContain("CLOSED");
    expect(care.SCREENING_CLOSEABLE_STATES).toContain("REVIEWED");
    expect(care.SCREENING_CLOSEABLE_STATES).not.toContain("REFERRAL_PLANNED");
    expect(care.SCREENING_CLOSEABLE_STATES).not.toContain("APPOINTED");
    expect(audit).toBeDefined();
  });

  test("listCareEligiblePatients queries only claimed MO-scoped patients", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await care.listCareEligiblePatients("mo-1", { search: "rama" });
    expect(result.items).toEqual([]);
    const sql = String(pool.query.mock.calls[0][0]);
    expect(sql).toContain("tbl_medical_officer_case_claims");
    expect(sql).toContain("claim.medical_officer_id");
    expect(sql).toContain("NOT EXISTS");
    expect(pool.query.mock.calls[0][1][0]).toBe("mo-1");
  });

  const MO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER_MO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const SP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
  const NAV_ID = "22222222-2222-4222-8222-222222222222";
  const SCREENING_ID = "88888888-8888-4888-8888-888888888888";
  const PLAN_ID = "55555555-5555-4555-8555-555555555555";

  const validCreateInput = {
    navigator_id: NAV_ID,
    clinical_summary: "Community treatment for mild lesions",
    treatment_start_date: "2026-11-12",
    hospital_revisit_date: "2026-11-26",
    medicines: [
      {
        medicine_name: "Chlorhexidine",
        dosage: "10 ml",
        frequency: "Twice daily",
        duration_days: 14,
      },
    ],
  };

  function connectTx(queryImpl) {
    const client = {
      release: jest.fn(),
      query: jest.fn(async (sql, params) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        return queryImpl(String(sql), params);
      }),
    };
    pool.connect.mockResolvedValue(client);
    return client;
  }

  test("createMoCarePlan allows same MO who signed the latest review", async () => {
    const client = connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return { rows: [{ id: PATIENT_ID, claim_id: "c1", mandal_id: 1 }] };
      }
      if (sql.includes("tbl_clinical_reviews") && sql.includes("signed_at")) {
        return {
          rows: [{
            id: SCREENING_ID,
            case_state: "REVIEWED",
            review_id: "r1",
            decision: "TREAT_IN_COMMUNITY",
            doctor_id: MO_ID,
          }],
        };
      }
      if (sql.includes("FROM tbl_care_plans") && sql.includes("status = ANY")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_users u") && sql.includes("NAVIGATOR")) {
        return { rows: [{ id: NAV_ID }] };
      }
      if (sql.includes("INSERT INTO tbl_care_plans")) {
        return { rows: [{ id: PLAN_ID }] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_medicines")) return { rows: [] };
      if (sql.includes("tbl_navigator_assignments") || sql.includes("INSERT INTO tbl_patient_navigator")) {
        return { rows: [] };
      }
      if (sql.includes("mst_notification_templates")) {
        return { rows: [{ id: 1, language_id: 1 }] };
      }
      if (sql.includes("INSERT INTO tbl_notifications") || sql.includes("notification")) {
        return { rows: [{ id: 1 }] };
      }
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("JOIN tbl_patients")) {
        return {
          rows: [{
            id: PLAN_ID,
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            referral_id: null,
            source: "MO",
            status: "AWAITING_NAVIGATOR",
            plan_version: 1,
            clinical_summary: "Community treatment for mild lesions",
            precautions: null,
            treatment_start_date: null,
            expected_end_date: null,
            responsible_mo_id: MO_ID,
            assigned_navigator_id: NAV_ID,
            closed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            patient_code: "P-1",
            patient_name: "Rama",
            medical_officer_name: "MO",
            navigator_name: "Nav",
            case_state: "REVIEWED",
          }],
        };
      }
      return { rows: [] };
    });

    const result = await care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, validCreateInput);
    expect(result.id).toBe(PLAN_ID);
    expect(result.status).toBe("AWAITING_NAVIGATOR");
    const insertSql = client.query.mock.calls.map((c) => String(c[0])).find((s) => s.includes("INSERT INTO tbl_care_plans"));
    expect(insertSql).toBeTruthy();
  });

  test("createMoCarePlan rejects when a different MO signed the latest review", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return { rows: [{ id: PATIENT_ID, claim_id: "c1", mandal_id: 1 }] };
      }
      if (sql.includes("tbl_clinical_reviews") && sql.includes("signed_at")) {
        return {
          rows: [{
            id: SCREENING_ID,
            case_state: "REVIEWED",
            review_id: "r1",
            decision: "TREAT_IN_COMMUNITY",
            doctor_id: OTHER_MO_ID,
          }],
        };
      }
      return { rows: [] };
    });

    await expect(
      care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, validCreateInput)
    ).rejects.toMatchObject({ status: 403, code: "REVIEW_OWNER" });
  });

  test("createMoCarePlan rejects when there is no signed review", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return { rows: [{ id: PATIENT_ID, claim_id: "c1", mandal_id: 1 }] };
      }
      if (sql.includes("tbl_clinical_reviews") && sql.includes("signed_at")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, validCreateInput)
    ).rejects.toMatchObject({ status: 400, code: "REVIEW_REQUIRED" });
  });

  test("createMoCarePlan rejects out-of-scope mandal (no active claim)", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, validCreateInput)
    ).rejects.toMatchObject({ status: 403, code: "CLAIM_REQUIRED" });
  });

  test("createMoCarePlan rejects when an active care plan already exists", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return { rows: [{ id: PATIENT_ID, claim_id: "c1", mandal_id: 1 }] };
      }
      if (sql.includes("tbl_clinical_reviews") && sql.includes("signed_at")) {
        return {
          rows: [{
            id: SCREENING_ID,
            case_state: "REVIEWED",
            review_id: "r1",
            decision: "TREAT_IN_COMMUNITY",
            doctor_id: MO_ID,
          }],
        };
      }
      if (sql.includes("FROM tbl_care_plans") && sql.includes("status = ANY")) {
        return { rows: [{ id: PLAN_ID }] };
      }
      return { rows: [] };
    });

    await expect(
      care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, validCreateInput)
    ).rejects.toMatchObject({ status: 409, code: "PLAN_EXISTS" });
  });

  test("tryCloseScreening legally closes REVIEWED screening via DB transition helper", async () => {
    const client = {
      query: jest.fn(async (sql, params) => {
        const s = String(sql);
        if (s.includes("FROM tbl_screenings") && s.includes("FOR UPDATE")) {
          return { rows: [{ case_state: "REVIEWED" }] };
        }
        if (s.includes("fn_case_transition_allowed")) {
          expect(params[0]).toBe("REVIEWED");
          return { rows: [{ ok: true }] };
        }
        if (s.includes("SAVEPOINT") || s.includes("RELEASE SAVEPOINT")) return { rows: [] };
        if (s.includes("UPDATE tbl_screenings SET case_state = 'CLOSED'")) return { rows: [] };
        return { rows: [] };
      }),
    };

    const result = await care.tryCloseScreening(client, SCREENING_ID, {
      userId: MO_ID,
      planId: PLAN_ID,
      reason: "unit legal close",
    });
    expect(result).toMatchObject({
      screening_sync_status: "SYNCED",
      screening_closed: true,
      screening_case_state: "CLOSED",
    });
  });

  test("tryCloseScreening keeps PENDING_SCREENING_CLOSE for illegal close transition", async () => {
    const client = {
      query: jest.fn(async (sql, params) => {
        const s = String(sql);
        if (s.includes("FROM tbl_screenings") && s.includes("FOR UPDATE")) {
          return { rows: [{ case_state: "REFERRAL_PLANNED" }] };
        }
        if (s.includes("fn_case_transition_allowed")) {
          expect(params[0]).toBe("REFERRAL_PLANNED");
          return { rows: [{ ok: false }] };
        }
        if (s.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
        return { rows: [] };
      }),
    };

    const result = await care.tryCloseScreening(client, SCREENING_ID, {
      userId: MO_ID,
      planId: PLAN_ID,
      reason: "unit illegal close",
    });
    expect(result).toMatchObject({
      screening_sync_status: "PENDING_SCREENING_CLOSE",
      screening_closed: false,
      screening_case_state: "REFERRAL_PLANNED",
    });
    const updates = client.query.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("UPDATE tbl_screenings SET case_state"));
    expect(updates).toHaveLength(0);
  });

  test("closeCarePlan retries pending screening sync without duplicate final review", async () => {
    let finalReviewInserts = 0;
    let screeningCloseAttempts = 0;

    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("final_decision")) {
        return {
          rows: [{
            id: PLAN_ID,
            status: "CLOSED",
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            responsible_mo_id: MO_ID,
            final_decision: "CLOSE_RECOVERED",
            recovery_confirmed: true,
          }],
        };
      }
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("JOIN tbl_patients")) {
        return {
          rows: [{
            id: PLAN_ID,
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            referral_id: null,
            source: "MO",
            status: "CLOSED",
            plan_version: 1,
            clinical_summary: "Done",
            precautions: null,
            treatment_start_date: null,
            expected_end_date: null,
            responsible_mo_id: MO_ID,
            assigned_navigator_id: NAV_ID,
            closed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            patient_code: "P-1",
            patient_name: "Rama",
            medical_officer_name: "MO",
            navigator_name: "Nav",
            case_state: "REFERRAL_PLANNED",
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) {
        finalReviewInserts += 1;
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_screenings") && sql.includes("FOR UPDATE")) {
        return { rows: [{ case_state: "REVIEWED" }] };
      }
      if (sql.includes("fn_case_transition_allowed")) {
        return { rows: [{ ok: true }] };
      }
      if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK TO SAVEPOINT")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_screenings SET case_state = 'CLOSED'")) {
        screeningCloseAttempts += 1;
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await care.closeCarePlan(MO_ID, { user: { id: MO_ID } }, PLAN_ID);
    expect(finalReviewInserts).toBe(0);
    expect(screeningCloseAttempts).toBe(1);
    expect(result.screening_sync_status).toBe("SYNCED");
    expect(result.screening_closed).toBe(true);
  });

  test("closeCarePlan prevents duplicate close when already closed and screening synced", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("final_decision")) {
        return {
          rows: [{
            id: PLAN_ID,
            status: "CLOSED",
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            responsible_mo_id: MO_ID,
            final_decision: "CLOSE_RECOVERED",
            recovery_confirmed: true,
          }],
        };
      }
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("JOIN tbl_patients")) {
        return {
          rows: [{
            id: PLAN_ID,
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            referral_id: null,
            source: "MO",
            status: "CLOSED",
            plan_version: 1,
            clinical_summary: "Done",
            precautions: null,
            treatment_start_date: null,
            expected_end_date: null,
            responsible_mo_id: MO_ID,
            assigned_navigator_id: NAV_ID,
            closed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            patient_code: "P-1",
            patient_name: "Rama",
            medical_officer_name: "MO",
            navigator_name: "Nav",
            case_state: "CLOSED",
          }],
        };
      }
      return { rows: [] };
    });

    const result = await care.closeCarePlan(MO_ID, { user: { id: MO_ID } }, PLAN_ID);
    expect(result.status).toBe("CLOSED");
    expect(result.screening_sync_status).toBe("SYNCED");
  });

  function mockPlanRow(overrides = {}) {
    return {
      id: PLAN_ID,
      screening_id: SCREENING_ID,
      patient_id: PATIENT_ID,
      referral_id: null,
      source: "MO",
      status: "FINAL_CHECKUP_PENDING",
      plan_version: 1,
      clinical_summary: "Community treatment",
      precautions: null,
      treatment_start_date: "2026-11-12",
      expected_end_date: "2026-11-26",
      hospital_revisit_date: "2026-11-26",
      patient_informed: false,
      hospital_revisit_scheduled: false,
      hospital_attended: true,
      responsible_mo_id: MO_ID,
      assigned_navigator_id: NAV_ID,
      closed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      patient_code: "P-1",
      patient_name: "Rama",
      medical_officer_name: "MO",
      navigator_name: "Nav",
      case_state: "REVIEWED",
      mo_reassessment_outcome: null,
      ...overrides,
    };
  }

  function mockLoadPlanQueries(planOverrides = {}) {
    return (sql) => {
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("JOIN tbl_patients")) {
        return { rows: [mockPlanRow(planOverrides)] };
      }
      if (sql.includes("FROM tbl_care_medicines")) return { rows: [] };
      if (sql.includes("FROM tbl_care_followup_schedules")) return { rows: [] };
      if (sql.includes("FROM tbl_care_discomfort_reports")) return { rows: [] };
      if (sql.includes("FROM tbl_care_final_reviews")) return { rows: [] };
      return { rows: [] };
    };
  }

  test("finalReview CLOSE_RECOVERED closes only after recovery confirmation", async () => {
    const NEW_PLAN = PLAN_ID;
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF plan")) {
        return { rows: [mockPlanRow({ status: "FINAL_CHECKUP_PENDING" })] };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("CLOSED")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("FROM tbl_screenings") && sql.includes("FOR UPDATE")) {
        return { rows: [{ case_state: "REVIEWED" }] };
      }
      if (sql.includes("fn_case_transition_allowed")) return { rows: [{ ok: true }] };
      if (sql.includes("SAVEPOINT") || sql.includes("RELEASE SAVEPOINT") || sql.includes("ROLLBACK")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_screenings SET case_state = 'CLOSED'")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("SELECT registered_by")) return { rows: [{ registered_by: null }] };
      return mockLoadPlanQueries({ status: "CLOSED", closed_at: new Date().toISOString() })(sql);
    });

    const result = await care.finalReview(MO_ID, { user: { id: MO_ID } }, NEW_PLAN, {
      observations: "Lesions resolved",
      clinical_assessment: "Recovered",
      decision: "CLOSE_RECOVERED",
      recovery_confirmed: true,
    });
    expect(result.mo_reassessment_outcome).toBe("CLOSE_RECOVERED");
    expect(result.status).toBe("CLOSED");
  });

  test("finalReview CONTINUE_TREATMENT creates a new open plan and keeps case open", async () => {
    const SUCCESSOR_ID = "66666666-6666-4666-8666-666666666666";
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF plan")) {
        return { rows: [mockPlanRow({ status: "FINAL_CHECKUP_PENDING" })] };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("SUPERSEDED")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plans")) return { rows: [{ id: SUCCESSOR_ID }] };
      if (sql.includes("INSERT INTO tbl_care_medicines")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        id: SUCCESSOR_ID,
        status: "AWAITING_NAVIGATOR",
        plan_version: 2,
        mo_reassessment_outcome: null,
      })(sql);
    });

    const result = await care.finalReview(MO_ID, { user: { id: MO_ID } }, PLAN_ID, {
      observations: "Partial improvement",
      clinical_assessment: "Continue mouthwash",
      decision: "CONTINUE_TREATMENT",
      clinical_summary: "Continue chlorhexidine",
      treatment_start_date: "2026-11-27",
      hospital_revisit_date: "2026-12-11",
      medicines: validCreateInput.medicines,
    });
    expect(result.id).toBe(SUCCESSOR_ID);
    expect(result.status).toBe("AWAITING_NAVIGATOR");
    expect(result.mo_reassessment_outcome).toBe("CONTINUE_TREATMENT");
    expect(result.status).not.toBe("CLOSED");
  });

  test("finalReview REFER_SPECIALIST creates or reuses referral and parks MO plan", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF plan")) {
        return { rows: [mockPlanRow({ status: "FINAL_CHECKUP_PENDING" })] };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("FROM tbl_referrals") && sql.includes("PLANNED")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            referral_code: "REF-2026-000099",
            status: "PLANNED",
            assigned_navigator_id: NAV_ID,
          }],
        };
      }
      if (sql.includes("UPDATE tbl_care_plans SET referral_id")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans") && sql.includes("FOR UPDATE") && sql.includes("patient_id")) {
        return { rows: [{ id: PLAN_ID, status: "FINAL_CHECKUP_PENDING", referral_id: null }] };
      }
      if (sql.includes("UPDATE tbl_care_followup_schedules")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("SUPERSEDED")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        status: "SUPERSEDED",
        mo_reassessment_outcome: "REFER_SPECIALIST",
        referral_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })(sql);
    });

    const result = await care.finalReview(MO_ID, { user: { id: MO_ID } }, PLAN_ID, {
      observations: "Needs specialist",
      clinical_assessment: "Suspicious lesion persists",
      decision: "REFER_SPECIALIST",
      referral_reason: "Persistent lesion after community care",
      hospital_facility_id: 1,
      specialty_id: 1,
      priority_id: 1,
    });
    expect(result.referral_workflow_required).toBe(false);
    expect(result.referral?.referral_code).toBe("REF-2026-000099");
    expect(result.mo_reassessment_outcome).toBe("REFER_SPECIALIST");
    expect(result.status).toBe("SUPERSEDED");
    expect(result.status).not.toBe("CLOSED");
  });

  test("createMoCarePlan rejects while specialist referral is open even with allow_with_referral", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return {
          rows: [{
            id: PATIENT_ID,
            patient_code: "P-1",
            registered_facility_id: 1,
            mandal_id: 1,
            district_id: 1,
            claim_id: "c1",
          }],
        };
      }
      if (sql.includes("FROM tbl_screenings screening") || (sql.includes("tbl_clinical_reviews") && sql.includes("signed_at"))) {
        return {
          rows: [{
            id: SCREENING_ID,
            case_state: "REVIEWED",
            review_id: "r1",
            decision: "TREAT_IN_COMMUNITY",
            doctor_id: MO_ID,
            followup_instructions: null,
            finding: null,
          }],
        };
      }
      if (sql.includes("FROM tbl_referrals") && sql.includes("referral_status[]")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            referral_code: "REF-OPEN",
            status: "PLANNED",
          }],
        };
      }
      return { rows: [] };
    });

    await expect(
      care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, {
        ...validCreateInput,
        allow_with_referral: true,
      })
    ).rejects.toMatchObject({ status: 409, code: "REFERRAL_ACTIVE" });
  });

  test("confirmReturnFromSpecialist rejects when Specialist has not authorized return", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return {
          rows: [{
            id: PATIENT_ID,
            patient_code: "P-1",
            registered_facility_id: 1,
            mandal_id: 1,
            district_id: 1,
            claim_id: "c1",
          }],
        };
      }
      if (sql.includes("FROM tbl_referrals") && sql.includes("referral_status[]")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_care_return_to_mo")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      care.confirmReturnFromSpecialist(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, {
        notes: "Resume community care",
      })
    ).rejects.toMatchObject({ status: 409, code: "RETURN_NOT_AUTHORIZED" });
  });

  test("confirmReturnFromSpecialist rejects while Specialist care plan is active", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return {
          rows: [{
            id: PATIENT_ID,
            patient_code: "P-1",
            registered_facility_id: 1,
            mandal_id: 1,
            district_id: 1,
            claim_id: "c1",
          }],
        };
      }
      if (sql.includes("FROM tbl_referrals") && sql.includes("referral_status[]")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_care_return_to_mo")) {
        return {
          rows: [{
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            authorized_by: SP_ID,
            authorized_at: new Date().toISOString(),
            referral_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            notes: "Handoff",
          }],
        };
      }
      if (sql.includes("source = 'SPECIALIST'") && sql.includes("care_plan_status")) {
        return { rows: [{ id: PLAN_ID, status: "FOLLOWUP_ACTIVE" }] };
      }
      return { rows: [] };
    });

    await expect(
      care.confirmReturnFromSpecialist(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, {
        notes: "Resume community care",
      })
    ).rejects.toMatchObject({ status: 409, code: "SPECIALIST_CARE_ACTIVE" });
  });

  test("confirmReturnFromSpecialist succeeds after Specialist authorization and no active SP plan", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("tbl_medical_officer_case_claims")) {
        return {
          rows: [{
            id: PATIENT_ID,
            patient_code: "P-1",
            registered_facility_id: 1,
            mandal_id: 1,
            district_id: 1,
            claim_id: "c1",
          }],
        };
      }
      if (sql.includes("FROM tbl_referrals") && sql.includes("referral_status[]")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_care_return_to_mo") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            authorized_by: SP_ID,
            authorized_at: new Date().toISOString(),
            referral_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            notes: "Handoff",
          }],
        };
      }
      if (sql.includes("source = 'SPECIALIST'") && sql.includes("care_plan_status")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_referrals") && sql.includes("COMPLETED")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            referral_code: "REF-DONE",
            status: "COMPLETED",
          }],
        };
      }
      if (sql.includes("FROM tbl_care_plans") && sql.includes("source = 'MO'")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_care_return_to_mo")) return { rows: [] };
      return { rows: [] };
    });

    const result = await care.confirmReturnFromSpecialist(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, {
      notes: "Resume community care",
    });
    expect(result.eligible_for_mo_care_plan).toBe(true);
    expect(result.referral.referral_code).toBe("REF-DONE");
    expect(result.authorization_id).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(result.parked_plan_ids).toEqual([]);
  });

  test("finalReview URGENT_ESCALATION cancels routine follow-ups and keeps case open", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FOR UPDATE OF plan")) {
        return { rows: [mockPlanRow({ status: "FOLLOWUP_ACTIVE" })] };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_followup_schedules") && sql.includes("CANCELLED")) return { rows: [] };
      if (sql.includes("SELECT registered_by")) return { rows: [{ registered_by: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
      if (sql.includes("INSERT INTO tbl_care_discomfort_reports")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_plans SET status = 'MO_REASSESSMENT'")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        status: "MO_REASSESSMENT",
        mo_reassessment_outcome: "URGENT_ESCALATION",
      })(sql);
    });

    const result = await care.finalReview(MO_ID, { user: { id: MO_ID } }, PLAN_ID, {
      observations: "Rapid worsening",
      decision: "URGENT_ESCALATION",
      urgent_reason: "Severe pain and swelling",
    });
    expect(result.mo_reassessment_outcome).toBe("URGENT_ESCALATION");
    expect(result.status).toBe("MO_REASSESSMENT");
    expect(result.status).not.toBe("CLOSED");
  });

  test("createMoCarePlan requires hospital revisit date", async () => {
    await expect(
      care.createMoCarePlan(MO_ID, { user: { id: MO_ID } }, PATIENT_ID, {
        ...validCreateInput,
        hospital_revisit_date: null,
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_CARE" });
  });

  test("exports four MO reassessment decisions", () => {
    expect(care.FINAL_REVIEW_DECISIONS).toEqual([
      "CLOSE_RECOVERED",
      "CONTINUE_TREATMENT",
      "REFER_SPECIALIST",
      "URGENT_ESCALATION",
    ]);
  });

  test("scanMissedHospitalRevisits marks attendance false, logs once, notifies Nav and MO", async () => {
    const notified = [];
    const client = connectTx(async (sql, params) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans") && sql.includes("hospital_revisit_date < CURRENT_DATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            patient_id: PATIENT_ID,
            responsible_mo_id: MO_ID,
            assigned_navigator_id: NAV_ID,
            hospital_revisit_date: "2026-11-01",
            hospital_attended: null,
            status: "FOLLOWUP_ACTIVE",
          }],
        };
      }
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("hospital_attended = FALSE")) {
        return { rows: [{ id: PLAN_ID }] };
      }
      if (sql.includes("FROM tbl_care_plan_status_history") && sql.includes("reason")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications") && sql.includes("dedupe_key")) {
        return { rows: [] };
      }
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        notified.push(params[0]);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const marked = await care.scanMissedHospitalRevisits();
    expect(marked).toEqual([PLAN_ID]);
    expect(notified).toEqual([NAV_ID, MO_ID]);
    expect(client.query).toHaveBeenCalled();
  });

  test("scanMissedHospitalRevisits skips when already marked or notification deduped", async () => {
    const inserts = [];
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans") && sql.includes("hospital_revisit_date < CURRENT_DATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            patient_id: PATIENT_ID,
            responsible_mo_id: MO_ID,
            assigned_navigator_id: NAV_ID,
            hospital_revisit_date: "2026-11-01",
            hospital_attended: null,
            status: "FOLLOWUP_ACTIVE",
          }],
        };
      }
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("hospital_attended = FALSE")) {
        return { rows: [{ id: PLAN_ID }] };
      }
      if (sql.includes("FROM tbl_care_plan_status_history") && sql.includes("reason")) {
        return { rows: [{ "?column?": 1 }] };
      }
      if (sql.includes("FROM tbl_notifications") && sql.includes("dedupe_key")) {
        return { rows: [{ "?column?": 1 }] };
      }
      if (sql.includes("INSERT INTO tbl_notifications")) {
        inserts.push("notify");
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) {
        inserts.push("history");
        return { rows: [] };
      }
      return { rows: [] };
    });

    const marked = await care.scanMissedHospitalRevisits();
    expect(marked).toEqual([PLAN_ID]);
    expect(inserts).toEqual([]);
  });

  test("updateNavigatorCoordination reschedule clears missed attendance for future date", async () => {
    const future = "2099-01-15";
    connectTx(async (sql, params) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            patient_id: PATIENT_ID,
            status: "FOLLOWUP_ACTIVE",
            treatment_start_date: "2026-11-01",
            hospital_revisit_date: "2026-11-01",
            hospital_attended: false,
            patient_informed: true,
            hospital_revisit_scheduled: true,
          }],
        };
      }
      if (sql.includes("UPDATE tbl_care_plans")) {
        expect(params[3]).toBe(future);
        expect(params[4]).toBe(true);
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) {
        expect(String(params[4])).toContain("HOSPITAL_REVISIT_RESCHEDULED");
        return { rows: [] };
      }
      return mockLoadPlanQueries({
        hospital_revisit_date: future,
        hospital_attended: null,
        hospital_revisit_scheduled: true,
      })(sql);
    });

    const plan = await care.updateNavigatorCoordination(NAV_ID, { user: { id: NAV_ID } }, PLAN_ID, {
      hospital_revisit_date: future,
    });
    expect(plan.hospital_revisit_date).toBe(future);
    expect(plan.hospital_attended).toBeNull();
  });

  test("clinicalOwnerNotify routes Specialist-sourced plans to Specialist", () => {
    const owner = care.clinicalOwnerNotify({
      source: "SPECIALIST",
      responsible_specialist_id: SP_ID,
      responsible_mo_id: MO_ID,
    });
    expect(owner.userId).toBe(SP_ID);
    expect(owner.path).toBe("/specialist/care");
    expect(owner.role).toBe("sp");
  });

  test("finalReviewForSpecialist CLOSE_RECOVERED closes Specialist-owned plan", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("responsible_specialist_id") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            screening_id: "88888888-8888-4888-8888-888888888888",
            patient_id: PATIENT_ID,
            referral_id: null,
            source: "SPECIALIST",
            status: "FINAL_CHECKUP_PENDING",
            plan_version: 1,
            responsible_mo_id: MO_ID,
            responsible_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("CLOSED")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("UPDATE tbl_screenings")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("FROM tbl_patients") && sql.includes("registered_by")) {
        return { rows: [{ registered_by: null }] };
      }
      return mockLoadPlanQueries({
        source: "SPECIALIST",
        status: "CLOSED",
        responsible_specialist_id: SP_ID,
        mo_reassessment_outcome: "CLOSE_RECOVERED",
      })(sql);
    });

    const result = await care.finalReviewForSpecialist(SP_ID, { user: { id: SP_ID } }, PLAN_ID, {
      observations: "Recovered after specialist care",
      decision: "CLOSE_RECOVERED",
      recovery_confirmed: true,
    });
    expect(result.mo_reassessment_outcome).toBe("CLOSE_RECOVERED");
    expect(result.status).toBe("CLOSED");
  });

  const structuredCarePayload = {
    clinical_summary: "Specialist treatment after video consult",
    precautions: "Avoid spicy food",
    follow_up_instructions: "Navigator to schedule HW visit",
    treatment_start_date: "2026-11-12",
    hospital_revisit_date: "2026-11-26",
    precautions_duration_days: 14,
    medicines: [{
      medicine_name: "Chlorhexidine",
      dosage: "10ml",
      frequency: "Twice daily",
      duration_days: 14,
      precautions: "Do not swallow",
    }],
  };

  test("sendSpecialistReviewToNavigator rejects empty payload when creating a plan", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: "33333333-3333-4333-8333-333333333333",
            patient_id: PATIENT_ID,
            referral_status: "ACCEPTED",
            assigned_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
            assessment_completed_at: null,
            screening_id: SCREENING_ID,
            responsible_mo_id: MO_ID,
            case_state: "APPOINTED",
            decision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            decision_status: "SIGNED",
            clinical_recommendation: "Use mouthwash",
            instructions: "Twice daily",
            additional_notes: null,
            decision_type: "VIDEO_CONSULTATION",
          }],
        };
      }
      if (sql.includes("SELECT id FROM tbl_care_plans") && sql.includes("referral_id")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      care.sendSpecialistReviewToNavigator(SP_ID, { user: { id: SP_ID } }, "33333333-3333-4333-8333-333333333333", {})
    ).rejects.toMatchObject({ status: 400, code: "INVALID_CARE" });
  });

  test("sendSpecialistReviewToNavigator creates structured plan for VIDEO_CONSULTATION", async () => {
    const inserts = [];
    connectTx(async (sql, params) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: "33333333-3333-4333-8333-333333333333",
            patient_id: PATIENT_ID,
            referral_status: "ACCEPTED",
            assigned_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
            assessment_completed_at: null,
            screening_id: SCREENING_ID,
            responsible_mo_id: MO_ID,
            case_state: "APPOINTED",
            decision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            decision_status: "SIGNED",
            clinical_recommendation: "Use mouthwash",
            instructions: "Twice daily",
            additional_notes: null,
            decision_type: "VIDEO_CONSULTATION",
          }],
        };
      }
      if (sql.includes("SELECT id FROM tbl_care_plans") && sql.includes("referral_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_care_plans") && sql.includes("source = 'MO'")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE tbl_referrals")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_referral_status_history")) return { rows: [] };
      if (sql.includes("UPDATE tbl_screenings")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plans")) {
        inserts.push({ sql, params });
        return { rows: [{ id: PLAN_ID }] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_medicines")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_case_assignments") || sql.includes("tbl_case_assignments")) {
        return { rows: [] };
      }
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications") && sql.includes("dedupe")) return { rows: [] };
      return mockLoadPlanQueries({
        source: "SPECIALIST",
        status: "AWAITING_NAVIGATOR",
        responsible_specialist_id: SP_ID,
        clinical_summary: structuredCarePayload.clinical_summary,
      })(sql);
    });

    const result = await care.sendSpecialistReviewToNavigator(
      SP_ID,
      { user: { id: SP_ID } },
      "33333333-3333-4333-8333-333333333333",
      structuredCarePayload
    );
    expect(result.source).toBe("SPECIALIST");
    expect(result.status).toBe("AWAITING_NAVIGATOR");
    expect(inserts[0].params).toContain(SP_ID);
    expect(inserts[0].params).toContain(structuredCarePayload.clinical_summary);
  });

  test("sendSpecialistReviewToNavigator creates structured plan for DIRECT_HOSPITAL_VISIT", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: "33333333-3333-4333-8333-333333333333",
            patient_id: PATIENT_ID,
            referral_status: "ACCEPTED",
            assigned_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
            assessment_completed_at: null,
            screening_id: SCREENING_ID,
            responsible_mo_id: MO_ID,
            case_state: "APPOINTED",
            decision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            decision_status: "SIGNED",
            clinical_recommendation: null,
            instructions: null,
            additional_notes: null,
            decision_type: "DIRECT_HOSPITAL_VISIT",
          }],
        };
      }
      if (sql.includes("SELECT id FROM tbl_care_plans") && sql.includes("referral_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_care_plans") && sql.includes("source = 'MO'")) return { rows: [] };
      if (sql.includes("UPDATE tbl_referrals")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_referral_status_history")) return { rows: [] };
      if (sql.includes("UPDATE tbl_screenings")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plans")) return { rows: [{ id: PLAN_ID }] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_medicines")) return { rows: [] };
      if (sql.includes("tbl_case_assignments")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        source: "SPECIALIST",
        status: "AWAITING_NAVIGATOR",
        responsible_specialist_id: SP_ID,
      })(sql);
    });

    const result = await care.sendSpecialistReviewToNavigator(
      SP_ID,
      { user: { id: SP_ID } },
      "33333333-3333-4333-8333-333333333333",
      structuredCarePayload
    );
    expect(result.source).toBe("SPECIALIST");
  });

  test("authorizeReturnToMo records Specialist handoff authorization", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans plan") && sql.includes("responsible_specialist_id")) {
        return { rows: [{ id: PLAN_ID }] };
      }
      if (sql.includes("FROM tbl_referrals") && sql.includes("referral_status[]")) {
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_referrals")) {
        return {
          rows: [{
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            referral_code: "REF-1",
            status: "COMPLETED",
            assigned_navigator_id: NAV_ID,
            responsible_mo_id: MO_ID,
          }],
        };
      }
      if (sql.includes("FROM tbl_care_return_to_mo") && sql.includes("confirmed_at IS NULL") && !sql.includes("INSERT")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_care_return_to_mo")) {
        return { rows: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", authorized_at: new Date().toISOString() }] };
      }
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      return { rows: [] };
    });

    const result = await care.authorizeReturnToMo(SP_ID, { user: { id: SP_ID } }, PATIENT_ID, {
      notes: "Clinical handoff complete",
    });
    expect(result.authorization_id).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(result.already_authorized).toBe(false);
  });

  test("finalReviewForSpecialist CONTINUE_TREATMENT keeps Specialist ownership", async () => {
    connectTx(async (sql, params) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("responsible_specialist_id") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            referral_id: null,
            source: "SPECIALIST",
            status: "FINAL_CHECKUP_PENDING",
            plan_version: 1,
            responsible_mo_id: MO_ID,
            responsible_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("SUPERSEDED")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plans")) {
        expect(params).toContain("SPECIALIST");
        expect(params).toContain(SP_ID);
        return { rows: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_medicines")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        source: "SPECIALIST",
        status: "AWAITING_NAVIGATOR",
        responsible_specialist_id: SP_ID,
        mo_reassessment_outcome: "CONTINUE_TREATMENT",
      })(sql);
    });

    const result = await care.finalReviewForSpecialist(SP_ID, { user: { id: SP_ID } }, PLAN_ID, {
      observations: "Needs more treatment",
      decision: "CONTINUE_TREATMENT",
      clinical_summary: "Continue chlorhexidine",
      treatment_start_date: "2026-11-12",
      hospital_revisit_date: "2026-11-26",
      medicines: structuredCarePayload.medicines,
    });
    expect(result.mo_reassessment_outcome).toBe("CONTINUE_TREATMENT");
    expect(result.status).not.toBe("CLOSED");
  });

  test("finalReviewForSpecialist URGENT_ESCALATION keeps case open", async () => {
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("responsible_specialist_id") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            screening_id: SCREENING_ID,
            patient_id: PATIENT_ID,
            referral_id: null,
            source: "SPECIALIST",
            status: "FOLLOWUP_ACTIVE",
            plan_version: 1,
            responsible_mo_id: MO_ID,
            responsible_specialist_id: SP_ID,
            assigned_navigator_id: NAV_ID,
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_care_final_reviews")) return { rows: [] };
      if (sql.includes("UPDATE tbl_care_followup_schedules")) return { rows: [] };
      if (sql.includes("SELECT registered_by")) return { rows: [{ registered_by: null }] };
      if (sql.includes("UPDATE tbl_care_plans SET status = 'MO_REASSESSMENT'")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        source: "SPECIALIST",
        status: "MO_REASSESSMENT",
        responsible_specialist_id: SP_ID,
        mo_reassessment_outcome: "URGENT_ESCALATION",
      })(sql);
    });

    const result = await care.finalReviewForSpecialist(SP_ID, { user: { id: SP_ID } }, PLAN_ID, {
      observations: "Worsening urgently",
      decision: "URGENT_ESCALATION",
      urgent_reason: "Severe bleeding",
    });
    expect(result.mo_reassessment_outcome).toBe("URGENT_ESCALATION");
    expect(result.status).toBe("MO_REASSESSMENT");
    expect(result.status).not.toBe("CLOSED");
  });

  test("scheduleFollowup assigns Health Worker on Specialist plan", async () => {
    const HW_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    connectTx(async (sql) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            patient_id: PATIENT_ID,
            status: "AWAITING_NAVIGATOR",
            assigned_navigator_id: NAV_ID,
            referral_id: null,
            source: "SPECIALIST",
          }],
        };
      }
      if (sql.includes("mst_roles") && sql.includes("HEALTH_WORKER")) {
        return { rows: [{ id: HW_ID }] };
      }
      if (sql.includes("FROM tbl_care_followup_schedules") && sql.includes("SCHEDULED")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_care_followup_schedules")) {
        return { rows: [{ id: "12121212-1212-4121-8121-121212121212", due_at: "2026-11-13T10:00:00.000Z" }] };
      }
      if (sql.includes("UPDATE tbl_care_plans")) return { rows: [] };
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("tbl_case_assignments")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        source: "SPECIALIST",
        status: "FOLLOWUP_ACTIVE",
        responsible_specialist_id: SP_ID,
      })(sql);
    });

    const result = await care.scheduleFollowup(NAV_ID, { user: { id: NAV_ID } }, PLAN_ID, {
      health_worker_id: HW_ID,
      due_at: "2026-11-13T10:00:00.000Z",
      instructions: "Check adherence",
    });
    expect(result.plan.status).toBe("FOLLOWUP_ACTIVE");
    expect(result.schedule.id).toBe("12121212-1212-4121-8121-121212121212");
  });

  test("submitFollowupReport notifies Specialist for Specialist-owned plan", async () => {
    const notified = [];
    const SCHEDULE_ID = "13131313-1313-4131-8131-131313131313";
    const HW_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    connectTx(async (sql, params) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_followup_schedules") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: SCHEDULE_ID,
            plan_id: PLAN_ID,
            patient_id: PATIENT_ID,
            assigned_hw_id: HW_ID,
            status: "SCHEDULED",
            assigned_navigator_id: NAV_ID,
            plan_status: "FOLLOWUP_ACTIVE",
            responsible_mo_id: MO_ID,
            responsible_specialist_id: SP_ID,
            source: "SPECIALIST",
          }],
        };
      }
      if (sql.includes("INSERT INTO tbl_care_followup_reports")) {
        return { rows: [{ id: "14141414-1414-4141-8141-141414141414" }] };
      }
      if (sql.includes("UPDATE tbl_care_followup_schedules")) return { rows: [] };
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        notified.push(params[0]);
        return { rows: [] };
      }
      if (sql.includes("FROM tbl_notifications")) return { rows: [] };
      return mockLoadPlanQueries({
        source: "SPECIALIST",
        status: "FOLLOWUP_ACTIVE",
        responsible_specialist_id: SP_ID,
      })(sql);
    });

    const result = await care.submitFollowupReport(HW_ID, { user: { id: HW_ID } }, SCHEDULE_ID, {
      adhering_to_treatment: true,
      precautions_followed: true,
      improvement_noted: true,
    });
    expect(result.report_id).toBe("14141414-1414-4141-8141-141414141414");
    expect(notified).toContain(NAV_ID);
  });

  test("scanMissedHospitalRevisits notifies Specialist for Specialist-owned plans", async () => {
    const notified = [];
    connectTx(async (sql, params) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM tbl_care_plans") && sql.includes("hospital_revisit_date < CURRENT_DATE")) {
        return {
          rows: [{
            id: PLAN_ID,
            patient_id: PATIENT_ID,
            responsible_mo_id: MO_ID,
            responsible_specialist_id: SP_ID,
            source: "SPECIALIST",
            assigned_navigator_id: NAV_ID,
            hospital_revisit_date: "2026-11-01",
            hospital_attended: null,
            status: "FOLLOWUP_ACTIVE",
          }],
        };
      }
      if (sql.includes("UPDATE tbl_care_plans") && sql.includes("hospital_attended = FALSE")) {
        return { rows: [{ id: PLAN_ID }] };
      }
      if (sql.includes("FROM tbl_care_plan_status_history") && sql.includes("reason")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_care_plan_status_history")) return { rows: [] };
      if (sql.includes("FROM tbl_notifications") && sql.includes("dedupe_key")) {
        return { rows: [] };
      }
      if (sql.includes("mst_notification_templates")) return { rows: [{ id: 1, language_id: 1 }] };
      if (sql.includes("INSERT INTO tbl_notifications")) {
        notified.push(params[0]);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const marked = await care.scanMissedHospitalRevisits();
    expect(marked).toEqual([PLAN_ID]);
    expect(notified).toEqual([NAV_ID, SP_ID]);
  });
});
