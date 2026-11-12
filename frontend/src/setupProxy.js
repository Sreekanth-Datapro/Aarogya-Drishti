/**
 * Dev proxy for Cloudflare / same-origin REACT_APP_API_URL=/api.
 * Forwards /api to the local Express backend on port 5000.
 * changeOrigin avoids Host-header issues when the browser hits a trycloudflare.com URL.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://127.0.0.1:5000",
      changeOrigin: true,
      secure: false,
      logLevel: "warn",
    })
  );
};
