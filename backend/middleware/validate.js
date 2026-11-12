// Validates req.body / req.query / req.params with zod schemas and replaces
// them with the parsed (trimmed, coerced) values.
function validate(schemas) {
  return (req, res, next) => {
    const errors = [];

    for (const source of ["params", "query", "body"]) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source] ?? {});

      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            field: issue.path.join(".") || source,
            message: issue.message,
          });
        }
      } else if (source === "query") {
        req.validatedQuery = result.data;
      } else {
        req[source] = result.data;
      }
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0].message,
        errors,
      });
    }

    next();
  };
}

module.exports = validate;
