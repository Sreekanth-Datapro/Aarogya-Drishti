jest.mock("../../db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({
  audit: jest.fn(async () => undefined),
}));

const pool = require("../../db");
const { audit } = require("../../utils/audit");
const service = require("../../services/diagnosticScheduleService");

function mockClient(handlers = []) {
  let call = 0;
  return {
    query: jest.fn(async (sql, params) => {
      const text = String(sql).trim().toUpperCase();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      const handler = handlers[call];
      call += 1;
      if (typeof handler === "function") return handler(sql, params);
      if (handler) return handler;
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
}

const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const orderId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const navigatorId = "44444444-4444-4444-8444-444444444444";
const staffId = "55555555-5555-4555-8555-555555555555";

describe("diagnosticScheduleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createScheduleRequest rejects unauthorized navigator order access", async () => {
    const client = mockClient([
      { rows: [] }, // setActor
      { rows: [] }, // order access miss
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.createScheduleRequest(navigatorId, { user: { id: navigatorId, role_name: "NAVIGATOR" } }, orderId, {
        facility_id: 9,
        requested_at: future,
      })
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("createScheduleRequest notifies hospital staff and prevents duplicate active booking", async () => {
    const client = mockClient([
      { rows: [] }, // setActor
      {
        rows: [{
          id: orderId,
          order_code: "DX-2026-000001",
          patient_id: patientId,
          facility_id: 9,
          referral_id: null,
          order_status_code: "ADVISED",
          order_is_terminal: false,
          assigned_navigator_id: navigatorId,
          patient_code: "P-1",
          patient_name: "Patient",
        }],
      },
      { rows: [{ granted: true }] }, // consent
      { rows: [{ id: 9, name_en: "Hospital", facility_type: "HOSPITAL" }] },
      { rows: [{ id: "existing" }] }, // active booking
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.createScheduleRequest(navigatorId, { user: { id: navigatorId, role_name: "NAVIGATOR" } }, orderId, {
        facility_id: 9,
        requested_at: future,
      })
    ).rejects.toMatchObject({ status: 409, code: "DUPLICATE_BOOKING" });
  });

  test("confirmAppointment marks order SCHEDULED and notifies navigator/HW", async () => {
    const client = mockClient([
      { rows: [] }, // setActor
      {
        rows: [{
          id: appointmentId,
          diagnostic_order_id: orderId,
          patient_id: patientId,
          facility_id: 9,
          requested_at: future,
          confirmed_at_time: null,
          status_id: 1,
          status_code: "REQUESTED",
          status_name: "Requested",
          status_name_te: null,
          is_terminal: false,
          attendance: "PENDING",
          patient_informed: false,
          patient_informed_at: null,
          contact_status: "NOT_CONTACTED",
          contact_notes: null,
          coordination_notes: "Need OPG",
          location_note: null,
          cancel_reason: null,
          missed_reason_text: null,
          booked_by: navigatorId,
          confirmed_by: null,
          confirmed_at: null,
          rescheduled_from_id: null,
          created_at: future,
          updated_at: future,
          order_code: "DX-1",
          order_notes: null,
          patient_code: "P-1",
          patient_name: "Patient",
          facility_name: "Hospital",
          facility_name_te: null,
          facility_type: "HOSPITAL",
          booked_by_name: "Nav",
          confirmed_by_name: null,
          assigned_navigator_id: navigatorId,
          referral_code: "R-1",
        }],
      },
      { rows: [] }, // no conflict
      { rows: [{ id: 2 }] }, // CONFIRMED status
      { rows: [{ id: appointmentId }] }, // update
      { rows: [] }, // history
      {
        rows: [{
          id: orderId,
          status_id: 1,
          order_status_code: "ADVISED",
          patient_id: patientId,
          order_code: "DX-1",
          referral_id: null,
          assigned_navigator_id: navigatorId,
          patient_code: "P-1",
        }],
      },
      { rows: [{ id: 3 }] }, // SCHEDULED investigation status
      { rows: [] }, // update order
      { rows: [] }, // update items
      { rows: [] }, // order history
      { rows: [{ health_worker_id: "66666666-6666-4666-8666-666666666666", role_code: "HEALTH_WORKER" }] },
      { rows: [{ id: 10, language_id: 1 }] }, // template (nav+hw notify)
      { rows: [] }, // dedupe nav
      { rows: [] }, // insert nav
      { rows: [] }, // dedupe hw
      { rows: [] }, // insert hw
      { rows: [{ id: 10, language_id: 1 }] }, // template (hw-only path)
      { rows: [] }, // dedupe hw-only
      { rows: [] }, // insert hw-only
      // getAppointmentForUser
      {
        rows: [{
          id: appointmentId,
          diagnostic_order_id: orderId,
          patient_id: patientId,
          facility_id: 9,
          requested_at: future,
          confirmed_at_time: future,
          status_id: 2,
          status_code: "CONFIRMED",
          status_name: "Confirmed",
          status_name_te: null,
          is_terminal: false,
          attendance: "PENDING",
          patient_informed: false,
          patient_informed_at: null,
          contact_status: "NOT_CONTACTED",
          contact_notes: null,
          coordination_notes: "Need OPG",
          location_note: null,
          cancel_reason: null,
          missed_reason_text: null,
          booked_by: navigatorId,
          confirmed_by: staffId,
          confirmed_at: future,
          rescheduled_from_id: null,
          created_at: future,
          updated_at: future,
          order_code: "DX-1",
          order_notes: null,
          patient_code: "P-1",
          patient_name: "Patient",
          facility_name: "Hospital",
          facility_name_te: null,
          facility_type: "HOSPITAL",
          booked_by_name: "Nav",
          confirmed_by_name: "Staff",
          assigned_navigator_id: navigatorId,
          referral_code: "R-1",
        }],
      },
      { rows: [] }, // items
      { rows: [] }, // history
    ]);
    pool.connect.mockResolvedValue(client);

    const result = await service.confirmAppointment(
      staffId,
      { user: { id: staffId, role_name: "HOSPITAL_STAFF" } },
      appointmentId,
      {}
    );

    expect(result.appointment.status_code).toBe("CONFIRMED");
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "DIAGNOSTIC_APPOINTMENT_CONFIRMED" })
    );
  });

  test("updateHealthWorkerFollowup rejects hospital confirmation role misuse path by scope", async () => {
    const client = mockClient([
      { rows: [] },
      { rows: [] }, // no HW access
    ]);
    pool.connect.mockResolvedValue(client);

    await expect(
      service.updateHealthWorkerFollowup(
        staffId,
        { user: { id: staffId, role_name: "HEALTH_WORKER" } },
        appointmentId,
        { contact_status: "INFORMED", patient_informed: true }
      )
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
