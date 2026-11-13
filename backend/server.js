const path = require("path");
const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "test" ? ".env.test" : ".env";
require("dotenv").config({ path: path.join(__dirname, envFile), quiet: true });

const app = require("./app");
const pool = require("./db");
const config = require("./config/config");
const bootstrap = require("./bootstrap");

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("PostgreSQL connected successfully.");

    await bootstrap();

    const listenHost = process.env.LISTEN_HOST || "0.0.0.0";
    app.listen(config.port, listenHost, (error) => {
      if (error) {
        console.error(
          `Server startup failed: cannot listen on ${listenHost}:${config.port} (${error.code || error.message}).`
        );
        process.exit(1);
      }

      const { resolveFrontendBuild } = require("./utils/frontendStatic");
      const frontend = resolveFrontendBuild(__dirname);
      console.log(
        `Aarogya Drishti API listening on ${listenHost}:${config.port}`
      );
      if (frontend.ready) {
        console.log(
          `Serving frontend production build from ${frontend.buildPath}`
        );
      } else {
        console.log(
          "Frontend build not found — API only. Build the CRA app and set FRONTEND_BUILD_PATH or place it at ../frontend/build or ./public."
        );
      }

      // Backend-owned background jobs. Do not rely on an open browser tab.
      if (nodeEnv !== "test") {
        const videoConsultationService = require("./services/videoConsultationService");
        const diagnosticWorkflowService = require("./services/diagnosticWorkflowService");
        const ATTENDANCE_SCAN_MS = 60 * 1000;
        const FOLLOWUP_DUE_SCAN_MS = 5 * 60 * 1000;
        const runAttendanceScan = async () => {
          try {
            await videoConsultationService.finalizeExpiredVideoAttendance();
          } catch (scanError) {
            console.error("Video attendance finalization failed:", scanError.message);
          }
        };
        const runFollowupDueScan = async () => {
          try {
            await diagnosticWorkflowService.scanDueFollowupNotifications();
          } catch (scanError) {
            console.error("Diagnostic follow-up due scan failed:", scanError.message);
          }
        };
        setInterval(runAttendanceScan, ATTENDANCE_SCAN_MS);
        setTimeout(runAttendanceScan, 5000);
        setInterval(runFollowupDueScan, FOLLOWUP_DUE_SCAN_MS);
        setTimeout(runFollowupDueScan, 15000);
      }
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
