// Shared checks used by more than one controller.
// Booking, payment, and webhook rules stay in their controllers.

function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readPositiveInt(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw createError(400, `${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw createError(400, `${label} must be a positive integer`);
  }
  return number;
}

function readRequiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(400, `${label} is required`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw createError(400, `${label} must be ${maxLength} characters or fewer`);
  }
  return text;
}

module.exports = {
  createError,
  readPositiveInt,
  readRequiredText,
};
