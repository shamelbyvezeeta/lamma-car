'use strict';
const express = require('express');
const multer = require('multer');
const vehicles = require('../../services/vehicles');
const customers = require('../../services/customers');
const qr = require('../../services/qr');
const { requirePerm } = require('../../middleware/auth');
const { verifyCsrf } = require('../../middleware/csrf');
const { schemas, parse } = require('../../lib/validation');
const { notFound } = require('../../lib/errors');
const { h, formFail } = require('./_util');

const router = express.Router();
const nav = 'vehicles';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 } });
const thisYear = new Date().getFullYear();

router.get('/', requirePerm('vehicles.view'), h(async (req, res) => {
  res.render('admin/vehicles/index.njk', { nav, list: await vehicles.list(req.query) });
}));

// New vehicle is always created under a customer: /admin/vehicles/new?customer=<id>
router.get('/new', requirePerm('vehicles.create'), h(async (req, res) => {
  const c = await customers.get(req.query.customer);
  if (!c) throw notFound();
  res.render('admin/vehicles/form.njk', { nav, c, form: { listing_status: 'unlisted', price_currency: 'EGP', model_year: thisYear }, isNew: true });
}));

router.post('/', requirePerm('vehicles.create'), h(async (req, res) => {
  const c = await customers.get(req.body.customer_id);
  if (!c) throw notFound();
  try {
    const data = parse(schemas.vehicle, req.body);
    const v = await vehicles.create(req.user, c.id, data, req);
    req.flash('success', 'flash.vehicle_created', { ref: v.vehicle_ref });
    res.redirect(303, `/admin/vehicles/${v.id}`);
  } catch (e) { return formFail(res, 'admin/vehicles/form.njk', { nav, c, form: req.body, isNew: true })(e); }
}));

router.get('/:id', requirePerm('vehicles.view'), h(async (req, res) => {
  const v = await vehicles.get(req.params.id);
  if (!v) throw notFound();
  res.render('admin/vehicles/show.njk', { nav, v });
}));

router.get('/:id/edit', requirePerm('vehicles.edit'), h(async (req, res) => {
  const v = await vehicles.get(req.params.id);
  if (!v) throw notFound();
  res.render('admin/vehicles/form.njk', { nav, v, c: { id: v.customer_id, full_name: v.customer_name, customer_ref: v.customer_ref }, form: v, isNew: false });
}));

router.post('/:id', requirePerm('vehicles.edit'), h(async (req, res) => {
  const v = await vehicles.get(req.params.id);
  if (!v) throw notFound();
  try {
    const data = parse(schemas.vehicle, req.body);
    await vehicles.update(req.user, v.id, data, req);
    req.flash('success', 'flash.saved');
    res.redirect(303, `/admin/vehicles/${v.id}`);
  } catch (e) {
    return formFail(res, 'admin/vehicles/form.njk', { nav, v, c: { id: v.customer_id, full_name: v.customer_name, customer_ref: v.customer_ref }, form: { ...v, ...req.body }, isNew: false })(e);
  }
}));

router.post('/:id/photo', requirePerm('vehicles.photo'), upload.single('photo'), verifyCsrf, h(async (req, res) => {
  await vehicles.setPhoto(req.user, req.params.id, req.file && req.file.buffer, req);
  req.flash('success', 'flash.photo_uploaded');
  res.redirect(303, `/admin/vehicles/${req.params.id}#photo`);
}));

router.get('/:id/photo', requirePerm('vehicles.view'), h(async (req, res) => {
  const v = await vehicles.get(req.params.id);
  const file = v && vehicles.photoPath(v.photo_key);
  if (!file) return res.status(404).end();
  res.set('Cache-Control', 'private, no-store');
  res.type('image/webp').sendFile(file);
}));

router.post('/:id/photo/approve', requirePerm('vehicles.photo_approve'), h(async (req, res) => {
  await vehicles.setPhotoApproval(req.user, req.params.id, req.body.approved === 'true', req);
  req.flash('success', 'flash.saved');
  res.redirect(303, `/admin/vehicles/${req.params.id}#photo`);
}));

router.post('/:id/photo/delete', requirePerm('vehicles.photo'), h(async (req, res) => {
  await vehicles.removePhoto(req.user, req.params.id, req);
  req.flash('success', 'flash.photo_removed');
  res.redirect(303, `/admin/vehicles/${req.params.id}#photo`);
}));

router.post('/:id/assign-qr', requirePerm('qr.assign'), h(async (req, res) => {
  const v = await vehicles.get(req.params.id);
  if (!v) throw notFound();
  try {
    const { serial } = parse(schemas.assignQr, req.body);
    await qr.assignBySerial(req.user, v.id, serial, req);
    req.flash('success', 'flash.qr_assigned');
    res.redirect(303, `/admin/vehicles/${v.id}#sticker`);
  } catch (e) { return formFail(res, 'admin/vehicles/show.njk', { nav, v, assignForm: req.body })(e); }
}));

module.exports = router;
