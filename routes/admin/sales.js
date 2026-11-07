'use strict';
const express = require('express');
const crypto = require('crypto');
const sales = require('../../services/sales');
const customers = require('../../services/customers');
const users = require('../../services/users');
const settings = require('../../services/settings');
const audit = require('../../lib/audit');
const fmt = require('../../lib/format');
const { toCsv } = require('../../lib/csv');
const { REPORTS } = require('../../services/reports');
const { requirePerm } = require('../../middleware/auth');
const { can } = require('../../lib/permissions');
const { schemas, parse } = require('../../lib/validation');
const { notFound, forbidden } = require('../../lib/errors');
const { h, formFail } = require('./_util');

const router = express.Router();
const nav = 'sales';

async function formLocals(req, form) {
  const [channels, staff, s] = await Promise.all([settings.salesChannels(), users.activeStaff(), settings.all()]);
  let customer = null;
  if (form.customer_id) customer = await customers.get(form.customer_id);
  return { nav, form, channels, staff, customer, defaultCurrency: s['sales.default_currency'] || 'EGP' };
}

router.get('/', requirePerm('sales.view'), h(async (req, res) => {
  const [list, channels, staff] = await Promise.all([sales.list(req.query), settings.salesChannels(false), users.activeStaff()]);
  res.render('admin/sales/index.njk', { nav, list, channels, staff, statuses: sales.STATUSES });
}));

router.get('/export.csv', requirePerm('reports.export'), h(async (req, res) => {
  const rows = await sales.exportRows(req.query);
  const cols = REPORTS.sales.columns(req.t, req.locale);
  await audit.log(null, { actor: req.user, action: 'export.sales_csv', entityType: 'sale', details: { filters: req.query, rows: rows.length }, req });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="lamma-car-sales-${fmt.todayIso()}.csv"`);
  res.send(toCsv(cols.map((c) => ({ label: c.label, key: c.key, value: c.value })), rows));
}));

router.get('/new', requirePerm('sales.create'), h(async (req, res) => {
  const s = await settings.all();
  const form = { sale_date: fmt.todayIso(), payment_status: 'pending', currency: s['sales.default_currency'] || 'EGP', amount: s['sales.default_amount'] ?? '', channel: 'direct', request_token: crypto.randomUUID(), customer_id: req.query.customer || '', vehicle_id: req.query.vehicle || '' };
  res.render('admin/sales/form.njk', { ...(await formLocals(req, form)), isNew: true });
}));

router.post('/', requirePerm('sales.create'), h(async (req, res) => {
  try {
    const data = parse(schemas.sale, req.body);
    const r = await sales.create(req.user, data, req);
    req.flash(r.duplicate ? 'info' : 'success', r.duplicate ? 'flash.duplicate_ignored' : 'flash.sale_created');
    res.redirect(303, `/admin/sales/${r.id}`);
  } catch (e) {
    const form = { ...req.body, request_token: req.body.request_token || crypto.randomUUID() };
    return formFail(res, 'admin/sales/form.njk', { ...(await formLocals(req, form)), isNew: true })(e);
  }
}));

router.get('/:id', requirePerm('sales.view'), h(async (req, res) => {
  const s = await sales.get(req.params.id);
  if (!s) throw notFound();
  res.render('admin/sales/show.njk', { nav, s, canEdit: can(req.user, 'sales.edit_full') || s.responsible_user_id === req.user.id });
}));

router.get('/:id/edit', requirePerm('sales.edit_own_limited'), h(async (req, res) => {
  const s = await sales.get(req.params.id);
  if (!s) throw notFound();
  const full = can(req.user, 'sales.edit_full');
  if (!full && s.responsible_user_id !== req.user.id) throw forbidden('errors.sale_not_yours');
  res.render('admin/sales/form.njk', { ...(await formLocals(req, { ...s, amount: s.amount })), s, isNew: false, limited: !full });
}));

router.post('/:id', requirePerm('sales.edit_own_limited'), h(async (req, res) => {
  const s = await sales.get(req.params.id);
  if (!s) throw notFound();
  const full = can(req.user, 'sales.edit_full');
  try {
    const data = full
      ? parse(schemas.sale, { ...req.body, customer_id: s.customer_id, vehicle_id: s.vehicle_id, request_token: crypto.randomUUID() })
      : parse(schemas.saleLimited, req.body);
    await sales.update(req.user, s.id, data, req);
    req.flash('success', 'flash.saved');
    res.redirect(303, `/admin/sales/${s.id}`);
  } catch (e) {
    return formFail(res, 'admin/sales/form.njk', { ...(await formLocals(req, { ...s, ...req.body })), s, isNew: false, limited: !full })(e);
  }
}));

module.exports = router;
