'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound, badRequest, conflict, fromPg } = require('../lib/errors');
const { pageParams, likeTerm, pager, Where } = require('../lib/listing');

const SORT = {
  date: { col: 's.sale_date', dir: 'DESC' },
  amount: { col: 's.amount', dir: 'DESC' },
  ref: { col: 's.sale_ref', dir: 'DESC' },
  created: { col: 's.created_at', dir: 'DESC' },
};
const STATUSES = ['pending', 'paid', 'refunded', 'cancelled'];
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function filters(query) {
  const w = new Where();
  const term = likeTerm(query.q);
  if (term) w.add('(s.sale_ref ILIKE ? OR c.full_name ILIKE ? OR c.customer_ref ILIKE ? OR v.vehicle_ref ILIKE ? OR b.batch_ref ILIKE ?)', term, term, term, term, term);
  if (STATUSES.includes(query.status)) w.add('s.payment_status = ?', query.status);
  if (query.channel && /^[a-z][a-z0-9_]{1,30}$/.test(query.channel)) w.add('s.channel = ?', query.channel);
  if (isDate(query.from)) w.add('s.sale_date >= ?', query.from);
  if (isDate(query.to)) w.add('s.sale_date <= ?', query.to);
  if (query.responsible && /^[0-9a-f-]{36}$/i.test(query.responsible)) w.add('s.responsible_user_id = ?', query.responsible);
  return w;
}
const FROM = `FROM sales s JOIN customers c ON c.id = s.customer_id JOIN vehicles v ON v.id = s.vehicle_id
  LEFT JOIN qr_codes q ON q.id = s.qr_code_id LEFT JOIN qr_batches b ON b.id = s.batch_id
  LEFT JOIN app_users u ON u.id = s.responsible_user_id LEFT JOIN sales_channels ch ON ch.code = s.channel`;
const COLS = `s.*, c.full_name AS customer_name, c.customer_ref, v.vehicle_ref, v.make, v.model, v.model_year,
  q.serial_no, b.batch_ref, u.full_name AS responsible_name, ch.name_ar AS channel_ar, ch.name_en AS channel_en`;

async function list(query = {}) {
  const p = pageParams(query, SORT, 'date');
  const w = filters(query);
  const { rows: agg } = await db.query(
    `SELECT s.currency, sum(s.amount) AS paid ${FROM} ${w.sql}${w.parts.length ? ' AND' : ' WHERE'} s.payment_status = 'paid' GROUP BY s.currency ORDER BY 2 DESC`, w.params);
  const { rows } = await db.query(`SELECT ${COLS} ${FROM} ${w.sql} ORDER BY ${p.orderBy}, s.sale_ref DESC LIMIT ${p.pageSize} OFFSET ${p.offset}`, w.params);
  const { rows: total } = await db.query(`SELECT count(*)::int AS n ${FROM} ${w.sql}`, w.params);
  return { rows, pager: pager(total[0].n, p.page, p.pageSize), sort: p.sortKey, dir: p.dir, paidByCurrency: agg };
}

async function exportRows(query = {}) {
  const w = filters(query);
  const { rows } = await db.query(`SELECT ${COLS} ${FROM} ${w.sql} ORDER BY s.sale_date DESC, s.sale_ref DESC LIMIT 50000`, w.params);
  return rows;
}

async function get(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows } = await db.query(`SELECT ${COLS} ${FROM} WHERE s.id = $1`, [id]);
  return rows[0] || null;
}

async function create(actor, data, req) {
  if (!can(actor, 'sales.create')) throw forbidden();
  // Only admins may record a sale on behalf of another staff member.
  const responsible = data.responsible_user_id && can(actor, 'sales.edit_full') ? data.responsible_user_id : actor.id;
  try {
    return await db.tx(async (c) => {
      const { rows: dup } = await c.query('SELECT id FROM sales WHERE request_token = $1', [data.request_token]);
      if (dup[0]) return { id: dup[0].id, duplicate: true };
      const { rows: v } = await c.query('SELECT id FROM vehicles WHERE id = $1 AND customer_id = $2', [data.vehicle_id, data.customer_id]);
      if (!v[0]) throw badRequest('errors.vehicle_not_customer');
      const { rows: ch } = await c.query('SELECT 1 FROM sales_channels WHERE code = $1 AND is_active', [data.channel]);
      if (!ch[0]) throw badRequest('errors.invalid_channel');
      const { rows: st } = await c.query('SELECT 1 FROM app_users WHERE id = $1 AND is_active', [responsible]);
      if (!st[0]) throw badRequest('errors.invalid_responsible');
      const { rows } = await c.query(
        `INSERT INTO sales (customer_id, vehicle_id, qr_code_id, sale_date, amount, currency, payment_status, channel, responsible_user_id, notes, request_token, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, sale_ref, amount, currency`,
        [data.customer_id, data.vehicle_id, data.qr_code_id, data.sale_date, data.amount, data.currency, data.payment_status, data.channel, responsible, data.notes, data.request_token, actor.id]);
      await audit.log(c, { actor, action: 'sale.create', entityType: 'sale', entityId: rows[0].id, details: { ref: rows[0].sale_ref, amount: rows[0].amount, currency: rows[0].currency, payment_status: data.payment_status }, req });
      return { id: rows[0].id, duplicate: false };
    });
  } catch (e) { throw fromPg(e); }
}

/**
 * Admins may edit everything except the customer/vehicle link.
 * Sales operators may only change payment status and notes, and only on sales they are responsible for.
 */
async function update(actor, id, data, req) {
  const full = can(actor, 'sales.edit_full');
  if (!full && !can(actor, 'sales.edit_own_limited')) throw forbidden();
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [id]);
      const s = rows[0];
      if (!s) throw notFound();
      if (!full && s.responsible_user_id !== actor.id) throw forbidden('errors.sale_not_yours');
      let fields;
      if (full) {
        const { rows: ch } = await c.query('SELECT 1 FROM sales_channels WHERE code = $1', [data.channel]);
        if (!ch[0]) throw badRequest('errors.invalid_channel');
        const responsible = data.responsible_user_id || s.responsible_user_id;
        fields = { qr_code_id: data.qr_code_id, sale_date: data.sale_date, amount: data.amount, currency: data.currency, payment_status: data.payment_status, channel: data.channel, responsible_user_id: responsible, notes: data.notes };
      } else {
        fields = { payment_status: data.payment_status, notes: data.notes };
      }
      const keys = Object.keys(fields);
      await c.query(`UPDATE sales SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
      const changes = {};
      for (const k of keys) if (String(s[k] ?? '') !== String(fields[k] ?? '') && !(k === 'amount' && Number(s[k]) === Number(fields[k]))) changes[k] = { from: s[k], to: fields[k] };
      await audit.log(c, { actor, action: 'sale.update', entityType: 'sale', entityId: id, details: { ref: s.sale_ref, changes }, req });
      return true;
    });
  } catch (e) { throw fromPg(e); }
}

/** Revenue = sum of PAID sales only. Pending/refunded/cancelled never count. */
async function summary() {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE payment_status <> 'cancelled')::int AS total_sales,
            count(*) FILTER (WHERE payment_status = 'paid')::int AS paid_sales,
            count(*) FILTER (WHERE payment_status = 'pending')::int AS pending_sales
       FROM sales`);
  const { rows: rev } = await db.query(
    `SELECT currency, sum(amount) AS revenue, sum(amount) FILTER (WHERE sale_date >= date_trunc('month', current_date)) AS month_revenue
       FROM sales WHERE payment_status = 'paid' GROUP BY currency ORDER BY sum(amount) DESC`);
  const { rows: pend } = await db.query(`SELECT currency, sum(amount) AS amount FROM sales WHERE payment_status = 'pending' GROUP BY currency`);
  return { ...rows[0], revenue: rev, pending: pend };
}

async function dailySeries(days = 30, currency = 'EGP') {
  const { rows } = await db.query(
    `SELECT d::date AS day,
            COALESCE(count(s.*) FILTER (WHERE s.payment_status <> 'cancelled'), 0)::int AS sales,
            COALESCE(sum(s.amount) FILTER (WHERE s.payment_status = 'paid' AND s.currency = $2), 0) AS revenue
       FROM generate_series(current_date - ($1::int - 1), current_date, '1 day') d
       LEFT JOIN sales s ON s.sale_date = d::date
      GROUP BY d ORDER BY d`, [days, currency]);
  return rows.map((r) => ({ day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day, sales: r.sales, revenue: Number(r.revenue) }));
}

module.exports = { list, exportRows, get, create, update, summary, dailySeries, STATUSES };
