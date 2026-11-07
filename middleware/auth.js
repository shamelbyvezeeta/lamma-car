'use strict';
const users = require('../services/users');
const { can } = require('../lib/permissions');
const { AppError } = require('../lib/errors');

// Reload the user on every request so deactivation / role changes take effect immediately.
async function loadUser(req, res, next) {
  try {
    if (req.session && req.session.userId) {
      const u = await users.getById(req.session.userId);
      if (u && u.is_active) {
        req.user = u;
        res.locals.user = u;
        res.locals.can = (perm) => can(u, perm);
      } else {
        delete req.session.userId;
      }
    }
    if (!res.locals.can) res.locals.can = () => false;
    next();
  } catch (e) { next(e); }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
    const nextUrl = req.method === 'GET' ? req.originalUrl : '/admin';
    return res.redirect('/admin/login?next=' + encodeURIComponent(nextUrl));
  }
  // Forced password change after first login / admin reset.
  if (req.user.must_change_password && !req.path.startsWith('/account') && req.path !== '/logout') {
    return res.redirect('/admin/account?force=1');
  }
  next();
}

function requirePerm(perm) {
  return (req, res, next) => (can(req.user, perm) ? next() : next(new AppError(403, 'errors.forbidden')));
}

module.exports = { loadUser, requireAuth, requirePerm };
