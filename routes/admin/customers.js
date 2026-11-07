'use strict';
const express = require('express');
const customers = require('../../services/customers');
const { requirePerm } = require('../../middleware/auth');
const { schemas, parse } = require('../../lib/validation');
const { notFound } = require('../../lib/errors');
const fmt = require('../../lib/format');
const { h, formFail } = require('./_util');

const router = express.Router();
const nav = 'customers';

router.get('/', requirePerm('customers.view'), h(async (req, res) => {
  res.render('admin/customers/index.njk', { nav, list: await customers.list(req.query) });
}));

router.get('/new', requirePerm('customers.create'), (req, res) => {
  res.render('admin/customers/form.njk', { nav, form: { preferred_locale: 'ar', registration_date: fmt.todayIso(), phone_visibility: 'not_set' }, isNew: true });
});

router.post('/', requirePerm('customers.create'), h(async (req, res) => {
  const locals = { nav, form: req.body, isNew: true };
  try {
    const data = parse(schemas.customer, req.body);
    // Privacy choice is optional at creation; if provided it MUST come with how consent was obtained.
    let privacy = null;
    if (['public', 'private'].includes(req.body.phone_visibility) || req.body.allow_contact_requests === 'on') {
      privacy = parse(schemas.privacy, { ...req.body, phone_visibility: req.body.phone_visibility || 'private' });
    }
    const c = await customers.create(req.user, data, privacy, req);
    req.flash('success', 'flash.customer_created', { ref: c.customer_ref });
    res.redirect(303, `/admin/customers/${c.id}`);
  } catch (e) { return formFail(res, 'admin/customers/form.njk', locals)(e); }
}));

router.get('/:id', requirePerm('customers.view'), h(async (req, res) => {
  const c = await customers.get(req.params.id);
  if (!c) throw notFound();
  res.render('admin/customers/show.njk', { nav, c });
}));

router.get('/:id/edit', requirePerm('customers.edit'), h(async (req, res) => {
  const c = await customers.get(req.params.id);
  if (!c) throw notFound();
  res.render('admin/customers/form.njk', { nav, form: c, c, isNew: false });
}));

router.post('/:id', requirePerm('customers.edit'), h(async (req, res) => {
  const c = await customers.get(req.params.id);
  if (!c) throw notFound();
  try {
    const data = parse(schemas.customer, req.body);
    await customers.update(req.user, c.id, data, req);
    req.flash('success', 'flash.saved');
    res.redirect(303, `/admin/customers/${c.id}`);
  } catch (e) { return formFail(res, 'admin/customers/form.njk', { nav, form: { ...c, ...req.body }, c, isNew: false })(e); }
}));

router.post('/:id/privacy', requirePerm('customers.privacy'), h(async (req, res) => {
  const c = await customers.get(req.params.id);
  if (!c) throw notFound();
  try {
    const p = parse(schemas.privacy, req.body);
    const changed = await customers.updatePrivacy(req.user, c.id, p, req);
    req.flash(changed ? 'success' : 'info', changed ? 'flash.privacy_saved' : 'flash.no_changes');
    res.redirect(303, `/admin/customers/${c.id}#privacy`);
  } catch (e) { return formFail(res, 'admin/customers/show.njk', { nav, c, privacyForm: req.body })(e); }
}));

router.post('/:id/status', requirePerm('customers.status'), h(async (req, res) => {
  const { status } = parse(schemas.customerStatus, req.body);
  await customers.setStatus(req.user, req.params.id, status, req);
  req.flash('success', 'flash.saved');
  res.redirect(303, `/admin/customers/${req.params.id}`);
}));

module.exports = router;
