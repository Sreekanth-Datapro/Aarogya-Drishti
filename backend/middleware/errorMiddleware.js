function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Request body is not valid JSON",
    });
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(`API Error [${req.requestId || "-"}]:`, err.message);
  }

  res.status(status).json({
    success: false,
    message:
      status >= 500 && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.expose === false ? "Request failed" : err.message,
    code: err.code && typeof err.code === "string" && /^[A-Z_]+$/.test(err.code) ? err.code : undefined,
    requestId: req.requestId,
    ...(err.code === "POSSIBLE_DUPLICATES" && Array.isArray(err.matches) ? { matches: err.matches } : {}),
  });
}

module.exports = errorHandler;
