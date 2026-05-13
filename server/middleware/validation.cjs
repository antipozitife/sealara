function createPaginationParser({ defaultLimit = 50, maxLimit = 100 } = {}) {
  return function parsePaginationQuery(query) {
    let page = parseInt(String(query?.page ?? ""), 10);
    let limit = parseInt(String(query?.limit ?? ""), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
    if (limit > maxLimit) limit = maxLimit;
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  };
}

function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details.map((d) => d.message).join("; ") });
    }
    req.body = value;
    return next();
  };
}

module.exports = {
  createPaginationParser,
  validateBody,
};
