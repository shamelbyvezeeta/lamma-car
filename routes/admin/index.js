'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const users = require('../../services/users');
const contact = require('../../services/contact');
const { verifyCsrf } = require('../../middleware/csrf');
const { requireAuth } = require('../../middleware/auth');
const { schemas, parse } = require('../../lib/validation');
const audit = require('../../lib/audit');
const { AppError } = require('../../lib/errors');

const router = express.Router();

// All admin responses are private and never cached.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

// CSRF on every state-changing request. Multipart (photo upload) is verified after parsing in its route.
const MULTIPART_OK = /^\/vehicles\/[0-9a-f-]{36}\/photo$/;
router.use((req, res, next) => {
  if (req.is('multipart/form-data')) return MULTIPART_OK.test(req.path) ? next() : next(new AppError(400, 'errors.invalid_data'));
  return verifyCsrf(req, res, next);
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: config.rateLimits.loginPer15Min, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).render('auth/login.njk', { errorKey: 'errors.too_many_logins', email: req.body && req.body.email }),
});

const safeNext = (n) => (typeof n === 'string' && /^\/admin(\/[\w\-/?=&.%]*)?$/.test(n) && !n.startsWith('//') ? n : '/admin');

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.render('auth/login.njk', { next: safeNext(req.query.next) });
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    let data;
    try { data = parse(schemas.login, req.body); } catch (_) { return res.status(400).render('auth/login.njk', { errorKey: 'errors.login_invalid', email: req.body.email }); }
    const r = await users.authenticate(data.email, data.password, req);
    if (!r.ok) {
      return res.status(401).render('auth/login.njk', { errorKey: r.reason === 'locked' ? 'errors.login_locked' : 'errors.login_invalid', email: data.email, next: safeNext(req.body.next) });
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = r.user.id;
      req.session.locale = r.user.preferred_locale;
      res.cookie('lc_lang', req.cookies.lc_lang || r.user.preferred_locale, { maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', secure: req.secure });
      req.session.save(() => res.redirect(303, r.user.must_change_password ? '/admin/account?force=1' : safeNext(req.body.next)));
    });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res) => {
  if (req.user) await audit.log(null, { actor: req.user, action: 'auth.logout', entityType: 'user', entityId: req.user.id, req }).catch(() => {});
  req.session.destroy(() => { res.clearCookie('lc_sid'); res.redirect(303, '/admin/login'); });
});

router.use(requireAuth);

// Sidebar badge for new contact requests.
router.use(async (req, res, next) => {
  try { res.locals.newContactCount = await contact.countNew(); } catch (_) { res.locals.newContactCount = 0; }
  next();
});

router.get('/lang/:l', async (req, res) => {
  if (['ar', 'en'].includes(req.params.l)) {
    await users.setLocale(req.user.id, req.params.l);
    res.cookie('lc_lang', req.params.l, { maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', secure: req.secure });
  }
  res.redirect(safeNext(req.query.back));
});

router.use('/', require('./dashboard'));
router.use('/account', require('./account'));
router.use('/customers', require('./customers'));
router.use('/vehicles', require('./vehicles'));
router.use('/qr', require('./qr'));
router.use('/batches', require('./batches'));
router.use('/sales', require('./sales'));
router.use('/contact-requests', require('./contact'));
router.use('/reports', require('./reports'));
router.use('/users', require('./users'));
router.use('/settings', require('./settings'));
router.use('/activity', require('./activity'));
router.use('/api', require('./api'));

module.exports = router;
