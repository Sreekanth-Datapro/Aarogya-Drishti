const fs = require("fs");
const path = require("path");

/**
 * Resolve the CRA production build directory for same-origin hosting on
 * local / Docker / native Render (no Docker).
 *
 * Order:
 * 1. FRONTEND_BUILD_PATH (absolute or relative to process.cwd())
 * 2. backend/public (Render Root Directory = backend after build sync)
 * 3. ../frontend/build (monorepo / Docker image layout)
 * 4. ./frontend/build (unusual but harmless)
 */
function candidateBuildDirs(backendRoot = path.join(__dirname, "..")) {
  const fromEnv = String(process.env.FRONTEND_BUILD_PATH || "").trim();
  const list = [];
  if (fromEnv) {
    list.push(path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv));
  }
  list.push(
    path.join(backendRoot, "public"),
    path.join(backendRoot, "..", "frontend", "build"),
    path.join(backendRoot, "frontend", "build")
  );
  return list;
}

function resolveFrontendBuild(backendRoot = path.join(__dirname, "..")) {
  for (const dir of candidateBuildDirs(backendRoot)) {
    const indexHtml = path.join(dir, "index.html");
    if (fs.existsSync(indexHtml)) {
      return { buildPath: dir, indexHtml, ready: true };
    }
  }
  return {
    buildPath: null,
    indexHtml: null,
    ready: false,
    tried: candidateBuildDirs(backendRoot),
  };
}

/**
 * Express 5–compatible SPA fallback: GET/HEAD only, never HTML for /api/*.
 * Missing static assets (paths with an extension) fall through to JSON/HTML 404 handlers.
 */
function createSpaFallback(indexHtml) {
  return function spaFallback(req, res, next) {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({
        success: false,
        message: "API route not found",
      });
    }
    if (path.extname(req.path)) {
      return next();
    }
    return res.sendFile(indexHtml, (error) => {
      if (error) next(error);
    });
  };
}

function mountFrontendStatic(app, express, backendRoot = path.join(__dirname, "..")) {
  const resolved = resolveFrontendBuild(backendRoot);
  if (!resolved.ready) {
    return resolved;
  }

  app.use(
    express.static(resolved.buildPath, {
      index: false,
      // Hashed /static assets stay cacheable; HTML/SW revalidated by the browser.
    })
  );

  // Express 5 requires a named wildcard (/{*path}), not bare "*".
  const spa = createSpaFallback(resolved.indexHtml);
  app.get("/{*path}", spa);
  app.head("/{*path}", spa);

  return resolved;
}

module.exports = {
  candidateBuildDirs,
  resolveFrontendBuild,
  createSpaFallback,
  mountFrontendStatic,
};
