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

      const frontendBuildPath = path.join(__dirname, "..", "frontend", "build");
      const servingFrontend = require("fs").existsSync(
        path.join(frontendBuildPath, "index.html")
      );
      console.log(
        `Aarogya Drishti API listening on ${listenHost}:${config.port}`
      );
      if (servingFrontend) {
        console.log(
          `Serving frontend production build from ${frontendBuildPath}`
        );
      } else {
        console.log(
          "Frontend build not found — API only. Run frontend production build to enable same-origin hosting."
        );
      }
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
