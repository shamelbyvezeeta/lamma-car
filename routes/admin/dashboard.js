'use strict';
const express = require('express');
const stats = require('../../services/stats');
const { requirePerm } = require('../../middleware/auth');
const { h } = require('./_util');

const router = express.Router();
router.get('/', requirePerm('dashboard.view'), h(async (req, res) => {
  const d = await stats.dashboard();
  const maxSeries = Math.max(1, ...d.series.map((s) => s.sales));
  res.render('admin/dashboard.njk', { d, maxSeries, nav: 'dashboard' });
}));
module.exports = router;
