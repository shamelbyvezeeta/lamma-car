'use strict';
const express = require('express');
const { REPORTS } = require('../../services/reports');
const reportPdf = require('../../pdf/report');
const audit = require('../../lib/audit');
const fmt = require('../../lib/format');
const { toCsv } = require('../../lib/csv');
const { requirePerm } = require('../../middleware/auth');
const { notFound } = require('../../lib/errors');
const { h } = require('./_util');

const router = express.Router();

router.get('/', requirePerm('reports.view'), (req, res) => {
  res.render('admin/reports/index.njk', { nav: 'reports', reports: Object.keys(REPORTS) });
});

router.get('/:key.:ext(csv|pdf)', requirePerm('reports.export'), h(async (req, res) => {
  const rep = REPORTS[req.params.key];
  if (!rep) throw notFound();
  const filters = { ...req.query };
  const rows = await rep.rows({ user: req.user, locale: req.locale, t: req.t, filters });
  const cols = rep.columns(req.t, req.locale);
  const name = `lamma-car-${req.params.key}-${fmt.todayIso()}`;
  await audit.log(null, { actor: req.user, action: `export.report_${req.params.ext}`, entityType: 'report', entityId: req.params.key, details: { rows: rows.length, filters }, req });
  if (req.params.ext === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(toCsv(cols.map((c) => ({ label: c.label, key: c.key, value: c.value })), rows));
  }
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${name}.pdf"`);
  await reportPdf.render(res, { title: req.t(rep.title), columns: cols.filter((c) => !c.csvOnly), rows, locale: req.locale, t: req.t, user: req.user });
}));

module.exports = router;
