'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound, fromPg } = require('../lib/errors');
const { pageParams, likeTerm, pager, Where } = require('../lib/listing');

const SORT = {
  name: { col: 'lower(c.full_name)', dir: 'ASC' },
  ref: { col: 'c.customer_ref', dir: 'DESC' },
  registered: { col: 'c.registration_date', dir: 'DESC' },
  created: { col: 'c.created_at', dir: 'DESC' },
};

async function list(query = {}) {
  const p = pageParams(query, SORT, 'created');
  const w = new Where();
  const term = likeTerm(query.q);
  if (term) {
    const digits = String(query.q).replace(/\D/g, '');
    w.add(`(c.full_name ILIKE ? OR c.customer_ref ILIKE ? OR c.email::text ILIKE ?${digits.length >= 4 ? ' OR c.mobile LIKE ?' : ''})`,
      term, term, term, ...(digits.length >= 4 ? ['%' + digits.replace(/^0/, '') + '%'] : []));
  }
  if (['active', 'inactive', 'archived'].includes(query.status)) w.add('c.status = ?', query.status);
  if (['not_set', 'public', 'private'].includes(query.visibility)) w.add('c.phone_visibility = ?', query.visibility);
  const { rows: cnt } = await db.query(`SELECT count(*)::int AS n FROM customers c ${w.sql}`, w.params);
  const { rows } = await db.query(
    `SELECT c.id, c.customer_ref, c.full_name, c.mobile, c.email, c.status, c.phone_visibility, c.registration_date, c.is_test_data,
            (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id)::int AS vehicle_count,
            (SELECT count(*) FROM qr_codes q WHERE q.customer_id = c.id AND q.status = 'active')::int AS active_qr_count
       FROM customers c ${w.sql} ORDER BY ${p.orderBy}, c.id LIMIT ${p.pageSize} OFFSET ${p.offset}`, w.params);
  return { rows, pager: pager(cnt[0].n, p.page, p.pageSize), sort: p.sortKey, dir: p.dir };
}

async function get(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows } = await db.query(
    `SELECT c.*, u.full_name AS created_by_name FROM customers c LEFT JOIN app_users u ON u.id = c.created_by WHERE c.id = $1`, [id]);
  if (!rows[0]) return null;
  const c = rows[0];
  const [veh, qrs, consents, sales] = await Promise.all([
    db.query(`SELECT v.*, (SELECT row_to_json(q) FROM (SELECT id, serial_no, public_code, status FROM qr_codes WHERE vehicle_id = v.id AND status IN ('assigned','active','suspended') LIMIT 1) q) AS live_qr
                FROM vehicles v WHERE v.customer_id = $1 ORDER BY v.created_at`, [id]),
    db.query(`SELECT q.id, q.serial_no, q.public_code, q.status, q.assigned_at, q.activated_at, b.batch_ref, v.vehicle_ref, v.make, v.model
                FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id LEFT JOIN vehicles v ON v.id = q.vehicle_id
               WHERE q.customer_id = $1 ORDER BY q.assigned_at DESC`, [id]),
    db.query(`SELECT r.*, u.full_name AS recorded_by_name FROM consent_records r LEFT JOIN app_users u ON u.id = r.recorded_by
               WHERE r.customer_id = $1 ORDER BY r.recorded_at DESC, r.id DESC`, [id]),
    db.query(`SELECT s.id, s.sale_ref, s.sale_date, s.amount, s.currency, s.payment_status FROM sales s WHERE s.customer_id = $1 ORDER BY s.sale_date DESC`, [id]),
  ]);
  c.vehicles = veh.rows;
  c.qr_codes = qrs.rows;
  c.consents = consents.rows;
  c.sales = sales.rows;
  return c;
}

async function create(actor, data, privacy, req) {
  if (!can(actor, 'customers.create')) throw forbidden();
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO customers (full_name, mobile, email, preferred_locale, registration_date, internal_notes, created_by)
         VALUES ($1,$2,$3,$4,COALESCE($5::date, current_date),$6,$7) RETURNING *`,
        [data.full_name, data.mobile, data.email, data.preferred_locale, data.registration_date || null, data.internal_notes, actor.id]);
      const cust = rows[0];
      await audit.log(c, { actor, action: 'customer.create', entityType: 'customer', entityId: cust.id, details: { ref: cust.customer_ref }, req });
      if (privacy) await applyPrivacy(c, actor, cust, privacy, req);
      return cust;
    });
  } catch (e) { throw fromPg(e); }
}

async function update(actor, id, data, req) {
  if (!can(actor, 'customers.edit')) throw forbidden();
  try {
    return await db.tx(async (c) => {
      const { rows: cur } = await c.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [id]);
      if (!cur[0]) throw notFound();
      const { rows } = await c.query(
        `UPDATE customers SET full_name = $2, mobile = $3, email = $4, preferred_locale = $5,
                registration_date = COALESCE($6::date, registration_date), internal_notes = $7 WHERE id = $1 RETURNING *`,
        [id, data.full_name, data.mobile, data.email, data.preferred_locale, data.registration_date || null, data.internal_notes]);
      const changed = ['full_name', 'mobile', 'email', 'preferred_locale', 'registration_date', 'internal_notes'].filter((k) => String(cur[0][k] ?? '') !== String(rows[0][k] ?? ''));
      await audit.log(c, { actor, action: 'customer.update', entityType: 'customer', entityId: id, details: { changed_fields: changed }, req });
      return rows[0];
    });
  } catch (e) { throw fromPg(e); }
}

// Every privacy change writes an immutable consent record (who, when, how, evidence).
async function applyPrivacy(c, actor, cust, p, req) {
  const changes = [];
  if (p.phone_visibility !== cust.phone_visibility) changes.push(['phone_visibility', p.phone_visibility]);
  if (Boolean(p.allow_contact_requests) !== Boolean(cust.allow_contact_requests)) changes.push(['contact_requests', p.allow_contact_requests ? 'allowed' : 'not_allowed']);
  if (!changes.length) return false;
  await c.query('UPDATE customers SET phone_visibility = $2, allow_contact_requests = $3 WHERE id = $1', [cust.id, p.phone_visibility, p.allow_contact_requests]);
  for (const [type, value] of changes) {
    await c.query(`INSERT INTO consent_records (customer_id, consent_type, value, method, evidence_note, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [cust.id, type, value, p.consent_method, p.evidence_note, actor.id]);
  }
  await audit.log(c, { actor, action: 'customer.privacy_change', entityType: 'customer', entityId: cust.id,
    details: { phone_visibility: { from: cust.phone_visibility, to: p.phone_visibility }, allow_contact_requests: { from: cust.allow_contact_requests, to: p.allow_contact_requests }, method: p.consent_method }, req });
  return true;
}

async function updatePrivacy(actor, id, p, req) {
  if (!can(actor, 'customers.privacy')) throw forbidden();
  return db.tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    return applyPrivacy(c, actor, rows[0], p, req);
  });
}

async function setStatus(actor, id, status, req) {
  if (!can(actor, 'customers.status')) throw forbidden();
  return db.tx(async (c) => {
    const { rows } = await c.query('SELECT status FROM customers WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    if (rows[0].status === status) return;
    await c.query('UPDATE customers SET status = $2 WHERE id = $1', [id, status]);
    await audit.log(c, { actor, action: 'customer.status_change', entityType: 'customer', entityId: id, details: { from: rows[0].status, to: status }, req });
  });
}

async function search(q, limit = 10) {
  const term = likeTerm(q);
  if (!term) return [];
  const digits = String(q).replace(/\D/g, '');
  const { rows } = await db.query(
    `SELECT id, customer_ref, full_name, mobile FROM customers
      WHERE status <> 'archived' AND (full_name ILIKE $1 OR customer_ref ILIKE $1 ${digits.length >= 4 ? 'OR mobile LIKE $3' : ''})
      ORDER BY full_name LIMIT $2`, digits.length >= 4 ? [term, limit, '%' + digits.replace(/^0/, '') + '%'] : [term, limit]);
  return rows;
}

module.exports = { list, get, create, update, updatePrivacy, setStatus, search };
