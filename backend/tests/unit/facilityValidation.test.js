const { facilityBody, statusBody } = require("../../utils/facilityValidation");
const { CATEGORIES } = require("../../utils/facilityCategories");

const validFacility = () => ({
  name_en: "Test Facility",
  category: "PHC",
  district_id: "1",
  mandal_id: "2",
  village_id: "3",
});

describe("facility body validation", () => {
  test("accepts valid required fields and coerces location ids", () => {
    expect(facilityBody.safeParse(validFacility())).toMatchObject({
      success: true,
      data: { district_id: 1, mandal_id: 2, village_id: 3 },
    });
  });

  test.each(["", "A", "x".repeat(151)])("rejects invalid facility name %s", (name_en) => {
    expect(facilityBody.safeParse({ ...validFacility(), name_en }).success).toBe(false);
  });

  test.each(Object.keys(CATEGORIES))("accepts facility category %s", (category) => {
    expect(facilityBody.safeParse({ ...validFacility(), category }).success).toBe(true);
  });

  test("rejects an unknown facility category", () => {
    expect(facilityBody.safeParse({ ...validFacility(), category: "CLINIC" }).success).toBe(false);
  });

  test.each(["12345", "012345", "12345a"])("rejects invalid PIN %s", (pin_code) => {
    expect(facilityBody.safeParse({ ...validFacility(), pin_code }).success).toBe(false);
  });

  test.each(["123456789", "123456789012", "12345abcde"])("rejects invalid contact phone %s", (contact_phone) => {
    expect(facilityBody.safeParse({ ...validFacility(), contact_phone }).success).toBe(false);
  });

  test("normalizes optional code and email values", () => {
    expect(facilityBody.parse({
      ...validFacility(),
      code: " fac-01 ",
      email: " TEST@example.org ",
    })).toMatchObject({ code: "FAC-01", email: "test@example.org" });
  });

  test("allows blank optional text fields as omitted", () => {
    expect(facilityBody.parse({
      ...validFacility(),
      address: " ",
      email: "",
      incharge_name: "",
    })).toMatchObject({ address: undefined, email: undefined, incharge_name: undefined });
  });
});

describe("facility status validation", () => {
  test.each([true, false])("accepts boolean status %s", (is_active) => {
    expect(statusBody.safeParse({ is_active }).success).toBe(true);
  });

  test.each(["true", "false", "yes", null])("rejects non-boolean status %s", (is_active) => {
    expect(statusBody.safeParse({ is_active }).success).toBe(false);
  });
});
