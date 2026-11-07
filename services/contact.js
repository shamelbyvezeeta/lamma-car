'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound } = require('../lib/errors');
const { pager, PAGE_SIZE } = require('../lib/listing');

async function list(query = {}) {
  const status = ['new', 'relayed', 'closed'].includes(query.status) ? query.status : null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const params = status ? [status] : [];
  const where = status ? 'WHERE r.status = $1' : '';
  const { rows: cnt } = await db.query(`SELECT count(*)::int AS n FROM contact_requests r ${where}`, params);
  const { rows } = await db.query(
    `SELECT r.*, c.full_name AS customer_name, c.customer_ref, c.mobile AS customer_mobile, v.vehicle_ref, v.make, v.model, q.serial_no, u.full_name AS handled_by_name
       FROM contact_requests r JOIN customers c ON c.id = r.customer_id JOIN vehicles v ON v.id = r.vehicle_id
       JOIN qr_codes q ON q.id = r.qr_code_id LEFT JOIN app_users u ON u.id = r.handled_by
       ${where} ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
  return { rows, pager: pager(cnt[0].n, page, PAGE_SIZE) };
}

async function countNew() {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM contact_requests WHERE status = 'new'`);
  return rows[0].n;
}

async function setStatus(actor, id, status, req) {
  if (!can(actor, 'contact.handle')) throw forbidden();
  if (!['relayed', 'closed', 'new'].includes(status)) throw notFound();
  await db.tx(async (c) => {
    const { rows } = await c.query('SELECT status FROM contact_requests WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    await c.query('UPDATE contact_requests SET status = $2, handled_by = $3, handled_at = now() WHERE id = $1', [id, status, actor.id]);
    await audit.log(c, { actor, action: 'contact_request.status', entityType: 'contact_request', entityId: id, details: { from: rows[0].status, to: status }, req });
  });
}

module.exports = { list, countNew, setStatus };
