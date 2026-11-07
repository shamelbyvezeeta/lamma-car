'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('../db');
const config = require('../config');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound, badRequest, conflict, fromPg } = require('../lib/errors');
const { pageParams, likeTerm, pager, Where } = require('../lib/listing');

const PHOTO_DIR = path.join(config.storageDir, 'photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const SORT = {
  created: { col: 'v.created_at', dir: 'DESC' },
  ref: { col: 'v.vehicle_ref', dir: 'DESC' },
  make: { col: 'lower(v.make)', dir: 'ASC' },
  year: { col: 'v.model_year', dir: 'DESC' },
};
const FIELDS = ['make', 'model', 'model_year', 'color', 'category', 'transmission', 'fuel_type', 'mileage_km', 'asking_price', 'price_currency', 'public_description', 'show_mileage', 'show_price', 'listing_status'];

async function list(query = {}) {
  const p = pageParams(query, SORT, 'created');
  const w = new Where();
  const term = likeTerm(query.q);
  if (term) w.add('(v.make ILIKE ? OR v.model ILIKE ? OR v.vehicle_ref ILIKE ? OR c.full_name ILIKE ? OR v.color ILIKE ?)', term, term, term, term, term);
  if (['unlisted', 'listed', 'sold'].includes(query.listing)) w.add('v.listing_status = ?', query.listing);
  if (query.category && /^[a-z_]+$/.test(query.category)) w.add('v.category = ?', query.category);
  if (query.sticker === 'none') w.add(`NOT EXISTS (SELECT 1 FROM qr_codes q WHERE q.vehicle_id = v.id AND q.status IN ('assigned','active','suspended'))`);
  if (query.sticker === 'live') w.add(`EXISTS (SELECT 1 FROM qr_codes q WHERE q.vehicle_id = v.id AND q.status IN ('assigned','active','suspended'))`);
  const from = 'FROM vehicles v JOIN customers c ON c.id = v.customer_id';
  const { rows: cnt } = await db.query(`SELECT count(*)::int AS n ${from} ${w.sql}`, w.params);
  const { rows } = await db.query(
    `SELECT v.id, v.vehicle_ref, v.make, v.model, v.model_year, v.color, v.category, v.listing_status, v.is_test_data,
            c.id AS customer_id, c.full_name AS customer_name, c.customer_ref,
            (SELECT row_to_json(q) FROM (SELECT serial_no, status FROM qr_codes WHERE vehicle_id = v.id AND status IN ('assigned','active','suspended') LIMIT 1) q) AS live_qr
       ${from} ${w.sql} ORDER BY ${p.orderBy}, v.id LIMIT ${p.pageSize} OFFSET ${p.offset}`, w.params);
  return { rows, pager: pager(cnt[0].n, p.page, p.pageSize), sort: p.sortKey, dir: p.dir };
}

async function get(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { rows } = await db.query(
    `SELECT v.*, c.full_name AS customer_name, c.customer_ref, c.status AS customer_status, c.phone_visibility
       FROM vehicles v JOIN customers c ON c.id = v.customer_id WHERE v.id = $1`, [id]);
  if (!rows[0]) return null;
  const v = rows[0];
  const { rows: qrs } = await db.query(
    `SELECT q.id, q.serial_no, q.public_code, q.status, q.assigned_at, q.activated_at, q.suspended_at, q.deactivated_at, q.status_reason, b.batch_ref
       FROM qr_codes q JOIN qr_batches b ON b.id = q.batch_id WHERE q.vehicle_id = $1 ORDER BY q.assigned_at DESC`, [id]);
  v.qr_codes = qrs;
  v.live_qr = qrs.find((q) => ['assigned', 'active', 'suspended'].includes(q.status)) || null;
  return v;
}

async function create(actor, customerId, data, req) {
  if (!can(actor, 'vehicles.create')) throw forbidden();
  try {
    return await db.tx(async (c) => {
      const { rows: cust } = await c.query('SELECT id, status FROM customers WHERE id = $1 FOR SHARE', [customerId]);
      if (!cust[0]) throw notFound();
      if (cust[0].status === 'archived') throw conflict('errors.customer_archived');
      const vals = FIELDS.map((f) => data[f] ?? null);
      const { rows } = await c.query(
        `INSERT INTO vehicles (customer_id, ${FIELDS.join(', ')}, created_by) VALUES ($1, ${FIELDS.map((_, i) => '$' + (i + 2)).join(', ')}, $${FIELDS.length + 2}) RETURNING *`,
        [customerId, ...vals, actor.id]);
      await audit.log(c, { actor, action: 'vehicle.create', entityType: 'vehicle', entityId: rows[0].id, details: { ref: rows[0].vehicle_ref, customer_id: customerId }, req });
      return rows[0];
    });
  } catch (e) { throw fromPg(e); }
}

async function update(actor, id, data, req) {
  if (!can(actor, 'vehicles.edit')) throw forbidden();
  try {
    return await db.tx(async (c) => {
      const { rows: cur } = await c.query('SELECT * FROM vehicles WHERE id = $1 FOR UPDATE', [id]);
      if (!cur[0]) throw notFound();
      const sets = FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const { rows } = await c.query(`UPDATE vehicles SET ${sets} WHERE id = $1 RETURNING *`, [id, ...FIELDS.map((f) => data[f] ?? null)]);
      const changed = FIELDS.filter((f) => String(cur[0][f] ?? '') !== String(rows[0][f] ?? ''));
      await audit.log(c, { actor, action: 'vehicle.update', entityType: 'vehicle', entityId: id, details: { changed_fields: changed }, req });
      return rows[0];
    });
  } catch (e) { throw fromPg(e); }
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
async function setPhoto(actor, id, buffer, req) {
  if (!can(actor, 'vehicles.photo')) throw forbidden();
  if (!buffer || buffer.length === 0) throw badRequest('errors.photo_required');
  if (buffer.length > MAX_PHOTO_BYTES) throw badRequest('errors.photo_too_large');
  let out;
  try {
    const meta = await sharp(buffer, { limitInputPixels: 40e6 }).metadata();
    if (!['jpeg', 'png', 'webp', 'heif'].includes(meta.format)) throw new Error('format');
    // Re-encode: auto-orient, resize, and strip ALL metadata (EXIF GPS etc.).
    out = await sharp(buffer, { limitInputPixels: 40e6 }).rotate().resize(1600, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch (_) {
    throw badRequest('errors.photo_invalid');
  }
  const key = crypto.randomBytes(16).toString('hex') + '.webp';
  fs.writeFileSync(path.join(PHOTO_DIR, key), out, { mode: 0o640 });
  let old;
  await db.tx(async (c) => {
    const { rows } = await c.query('SELECT photo_key FROM vehicles WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) { fs.unlinkSync(path.join(PHOTO_DIR, key)); throw notFound(); }
    old = rows[0].photo_key;
    // A new photo always needs fresh approval before it can appear publicly.
    await c.query('UPDATE vehicles SET photo_key = $2, photo_approved = false WHERE id = $1', [id, key]);
    await audit.log(c, { actor, action: 'vehicle.photo_upload', entityType: 'vehicle', entityId: id, req });
  });
  if (old) fs.rm(path.join(PHOTO_DIR, old), () => {});
}

async function setPhotoApproval(actor, id, approved, req) {
  if (!can(actor, 'vehicles.photo_approve')) throw forbidden();
  await db.tx(async (c) => {
    const { rows } = await c.query('SELECT photo_key FROM vehicles WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    if (!rows[0].photo_key) throw badRequest('errors.photo_required');
    await c.query('UPDATE vehicles SET photo_approved = $2 WHERE id = $1', [id, approved]);
    await audit.log(c, { actor, action: approved ? 'vehicle.photo_approve' : 'vehicle.photo_unapprove', entityType: 'vehicle', entityId: id, req });
  });
}

async function removePhoto(actor, id, req) {
  if (!can(actor, 'vehicles.photo')) throw forbidden();
  let old;
  await db.tx(async (c) => {
    const { rows } = await c.query('SELECT photo_key FROM vehicles WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    old = rows[0].photo_key;
    await c.query('UPDATE vehicles SET photo_key = NULL, photo_approved = false WHERE id = $1', [id]);
    await audit.log(c, { actor, action: 'vehicle.photo_remove', entityType: 'vehicle', entityId: id, req });
  });
  if (old) fs.rm(path.join(PHOTO_DIR, old), () => {});
}

function photoPath(key) {
  if (!key || !/^[a-f0-9]{32}\.webp$/.test(key)) return null;
  const p = path.join(PHOTO_DIR, key);
  return fs.existsSync(p) ? p : null;
}

module.exports = { list, get, create, update, setPhoto, setPhotoApproval, removePhoto, photoPath, FIELDS };
