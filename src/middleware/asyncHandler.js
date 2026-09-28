// Express 4 does not catch errors thrown inside async route handlers.
// This wrapper sends those failures to the error handler.
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
