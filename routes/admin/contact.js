'use strict';
const express = require('express');
const contact = require('../../services/contact');
const settings = require('../../services/settings');
const { requirePerm } = require('../../middleware/auth');
const { h, isUuid } = require('./_util');
const { notFound } = require('../../lib/errors');

const router = express.Router();
router.get('/', requirePerm('contact.view'), h(async (req, res) => {
  const [list, s] = await Promise.all([contact.list(req.query), settings.all()]);
  res.render('admin/contact/index.njk', { nav: 'contact', list, enabled: s['contact.requests_enabled'] });
}));
router.post('/:id/status', requirePerm('contact.handle'), h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await contact.setStatus(req.user, req.params.id, req.body.status, req);
  req.flash('success', 'flash.saved');
  res.redirect(303, '/admin/contact-requests' + (req.body.filter ? '?status=' + encodeURIComponent(req.body.filter) : ''));
}));
module.exports = router;
