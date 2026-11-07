'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound, conflict, fromPg } = require('../lib/errors');
const { pageParams, likeTerm, pager, Where } = require('../lib/listing');
const { generatePublicCode } = require('../lib/codes');

const SORT = {
  created: { col: 'b.created_at', dir: 'DESC' },
  ref: { col: 'b.batch_ref', dir: 'DESC' },
  name: { col: 'lower(b.name)', dir: 'ASC' },
  quantity: { col: 'b.quantity', dir: 'DESC' },
};

const COUNTS = `
  count(q.*)::int AS total,
  count(*) FILTER (WHERE q.status = 'generated')::int   AS generated,
  count(*) FILTER (WHERE q.status = 'available')::int   AS available,
  count(*) FILTER (WHERE q.status = 'assigned')::int    AS assigned,
  count(*) FILTER (WHERE q.status = 'active')::int      AS active,
  count(*) FILTER (WHERE q.status = 'suspended')::int   AS suspended,
  count(*) FILTER (WHERE q.status = 'deactivated')::int AS deactivated,
  count(*) FILTER (WHERE q.activated_at IS NOT NULL)::int AS ever_activated,
  count(*) FILTER (WHERE q.customer_id IS NOT NULL)::int AS ever_assigned`;

async function list(query = {}) {
  const p = pageParams(query, SORT, 'created');
  const w = new Where();
  const term = likeTerm(query.q);
  if (term) w.add('(b.batch_ref ILIKE ? OR b.name ILIKE ?)', term, term);
  if (['generated', 'released', 'closed'].includes(query.status)) w.add('b.status = ?', query.status);
  const { rows: cnt } = await db.query(`SELECT count(*)::int AS n FROM qr_batches b ${w.sql}`, w.params);
  const { rows } = await db.query(
    `SELECT b.*, u.full_name AS created_by_name, ${COUNTS}
       FROM qr_batches b LEFT JOIN app_users u ON u.id = b.created_by LEFT JOIN qr_codes q ON q.batch_id = b.id
       ${w.sql} GROUP BY b.id, u.full_name ORDER BY ${p.orderBy}, b.id LIMIT ${p.pageSize} OFFSET ${p.offset}`, w.params);
  return { rows, pager: pager(cnt[0].n, p.page, p.pageSize), sort: p.sortKey, dir: p.dir };
}

async function get(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows } = await db.query(
    `SELECT b.*, u.full_name AS created_by_name, r.full_name AS released_by_name, ${COUNTS}
       FROM qr_batches b LEFT JOIN app_users u ON u.id = b.created_by LEFT JOIN app_users r ON r.id = b.released_by
       LEFT JOIN qr_codes q ON q.batch_id = b.id WHERE b.id = $1 GROUP BY b.id, u.full_name, r.full_name`, [id]);
  return rows[0] || null;
}

async function codesForPdf(batchId) {
  const { rows } = await db.query('SELECT serial_no, public_code, status FROM qr_codes WHERE batch_id = $1 ORDER BY serial_no', [batchId]);
  return rows;
}

async function exportRows(batchId) {
  const { rows } = await db.query(
    `SELECT q.serial_no, q.public_code, q.status, q.created_at, q.assigned_at, q.activated_at, q.deactivated_at, b.batch_ref,
            c.customer_ref, v.vehicle_ref
       FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id
       LEFT JOIN customers c ON c.id = q.customer_id LEFT JOIN vehicles v ON v.id = q.vehicle_id
      WHERE q.batch_id = $1 ORDER BY q.serial_no`, [batchId]);
  return rows;
}

/**
 * Create a batch and generate `quantity` unique QR identifiers in ONE transaction.
 * `request_token` makes a double-submitted form idempotent.
 */
async function create(actor, data, req) {
  if (!can(actor, 'batches.create')) throw forbidden();
  try {
    return await db.tx(async (c) => {
      const { rows: existing } = await c.query('SELECT id FROM qr_batches WHERE request_token = $1', [data.request_token]);
      if (existing[0]) return { id: existing[0].id, duplicate: true };
      await c.query('SELECT pg_advisory_xact_lock(4242001)');
      const year = new Date().getFullYear();
      const { rows: seq } = await c.query(
        `SELECT COALESCE(max(substring(batch_ref from 8)::int), 0) + 1 AS n FROM qr_batches WHERE batch_ref LIKE $1`, [`B-${year}-%`]);
      const ref = `B-${year}-${String(seq[0].n).padStart(4, '0')}`;
      const { rows } = await c.query(
        `INSERT INTO qr_batches (batch_ref, name, quantity, notes, request_token, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [ref, data.name, data.quantity, data.notes, data.request_token, actor.id]);
      const batch = rows[0];
      let created = 0;
      let attempts = 0;
      while (created < data.quantity) {
        if (++attempts > 20) throw new Error('could not generate unique codes');
        const need = data.quantity - created;
        const codes = Array.from({ length: need }, generatePublicCode);
        const { rowCount } = await c.query(
          `INSERT INTO qr_codes (public_code, batch_id)
           SELECT code, $2 FROM unnest($1::text[]) WITH ORDINALITY AS t(code, ord) ORDER BY ord
           ON CONFLICT (public_code) DO NOTHING`, [codes, batch.id]);
        created += rowCount;
      }
      await c.query(`INSERT INTO qr_status_history (qr_code_id, from_status, to_status, actor_id)
                     SELECT id, NULL, 'generated', $2 FROM qr_codes WHERE batch_id = $1`, [batch.id, actor.id]);
      await audit.log(c, { actor, action: 'batch.create', entityType: 'batch', entityId: batch.id, details: { ref, name: data.name, quantity: data.quantity }, req });
      return { id: batch.id, duplicate: false };
    });
  } catch (e) { throw fromPg(e); }
}

/** Mark printed stickers as stock: all GENERATED codes in the batch become AVAILABLE. */
async function release(actor, id, req) {
  if (!can(actor, 'batches.release')) throw forbidden();
  return db.tx(async (c) => {
    const { rows } = await c.query('SELECT status, batch_ref FROM qr_batches WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    if (rows[0].status !== 'generated') throw conflict('errors.batch_not_generated');
    const { rows: moved } = await c.query(`UPDATE qr_codes SET status = 'available' WHERE batch_id = $1 AND status = 'generated' RETURNING id`, [id]);
    if (moved.length) {
      await c.query(`INSERT INTO qr_status_history (qr_code_id, from_status, to_status, actor_id) SELECT unnest($1::uuid[]), 'generated', 'available', $2`, [moved.map((r) => r.id), actor.id]);
    }
    await c.query(`UPDATE qr_batches SET status = 'released', released_at = now(), released_by = $2 WHERE id = $1`, [id, actor.id]);
    await audit.log(c, { actor, action: 'batch.release', entityType: 'batch', entityId: id, details: { ref: rows[0].batch_ref, codes: moved.length }, req });
    return moved.length;
  });
}

async function close(actor, id, req) {
  if (!can(actor, 'batches.close')) throw forbidden();
  return db.tx(async (c) => {
    const { rows } = await c.query('SELECT status, batch_ref FROM qr_batches WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    if (rows[0].status === 'closed') throw conflict('errors.batch_already_closed');
    await c.query(`UPDATE qr_batches SET status = 'closed' WHERE id = $1`, [id]);
    await audit.log(c, { actor, action: 'batch.close', entityType: 'batch', entityId: id, details: { ref: rows[0].batch_ref }, req });
  });
}

async function performance(limit = 8) {
  const { rows } = await db.query(
    `SELECT b.id, b.batch_ref, b.name, b.quantity, b.status, b.created_at, ${COUNTS}
       FROM qr_batches b LEFT JOIN qr_codes q ON q.batch_id = b.id GROUP BY b.id ORDER BY b.created_at DESC LIMIT $1`, [limit]);
  return rows;
}

module.exports = { list, get, codesForPdf, exportRows, create, release, close, performance };
