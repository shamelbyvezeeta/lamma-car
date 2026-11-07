#!/usr/bin/env node
'use strict';
// Loads CLEARLY-MARKED TEST DATA for QA/demo environments. Never run against production data.
// Phone numbers use the UK Ofcom range reserved for fiction (+44 7700 900xxx) so no real person can be reached.
// Staff test accounts get random passwords printed once (none are hardcoded).
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const db = require('../src/db');
const users = require('../src/services/users');
const customers = require('../src/services/customers');
const vehicles = require('../src/services/vehicles');
const batches = require('../src/services/batches');
const qr = require('../src/services/qr');
const sales = require('../src/services/sales');
const audit = require('../src/lib/audit');

if (!process.argv.includes('--yes-this-is-test-data')) { console.error('Refusing: pass --yes-this-is-test-data'); process.exit(2); }
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_SEED !== 'true') { console.error('Refusing to seed in production.'); process.exit(2); }

const pw = () => crypto.randomBytes(12).toString('base64url') + 'aA1!';

(async () => {
  const { rows: existing } = await db.query(`SELECT count(*)::int AS n FROM customers WHERE is_test_data`);
  if (existing[0].n > 0) { console.log('Test data already present — nothing to do.'); return db.pool.end(); }
  const { rows: sa } = await db.query(`SELECT * FROM app_users WHERE role = 'super_admin' AND is_active ORDER BY created_at LIMIT 1`);
  if (!sa[0]) { console.error('Create the first Super Admin first (npm run create-admin).'); process.exit(3); }
  const actor = sa[0];

  const creds = [];
  for (const [email, name, role] of [['test.admin@lamma-car.test', 'TEST Admin', 'admin'], ['test.sales@lamma-car.test', 'TEST Sales Operator', 'sales_operator']]) {
    const { rows } = await db.query('SELECT 1 FROM app_users WHERE email = $1', [email]);
    if (rows[0]) continue;
    const p = pw();
    await users.create(actor, { email, full_name: name, role, password: p });
    creds.push({ email, password: p, role });
  }

  const b = await batches.create(actor, { name: 'TEST — Demo batch', quantity: 24, notes: 'Test data. Do not print for customers.', request_token: crypto.randomUUID() });
  await batches.release(actor, b.id);
  const { rows: codes } = await db.query('SELECT serial_no FROM qr_codes WHERE batch_id = $1 ORDER BY serial_no', [b.id]);

  const people = [
    { full_name: 'عميل تجريبي — أحمد', mobile: '+447700900101', vis: 'public', relay: false, car: ['Toyota', 'Corolla', 2021, 'أبيض', 'sedan', 'listed', 'automatic', 'petrol', 48000, 865000, true, true, 'TEST — صيانة دورية في التوكيل، فرش أصلي.'] },
    { full_name: 'TEST Customer — Sara', mobile: '+447700900102', vis: 'private', relay: true, car: ['Hyundai', 'Tucson', 2023, 'Grey', 'suv', 'listed', 'automatic', 'petrol', 21000, 1650000, false, true, 'TEST — single owner.'] },
    { full_name: 'عميل تجريبي — منى', mobile: '+447700900103', vis: null, relay: false, car: ['Kia', 'Picanto', 2019, 'أحمر', 'hatchback', 'unlisted', null, null, null, null, false, false, null] },
    { full_name: 'TEST Customer — Omar', mobile: '+447700900104', vis: 'private', relay: false, car: ['Nissan', 'Sunny', 2018, 'Silver', 'sedan', 'sold', 'manual', 'petrol', 120000, null, false, false, null] },
  ];
  let i = 0;
  for (const p of people) {
    const privacy = p.vis ? { phone_visibility: p.vis, allow_contact_requests: p.relay, consent_method: 'written_form', evidence_note: 'TEST consent record' } : null;
    const c = await customers.create(actor, { full_name: p.full_name, mobile: p.mobile, email: null, preferred_locale: 'ar', internal_notes: 'TEST DATA' }, privacy);
    await db.query('UPDATE customers SET is_test_data = true WHERE id = $1', [c.id]);
    const [make, model, model_year, color, category, listing_status, transmission, fuel_type, mileage_km, asking_price, show_price, show_mileage, public_description] = p.car;
    const v = await vehicles.create(actor, c.id, { make, model, model_year, color, category, listing_status, transmission, fuel_type, mileage_km, asking_price, price_currency: 'EGP', show_price, show_mileage, public_description });
    await db.query('UPDATE vehicles SET is_test_data = true WHERE id = $1', [v.id]);
    const qrId = await qr.assignBySerial(actor, v.id, String(codes[i].serial_no));
    if (i < 3) await qr.activate(actor, qrId);
    if (i === 3) { await qr.activate(actor, qrId); await qr.suspend(actor, qrId, 'TEST — suspended to demonstrate the state'); }
    await sales.create(actor, { customer_id: c.id, vehicle_id: v.id, qr_code_id: qrId, sale_date: new Date(Date.now() - i * 86400000 * 3).toISOString().slice(0, 10), amount: 350, currency: 'EGP', payment_status: i === 2 ? 'pending' : 'paid', channel: i % 2 ? 'showroom' : 'direct', notes: 'TEST sale', request_token: crypto.randomUUID() });
    i++;
  }
  await audit.log(null, { actor, action: 'seed.test_data', details: { customers: people.length, batch: b.id } });
  const { rows: active } = await db.query(`SELECT public_code FROM qr_codes WHERE status = 'active' AND batch_id = $1 ORDER BY serial_no`, [b.id]);
  console.log('Test data loaded (all records flagged TEST).');
  console.log('Active test sticker codes:', active.map((r) => r.public_code).join(', '));
  if (creds.length) {
    console.log('\nTest staff accounts (passwords shown ONCE; users must change them at first sign-in):');
    for (const c of creds) console.log(`  ${c.role.padEnd(15)} ${c.email}  ${c.password}`);
  }
  await db.pool.end();
})().catch(async (e) => { console.error(e.key || e); await db.pool.end().catch(() => {}); process.exit(1); });
