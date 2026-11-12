const { validateRegistration } = require("../../utils/registrationValidation");

const validInput = () => ({
  username: "worker_01",
  password: "SecurePass123",
  full_name: "Test Worker",
  phone: "9876543210",
  designation: "asha",
  district_id: "5",
  facility_id: "1",
  mandal_id: "2",
  village_id: "3",
  language_id: "4",
  terms_accepted: true,
});

describe("health worker registration validation", () => {
  test.each([
    ["username", { username: "" }],
    ["password", { password: "" }],
    ["full name", { full_name: " " }],
    ["phone", { phone: "" }],
    ["designation", { designation: "" }],
    ["district", { district_id: "" }],
    ["facility", { facility_id: "" }],
    ["mandal", { mandal_id: "" }],
    ["village", { village_id: "" }],
    ["language", { language_id: "" }],
  ])("requires %s", (_, change) => {
    expect(validateRegistration({ ...validInput(), ...change }).error)
      .toBe("Please provide all required registration fields");
  });

  test("requires explicit terms acceptance", () => {
    expect(validateRegistration({ ...validInput(), terms_accepted: false }).error)
      .toBe("Please accept the terms and conditions");
  });

  test.each(["123456789", "12345678901", "12345abcde"])("rejects invalid phone %s", (phone) => {
    expect(validateRegistration({ ...validInput(), phone }).error)
      .toBe("Enter a valid 10-digit phone number");
  });

  test.each(["DOCTOR", ""])("rejects invalid designation %s", (designation) => {
    const input = validInput();
    input.designation = designation || "DOCTOR";
    expect(validateRegistration(input).error).toBe("Invalid health worker designation");
  });

  test.each(["ab", "a".repeat(41), "worker name"])("rejects invalid username %s", (username) => {
    expect(validateRegistration({ ...validInput(), username }).error)
      .toBe("Username must be 3-40 characters");
  });

  test.each([
    ["district_id", "0"],
    ["facility_id", "0"],
    ["mandal_id", "-1"],
    ["village_id", "1.5"],
    ["language_id", "not-a-number"],
  ])("rejects invalid %s", (field, value) => {
    expect(validateRegistration({ ...validInput(), [field]: value }).error)
      .toBe("Invalid district, facility, mandal, village or language selection");
  });

  test("returns normalized values for a valid registration", () => {
    expect(validateRegistration({
      ...validInput(),
      username: "  Worker_01  ",
      designation: "asha",
    })).toEqual({
      error: null,
      normalizedUsername: "worker_01",
      normalizedDesignation: "ASHA",
      districtId: 5,
      facilityId: 1,
      mandalId: 2,
      villageId: 3,
      languageId: 4,
    });
  });
});
