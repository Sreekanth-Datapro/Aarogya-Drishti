const { checkPassword } = require("./passwordPolicy");

function validateRegistration(input) {
  const {
    username,
    password,
    full_name,
    phone,
    designation,
    district_id,
    facility_id,
    mandal_id,
    village_id,
    language_id,
    terms_accepted,
  } = input;

  if (
    !username?.trim() ||
    !password ||
    !full_name?.trim() ||
    !phone ||
    !designation ||
    !district_id ||
    !facility_id ||
    !mandal_id ||
    !village_id ||
    !language_id
  ) {
    return { error: "Please provide all required registration fields" };
  }

  if (terms_accepted !== true) {
    return { error: "Please accept the terms and conditions" };
  }

  const passwordError = checkPassword(password, { username });
  if (passwordError) return { error: passwordError };

  if (!/^\d{10}$/.test(phone)) {
    return { error: "Enter a valid 10-digit phone number" };
  }

  const allowedDesignations = ["ASHA", "ANM", "CHO", "OTHER"];
  const normalizedDesignation = designation.toUpperCase();
  if (!allowedDesignations.includes(normalizedDesignation)) {
    return { error: "Invalid health worker designation" };
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,40}$/.test(normalizedUsername)) {
    return { error: "Username must be 3-40 characters" };
  }

  const districtId = Number(district_id);
  const facilityId = Number(facility_id);
  const mandalId = Number(mandal_id);
  const villageId = Number(village_id);
  const languageId = Number(language_id);
  const isValidId = (id) => Number.isSafeInteger(id) && id > 0;

  if (![districtId, facilityId, mandalId, villageId, languageId].every(isValidId)) {
    return { error: "Invalid district, facility, mandal, village or language selection" };
  }

  return {
    error: null,
    normalizedUsername,
    normalizedDesignation,
    districtId,
    facilityId,
    mandalId,
    villageId,
    languageId,
  };
}

module.exports = { validateRegistration };
