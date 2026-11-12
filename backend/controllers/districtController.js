const district = require("../services/districtService");

// ==========================================
// DISTRICT ADMIN API (read only)
// req.districtId is set by requireDistrictAdminScope from the user's record.
// ==========================================

// GET /api/district/dashboard
exports.dashboard = async (req, res, next) => {
  try {
    res.json({ success: true, dashboard: await district.getDashboard(req.districtId, req.user.id) });
  } catch (error) {
    next(error);
  }
};

// GET /api/district/programme?mandal_id=&date_from=&date_to=
exports.programme = async (req, res, next) => {
  try {
    res.json({ success: true, programme: await district.getProgramme(req.districtId, req.query) });
  } catch (error) {
    next(error);
  }
};

// GET /api/district/patients?search=&mandal_id=&facility_id=&status=&review=&date_from=&date_to=&page=
// De-identified list (no names, phone numbers or addresses)
exports.patients = async (req, res, next) => {
  try {
    res.json({ success: true, ...(await district.listPatients(req.districtId, req.query)) });
  } catch (error) {
    next(error);
  }
};

// GET /api/district/health-workers?search=&mandal_id=&status=&page=
// Health Workers of the district with their location and number of registered patients
exports.healthWorkers = async (req, res, next) => {
  try {
    res.json({ success: true, ...(await district.listHealthWorkers(req.districtId, req.query)) });
  } catch (error) {
    next(error);
  }
};

// GET /api/district/mandals?search=&page=
exports.mandals = async (req, res, next) => {
  try {
    res.json({ success: true, ...(await district.listMandals(req.districtId, req.query)) });
  } catch (error) {
    next(error);
  }
};

// GET /api/district/villages?mandal_id=&search=&page=
exports.villages = async (req, res, next) => {
  try {
    res.json({ success: true, ...(await district.listVillages(req.districtId, req.query)) });
  } catch (error) {
    next(error);
  }
};
