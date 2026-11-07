'use strict';
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const settings = require('./settings');
const { normalizePublicCode } = require('../lib/codes');
const { badRequest, notFound } = require('../lib/errors');

/**
 * Resolve a scanned code into the public card.
 * Returns { state: 'invalid' | 'not_active' | 'active', card? }.
 * Uses ONLY the database function public_qr_card(), which can never return private fields.
 * 'not_active' intentionally does not distinguish generated/available/assigned/suspended/deactivated
 * to visitors (no information leakage about stock or customers).
 */
async function resolve(rawCode) {
  const code = normalizePublicCode(rawCode);
  if (!code) return { state: 'invalid' };
  const { rows } = await db.query('SELECT * FROM public_qr_card($1)', [code]);
  if (!rows[0]) return { state: 'invalid' };
  const r = rows[0];
  if (r.qr_status !== 'active') return { state: 'not_active', code };
  const s = await settings.all();
  const card = {
    code,
    make: r.make, model: r.model, model_year: r.model_year, color: r.color,
    category: s['landing.show_category'] ? r.category : null,
    listing_status: r.listing_status,
    transmission: s['landing.show_extended_details'] ? r.transmission : null,
    fuel_type: s['landing.show_extended_details'] ? r.fuel_type : null,
    mileage_km: s['landing.show_extended_details'] ? r.mileage_km : null,
    asking_price: r.listing_status === 'listed' ? r.asking_price : null,
    price_currency: r.price_currency,
    public_description: r.public_description,
    has_photo: Boolean(s['landing.show_vehicle_photo'] && r.photo_key),
    photo_key: s['landing.show_vehicle_photo'] ? r.photo_key : null,
    public_phone: r.public_phone || null,
    contact_requests: Boolean(s['contact.requests_enabled'] && r.contact_requests),
    support_phone: s['support.public_phone'] || null,
    support_email: s['support.public_email'] || null,
  };
  return { state: 'active', card };
}

function hashIp(ip) {
  return crypto.createHmac('sha256', config.ipHashSalt).update(String(ip || '')).digest('hex').slice(0, 32);
}

/** Store a visitor's message for the Lamma team to relay. Only allowed when the owner opted in AND the feature is on. */
async function createContactRequest(rawCode, data, ip) {
  const code = normalizePublicCode(rawCode);
  if (!code) throw notFound();
  const s = await settings.all();
  if (!s['contact.requests_enabled']) throw badRequest('errors.contact_disabled');
  return db.tx(async (c) => {
    const { rows } = await c.query(
      `SELECT q.id, q.customer_id, q.vehicle_id FROM qr_codes q JOIN customers cu ON cu.id = q.customer_id
        WHERE q.public_code = $1 AND q.status = 'active' AND cu.status = 'active' AND cu.allow_contact_requests`, [code]);
    if (!rows[0]) throw badRequest('errors.contact_disabled');
    const ipHash = hashIp(ip);
    const { rows: recent } = await c.query(
      `SELECT count(*)::int AS n FROM contact_requests WHERE ip_hash = $1 AND created_at > now() - interval '1 day'`, [ipHash]);
    if (recent[0].n >= 10) throw badRequest('errors.too_many_requests');
    await c.query(
      `INSERT INTO contact_requests (qr_code_id, customer_id, vehicle_id, visitor_name, visitor_phone, message, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rows[0].id, rows[0].customer_id, rows[0].vehicle_id, data.visitor_name, data.visitor_phone, data.message, ipHash]);
    return true;
  });
}

module.exports = { resolve, createContactRequest, hashIp };
