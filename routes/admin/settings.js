'use strict';
const express = require('express');
const settings = require('../../services/settings');
const { STICKER } = require('../../pdf/sticker');
const { requirePerm } = require('../../middleware/auth');
const { schemas, parse } = require('../../lib/validation');
const { h, formFail, isUuid } = require('./_util');
const { notFound } = require('../../lib/errors');

const router = express.Router();
const nav = 'settings';
router.use(requirePerm('settings.manage'));

async function locals(extra = {}) {
  const [s, layouts, channels] = await Promise.all([settings.all(), settings.layouts(), settings.salesChannels(false)]);
  return { nav, s, layouts, channels, sticker: STICKER, ...extra };
}

router.get('/', h(async (req, res) => res.render('admin/settings/index.njk', await locals())));

router.post('/', h(async (req, res) => {
  try {
    await settings.updateMany(req.user, req.body, req);
    req.flash('success', 'flash.saved');
    res.redirect(303, '/admin/settings');
  } catch (e) { return formFail(res, 'admin/settings/index.njk', await locals())(e); }
}));

router.post('/layouts', h(async (req, res) => {
  try {
    const d = parse(schemas.layout, req.body);
    await settings.createLayout(req.user, d, STICKER, req);
    req.flash('success', 'flash.layout_created');
    res.redirect(303, '/admin/settings#layouts');
  } catch (e) { return formFail(res, 'admin/settings/index.njk', await locals({ layoutForm: req.body }))(e); }
}));

router.post('/layouts/:id/default', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await settings.setDefaultLayout(req.user, req.params.id, req);
  req.flash('success', 'flash.saved');
  res.redirect(303, '/admin/settings#layouts');
}));

router.post('/layouts/:id/delete', h(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  await settings.deleteLayout(req.user, req.params.id, req);
  req.flash('success', 'flash.layout_deleted');
  res.redirect(303, '/admin/settings#layouts');
}));

module.exports = router;
