const crypto = require("crypto");

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

function requestId(req, res, next) {
  const incoming = req.get("X-Request-Id");
  req.requestId = incoming && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : crypto.randomUUID();

  res.set("X-Request-Id", req.requestId);
  next();
}

module.exports = requestId;
