function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  // express.json() throws this when the body is not valid JSON.
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    res.status(400).json({ error: 'Request body must be valid JSON' });
    return;
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong' : err.message,
  });
}

module.exports = {
  errorHandler,
};
