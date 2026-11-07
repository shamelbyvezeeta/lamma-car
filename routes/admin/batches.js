'use strict';
const express = require('express');
const crypto = require('crypto');
const batches = require('../../services/batches');
const qr = require('../../services/qr');
const settings = require('../../services/settings');
const batchSheet = require('../../pdf/batchSheet');
const audit = require('../../lib/audit');
const { toCsv } = require('../../lib/csv');
const { requirePerm } = require('../../middleware/auth');
const { schemas, parse } = require('../../lib/validation');
const { notFound, badRequest } = require('../../lib/errors');
const { serialRef, qrUrl } = require('../../lib/codes');
const { h, formFail } = require('./_util');

const router = express.Router();
const nav = 'batches';

router.get('/', requirePerm('batches.view'), h(async (req, res) => {
  res.render('admin/batches/index.njk', { nav, list: await batches.list(req.query) });
}));

router.get('/new', requirePerm('batches.create'), (req, res) => {
  res.render('admin/batches/new.njk', { nav, form: { quantity: 100, request_token: crypto.randomUUID() } });
});

router.post('/', requirePerm('batches.create'), h(async (req, res) => {
  try {
    const data = parse(schemas.batch, req.body);
    const r = await batches.create(req.user, data, req);
    req.flash(r.duplicate ? 'info' : 'success', r.duplicate ? 'flash.duplicate_ignored' : 'flash.batch_created');
    res.redirect(303, `/admin/batches/${r.id}`);
  } catch (e) { return formFail(res, 'admin/batches/new.njk', { nav, form: { ...req.body, request_token: crypto.randomUUID() } })(e); }
}));

router.get('/:id', requirePerm('batches.view'), h(async (req, res) => {
  const b = await batches.get(req.params.id);
  if (!b) throw notFound();
  const [codes, layouts] = await Promise.all([qr.list({ ...req.query, batch: b.batch_ref }), settings.layouts()]);
  res.render('admin/batches/show.njk', { nav, b, codes, layouts, statuses: qr.STATUSES, variants: batchSheet.VARIANTS });
}));

router.post('/:id/release', requirePerm('batches.release'), h(async (req, res) => {
  const n = await batches.release(req.user, req.params.id, req);
  req.flash('success', 'flash.batch_released', { n });
  res.redirect(303, `/admin/batches/${req.params.id}`);
}));

router.post('/:id/close', requirePerm('batches.close'), h(async (req, res) => {
  await batches.close(req.user, req.params.id, req);
  req.flash('success', 'flash.batch_closed');
  res.redirect(303, `/admin/batches/${req.params.id}`);
}));

// Regenerates the PDF from stored identifiers; never creates new codes.
router.get('/:id/pdf', requirePerm('batches.pdf'), h(async (req, res) => {
  const b = await batches.get(req.params.id);
  if (!b) throw notFound();
  const layout = req.query.layout ? await settings.layout(req.query.layout).catch(() => null) : await settings.defaultLayout();
  if (!layout) throw badRequest('errors.layout_not_found');
  const variant = batchSheet.VARIANTS.includes(req.query.variant) ? req.query.variant : 'print';
  const scope = req.query.scope === 'unassigned' ? ['generated', 'available'] : ['generated', 'available', 'assigned', 'active', 'suspended'];
  const codes = (await batches.codesForPdf(b.id)).filter((c) => scope.includes(c.status));
  if (!codes.length) throw badRequest('errors.batch_no_printable_codes');
  await audit.log(null, { actor: req.user, action: 'export.batch_pdf', entityType: 'batch', entityId: b.id, details: { ref: b.batch_ref, variant, layout: layout.name, codes: codes.length }, req });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="lamma-car-${b.batch_ref}-${variant}.pdf"`);
  await batchSheet.render(res, { title: `Lamma Car ${b.batch_ref} — ${b.name}`, batchRef: b.batch_ref, codes, layout, variant, generatedBy: req.user.email });
}));

router.get('/:id/export.csv', requirePerm('batches.export'), h(async (req, res) => {
  const b = await batches.get(req.params.id);
  if (!b) throw notFound();
  const rows = await batches.exportRows(b.id);
  const t = req.t;
  const csv = toCsv([
    { label: t('fields.serial'), value: (r) => serialRef(r.serial_no) },
    { label: t('fields.public_code'), key: 'public_code' },
    { label: t('fields.qr_url'), value: (r) => qrUrl(r.public_code) },
    { label: t('fields.batch'), key: 'batch_ref' },
    { label: t('fields.status'), value: (r) => t('qr_status.' + r.status) },
    { label: t('fields.customer'), key: 'customer_ref' },
    { label: t('fields.vehicle'), key: 'vehicle_ref' },
    { label: t('fields.created_at'), value: (r) => r.created_at && r.created_at.toISOString() },
    { label: t('fields.assigned_at'), value: (r) => r.assigned_at && r.assigned_at.toISOString() },
    { label: t('fields.activated_at'), value: (r) => r.activated_at && r.activated_at.toISOString() },
    { label: t('fields.deactivated_at'), value: (r) => r.deactivated_at && r.deactivated_at.toISOString() },
  ], rows);
  await audit.log(null, { actor: req.user, action: 'export.batch_csv', entityType: 'batch', entityId: b.id, details: { ref: b.batch_ref, rows: rows.length }, req });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="lamma-car-${b.batch_ref}.csv"`);
  res.send(csv);
}));

module.exports = router;
