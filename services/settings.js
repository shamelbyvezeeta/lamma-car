'use strict';
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, badRequest, notFound, conflict, fromPg } = require('../lib/errors');

// Known settings and their validators. Unknown keys are rejected.
const DEFS = {
  'landing.show_category': { type: 'bool' },
  'landing.show_vehicle_photo': { type: 'bool' },
  'landing.show_extended_details': { type: 'bool' },
  'contact.requests_enabled': { type: 'bool' },
  'sales.default_currency': { type: 'currency' },
  'sales.default_amount': { type: 'money_or_null' },
  'support.public_phone': { type: 'phone_or_null' },
  'support.public_email': { type: 'email_or_null' },
};

let cache = null;
let cacheAt = 0;

async function all() {
  if (cache && Date.now() - cacheAt < 5000) return cache;
  const { rows } = await db.query('SELECT key, value FROM system_settings');
  const out = {};
  for (const k of Object.keys(DEFS)) out[k] = null;
  for (const r of rows) out[r.key] = r.value;
  cache = out; cacheAt = Date.now();
  return out;
}
function invalidate() { cache = null; }

function coerce(key, raw) {
  const def = DEFS[key];
  if (!def) throw badRequest('errors.invalid_data');
  const v = typeof raw === 'string' ? raw.trim() : raw;
  switch (def.type) {
    case 'bool': return v === 'on' || v === 'true' || v === true;
    case 'currency': if (!/^[A-Za-z]{3}$/.test(v || '')) throw badRequest('validation.invalid_currency'); return v.toUpperCase();
    case 'money_or_null': if (v === '' || v == null) return null; if (!/^\d+(\.\d{1,2})?$/.test(v)) throw badRequest('validation.invalid_number'); return Number(v);
    case 'phone_or_null': if (v === '' || v == null) return null; if (!/^\+?[0-9 ]{7,20}$/.test(v)) throw badRequest('validation.invalid_mobile'); return v;
    case 'email_or_null': if (v === '' || v == null) return null; if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw badRequest('validation.invalid_email'); return v;
    default: throw badRequest('errors.invalid_data');
  }
}

async function updateMany(actor, body, req) {
  if (!can(actor, 'settings.manage')) throw forbidden();
  const changes = {};
  for (const key of Object.keys(DEFS)) {
    const field = key.replace(/\./g, '__');
    const raw = DEFS[key].type === 'bool' ? (body[field] ?? false) : body[field];
    if (raw === undefined) continue;
    changes[key] = coerce(key, raw);
  }
  await db.tx(async (c) => {
    const before = (await c.query('SELECT key, value FROM system_settings')).rows.reduce((a, r) => ((a[r.key] = r.value), a), {});
    for (const [k, v] of Object.entries(changes)) {
      await c.query(`INSERT INTO system_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [k, JSON.stringify(v), actor.id]);
    }
    const diff = {};
    for (const [k, v] of Object.entries(changes)) if (JSON.stringify(before[k]) !== JSON.stringify(v)) diff[k] = { from: before[k] ?? null, to: v };
    await audit.log(c, { actor, action: 'settings.update', entityType: 'settings', details: diff, req });
  });
  invalidate();
}

// ---- Sheet layouts ----------------------------------------------------------
async function layouts() {
  const { rows } = await db.query('SELECT * FROM sheet_layouts ORDER BY is_default DESC, name');
  return rows.map(numLayout);
}
function numLayout(r) {
  for (const k of ['page_width_mm', 'page_height_mm', 'margin_top_mm', 'margin_left_mm', 'gap_x_mm', 'gap_y_mm', 'bleed_mm']) r[k] = Number(r[k]);
  return r;
}
async function layout(id) {
  const { rows } = await db.query('SELECT * FROM sheet_layouts WHERE id = $1', [id]);
  return rows[0] ? numLayout(rows[0]) : null;
}
async function defaultLayout() {
  const { rows } = await db.query('SELECT * FROM sheet_layouts ORDER BY is_default DESC, created_at LIMIT 1');
  return rows[0] ? numLayout(rows[0]) : null;
}

function assertLayoutFits(l, sticker) {
  const needW = l.margin_left_mm + l.columns * sticker.width_mm + (l.columns - 1) * l.gap_x_mm;
  const needH = l.margin_top_mm + l.rows * sticker.height_mm + (l.rows - 1) * l.gap_y_mm;
  if (needW > l.page_width_mm + 0.01 || needH > l.page_height_mm + 0.01) throw badRequest('errors.layout_does_not_fit', { w: needW.toFixed(1), h: needH.toFixed(1) });
  if (l.columns > 1 && l.gap_x_mm < 2 * l.bleed_mm) throw badRequest('errors.layout_gap_bleed');
  if (l.rows > 1 && l.gap_y_mm < 2 * l.bleed_mm) throw badRequest('errors.layout_gap_bleed');
  if (l.margin_left_mm < l.bleed_mm || l.margin_top_mm < l.bleed_mm) throw badRequest('errors.layout_margin_bleed');
}

async function createLayout(actor, data, sticker, req) {
  if (!can(actor, 'settings.manage')) throw forbidden();
  assertLayoutFits(data, sticker);
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query(`INSERT INTO sheet_layouts (name, page_width_mm, page_height_mm, columns, rows, margin_top_mm, margin_left_mm, gap_x_mm, gap_y_mm, bleed_mm, crop_marks)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.name, data.page_width_mm, data.page_height_mm, data.columns, data.rows, data.margin_top_mm, data.margin_left_mm, data.gap_x_mm, data.gap_y_mm, data.bleed_mm, data.crop_marks]);
      await audit.log(c, { actor, action: 'layout.create', entityType: 'sheet_layout', entityId: rows[0].id, details: data, req });
      return rows[0];
    });
  } catch (e) { throw fromPg(e); }
}

async function setDefaultLayout(actor, id, req) {
  if (!can(actor, 'settings.manage')) throw forbidden();
  await db.tx(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM sheet_layouts WHERE id = $1', [id]);
    if (!rowCount) throw notFound();
    await c.query('UPDATE sheet_layouts SET is_default = false WHERE is_default');
    await c.query('UPDATE sheet_layouts SET is_default = true WHERE id = $1', [id]);
    await audit.log(c, { actor, action: 'layout.set_default', entityType: 'sheet_layout', entityId: id, req });
  });
}

async function deleteLayout(actor, id, req) {
  if (!can(actor, 'settings.manage')) throw forbidden();
  await db.tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM sheet_layouts WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound();
    if (rows[0].is_default) throw conflict('errors.cannot_delete_default_layout');
    await c.query('DELETE FROM sheet_layouts WHERE id = $1', [id]);
    await audit.log(c, { actor, action: 'layout.delete', entityType: 'sheet_layout', entityId: id, details: { name: rows[0].name }, req });
  });
}

async function salesChannels(activeOnly = true) {
  const { rows } = await db.query(`SELECT * FROM sales_channels ${activeOnly ? 'WHERE is_active' : ''} ORDER BY sort_order, code`);
  return rows;
}

module.exports = { all, invalidate, updateMany, DEFS, layouts, layout, defaultLayout, createLayout, setDefaultLayout, deleteLayout, assertLayoutFits, salesChannels };
