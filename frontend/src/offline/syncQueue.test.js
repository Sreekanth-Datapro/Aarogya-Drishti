import { syncPendingRegistrations } from "./syncQueue";
import { DRAFT_STATUS } from "./constants";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock("./drafts", () => ({
  listRegistrationDrafts: jest.fn(),
  loadDraftPayload: jest.fn(),
  removeDraft: jest.fn(),
  updateDraftStatus: jest.fn(),
  toRegistrationApiBody: jest.requireActual("./drafts").toRegistrationApiBody,
  isSyncEligibleStatus: jest.requireActual("./drafts").isSyncEligibleStatus,
}));

jest.mock("./vault", () => ({
  wipeAllOfflineData: jest.fn(),
}));

const api = require("../services/api").default;
const drafts = require("./drafts");

describe("syncQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("skips when there is no online access token", async () => {
    const result = await syncPendingRegistrations({ pin: "1234", userId: "9" });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("not_online_authenticated");
    expect(api.post).not.toHaveBeenCalled();
  });

  test("treats idempotent already_registered response as synced", async () => {
    sessionStorage.setItem("accessToken", "tok");
    drafts.listRegistrationDrafts.mockResolvedValue([
      {
        idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: DRAFT_STATUS.PENDING,
      },
    ]);
    drafts.loadDraftPayload.mockResolvedValue({
      record: { idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      payload: {
        full_name: "Rama",
        sex: "FEMALE",
        age_years: 40,
        preferred_language_id: 1,
        village_id: 2,
        facility_id: 3,
        consents: { DATA_PROCESSING: true, SCREENING: true, IMAGE_CAPTURE: false },
        consent_method: "CHECKBOX",
        idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        client_created_at: "2026-11-11T10:00:00.000Z",
        consent_captured_at: "2026-11-11T10:01:00.000Z",
      },
    });
    api.post
      .mockResolvedValueOnce({ data: { matches: [] } })
      .mockResolvedValueOnce({
        status: 200,
        data: { success: true, patient: { already_registered: true, patient_code: "AD-1" } },
      });

    const result = await syncPendingRegistrations({ pin: "1234", userId: "9" });
    expect(result.synced).toBe(1);
    expect(drafts.removeDraft).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/patients",
      expect.objectContaining({
        idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        full_name: "Rama",
        client_created_at: "2026-11-11T10:00:00.000Z",
        consent_captured_at: "2026-11-11T10:01:00.000Z",
      })
    );
  });

  test("marks needs_confirmation when duplicate-check returns matches", async () => {
    sessionStorage.setItem("accessToken", "tok");
    drafts.listRegistrationDrafts.mockResolvedValue([
      { idempotency_key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: DRAFT_STATUS.PENDING },
    ]);
    drafts.loadDraftPayload.mockResolvedValue({
      record: {},
      payload: {
        full_name: "Sita",
        sex: "FEMALE",
        age_years: 35,
        preferred_language_id: 1,
        village_id: 2,
        facility_id: 3,
        consents: { DATA_PROCESSING: true, SCREENING: true, IMAGE_CAPTURE: true },
        consent_method: "CHECKBOX",
        idempotency_key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    });
    api.post.mockResolvedValueOnce({ data: { matches: [{ id: "p1" }] } });

    const result = await syncPendingRegistrations({ pin: "1234", userId: "9" });
    expect(result.needsConfirmation).toBe(1);
    expect(drafts.updateDraftStatus).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      DRAFT_STATUS.NEEDS_CONFIRMATION,
      expect.any(String)
    );
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  test("skips incomplete local_draft rows and does not call the API", async () => {
    sessionStorage.setItem("accessToken", "tok");
    drafts.listRegistrationDrafts.mockResolvedValue([
      { idempotency_key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status: DRAFT_STATUS.LOCAL_DRAFT },
    ]);

    const result = await syncPendingRegistrations({ pin: "1234", userId: "9" });
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(api.post).not.toHaveBeenCalled();
    expect(drafts.loadDraftPayload).not.toHaveBeenCalled();
  });
});
