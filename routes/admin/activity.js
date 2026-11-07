'use strict';
const express = require('express');
const db = require('../../db');
const { requirePerm } = require('../../middleware/auth');
const { pager, PAGE_SIZE, Where, likeTerm } = require('../../lib/listing');
const { h } = require('./_util');

const router = express.Router();
router.get('/', requirePerm('logs.view'), h(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const w = new Where();
  if (req.query.action && /^[a-z_.]{2,60}$/.test(req.query.action)) w.add('a.action LIKE ?', req.query.action.replace(/[%_]/g, '') + '%');
  if (req.query.entity && /^[a-z_]{2,30}$/.test(req.query.entity)) w.add('a.entity_type = ?', req.query.entity);
  const term = likeTerm(req.query.q);
  if (term) w.add('(a.actor_label ILIKE ? OR a.entity_id ILIKE ? OR a.details::text ILIKE ?)', term, term, term);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) w.add('a.created_at >= ?::date', req.query.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) w.add(`a.created_at < (?::date + interval '1 day')`, req.query.to);
  const { rows: cnt } = await db.query(`SELECT count(*)::int AS n FROM audit_logs a ${w.sql}`, w.params);
  const { rows } = await db.query(
    `SELECT a.*, u.full_name AS actor_name FROM audit_logs a LEFT JOIN app_users u ON u.id = a.actor_id ${w.sql}
      ORDER BY a.created_at DESC, a.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, w.params);
  const { rows: actions } = await db.query(`SELECT DISTINCT split_part(action, '.', 1) AS a FROM audit_logs ORDER BY 1`);
  res.render('admin/activity/index.njk', { nav: 'activity', rows, pager: pager(cnt[0].n, page, PAGE_SIZE), actionGroups: actions.map((r) => r.a) });
}));
module.exports = router;
