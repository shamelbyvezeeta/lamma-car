'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound, conflict, badRequest, fromPg } = require('../lib/errors');
const { pageParams, likeTerm, pager, Where } = require('../lib/listing');
const { parseSerialRef, normalizePublicCode } = require('../lib/codes');

const STATUSES = ['generated', 'available', 'assigned', 'active', 'suspended', 'deactivated'];
const SORT = {
  serial: { col: 'q.serial_no', dir: 'DESC' },
  status: { col: 'q.status', dir: 'ASC' },
  activated: { col: 'q.activated_at', dir: 'DESC' },
  updated: { col: 'q.updated_at', dir: 'DESC' },
};

async function list(query = {}) {
  const p = pageParams(query, SORT, 'serial');
  const w = new Where();
  if (query.q) {
    const serial = parseSerialRef(query.q);
    const code = normalizePublicCode(query.q);
    const term = likeTerm(query.q);
    const ors = ['c.full_name ILIKE ?', 'v.vehicle_ref ILIKE ?', 'b.batch_ref ILIKE ?'];
    const vals = [term, term, term];
    if (serial) { ors.push('q.serial_no = ?'); vals.push(serial); }
    if (code) { ors.push('q.public_code = ?'); vals.push(code); }
    w.add('(' + ors.join(' OR ') + ')', ...vals);
  }
  if (STATUSES.includes(query.status)) w.add('q.status = ?', query.status);
  if (query.batch && /^B-\d{4}-\d{4}$/i.test(query.batch)) w.add('b.batch_ref = ?', query.batch.toUpperCase());
  const from = `FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id
                LEFT JOIN customers c ON c.id = q.customer_id LEFT JOIN vehicles v ON v.id = q.vehicle_id`;
  const { rows: cnt } = await db.query(`SELECT count(*)::int AS n ${from} ${w.sql}`, w.params);
  const { rows } = await db.query(
    `SELECT q.id, q.serial_no, q.public_code, q.status, q.created_at, q.assigned_at, q.activated_at, q.updated_at,
            b.batch_ref, b.id AS batch_id, c.id AS customer_id, c.full_name AS customer_name, v.id AS vehicle_id, v.vehicle_ref, v.make, v.model
       ${from} ${w.sql} ORDER BY ${p.orderBy}, q.serial_no DESC LIMIT ${p.pageSize} OFFSET ${p.offset}`, w.params);
  return { rows, pager: pager(cnt[0].n, p.page, p.pageSize), sort: p.sortKey, dir: p.dir };
}

async function get(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows } = await db.query(
    `SELECT q.*, b.batch_ref, b.name AS batch_name, c.full_name AS customer_name, c.customer_ref, v.vehicle_ref, v.make, v.model, v.model_year,
            ua.full_name AS assigned_by_name, uv.full_name AS activated_by_name
       FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id
       LEFT JOIN customers c ON c.id = q.customer_id LEFT JOIN vehicles v ON v.id = q.vehicle_id
       LEFT JOIN app_users ua ON ua.id = q.assigned_by LEFT JOIN app_users uv ON uv.id = q.activated_by
      WHERE q.id = $1`, [id]);
  if (!rows[0]) return null;
  const { rows: hist } = await db.query(
    `SELECT h.*, u.full_name AS actor_name FROM qr_status_history h LEFT JOIN app_users u ON u.id = h.actor_id
      WHERE h.qr_code_id = $1 ORDER BY h.created_at DESC, h.id DESC`, [id]);
  rows[0].history = hist;
  return rows[0];
}

async function history(c, qrId, from, to, reason, actor) {
  await c.query('INSERT INTO qr_status_history (qr_code_id, from_status, to_status, reason, actor_id) VALUES ($1,$2,$3,$4,$5)', [qrId, from, to, reason || null, actor ? actor.id : null]);
}

/** Assign an AVAILABLE sticker (found by printed serial "LC-000123") to a vehicle. */
async function assignBySerial(actor, vehicleId, serialInput, req) {
  if (!can(actor, 'qr.assign')) throw forbidden();
  const serial = parseSerialRef(serialInput);
  if (!serial) throw badRequest('errors.qr_serial_invalid');
  try {
    return await db.tx(async (c) => {
      const { rows: vr } = await c.query(
        `SELECT v.id, v.customer_id, c.status AS customer_status FROM vehicles v JOIN customers c ON c.id = v.customer_id WHERE v.id = $1 FOR UPDATE OF v`, [vehicleId]);
      if (!vr[0]) throw notFound();
      if (vr[0].customer_status !== 'active') throw conflict('errors.customer_not_active');
      const { rows: live } = await c.query(`SELECT 1 FROM qr_codes WHERE vehicle_id = $1 AND status IN ('assigned','active','suspended')`, [vehicleId]);
      if (live.length) throw conflict('errors.vehicle_has_live_qr');
      const { rows: qr } = await c.query(
        `SELECT q.id, q.status, q.customer_id, b.status AS batch_status FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id
          WHERE q.serial_no = $1 FOR UPDATE OF q`, [serial]);
      if (!qr[0]) throw badRequest('errors.qr_serial_not_found');
      if (qr[0].batch_status === 'closed') throw conflict('errors.batch_closed');
      if (qr[0].customer_id) throw conflict('errors.qr_no_reuse');
      if (qr[0].status !== 'available') throw conflict(qr[0].status === 'generated' ? 'errors.qr_batch_not_released' : 'errors.qr_not_available');
      await c.query(`UPDATE qr_codes SET status = 'assigned', customer_id = $2, vehicle_id = $3, assigned_at = now(), assigned_by = $4 WHERE id = $1`,
        [qr[0].id, vr[0].customer_id, vehicleId, actor.id]);
      await history(c, qr[0].id, 'available', 'assigned', null, actor);
      await audit.log(c, { actor, action: 'qr.assign', entityType: 'qr_code', entityId: qr[0].id, details: { serial, vehicle_id: vehicleId, customer_id: vr[0].customer_id }, req });
      return qr[0].id;
    });
  } catch (e) { throw fromPg(e); }
}

async function transition(actor, qrId, to, reason, req) {
  const perm = { active: 'qr.activate', suspended: 'qr.suspend', deactivated: 'qr.deactivate' }[to];
  if (!perm || !can(actor, perm)) throw forbidden();
  if ((to === 'suspended' || to === 'deactivated') && (!reason || reason.trim().length < 3)) throw badRequest('errors.reason_required');
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query(
        `SELECT q.id, q.status, q.serial_no, q.vehicle_id, c.status AS customer_status
           FROM qr_codes q LEFT JOIN customers c ON c.id = q.customer_id WHERE q.id = $1 FOR UPDATE OF q`, [qrId]);
      const q = rows[0];
      if (!q) throw notFound();
      if (q.status === to) throw conflict('errors.qr_already_in_status');
      const allowed = { active: ['assigned', 'suspended'], suspended: ['active'], deactivated: ['generated', 'available', 'assigned', 'active', 'suspended'] }[to];
      if (!allowed.includes(q.status)) throw conflict('errors.qr_invalid_transition');
      if (to === 'active' && q.customer_status !== 'active') throw conflict('errors.customer_not_active');
      const extra = to === 'active'
        ? ', activated_at = COALESCE(activated_at, now()), activated_by = COALESCE(activated_by, $3), suspended_at = NULL'
        : to === 'suspended' ? ', suspended_at = now()' : ', deactivated_at = now()';
      const params = [qrId, to];
      if (to === 'active') params.push(actor.id);
      params.push(reason || null);
      await c.query(`UPDATE qr_codes SET status = $2${extra}, status_reason = $${params.length} WHERE id = $1`, params);
      await history(c, qrId, q.status, to, reason, actor);
      await audit.log(c, { actor, action: `qr.${to === 'active' ? (q.status === 'suspended' ? 'reactivate' : 'activate') : to === 'suspended' ? 'suspend' : 'deactivate'}`,
        entityType: 'qr_code', entityId: qrId, details: { serial: q.serial_no, from: q.status, to, reason: reason || null }, req });
    });
  } catch (e) { throw fromPg(e); }
}

const activate = (a, id, req) => transition(a, id, 'active', null, req);
const suspend = (a, id, reason, req) => transition(a, id, 'suspended', reason, req);
const deactivate = (a, id, reason, req) => transition(a, id, 'deactivated', reason, req);

async function statusCounts() {
  const { rows } = await db.query('SELECT status, count(*)::int AS n FROM qr_codes GROUP BY status');
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of rows) out[r.status] = r.n;
  return out;
}

module.exports = { list, get, assignBySerial, activate, suspend, deactivate, statusCounts, STATUSES };
