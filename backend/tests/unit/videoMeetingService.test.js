process.env.VIDEO_PROVIDER = "jitsi";
process.env.JITSI_DOMAIN = "meet.jit.si";
delete process.env.JITSI_APP_ID;
delete process.env.JITSI_APP_SECRET;

const {
  deriveLifecycle,
  ensureMeetingProvisioned,
  isVideoProviderConfigured,
  issuePublicMeetingAccess,
  opaqueRoomRef,
  kolkataDateKey,
} = require("../../services/videoMeetingService");

describe("videoMeetingService (public meet.jit.si)", () => {
  test("is configured with VIDEO_PROVIDER and JITSI_DOMAIN only (no app secret)", () => {
    expect(isVideoProviderConfigured()).toBe(true);
  });

  test("deriveLifecycle enables join near start and blocks cancelled or expired meetings", () => {
    const start = new Date("2035-06-01T10:00:00.000Z");
    const end = new Date("2035-06-01T10:30:00.000Z");
    const early = deriveLifecycle({
      statusCode: "CONFIRMED",
      isActive: true,
      slotStart: start,
      slotEnd: end,
      now: new Date("2035-06-01T09:00:00.000Z"),
    });
    expect(early).toMatchObject({ lifecycle_status: "SCHEDULED", can_join: false, join_blocked_reason: "TOO_EARLY" });

    const open = deriveLifecycle({
      statusCode: "CONFIRMED",
      isActive: true,
      slotStart: start,
      slotEnd: end,
      now: new Date("2035-06-01T09:55:00.000Z"),
    });
    expect(open.can_join).toBe(true);

    const cancelled = deriveLifecycle({
      statusCode: "CANCELLED",
      isActive: false,
      slotStart: start,
      slotEnd: end,
      now: new Date("2035-06-01T10:05:00.000Z"),
    });
    expect(cancelled).toMatchObject({ can_join: false, join_blocked_reason: "CANCELLED" });
  });

  test("public meeting access returns domain and room without a Jitsi JWT", () => {
    const issued = issuePublicMeetingAccess({
      roomRef: "ad-room123",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      displayName: "Health Worker",
      moderator: false,
    });
    expect(issued.domain).toBe("meet.jit.si");
    expect(issued.room_ref).toBe("ad-room123");
    expect(issued.jwt).toBeNull();
    expect(issued.join_url).toContain("meet.jit.si");
    expect(issued.public_room_warning).toBe(true);
  });

  test("opaque room names are unique and do not embed patient details", () => {
    const first = opaqueRoomRef();
    const second = opaqueRoomRef();
    expect(first).not.toEqual(second);
    expect(first).toMatch(/^ad-[a-f0-9]{32}$/);
    expect(first.toLowerCase()).not.toContain("patient");
  });

  test("ensureMeetingProvisioned is idempotent when room_ref already exists", async () => {
    const client = { query: jest.fn() };
    const result = await ensureMeetingProvisioned(client, {
      id: "99999999-9999-4999-8999-999999999999",
      status_code: "CONFIRMED",
      is_active: true,
      provider: "jitsi",
      room_ref: "existing-room",
      meeting_expires_at: "2035-06-01T10:45:00.000Z",
    }, { slot_end: "2035-06-01T10:30:00.000Z" });
    expect(result).toMatchObject({
      provisioned: true,
      already_existed: true,
      room_ref: "existing-room",
    });
    expect(client.query).not.toHaveBeenCalled();
  });

  test("kolkataDateKey uses Asia/Kolkata calendar day", () => {
    expect(kolkataDateKey("2035-06-01T18:30:00.000Z")).toMatch(/2035-06-0[12]/);
  });
});
