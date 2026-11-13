const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const request = require("supertest");
const {
  resolveFrontendBuild,
  createSpaFallback,
  mountFrontendStatic,
} = require("../../utils/frontendStatic");

describe("frontendStatic SPA hosting", () => {
  let tmpRoot;
  let buildDir;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aarogya-spa-"));
    buildDir = path.join(tmpRoot, "public");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(
      path.join(buildDir, "index.html"),
      "<!doctype html><title>spa</title><div id=\"root\"></div>"
    );
    fs.mkdirSync(path.join(buildDir, "static", "js"), { recursive: true });
    fs.writeFileSync(path.join(buildDir, "static", "js", "main.js"), "console.log(1)");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.FRONTEND_BUILD_PATH;
  });

  test("resolveFrontendBuild finds backend/public", () => {
    const resolved = resolveFrontendBuild(tmpRoot);
    expect(resolved.ready).toBe(true);
    expect(resolved.buildPath).toBe(buildDir);
  });

  test("resolveFrontendBuild honors FRONTEND_BUILD_PATH", () => {
    const custom = path.join(tmpRoot, "custom-build");
    fs.mkdirSync(custom, { recursive: true });
    fs.writeFileSync(path.join(custom, "index.html"), "<html></html>");
    process.env.FRONTEND_BUILD_PATH = custom;
    const resolved = resolveFrontendBuild(path.join(tmpRoot, "other"));
    expect(resolved.ready).toBe(true);
    expect(resolved.buildPath).toBe(custom);
  });

  test("SPA fallback serves index.html for client routes and keeps /api JSON", async () => {
    const app = express();
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.use("/api", (_req, res) => {
      res.status(404).json({ success: false, message: "API route not found" });
    });
    mountFrontendStatic(app, express, tmpRoot);

    expect((await request(app).get("/api/health")).body.ok).toBe(true);
    expect((await request(app).get("/api/missing")).body.message).toBe("API route not found");

    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain("id=\"root\"");

    const login = await request(app).get("/login");
    expect(login.status).toBe(200);
    expect(login.text).toContain("id=\"root\"");

    const nested = await request(app).get("/district/accounts/new");
    expect(nested.status).toBe(200);
    expect(nested.text).toContain("id=\"root\"");

    const asset = await request(app).get("/static/js/main.js");
    expect(asset.status).toBe(200);
    expect(asset.text).toContain("console.log(1)");
  });

  test("createSpaFallback never returns HTML for /api paths", async () => {
    const app = express();
    app.use(createSpaFallback(path.join(buildDir, "index.html")));
    const res = await request(app).get("/api/secret");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});
