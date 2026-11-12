const { z } = require("zod");
const { CATEGORIES } = require("./facilityCategories");

const id = z.coerce.number().int().positive();
const category = z.enum(Object.keys(CATEGORIES), { message: "Select a facility type" });

const optional = (schema) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

const facilityBody = z.object({
  name_en: z.string().trim().min(2, "Enter the facility name").max(150),
  name_te: optional(z.string().trim().max(150)),
  code: optional(
    z.string().trim().toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_\-/]{1,39}$/, "Facility code: 2-40 letters, numbers, - _ or /")
  ),
  category,
  district_id: id,
  mandal_id: id,
  village_id: id,
  address: optional(z.string().trim().max(300)),
  pin_code: optional(z.string().trim().regex(/^[1-9][0-9]{5}$/, "PIN code must be 6 digits")),
  contact_phone: optional(z.string().trim().regex(/^[0-9]{10,11}$/, "Contact number must be 10 or 11 digits")),
  email: optional(z.string().trim().toLowerCase().email("Enter a valid email address").max(120)),
  incharge_name: optional(z.string().trim().max(120)),
  is_active: z.boolean().optional(),
});

const listQuery = z.object({
  search: optional(z.string().trim().max(100)),
  district_id: id.optional(),
  mandal_id: id.optional(),
  village_id: id.optional(),
  category: category.optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const idParams = z.object({ id });
const statusBody = z.object({
  is_active: z.boolean({ message: "is_active must be true or false" }),
});

module.exports = { facilityBody, listQuery, idParams, statusBody };
