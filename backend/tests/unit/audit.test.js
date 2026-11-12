const mockQuery = jest.fn();

jest.mock("../../db", () => ({ query: (...args) => mockQuery(...args) }));

const { audit } = require("../../utils/audit");

beforeEach(() => {
  jest.clearAllMocks();
});

test("required audit writes propagate database errors", async () => {
  mockQuery.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(audit({}, {
    event: "CRITICAL_ACTION",
    resourceType: "patient",
    required: true,
  })).rejects.toThrow("audit unavailable");
});

test("best-effort audit writes continue logging failures without throwing", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  mockQuery.mockRejectedValueOnce(new Error("audit unavailable"));

  await expect(audit({}, {
    event: "NONCRITICAL_ACTION",
    resourceType: "user",
  })).resolves.toBeUndefined();

  expect(errorLog).toHaveBeenCalledWith(
    "Audit write failed for NONCRITICAL_ACTION:",
    "audit unavailable"
  );
  errorLog.mockRestore();
});
