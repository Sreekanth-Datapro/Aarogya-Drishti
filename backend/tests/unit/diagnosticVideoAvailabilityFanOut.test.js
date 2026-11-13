/**
 * Synthetic tests for Path B Hospital Staff notification fan-out
 * after diagnostic reassessment creates an availability request.
 */
jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const {
  fanOutDiagnosticVideoAvailabilityNotifications,
} = require("../../services/specialistAvailabilityRequestService");

const REFERRAL_ID = "abababab-abab-4aba-8aba-abababababab";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const NAV_ID = "33333333-3333-4333-8333-333333333333";
const HW_ID = "44444444-4444-4444-8444-444444444444";
const SP_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "avail-request-1";

function buildClient({ existingDedupeKeys = new Set() } = {}) {
  const insertedPayloads = [];
  const client = {
    insertedPayloads,
    query: jest.fn(async (sql, params) => {
      if (sql.includes("SELECT DISTINCT staff.id")) {
        return { rows: [{ id: "hs-1" }, { id: "hs-2" }] };
      }
      if (sql.includes("FROM mst_notification_templates")) {
        return { rows: [{ id: 1, language_id: 1 }] };
      }
      if (sql.includes("FROM tbl_notifications") && sql.includes("dedupe_key")) {
        const dedupeKey = params?.[2];
        if (existingDedupeKeys.has(dedupeKey)) {
          return { rows: [{ exists: 1 }] };
        }
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_notifications")) {
        const payload = JSON.parse(params?.[4] || "{}");
        insertedPayloads.push(payload);
        if (payload.dedupe_key) existingDedupeKeys.add(payload.dedupe_key);
        return { rows: [] };
      }
      // Coordinator lookup used by notifyReferralCoordinators
      if (sql.includes("FROM tbl_referrals") || sql.includes("assigned_navigator_id")) {
        return {
          rows: [{
            assigned_navigator_id: NAV_ID,
            patient_id: PATIENT_ID,
            registered_by: HW_ID,
            health_worker_role: "HEALTH_WORKER",
            medical_officer_id: null,
          }],
        };
      }
      return { rows: [] };
    }),
  };
  return client;
}

describe("diagnostic Path B availability fan-out", () => {
  test("notifies Hospital Staff and does not auto-confirm", async () => {
    const client = buildClient();
    const result = await fanOutDiagnosticVideoAvailabilityNotifications(client, {
      referral: {
        id: REFERRAL_ID,
        patient_id: PATIENT_ID,
        to_hospital_id: 10,
      },
      requestId: REQUEST_ID,
      excludeUserId: SP_ID,
    });

    expect(result.hospital_staff_candidates).toBe(2);
    expect(result.hospital_staff_notified).toBe(2);
    expect(client.insertedPayloads.length).toBeGreaterThanOrEqual(2);
    expect(
      client.insertedPayloads.every((payload) => !String(payload.event || "").includes("CONFIRMED"))
    ).toBe(true);
    expect(
      client.insertedPayloads.some((payload) => payload.request_id === REQUEST_ID)
    ).toBe(true);
    expect(
      client.insertedPayloads.some((payload) => String(payload.target_path || "").includes("hospital-staff"))
    ).toBe(true);
  });

  test("repeated fan-out does not duplicate Hospital Staff notifications", async () => {
    const shared = new Set();
    const firstClient = buildClient({ existingDedupeKeys: shared });
    const first = await fanOutDiagnosticVideoAvailabilityNotifications(firstClient, {
      referral: {
        id: REFERRAL_ID,
        patient_id: PATIENT_ID,
        to_hospital_id: 10,
      },
      requestId: REQUEST_ID,
      excludeUserId: SP_ID,
    });
    expect(first.hospital_staff_notified).toBe(2);

    const secondClient = buildClient({ existingDedupeKeys: shared });
    const second = await fanOutDiagnosticVideoAvailabilityNotifications(secondClient, {
      referral: {
        id: REFERRAL_ID,
        patient_id: PATIENT_ID,
        to_hospital_id: 10,
      },
      requestId: REQUEST_ID,
      excludeUserId: SP_ID,
    });
    expect(second.hospital_staff_notified).toBe(0);
    expect(secondClient.insertedPayloads.filter((p) => p.event === "NAVIGATOR_VIDEO_PREFERRED_TIME")).toHaveLength(0);
  });
});
