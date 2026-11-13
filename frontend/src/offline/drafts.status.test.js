import { DRAFT_STATUS, SYNC_ELIGIBLE_STATUSES } from "./constants";
import { isSyncEligibleStatus } from "./drafts";

describe("offline draft sync eligibility", () => {
  test("local drafts are never sync-eligible", () => {
    expect(isSyncEligibleStatus(DRAFT_STATUS.LOCAL_DRAFT)).toBe(false);
    expect(SYNC_ELIGIBLE_STATUSES).not.toContain(DRAFT_STATUS.LOCAL_DRAFT);
  });

  test("pending, failed, needs_confirmation and syncing are sync-eligible", () => {
    expect(isSyncEligibleStatus(DRAFT_STATUS.PENDING)).toBe(true);
    expect(isSyncEligibleStatus(DRAFT_STATUS.FAILED)).toBe(true);
    expect(isSyncEligibleStatus(DRAFT_STATUS.NEEDS_CONFIRMATION)).toBe(true);
    expect(isSyncEligibleStatus(DRAFT_STATUS.SYNCING)).toBe(true);
  });

  test("synced status is not sync-eligible", () => {
    expect(isSyncEligibleStatus(DRAFT_STATUS.SYNCED)).toBe(false);
  });
});
