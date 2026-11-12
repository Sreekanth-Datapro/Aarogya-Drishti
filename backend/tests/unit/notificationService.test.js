let mockQueryHandler;
const mockQueries = [];

jest.mock("../../db", () => ({
  query: jest.fn((sql, params) => {
    mockQueries.push({ sql, params });
    return mockQueryHandler(sql, params);
  }),
}));

const service = require("../../services/notificationService");

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOTIFICATION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockQueryHandler = (sql) => {
    if (sql.includes("COUNT(*)")) return { rows: [{ unread_count: 1 }] };
    return {
      rows: [{
        id: NOTIFICATION,
        created_at: new Date("2026-11-11T09:00:00Z"),
        delivery_status: "SENT",
        payload: {
          event: "SPECIALIST_AVAILABILITY_REQUEST",
          request_id: REQUEST,
          title: "Specialist availability request",
          message: "Availability response requested.",
        },
        subject: "Reminder",
        body: "Template fallback",
        is_read: false,
      }],
    };
  };
});

test("lists only the authenticated user's notifications with unread count and internal request link", async () => {
  const result = await service.listForUser(USER);

  expect(result.unread_count).toBe(1);
  expect(result.notifications[0]).toMatchObject({
    id: NOTIFICATION,
    is_read: false,
    event_type: "SPECIALIST_AVAILABILITY_REQUEST",
    target_path: `/specialist/referrals#availability-request-${REQUEST}`,
  });
  expect(mockQueries.map((query) => query.params[0])).toEqual([USER, USER]);
  expect(mockQueries.every((query) => query.sql.includes("recipient_user_id = $1"))).toBe(true);
});

test("does not generate navigation links for arbitrary notification payloads", async () => {
  mockQueryHandler = (sql) => sql.includes("COUNT(*)")
    ? { rows: [{ unread_count: 0 }] }
    : { rows: [{
      id: NOTIFICATION,
      payload: { event: "UNRECOGNIZED", request_id: REQUEST, target_path: "https://example.invalid" },
      is_read: true,
    }] };

  const result = await service.listForUser(USER);
  expect(result.notifications[0].target_path).toBeNull();
});

test("marks a notification read only for its recipient", async () => {
  mockQueryHandler = (sql, params) => {
    expect(sql).toContain("recipient_user_id = $2");
    expect(sql).toContain("jsonb_set");
    expect(params).toEqual([NOTIFICATION, USER]);
    return { rows: [{ id: NOTIFICATION, read_at: "2026-11-11T09:00:00Z" }] };
  };

  await expect(service.markRead(USER, NOTIFICATION)).resolves.toMatchObject({ id: NOTIFICATION });
});

test("returns not found when the notification is not owned by the authenticated user", async () => {
  mockQueryHandler = () => ({ rows: [] });
  await expect(service.markRead(OTHER_USER, NOTIFICATION)).rejects.toMatchObject({
    status: 404,
    code: "NOTIFICATION_NOT_FOUND",
  });
});

test("creates in-app notifications for Medical Officers with dedupe and target path", async () => {
  const client = {
    query: jest.fn(async (sql, params) => {
      mockQueries.push({ sql, params });
      if (sql.includes("FROM mst_notification_templates")) {
        return { rows: [{ id: 9, language_id: 1 }] };
      }
      if (sql.includes("FROM tbl_notifications") && sql.includes("dedupe_key")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO tbl_notifications")) {
        return { rows: [{ id: NOTIFICATION }] };
      }
      return { rows: [] };
    }),
  };

  const created = await service.createInAppNotifications(client, {
    recipients: [USER, USER, OTHER_USER],
    patientId: "11111111-1111-4111-8111-111111111111",
    event: "SCREENING_AWAITING_REVIEW",
    title: "New screening awaiting review",
    message: "A screening is waiting in your queue.",
    targetPath: "/medical-officer/queue",
    dedupeKey: "SCREENING_AWAITING_REVIEW:screening-1",
  });

  expect(created).toBe(2);
  const inserts = mockQueries.filter((query) => query.sql.includes("INSERT INTO tbl_notifications"));
  expect(inserts).toHaveLength(2);
  expect(JSON.parse(inserts[0].params[4])).toMatchObject({
    event: "SCREENING_AWAITING_REVIEW",
    target_path: "/medical-officer/queue",
    dedupe_key: `SCREENING_AWAITING_REVIEW:screening-1:${USER}`,
  });
});

test("skips duplicate notification creation for the same dedupe key", async () => {
  const client = {
    query: jest.fn(async (sql) => {
      if (sql.includes("FROM mst_notification_templates")) {
        return { rows: [{ id: 9, language_id: 1 }] };
      }
      if (sql.includes("dedupe_key")) {
        return { rows: [{ "?column?": 1 }] };
      }
      return { rows: [] };
    }),
  };

  const created = await service.createInAppNotifications(client, {
    recipients: [USER],
    event: "CASE_ASSIGNED_TO_MO",
    title: "Assigned",
    message: "Claimed",
    targetPath: "/medical-officer/review",
    dedupeKey: "CASE_ASSIGNED_TO_MO:claim-1",
  });

  expect(created).toBe(0);
  expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO tbl_notifications"))).toBe(false);
});

test("lists Medical Officer absolute target paths from payload", async () => {
  mockQueryHandler = (sql) => sql.includes("COUNT(*)")
    ? { rows: [{ unread_count: 1 }] }
    : {
      rows: [{
        id: NOTIFICATION,
        created_at: new Date("2026-11-11T09:00:00Z"),
        delivery_status: "SENT",
        payload: {
          event: "SCREENING_AWAITING_REVIEW",
          title: "New screening awaiting review",
          message: "Review the queue.",
          target_path: "/medical-officer/queue",
        },
        subject: "Reminder",
        body: "Template fallback",
        is_read: false,
      }],
    };

  const result = await service.listForUser(USER);
  expect(result.notifications[0]).toMatchObject({
    event_type: "SCREENING_AWAITING_REVIEW",
    target_path: "/medical-officer/queue",
  });
});

test("lists active Medical Officers only for the patient Mandal", async () => {
  const client = {
    query: jest.fn(async (sql, params) => {
      expect(sql).toContain("tbl_medical_officer_mandal_assignments");
      expect(sql).toContain("MEDICAL_OFFICER");
      expect(params).toEqual([USER]);
      return { rows: [{ id: OTHER_USER }] };
    }),
  };
  await expect(service.listActiveMedicalOfficersForPatient(client, USER))
    .resolves.toEqual([OTHER_USER]);
});
