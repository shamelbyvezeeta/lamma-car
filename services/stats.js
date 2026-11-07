'use strict';
const db = require('../db');
const qr = require('./qr');
const sales = require('./sales');
const batches = require('./batches');
const settings = require('./settings');

// Every figure here is computed live from the database. Nothing is estimated or sampled.
async function dashboard() {
  const s = await settings.all();
  const currency = s['sales.default_currency'] || 'EGP';
  const [qrCounts, salesSummary, series, perf, people, recent] = await Promise.all([
    qr.statusCounts(),
    sales.summary(),
    sales.dailySeries(30, currency),
    batches.performance(6),
    db.query(`SELECT (SELECT count(*) FROM customers WHERE status <> 'archived')::int AS customers,
                     (SELECT count(*) FROM vehicles v JOIN customers c ON c.id = v.customer_id WHERE c.status <> 'archived')::int AS vehicles,
                     (SELECT count(*) FROM customers WHERE phone_visibility = 'not_set' AND status = 'active')::int AS privacy_not_set,
                     (SELECT count(*) FROM qr_codes WHERE status = 'assigned')::int AS awaiting_activation`),
    db.query(`SELECT a.action, a.entity_type, a.entity_id, a.created_at, a.actor_label, u.full_name AS actor_name
                FROM audit_logs a LEFT JOIN app_users u ON u.id = a.actor_id
               WHERE a.action NOT LIKE 'auth.%' AND a.action NOT LIKE 'export.%' ORDER BY a.created_at DESC LIMIT 8`),
  ]);
  return { qr: qrCounts, sales: salesSummary, series, currency, batches: perf, ...people.rows[0], recent: recent.rows };
}

module.exports = { dashboard };
