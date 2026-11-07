'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const publicCard = require('../services/publicCard');
const vehicles = require('../services/vehicles');
const settings = require('../services/settings');
const { schemas, parse } = require('../lib/validation');
const { ValidationError } = require('../lib/errors');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();

const tooMany = (req, res) => res.status(429).render('public/error.njk', { status: 429, messageKey: 'errors.too_many_requests' });
// Throttles scanning/enumeration. Codes have 50 bits of entropy; this makes guessing impractical.
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: config.rateLimits.publicPerMinute, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooMany });
// Invalid-code lookups are throttled much harder than valid ones.
const invalidLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooMany, skipSuccessfulRequests: true, requestWasSuccessful: (req, res) => res.statusCode < 400 });
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: config.rateLimits.contactPerHour, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooMany });

router.get('/', async (req, res) => {
  res.render('public/home.njk');
});

function noStore(res) {
  // Status changes (suspend/deactivate) must take effect immediately — never cache the card.
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

router.get('/q/:code', publicLimiter, invalidLimiter, async (req, res, next) => {
  try {
    noStore(res);
    const r = await publicCard.resolve(req.params.code);
    if (r.state === 'invalid') return res.status(404).render('public/card-unavailable.njk', { reason: 'invalid' });
    if (r.state === 'not_active') {
      const s = await settings.all();
      return res.status(410).render('public/card-unavailable.njk', { reason: 'inactive', support: { phone: s['support.public_phone'], email: s['support.public_email'] } });
    }
    res.render('public/card.njk', { card: r.card, sent: req.query.sent === '1' });
  } catch (e) { next(e); }
});

router.get('/q/:code/photo', publicLimiter, async (req, res, next) => {
  try {
    const r = await publicCard.resolve(req.params.code);
    const file = r.state === 'active' && r.card.photo_key ? vehicles.photoPath(r.card.photo_key) : null;
    if (!file) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=300');
    res.type('image/webp').sendFile(file);
  } catch (e) { next(e); }
});

router.post('/q/:code/contact', contactLimiter, verifyCsrf, async (req, res, next) => {
  noStore(res);
  try {
    if (req.body.website) return res.redirect(303, `/q/${encodeURIComponent(req.params.code)}?sent=1`); // honeypot: pretend success
    const data = parse(schemas.contactRequest, req.body);
    await publicCard.createContactRequest(req.params.code, data, req.ip);
    res.redirect(303, `/q/${encodeURIComponent(req.params.code)}?sent=1#contact`);
  } catch (e) {
    if (e instanceof ValidationError) {
      const r = await publicCard.resolve(req.params.code).catch(() => null);
      if (r && r.state === 'active') return res.status(422).render('public/card.njk', { card: r.card, form: req.body, errors: e.fieldErrors });
    }
    next(e);
  }
});

module.exports = router;
