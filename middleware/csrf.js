'use strict';
const crypto = require('crypto');
const { AppError } = require('../lib/errors');

// Synchronizer-token CSRF protection bound to the session.
function ensureToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

// Lazy: a token (and therefore a session cookie) is only created when a page actually renders a form.
function csrfToken(req, res, next) {
  res.locals.csrfToken = () => (req.session ? ensureToken(req) : '');
  next();
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  const expected = req.session && req.session.csrf;
  if (!sent || !expected || sent.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return next(new AppError(403, 'errors.csrf'));
  }
  next();
}

module.exports = { csrfToken, verifyCsrf };
