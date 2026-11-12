// Facility types an administrator can choose when adding a facility.
// The text for each type is in translations.js (facilities.types.<TYPE>).
export const FACILITY_TYPES = [
  "PHC",
  "CHC",
  "DISTRICT_HOSPITAL",
  "AREA_HOSPITAL",
  "SUB_CENTRE",
  "MEDICAL_COLLEGE",
  "OTHER",
];

// Hospital types can be switched among themselves after creation; other types cannot
export const HOSPITAL_TYPES = ["CHC", "DISTRICT_HOSPITAL", "AREA_HOSPITAL", "MEDICAL_COLLEGE"];

// Types allowed when editing a facility that currently has `category`
export function editableTypes(category) {
  return HOSPITAL_TYPES.includes(category) ? HOSPITAL_TYPES : [category];
}

// True when the signed-in user may add, edit and (de)activate facilities
export function canManageFacilities(user) {
  return Boolean(
    user?.role !== "DISTRICT_ADMIN" &&
    user?.permissions?.includes("master.manage")
  );
}
