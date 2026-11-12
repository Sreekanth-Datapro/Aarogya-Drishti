const config = require("../config/config");

const REFRESH_COOKIE = "ad_refresh";
const REFRESH_COOKIE_PATH = "/api/auth";

function parseCookies(header = "") {
  const cookies = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }

  return cookies;
}

function readRefreshCookie(req) {
  return parseCookies(req.headers.cookie)[REFRESH_COOKIE] || null;
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  });
}

module.exports = { readRefreshCookie, setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE };
