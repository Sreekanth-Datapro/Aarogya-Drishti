const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const pool = require("./db");
const config = require("./config/config");
const contentSecurityPolicy = require("./config/contentSecurityPolicy");
const { resolveTrustProxy } = require("./utils/trustProxy");
const requestId = require("./middleware/requestId");
const errorHandler = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/auth");
const mastersRoutes = require("./routes/masters");
const dashboardRoutes = require("./routes/dashboard");
const locationRoutes = require("./routes/locations");
const facilityRoutes = require("./routes/facilities");
const systemAdminRoutes = require("./routes/systemAdmin");
const reportsRoutes = require("./routes/reports");
const auditRoutes = require("./routes/audit");
const districtRoutes = require("./routes/district");
const patientRoutes = require("./routes/patients");
const medicalOfficerRoutes = require("./routes/medicalOfficer");
const registrationRoutes = require("./routes/registrations");
const screeningRoutes = require("./routes/screenings");
const navigatorRoutes = require("./routes/navigator");
const specialistRoutes = require("./routes/specialist");
const hospitalStaffRoutes = require("./routes/hospitalStaff");
const notificationRoutes = require("./routes/notifications");
const diagnosticRoutes = require("./routes/diagnostics");
const trackingRoutes = require("./routes/tracking");
const speechRoutes = require("./routes/speech");
const assistantRoutes = require("./routes/assistant");

const app = express();

app.disable("x-powered-by");
// Render / reverse proxies: trust a bounded hop count in production (see TRUST_PROXY).
app.set("trust proxy", resolveTrustProxy(process.env, { isProduction: config.isProduction }));

app.use(requestId);
app.use(helmet({ contentSecurityPolicy }));

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      message: "Aarogya Drishti API is running",
      database: "Connected",
    });
  } catch (error) {
    next(error);
  }
});

// Authentication
app.use("/api/auth", authRoutes);
app.use("/api/registrations", registrationRoutes);

// Master data
app.use("/api/masters", mastersRoutes);

// Role dashboards (counts only)
app.use("/api/dashboard", dashboardRoutes);

// Location master data import from LGD (SUPER_ADMIN)
app.use("/api/locations", locationRoutes);

// Facility management (master.view / master.manage)
app.use("/api/facilities", facilityRoutes);
app.use("/api/admin", systemAdminRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/audit", auditRoutes);

// District Admin read-only views of their own district
app.use("/api/district", districtRoutes);
app.use("/api/patients", patientRoutes);
// Health Worker consent, oral screening and photos
app.use("/api/screenings", screeningRoutes);
app.use("/api/medical-officer", medicalOfficerRoutes);
app.use("/api/navigator", navigatorRoutes);
app.use("/api/specialist", specialistRoutes);
app.use("/api/hospital-staff", hospitalStaffRoutes);
app.use("/api/health-worker", require("./routes/healthWorker"));
app.use("/api/video-consultations", require("./routes/videoConsultations"));
app.use("/api/notifications", notificationRoutes);
app.use("/api/diagnostics", diagnosticRoutes);
app.use("/api/tracking", trackingRoutes);
// Sarvam Speech proxy (keys stay on server; HEALTH_WORKER only)
app.use("/api/speech", speechRoutes);
app.use("/api/assistant", assistantRoutes);

// Unknown API paths always return JSON — never the React SPA shell
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Same-origin CRA hosting (local / Docker / native Render). Mounted AFTER /api
// so refresh on React routes serves index.html while /api/* stays JSON.
const { mountFrontendStatic } = require("./utils/frontendStatic");
mountFrontendStatic(app, express, __dirname);

// Error handler must be last
app.use(errorHandler);

module.exports = app;
