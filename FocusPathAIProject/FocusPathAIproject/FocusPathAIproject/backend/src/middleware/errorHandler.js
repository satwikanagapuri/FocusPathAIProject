function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);

  // Zod request-validation errors should be client errors, not 500.
  if (err && (err.name === "ZodError" || Array.isArray(err.issues))) {
    return res.status(400).json({
      error: "Validation failed",
      details: (err.issues || []).map((issue) => ({
        path: issue.path?.join(".") || "",
        message: issue.message,
      })),
    });
  }

  // Prisma connection/auth errors should surface as actionable infra errors.
  if (err && (err.code === "P1000" || err.code === "P1001")) {
    return res.status(503).json({
      error:
        "Database connection failed. Check DATABASE_URL credentials and ensure PostgreSQL is running.",
      ...(process.env.NODE_ENV !== "production" ? { details: err.message } : null),
    });
  }

  const status = err.statusCode || err.status || 500;
  const message = err.expose ? err.message : status === 500 ? "Internal Server Error" : err.message;

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== "production" ? { details: err.details || null } : null),
  });
}

module.exports = { errorHandler };

