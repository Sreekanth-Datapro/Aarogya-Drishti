const CATEGORIES = {
  PHC: { facilityType: "PHC", parent: "phc" },
  CHC: { facilityType: "HOSPITAL", parent: "hospital", level: "CHC" },
  DISTRICT_HOSPITAL: { facilityType: "HOSPITAL", parent: "hospital", level: "DH" },
  AREA_HOSPITAL: { facilityType: "HOSPITAL", parent: "hospital", level: "AH" },
  MEDICAL_COLLEGE: { facilityType: "HOSPITAL", parent: "hospital", level: "TERTIARY" },
  SUB_CENTRE: { facilityType: "SUB_CENTRE", parent: null },
  OTHER: { facilityType: "OTHER", parent: null },
  SCREENING_SITE: { facilityType: "SCREENING_SITE", parent: null },
  DISTRICT_OFFICE: { facilityType: "DISTRICT_OFFICE", parent: null },
};

const HOSPITAL_CATEGORIES = ["CHC", "DISTRICT_HOSPITAL", "AREA_HOSPITAL", "MEDICAL_COLLEGE"];

module.exports = { CATEGORIES, HOSPITAL_CATEGORIES };
