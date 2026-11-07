'use strict';
const express = require('express');
const qr = require('../../services/qr');
const settings = require('../../services/settings');
const batchSheet = require('../../pdf/batchSheet');
const audit = require('../../lib/audit');
const { requirePerm } = require('../../middleware/auth');
const { schemas, parse } = require('../../lib/validation');
const { notFound, badRequest } = require('../../lib/errors');
const { qrUrl } = require('../../lib/codes');
const { h, formFail } = require('./_util');

const router = express.Router();
const nav = 'qr';

router.get('/', requirePerm('qr.view'), h(async (req, res) => {
  const [list, counts] = await Promise.all([qr.list(req.query), qr.statusCounts()]);
  res.render('admin/qr/index.njk', { nav, list, counts, statuses: qr.STATUSES });
}));

router.get('/:id', requirePerm('qr.view'), h(async (req, res) => {
  const q = await qr.get(req.params.id);
  if (!q) throw notFound();
  res.render('admin/qr/show.njk', { nav, q, url: qrUrl(q.public_code) });
}));

const back = (req) => (typeof req.body.back === 'string' && /^\/admin\/[\w\-/]*$/.test(req.body.back) ? req.body.back : `/admin/qr/${req.params.id}`);

router.post('/:id/activate', requirePerm('qr.activate'), h(async (req, res) => {
  await qr.activate(req.user, req.params.id, req);
  req.flash('success', 'flash.qr_activated');
  res.redirect(303, back(req));
}));

for (const action of ['suspend', 'deactivate']) {
  router.post(`/:id/${action}`, requirePerm(`qr.${action}`), h(async (req, res) => {
    const q = await qr.get(req.params.id);
    if (!q) throw notFound();
    try {
      const { reason } = parse(schemas.qrReason, req.body);
      await qr[action](req.user, q.id, reason, req);
      req.flash('success', action === 'suspend' ? 'flash.qr_suspended' : 'flash.qr_deactivated');
      res.redirect(303, back(req));
    } catch (e) { return formFail(res, 'admin/qr/show.njk', { nav, q, url: qrUrl(q.public_code), reasonFor: action, reasonForm: req.body })(e); }
  }));
}

// Re-print a single sticker (e.g. damaged) — same identifier, never a new one.
router.get('/:id/sticker.pdf', requirePerm('batches.pdf'), h(async (req, res) => {
  const q = await qr.get(req.params.id);
  if (!q) throw notFound();
  if (q.status === 'deactivated') throw badRequest('errors.qr_deactivated_no_print');
  const variant = batchSheet.VARIANTS.includes(req.query.variant) ? req.query.variant : 'proof';
  const layouts = await settings.layouts();
  const layout = layouts.find((l) => l.columns === 1 && l.rows === 1) || (await settings.defaultLayout());
  await audit.log(null, { actor: req.user, action: 'export.sticker_pdf', entityType: 'qr_code', entityId: q.id, details: { variant, serial: q.serial_no }, req });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="lamma-car-LC-${String(q.serial_no).padStart(6, '0')}-${variant}.pdf"`);
  await batchSheet.render(res, { title: `Lamma Car sticker LC-${q.serial_no}`, batchRef: q.batch_ref, codes: [q], layout, variant, generatedBy: req.user.email });
}));

module.exports = router;
