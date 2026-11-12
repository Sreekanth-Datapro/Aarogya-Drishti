const express = require("express");
const helmet = require("helmet");
const request = require("supertest");
const contentSecurityPolicy = require("../../config/contentSecurityPolicy");

describe("Content-Security-Policy for private patient images", () => {
  test("imgSrc allows self, data:, and blob: only", () => {
    expect(contentSecurityPolicy.useDefaults).toBe(true);
    expect(contentSecurityPolicy.directives.imgSrc).toEqual(["'self'", "data:", "blob:"]);
    expect(contentSecurityPolicy.directives.scriptSrc).toBeUndefined();
    expect(contentSecurityPolicy.directives.connectSrc).toBeUndefined();
    expect(contentSecurityPolicy.directives.defaultSrc).toBeUndefined();
  });

  test("Helmet emits img-src with blob: and keeps script/connect/default-src free of blob:", async () => {
    const app = express();
    app.use(helmet({ contentSecurityPolicy }));
    app.get("/probe", (_req, res) => res.status(204).end());

    const response = await request(app).get("/probe");
    const csp = response.headers["content-security-policy"] || "";

    expect(csp).toBeTruthy();

    const imgSrc = (csp.match(/img-src([^;]*)/) || [])[1] || "";
    expect(imgSrc).toMatch(/'self'/);
    expect(imgSrc).toMatch(/data:/);
    expect(imgSrc).toMatch(/blob:/);

    const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || "";
    const connectSrc = (csp.match(/connect-src([^;]*)/) || [])[1] || "";
    const defaultSrc = (csp.match(/default-src([^;]*)/) || [])[1] || "";

    expect(scriptSrc).not.toMatch(/blob:/);
    expect(connectSrc).not.toMatch(/blob:/);
    expect(defaultSrc).not.toMatch(/blob:/);
    // Do not introduce script-level unsafe-inline / unsafe-eval (style-src may keep Helmet defaults).
    expect(scriptSrc).not.toMatch(/unsafe-inline/);
    expect(scriptSrc).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });
});
