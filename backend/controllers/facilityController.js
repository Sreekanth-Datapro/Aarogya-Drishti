const facilities = require("../services/facilityService");
const { resolveAuthorizedDistrict } = require("../utils/districtAuthorization");
const pool = require("../db");

// ==========================================
// FACILITY MANAGEMENT API
// Read: permission master.view   Write: permission master.manage
// ==========================================

// GET /api/facilities/summary - counts for the dashboard cards
exports.summary = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    res.json({ success: true, summary: await facilities.summary(districtId) });
  } catch (error) {
    next(error);
  }
};

// GET /api/facilities?search=&district_id=&mandal_id=&village_id=&category=&status=&page=
exports.list = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    res.json({ success: true, ...(await facilities.list(req.validatedQuery, districtId)) });
  } catch (error) {
    next(error);
  }
};

// GET /api/facilities/:id
exports.getOne = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    res.json({ success: true, facility: await facilities.getById(req.params.id, pool, districtId) });
  } catch (error) {
    next(error);
  }
};

// POST /api/facilities
exports.create = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    const facility = await facilities.create(req.body, districtId, req);

    res.status(201).json({ success: true, message: "Facility created", facility });
  } catch (error) {
    next(error);
  }
};

// PUT /api/facilities/:id
exports.update = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    const facility = await facilities.update(req.params.id, req.body, districtId, req);

    res.json({ success: true, message: "Facility updated", facility });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/facilities/:id/status   Body: { is_active: true | false }
exports.setStatus = async (req, res, next) => {
  try {
    const districtId = await resolveAuthorizedDistrict(req);
    const facility = await facilities.setStatus(req.params.id, req.body.is_active, districtId, req);

    res.json({
      success: true,
      message: facility.is_active ? "Facility activated" : "Facility deactivated",
      facility,
    });
  } catch (error) {
    next(error);
  }
};
