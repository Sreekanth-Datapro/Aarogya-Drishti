const patientService = require("../services/patientService");

// GET /patients/registration-options - assigned locations, languages and consent texts
exports.registrationOptions = async (req, res, next) => {
  try {
    const [locations, formOptions] = await Promise.all([
      patientService.getRegistrationOptions(req.user.id),
      patientService.getFormOptions(),
    ]);
    const choices = await patientService.getRegistrationChoices(req.user.id, locations);
    res.json({ success: true, locations, ...choices, ...formOptions });
  } catch (error) {
    next(error);
  }
};

exports.listMine = async (req, res, next) => {
  try {
    const patients = await patientService.listMine(req.user.id);
    res.json({ success: true, patients });
  } catch (error) {
    next(error);
  }
};

exports.search = async (req, res, next) => {
  try {
    res.json({ success: true, ...await patientService.searchPatients(req.user.id, req.query) });
  } catch (error) {
    next(error);
  }
};

exports.checkDuplicates = async (req, res, next) => {
  try {
    const matches = await patientService.checkDuplicates(req.user.id, req.body);
    res.json({ success: true, matches });
  } catch (error) {
    next(error);
  }
};

exports.details = async (req, res, next) => {
  try {
    const details = await patientService.getPatientDetails(req.user.id, req.params.patientId);
    res.json({ success: true, ...details });
  } catch (error) {
    next(error);
  }
};

// GET /patients/summary - numbers for the Health Worker dashboard
exports.summary = async (req, res, next) => {
  try {
    res.json({ success: true, summary: await patientService.getSummary(req.user.id) });
  } catch (error) {
    next(error);
  }
};

exports.register = async (req, res, next) => {
  try {
    const patient = await patientService.registerPatient(req.user.id, req, req.body);
    res.status(patient.already_registered ? 200 : 201).json({ success: true, patient });
  } catch (error) {
    next(error);
  }
};
