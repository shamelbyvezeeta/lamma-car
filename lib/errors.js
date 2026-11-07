'use strict';

class AppError extends Error {
  constructor(status, key, params = {}) {
    super(key);
    this.status = status;
    this.key = key; // i18n key
    this.params = params;
  }
}
const badRequest = (key, params) => new AppError(400, key, params);
const forbidden = (key = 'errors.forbidden') => new AppError(403, key);
const notFound = (key = 'errors.not_found') => new AppError(404, key);
const conflict = (key, params) => new AppError(409, key, params);

class ValidationError extends AppError {
  constructor(fieldErrors) {
    super(422, 'errors.validation');
    this.fieldErrors = fieldErrors; // { field: i18nKey }
  }
}

// Translate known PostgreSQL errors into safe, user-facing errors. Never leak SQL details.
function fromPg(err) {
  if (err instanceof AppError) return err;
  if (!err || !err.code) return err;
  if (err.code === '23505') {
    const c = err.constraint || '';
    if (c.includes('customers_mobile')) return conflict('errors.duplicate_mobile');
    if (c.includes('qr_batches_name')) return conflict('errors.duplicate_batch_name');
    if (c.includes('one_live_per_vehicle')) return conflict('errors.vehicle_has_live_qr');
    if (c.includes('app_users_email')) return conflict('errors.duplicate_email');
    if (c.includes('sheet_layouts_name')) return conflict('errors.duplicate_layout_name');
    if (c.includes('request_token')) return conflict('errors.duplicate_submission');
    return conflict('errors.duplicate');
  }
  if (err.code === '23503') return conflict('errors.in_use');
  if (err.code === '23514' || err.code === '22P02' || err.code === '22001' || err.code === '22003') return badRequest('errors.invalid_data');
  if (err.code === 'P0001') {
    const m = err.message || '';
    if (m.includes('reassigned') || m.includes('moved to another')) return conflict('errors.qr_no_reuse');
    if (m.includes('invalid QR status transition')) return conflict('errors.qr_invalid_transition');
    if (m.includes('not assigned to this customer')) return badRequest('errors.sale_qr_mismatch');
    if (m.includes('owner cannot be changed')) return badRequest('errors.vehicle_owner_immutable');
    return conflict('errors.operation_not_allowed');
  }
  return err;
}

module.exports = { AppError, ValidationError, badRequest, forbidden, notFound, conflict, fromPg };
