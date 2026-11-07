'use strict';
// End-to-end system tests: real PostgreSQL, real HTTP, real sessions/CSRF. Sections follow the brief (A–I).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { resetDb, getApp, Agent, makeUser, locationId, request } = require('./helpers');

let db;
const S = {}; // shared state across sections

before(async () => {
  await resetDb();
  db = require('../src/db');
  await require('../src/pdf/text').init();
  S.superAdmin = await makeUser('super_admin', 'super@lamma.test');
  S.admin = await makeUser('admin', 'admin@lamma.test');
  S.operator = await makeUser('sales_operator', 'ops@lamma.test');
  S.operator2 = await makeUser('sales_operator', 'ops2@lamma.test');
  S.sa = new Agent(); await S.sa.login(S.superAdmin.email, S.superAdmin.password);
  S.ad = new Agent(); await S.ad.login(S.admin.email, S.admin.password);
  S.op = new Agent(); await S.op.login(S.operator.email, S.operator.password);
});
after(async () => { await db.pool.end(); });

const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];

// ---------------------------------------------------------------------------
describe('A. Authentication & authorisation', () => {
  it('rejects wrong password and does not reveal whether the email exists', async () => {
    const a = new Agent();
    const r1 = await a.login('super@lamma.test', 'wrong-password-123');
    const r2 = await a.login('nobody@lamma.test', 'wrong-password-123');
    assert.equal(r1.status, 401); assert.equal(r2.status, 401);
    assert.match(r1.text, /incorrect|غير صحيحة/); assert.match(r2.text, /incorrect|غير صحيحة/);
  });

  it('admin login succeeds and dashboard renders live figures', async () => {
    const r = await S.sa.get('/admin');
    assert.equal(r.status, 200);
    assert.match(r.text, /Ahmed|Test super_admin|أهلًا/);
  });

  it('locks the account after 5 failed attempts', async () => {
    const u = await makeUser('sales_operator', 'lockme@lamma.test');
    const a = new Agent();
    for (let i = 0; i < 5; i++) await a.login(u.email, 'bad-password-xyz');
    const r = await a.login(u.email, u.password); // correct password, but locked
    assert.equal(r.status, 401);
    assert.match(r.text, /locked|قفل/);
  });

  it('redirects anonymous users to login and returns 401 JSON for API', async () => {
    const r = await request(getApp()).get('/admin/customers');
    assert.equal(r.status, 302); assert.match(r.headers.location, /^\/admin\/login/);
    const j = await request(getApp()).get('/admin/api/customers?q=ab').set('Accept', 'application/json');
    assert.equal(j.status, 401);
  });

  it('rejects state-changing requests without a valid CSRF token', async () => {
    const r = await S.sa.a.post('/admin/customers').type('form').send({ full_name: 'No Csrf', mobile: '01011111111' });
    assert.equal(r.status, 403);
    const n = await q1(`SELECT count(*)::int n FROM customers WHERE full_name = 'No Csrf'`);
    assert.equal(n.n, 0);
  });

  it('enforces role permissions on the server (not just hidden buttons)', async () => {
    assert.equal((await S.op.get('/admin/users')).status, 403);
    assert.equal((await S.op.get('/admin/settings')).status, 403);
    assert.equal((await S.op.get('/admin/batches/new')).status, 403);
    assert.equal((await S.op.get('/admin/reports')).status, 403);
    assert.equal((await S.op.get('/admin/activity')).status, 403);
    assert.equal((await S.ad.get('/admin/users')).status, 403);
    assert.equal((await S.ad.get('/admin/settings')).status, 403);
    const forged = await S.op.post('/admin/batches', { name: 'Forged', quantity: 5, request_token: crypto.randomUUID() });
    assert.equal(forged.status, 403);
    assert.equal((await q1(`SELECT count(*)::int n FROM qr_batches WHERE name = 'Forged'`)).n, 0);
  });

  it('forces a password change for new users and disables sessions of deactivated users', async () => {
    const created = await S.sa.post('/admin/users', { full_name: 'New Person', email: 'new.person@lamma.test', role: 'sales_operator', password: 'Temp-Password-2026' });
    assert.equal(created.status, 303);
    const a = new Agent();
    const l = await a.login('new.person@lamma.test', 'Temp-Password-2026');
    assert.equal(l.headers.location, '/admin/account?force=1');
    const blocked = await a.get('/admin/customers');
    assert.equal(blocked.status, 302); assert.equal(blocked.headers.location, '/admin/account?force=1');
    await a.token('/admin/account');
    const ch = await a.post('/admin/account/password', { current_password: 'Temp-Password-2026', new_password: 'Brand-New-Password-77', confirm_password: 'Brand-New-Password-77' });
    assert.equal(ch.status, 303);
    assert.equal((await a.get('/admin/customers')).status, 200);
    const u = await q1(`SELECT id FROM app_users WHERE email = 'new.person@lamma.test'`);
    await S.sa.post(`/admin/users/${u.id}`, { full_name: 'New Person', role: 'sales_operator' }); // is_active unchecked
    const after = await a.get('/admin/customers');
    assert.equal(after.status, 302);
  });

  it('prevents removing the last Super Admin', async () => {
    const r = await S.sa.post(`/admin/users/${S.superAdmin.id}`, { full_name: 'x y', role: 'admin', is_active: 'on' });
    assert.equal(r.status, 409);
  });
});

// ---------------------------------------------------------------------------
describe('B. Customers', () => {
  it('validates required fields and phone format', async () => {
    const r = await S.op.post('/admin/customers', { full_name: '', mobile: '123' });
    assert.equal(r.status, 422);
    assert.match(r.text, /has-error/);
    assert.equal((await q1('SELECT count(*)::int n FROM customers')).n, 0);
  });

  it('creates a customer (Arabic name, Arabic-Indic digits normalised) with privacy defaulting to not_set', async () => {
    const r = await S.op.post('/admin/customers', { full_name: 'محمد علي', mobile: '٠١٠٠١٢٣٤٥٦٧', email: '', preferred_locale: 'ar', phone_visibility: 'not_set' });
    assert.equal(r.status, 303);
    S.c1 = locationId(r, '/admin/customers');
    const c = await q1('SELECT * FROM customers WHERE id = $1', [S.c1]);
    assert.equal(c.mobile, '+201001234567');
    assert.equal(c.phone_visibility, 'not_set');
    assert.match(c.customer_ref, /^C-\d{6}$/);
  });

  it('rejects a duplicate mobile number', async () => {
    const r = await S.op.post('/admin/customers', { full_name: 'Someone Else', mobile: '+201001234567' });
    assert.equal(r.status, 409);
  });

  it('requires a consent method when recording a privacy choice at creation', async () => {
    const r = await S.op.post('/admin/customers', { full_name: 'Public Owner', mobile: '01112223334', phone_visibility: 'public' });
    assert.equal(r.status, 422);
    const ok = await S.op.post('/admin/customers', { full_name: 'Public Owner', mobile: '01112223334', phone_visibility: 'public', consent_method: 'written_form', evidence_note: 'Form #1' });
    assert.equal(ok.status, 303);
    S.c2 = locationId(ok, '/admin/customers');
    const cr = await db.query('SELECT * FROM consent_records WHERE customer_id = $1', [S.c2]);
    assert.equal(cr.rows.length, 1);
    assert.equal(cr.rows[0].value, 'public');
  });

  it('edits a customer and records an audit entry', async () => {
    const r = await S.op.post(`/admin/customers/${S.c1}`, { full_name: 'محمد علي حسن', mobile: '01001234567', email: 'm@example.com', preferred_locale: 'ar' });
    assert.equal(r.status, 303);
    const c = await q1('SELECT full_name, email FROM customers WHERE id = $1', [S.c1]);
    assert.equal(c.full_name, 'محمد علي حسن'); assert.equal(c.email, 'm@example.com');
    const a = await q1(`SELECT details FROM audit_logs WHERE action = 'customer.update' AND entity_id = $1`, [S.c1]);
    assert.deepEqual(a.details.changed_fields.sort(), ['email', 'full_name']);
  });

  it('searches by name, mobile fragment and reference', async () => {
    const byName = await S.op.get('/admin/customers?q=' + encodeURIComponent('محمد'));
    assert.match(byName.text, /محمد علي حسن/);
    const byPhone = await S.op.get('/admin/customers?q=0100123');
    assert.match(byPhone.text, /محمد علي حسن/);
    assert.doesNotMatch(byPhone.text, /Public Owner/);
    const byRef = await S.op.get('/admin/customers?q=C-000');
    assert.match(byRef.text, /Public Owner/);
  });

  it('only admins can archive customers', async () => {
    const r = await S.op.post(`/admin/customers/${S.c1}/status`, { status: 'archived' });
    assert.equal(r.status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('C. Vehicles', () => {
  it('validates vehicle input', async () => {
    const r = await S.op.post('/admin/vehicles', { customer_id: S.c1, make: '', model: 'X', model_year: '1800', color: '', category: 'tank', listing_status: 'listed' });
    assert.equal(r.status, 422);
  });

  it('creates vehicles under a customer (multiple vehicles per customer)', async () => {
    const base = { customer_id: S.c1, make: 'Toyota', model: 'Corolla', model_year: '2021', color: 'White', category: 'sedan', listing_status: 'listed', transmission: 'automatic', fuel_type: 'petrol', mileage_km: '48000', show_mileage: 'on', asking_price: '865000', price_currency: 'EGP', show_price: 'on', public_description: 'Agency maintained' };
    const r = await S.op.post('/admin/vehicles', base);
    assert.equal(r.status, 303);
    S.v1 = locationId(r, '/admin/vehicles');
    const r2 = await S.op.post('/admin/vehicles', { ...base, make: 'Kia', model: 'Picanto', listing_status: 'unlisted', show_price: '', show_mileage: '' });
    S.v1b = locationId(r2, '/admin/vehicles');
    const r3 = await S.op.post('/admin/vehicles', { ...base, customer_id: S.c2, make: 'Hyundai', model: 'Elantra' });
    S.v2 = locationId(r3, '/admin/vehicles');
    assert.ok(S.v1 && S.v1b && S.v2);
    assert.equal((await q1('SELECT count(*)::int n FROM vehicles WHERE customer_id = $1', [S.c1])).n, 2);
  });

  it('edits vehicle information', async () => {
    const r = await S.op.post(`/admin/vehicles/${S.v1}`, { make: 'Toyota', model: 'Corolla', model_year: '2021', color: 'Pearl White', category: 'sedan', listing_status: 'listed', transmission: 'automatic', fuel_type: 'petrol', mileage_km: '49000', show_mileage: 'on', asking_price: '850000', price_currency: 'egp', show_price: 'on', public_description: 'Agency maintained' });
    assert.equal(r.status, 303);
    const v = await q1('SELECT color, mileage_km, asking_price, price_currency FROM vehicles WHERE id = $1', [S.v1]);
    assert.equal(v.color, 'Pearl White'); assert.equal(v.mileage_km, 49000); assert.equal(v.asking_price, '850000.00'); assert.equal(v.price_currency, 'EGP');
  });

  it('a vehicle can never be moved to another customer (DB-enforced)', async () => {
    await assert.rejects(db.query('UPDATE vehicles SET customer_id = $2 WHERE id = $1', [S.v1, S.c2]), /owner cannot be changed/);
  });

  it('accepts a photo, strips metadata, and requires approval', async () => {
    const sharp = require('sharp');
    const jpg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#FE764F' } })
      .withExif({ IFD0: { Copyright: 'secret-location' } }).jpeg().toBuffer();
    const r = await S.op.a.post(`/admin/vehicles/${S.v1}/photo`).field('_csrf', S.op.csrf).attach('photo', jpg, 'car.jpg');
    assert.equal(r.status, 303);
    const v = await q1('SELECT photo_key, photo_approved FROM vehicles WHERE id = $1', [S.v1]);
    assert.match(v.photo_key, /^[a-f0-9]{32}\.webp$/); assert.equal(v.photo_approved, false);
    const meta = await sharp(require('../src/services/vehicles').photoPath(v.photo_key)).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal((await S.op.post(`/admin/vehicles/${S.v1}/photo/approve`, { approved: 'true' })).status, 403);
    assert.equal((await S.ad.post(`/admin/vehicles/${S.v1}/photo/approve`, { approved: 'true' })).status, 303);
    const bad = await S.op.a.post(`/admin/vehicles/${S.v1b}/photo`).field('_csrf', S.op.csrf).attach('photo', Buffer.from('not an image'), 'x.jpg');
    assert.equal(bad.status, 400);
  });
});

// ---------------------------------------------------------------------------
describe('D/E. Batches & QR codes', () => {
  it('generates a batch with unique, well-formed identifiers in one transaction', async () => {
    const token = crypto.randomUUID();
    const r = await S.ad.post('/admin/batches', { name: 'Run 1', quantity: '200', notes: '', request_token: token });
    assert.equal(r.status, 303);
    S.b1 = locationId(r, '/admin/batches');
    const rows = (await db.query('SELECT public_code, serial_no, status FROM qr_codes WHERE batch_id = $1', [S.b1])).rows;
    assert.equal(rows.length, 200);
    assert.equal(new Set(rows.map((x) => x.public_code)).size, 200);
    assert.ok(rows.every((x) => /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/.test(x.public_code) && x.status === 'generated'));
    const b = await q1('SELECT batch_ref, quantity FROM qr_batches WHERE id = $1', [S.b1]);
    assert.match(b.batch_ref, /^B-\d{4}-0001$/);
    // Idempotent re-submission of the same form creates nothing new
    const again = await S.ad.post('/admin/batches', { name: 'Run 1', quantity: '200', notes: '', request_token: token });
    assert.equal(locationId(again, '/admin/batches'), S.b1);
    assert.equal((await q1('SELECT count(*)::int n FROM qr_codes')).n, 200);
  });

  it('rejects duplicate batch names and out-of-range quantities', async () => {
    assert.equal((await S.ad.post('/admin/batches', { name: 'run 1', quantity: '5', request_token: crypto.randomUUID() })).status, 409);
    assert.equal((await S.ad.post('/admin/batches', { name: 'Huge', quantity: '5001', request_token: crypto.randomUUID() })).status, 422);
  });

  it('the database refuses duplicate public codes', async () => {
    const one = await q1('SELECT public_code FROM qr_codes LIMIT 1');
    await assert.rejects(db.query('INSERT INTO qr_codes (public_code, batch_id) VALUES ($1, $2)', [one.public_code, S.b1]), /duplicate key/);
  });

  it('cannot assign codes from a batch that was not released', async () => {
    const serial = (await q1('SELECT serial_no FROM qr_codes WHERE batch_id = $1 ORDER BY serial_no LIMIT 1', [S.b1])).serial_no;
    const r = await S.op.post(`/admin/vehicles/${S.v1}/assign-qr`, { serial: 'LC-' + serial });
    assert.equal(r.status, 409);
  });

  it('releases the batch to stock', async () => {
    assert.equal((await S.op.post(`/admin/batches/${S.b1}/release`)).status, 403);
    assert.equal((await S.ad.post(`/admin/batches/${S.b1}/release`)).status, 303);
    assert.equal((await q1(`SELECT count(*)::int n FROM qr_codes WHERE batch_id = $1 AND status = 'available'`, [S.b1])).n, 200);
  });

  it('assigns a sticker by printed serial; prevents double assignment and reuse', async () => {
    const codes = (await db.query('SELECT id, serial_no, public_code FROM qr_codes WHERE batch_id = $1 ORDER BY serial_no LIMIT 4', [S.b1])).rows;
    S.qr1 = codes[0]; S.qr2 = codes[1]; S.qr3 = codes[2]; S.qr4 = codes[3];
    const r = await S.op.post(`/admin/vehicles/${S.v1}/assign-qr`, { serial: 'lc-' + String(S.qr1.serial_no).padStart(6, '0') });
    assert.equal(r.status, 303);
    const q = await q1('SELECT status, customer_id, vehicle_id FROM qr_codes WHERE id = $1', [S.qr1.id]);
    assert.equal(q.status, 'assigned'); assert.equal(q.customer_id, S.c1); assert.equal(q.vehicle_id, S.v1);
    // same vehicle can't get a second live sticker
    assert.equal((await S.op.post(`/admin/vehicles/${S.v1}/assign-qr`, { serial: String(S.qr2.serial_no) })).status, 409);
    // the same sticker can't go to another vehicle/customer
    assert.equal((await S.op.post(`/admin/vehicles/${S.v2}/assign-qr`, { serial: String(S.qr1.serial_no) })).status, 409);
    await assert.rejects(db.query('UPDATE qr_codes SET customer_id = $2 WHERE id = $1', [S.qr1.id, S.c2]), /never be reassigned/);
    await assert.rejects(db.query('DELETE FROM qr_codes WHERE id = $1', [S.qr1.id]), /never deleted/);
    assert.equal((await S.op.post(`/admin/vehicles/${S.v2}/assign-qr`, { serial: 'LC-99999999' })).status, 400);
  });

  it('only admins can activate / suspend / deactivate', async () => {
    assert.equal((await S.op.post(`/admin/qr/${S.qr1.id}/activate`)).status, 403);
    assert.equal((await S.ad.post(`/admin/qr/${S.qr1.id}/activate`)).status, 303);
    const q = await q1('SELECT status, activated_at, activated_by FROM qr_codes WHERE id = $1', [S.qr1.id]);
    assert.equal(q.status, 'active'); assert.ok(q.activated_at); assert.equal(q.activated_by, S.admin.id);
    assert.equal((await S.op.post(`/admin/qr/${S.qr1.id}/suspend`, { reason: 'test' })).status, 403);
  });

  it('suspend requires a reason; reactivate keeps the original activation date', async () => {
    assert.equal((await S.ad.post(`/admin/qr/${S.qr1.id}/suspend`, { reason: '' })).status, 422);
    const before = await q1('SELECT activated_at FROM qr_codes WHERE id = $1', [S.qr1.id]);
    assert.equal((await S.ad.post(`/admin/qr/${S.qr1.id}/suspend`, { reason: 'Owner request' })).status, 303);
    assert.equal((await q1('SELECT status FROM qr_codes WHERE id = $1', [S.qr1.id])).status, 'suspended');
    assert.equal((await S.ad.post(`/admin/qr/${S.qr1.id}/activate`)).status, 303);
    const after = await q1('SELECT status, activated_at FROM qr_codes WHERE id = $1', [S.qr1.id]);
    assert.equal(after.status, 'active'); assert.equal(after.activated_at.toISOString(), before.activated_at.toISOString());
    const hist = (await db.query('SELECT from_status, to_status FROM qr_status_history WHERE qr_code_id = $1 ORDER BY id', [S.qr1.id])).rows.map((h) => `${h.from_status}>${h.to_status}`);
    assert.deepEqual(hist, ['null>generated', 'generated>available', 'available>assigned', 'assigned>active', 'active>suspended', 'suspended>active']);
  });

  it('rejects invalid transitions, including DB-level guard', async () => {
    assert.equal((await S.ad.post(`/admin/qr/${S.qr2.id}/activate`)).status, 409); // available → active not allowed
    await assert.rejects(db.query(`UPDATE qr_codes SET status = 'available', customer_id = NULL, vehicle_id = NULL WHERE id = $1`, [S.qr1.id]), /reassigned|invalid QR status transition/);
  });

  it('deactivation is permanent and allows a replacement sticker on the same vehicle', async () => {
    assert.equal((await S.op.post(`/admin/vehicles/${S.v2}/assign-qr`, { serial: String(S.qr3.serial_no) })).status, 303);
    assert.equal((await S.ad.post(`/admin/qr/${S.qr3.id}/activate`)).status, 303);
    assert.equal((await S.ad.post(`/admin/qr/${S.qr3.id}/deactivate`, { reason: 'Sticker damaged' })).status, 303);
    assert.equal((await S.ad.post(`/admin/qr/${S.qr3.id}/activate`)).status, 409);
    assert.equal((await S.op.post(`/admin/vehicles/${S.v2}/assign-qr`, { serial: String(S.qr3.serial_no) })).status, 409);
    assert.equal((await S.op.post(`/admin/vehicles/${S.v2}/assign-qr`, { serial: String(S.qr4.serial_no) })).status, 303);
    assert.equal((await S.ad.post(`/admin/qr/${S.qr4.id}/activate`)).status, 303);
  });

  it('exports batch CSV and regenerates PDFs without creating identifiers', async () => {
    const before = await q1('SELECT count(*)::int n, max(serial_no) m FROM qr_codes');
    const csv = await S.ad.get(`/admin/batches/${S.b1}/export.csv`);
    assert.equal(csv.status, 200);
    assert.ok(csv.text.startsWith('﻿'));
    assert.equal(csv.text.trim().split('\r\n').length, 201);
    assert.ok(csv.text.includes('https://car.lamma.test/q/' + S.qr1.public_code));
    const layout = await q1(`SELECT id FROM sheet_layouts WHERE is_default`);
    const pdfs = {};
    for (const variant of ['proof', 'print', 'white', 'cut']) {
      const r = await S.ad.get(`/admin/batches/${S.b1}/pdf?layout=${layout.id}&variant=${variant}`).buffer(true).parse((res, cb) => { const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => cb(null, Buffer.concat(ch))); });
      assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'application/pdf');
      assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
      pdfs[variant] = r.body;
    }
    S.proofPdf = pdfs.proof;
    const afterCnt = await q1('SELECT count(*)::int n, max(serial_no) m FROM qr_codes');
    assert.deepEqual(afterCnt, before);
    assert.equal((await S.op.get(`/admin/batches/${S.b1}/pdf?variant=print`)).status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('E2. PDF dimensions and QR readability', () => {
  it('A4 sheet has the configured page size and 50 pages for 199 printable codes (2×2)', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
    const f = path.join(os.tmpdir(), 'lc-proof.pdf');
    fs.writeFileSync(f, S.proofPdf);
    const info = execFileSync('pdfinfo', [f]).toString();
    const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
    const [w, h] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info).slice(1).map(Number);
    assert.equal(pages, Math.ceil(199 / 4)); // 200 minus 1 deactivated
    assert.ok(Math.abs(w - 595.28) < 0.5 && Math.abs(h - 841.89) < 0.5, `page ${w}x${h}`);
  });

  it('the printed QR decodes to the exact public URL (rendered at 300 dpi)', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
    const { Jimp } = require('jimp');
    const jsQRmod = require('jsqr');
    const jsQR = typeof jsQRmod === 'function' ? jsQRmod : jsQRmod.default;
    const f = path.join(os.tmpdir(), 'lc-proof.pdf');
    const out = path.join(os.tmpdir(), 'lc-proof-p1');
    execFileSync('pdftoppm', ['-r', '300', '-f', '1', '-l', '1', '-singlefile', '-png', f, out]);
    const img = await Jimp.read(out + '.png');
    // Crop the first sticker cell (top-left in proof orientation)
    const mm = 300 / 25.4;
    const crop = img.clone().crop({ x: Math.round(9 * mm), y: Math.round(12 * mm), w: Math.round(90 * mm), h: Math.round(130 * mm) });
    const code = jsQR(new Uint8ClampedArray(crop.bitmap.data), crop.bitmap.width, crop.bitmap.height);
    assert.ok(code, 'QR not decoded');
    const first = await q1(`SELECT public_code FROM qr_codes WHERE batch_id = $1 AND status <> 'deactivated' ORDER BY serial_no LIMIT 1`, [S.b1]);
    assert.equal(code.data, 'https://car.lamma.test/q/' + first.public_code);
  });
});

// ---------------------------------------------------------------------------
describe('F/G. Privacy & public landing page', () => {
  it('active code with phone NOT recorded: page renders, number never appears anywhere', async () => {
    const r = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.equal(r.status, 200);
    assert.match(r.text, /Toyota/); assert.match(r.text, /Corolla/); assert.match(r.text, /2021/);
    for (const needle of ['1001234567', '+20 100', S.c1, S.v1, S.qr1.id, 'محمد علي', 'm@example.com', 'internal']) assert.ok(!r.text.includes(needle), `leaked: ${needle}`);
    assert.equal(r.headers['cache-control'], 'no-store, max-age=0');
    assert.match(r.headers['x-robots-tag'], /noindex/);
  });

  it('phone public: number appears as a tel: link; switching to private removes it immediately', async () => {
    const pub = await S.op.post(`/admin/customers/${S.c1}/privacy`, { phone_visibility: 'public', consent_method: 'in_person', evidence_note: 'Signed' });
    assert.equal(pub.status, 303);
    let r = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.match(r.text, /tel:\+201001234567/);
    const priv = await S.op.post(`/admin/customers/${S.c1}/privacy`, { phone_visibility: 'private', consent_method: 'phone_call' });
    assert.equal(priv.status, 303);
    r = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.ok(!r.text.includes('1001234567'));
    const consents = (await db.query('SELECT value, method FROM consent_records WHERE customer_id = $1 ORDER BY id', [S.c1])).rows;
    assert.deepEqual(consents.map((c) => c.value), ['public', 'private']);
    await assert.rejects(db.query('DELETE FROM consent_records WHERE customer_id = $1', [S.c1]), /append-only/);
  });

  it('privacy change without consent method is rejected', async () => {
    const r = await S.op.post(`/admin/customers/${S.c1}/privacy`, { phone_visibility: 'public' });
    assert.equal(r.status, 422);
    assert.equal((await q1('SELECT phone_visibility FROM customers WHERE id = $1', [S.c1])).phone_visibility, 'private');
  });

  it('the database read model never returns a private number', async () => {
    const r = await q1('SELECT * FROM public_qr_card($1)', [S.qr1.public_code]);
    assert.equal(r.public_phone, null);
    assert.ok(!Object.keys(r).some((k) => /id$|mobile|email|name/.test(k)), 'no identifiers in read model');
  });

  it('honours listing status and show_price / show_mileage flags', async () => {
    const r = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.match(r.text, /850,000\.00/); // listed + show_price
    await S.op.post(`/admin/vehicles/${S.v1}`, { make: 'Toyota', model: 'Corolla', model_year: '2021', color: 'Pearl White', category: 'sedan', listing_status: 'unlisted', mileage_km: '49000', asking_price: '850000', price_currency: 'EGP', show_price: 'on', show_mileage: 'on', public_description: 'Agency maintained' });
    const r2 = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.ok(!r2.text.includes('850,000')); assert.ok(!r2.text.includes('49,000')); assert.ok(!r2.text.includes('Agency maintained'));
  });

  it('approved photo is served only for an active code', async () => {
    const r = await request(getApp()).get(`/q/${S.qr1.public_code}/photo`);
    assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'image/webp');
  });

  it('invalid, unknown, inactive and suspended codes show a safe message', async () => {
    const inv = await request(getApp()).get('/q/not-a-code');
    assert.equal(inv.status, 404); assert.match(inv.text, /not recognised|غير معروف/);
    const unk = await request(getApp()).get('/q/ZZZZZZZZZZ');
    assert.equal(unk.status, 404);
    const avail = await request(getApp()).get('/q/' + S.qr2.public_code);
    assert.equal(avail.status, 410);
    await S.ad.post(`/admin/qr/${S.qr1.id}/suspend`, { reason: 'Privacy test' });
    const sus = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.equal(sus.status, 410);
    for (const needle of ['Toyota', 'Corolla', '1001234567', 'Pearl']) assert.ok(!sus.text.includes(needle), `leaked on suspended: ${needle}`);
    assert.equal((await request(getApp()).get(`/q/${S.qr1.public_code}/photo`)).status, 404);
    const deact = await request(getApp()).get('/q/' + S.qr3.public_code);
    assert.equal(deact.status, 410); assert.ok(!deact.text.includes('Hyundai'));
    // generated/available/suspended/deactivated responses are indistinguishable to visitors
    const norm = (t) => t.replace(/\/q\/[0-9A-Z]{10}/g, '/q/CODE').replace(/\s+/g, '');
    assert.equal(norm(avail.text), norm(sus.text));
    await S.ad.post(`/admin/qr/${S.qr1.id}/activate`);
  });

  it('a non-active customer hides contact details even if the code is active', async () => {
    await S.op.post(`/admin/customers/${S.c2}/privacy`, { phone_visibility: 'public', consent_method: 'in_person' });
    let r = await request(getApp()).get('/q/' + S.qr4.public_code);
    assert.match(r.text, /tel:\+201112223334/);
    await S.ad.post(`/admin/customers/${S.c2}/status`, { status: 'inactive' });
    r = await request(getApp()).get('/q/' + S.qr4.public_code);
    assert.ok(!r.text.includes('1112223334'));
    await S.ad.post(`/admin/customers/${S.c2}/status`, { status: 'active' });
  });

  it('renders Arabic (RTL, default) and English (LTR)', async () => {
    const ar = await request(getApp()).get('/q/' + S.qr1.public_code);
    assert.match(ar.text, /<html lang="ar" dir="rtl">/);
    const en = await request(getApp()).get('/q/' + S.qr1.public_code + '?lang=en');
    assert.match(en.text, /<html lang="en" dir="ltr">/);
    assert.match(en.text, /Contact details are private|Contact the owner/);
  });

  it('message relay: disabled by default, works only when enabled AND owner opted in', async () => {
    const page = await request.agent(getApp());
    let r = await page.get('/q/' + S.qr1.public_code);
    assert.ok(!r.text.includes('/contact"'));
    await S.sa.post('/admin/settings', { contact__requests_enabled: 'on', landing__show_category: 'on', landing__show_vehicle_photo: 'on', landing__show_extended_details: 'on', sales__default_currency: 'EGP', sales__default_amount: '', support__public_phone: '', support__public_email: '' });
    require('../src/services/settings').invalidate();
    r = await page.get('/q/' + S.qr1.public_code);
    assert.ok(!r.text.includes('/contact"'), 'owner has not opted in');
    await S.op.post(`/admin/customers/${S.c1}/privacy`, { phone_visibility: 'private', allow_contact_requests: 'on', consent_method: 'written_form' });
    r = await page.get('/q/' + S.qr1.public_code);
    assert.ok(r.text.includes(`/q/${S.qr1.public_code}/contact`));
    const csrf = /name="_csrf" value="([a-f0-9]+)"/.exec(r.text)[1];
    const bad = await page.post(`/q/${S.qr1.public_code}/contact`).type('form').send({ _csrf: csrf, visitor_name: 'A', visitor_phone: '12', message: '' });
    assert.equal(bad.status, 422);
    const ok = await page.post(`/q/${S.qr1.public_code}/contact`).type('form').send({ _csrf: csrf, visitor_name: 'Visitor', visitor_phone: '01223334445', message: 'Is it still for sale?' });
    assert.equal(ok.status, 303);
    const cr = await q1('SELECT * FROM contact_requests');
    assert.equal(cr.visitor_phone, '+201223334445'); assert.equal(cr.customer_id, S.c1);
    const noCsrf = await request(getApp()).post(`/q/${S.qr1.public_code}/contact`).type('form').send({ visitor_name: 'X Y', visitor_phone: '01223334445', message: 'hi there' });
    assert.equal(noCsrf.status, 403);
    const list = await S.op.get('/admin/contact-requests');
    assert.match(list.text, /Is it still for sale\?/);
  });
});

// ---------------------------------------------------------------------------
describe('H. Sales', () => {
  it('records a sale linked to customer, vehicle, sticker and (derived) batch', async () => {
    const token = crypto.randomUUID();
    const r = await S.op.post('/admin/sales', { customer_id: S.c1, vehicle_id: S.v1, qr_code_id: S.qr1.id, sale_date: '2026-11-01', amount: '350.50', currency: 'EGP', payment_status: 'paid', channel: 'direct', notes: 'first', request_token: token });
    assert.equal(r.status, 303);
    S.s1 = locationId(r, '/admin/sales');
    const s = await q1('SELECT * FROM sales WHERE id = $1', [S.s1]);
    assert.equal(s.batch_id, S.b1); assert.equal(s.responsible_user_id, S.operator.id); assert.equal(s.amount, '350.50');
    const dup = await S.op.post('/admin/sales', { customer_id: S.c1, vehicle_id: S.v1, qr_code_id: S.qr1.id, sale_date: '2026-11-01', amount: '350.50', currency: 'EGP', payment_status: 'paid', channel: 'direct', request_token: token });
    assert.equal(locationId(dup, '/admin/sales'), S.s1);
    assert.equal((await q1('SELECT count(*)::int n FROM sales')).n, 1);
  });

  it('rejects mismatched vehicle/customer and mismatched sticker', async () => {
    const base = { sale_date: '2026-11-02', amount: '100', currency: 'EGP', payment_status: 'pending', channel: 'direct' };
    assert.equal((await S.op.post('/admin/sales', { ...base, customer_id: S.c2, vehicle_id: S.v1, request_token: crypto.randomUUID() })).status, 400);
    assert.equal((await S.op.post('/admin/sales', { ...base, customer_id: S.c2, vehicle_id: S.v2, qr_code_id: S.qr1.id, request_token: crypto.randomUUID() })).status, 400);
    assert.equal((await S.op.post('/admin/sales', { ...base, customer_id: S.c2, vehicle_id: S.v2, amount: '-5', request_token: crypto.randomUUID() })).status, 422);
  });

  it('operators can only change payment status/notes on their own sales; admins can edit amounts', async () => {
    await S.ad.post('/admin/sales', { customer_id: S.c2, vehicle_id: S.v2, qr_code_id: S.qr4.id, sale_date: '2026-11-03', amount: '400', currency: 'EGP', payment_status: 'pending', channel: 'showroom', request_token: crypto.randomUUID() });
    const s2 = await q1(`SELECT id FROM sales WHERE amount = 400`);
    S.s2 = s2.id;
    assert.equal((await S.op.post(`/admin/sales/${S.s2}`, { payment_status: 'paid' })).status, 403); // not theirs
    const own = await S.op.post(`/admin/sales/${S.s1}`, { payment_status: 'refunded', notes: 'customer returned', amount: '1' });
    assert.equal(own.status, 303);
    const s1 = await q1('SELECT payment_status, amount, notes FROM sales WHERE id = $1', [S.s1]);
    assert.equal(s1.payment_status, 'refunded'); assert.equal(s1.amount, '350.50'); // amount ignored for operators
    const adm = await S.ad.post(`/admin/sales/${S.s1}`, { qr_code_id: S.qr1.id, sale_date: '2026-11-01', amount: '360', currency: 'EGP', payment_status: 'paid', channel: 'direct', notes: 'corrected' });
    assert.equal(adm.status, 303);
    assert.equal((await q1('SELECT amount FROM sales WHERE id = $1', [S.s1])).amount, '360.00');
  });

  it('revenue counts PAID sales only and dashboard figures match the database', async () => {
    await S.ad.post('/admin/sales', { customer_id: S.c1, vehicle_id: S.v1b, sale_date: '2026-11-04', amount: '999', currency: 'EGP', payment_status: 'cancelled', channel: 'event', request_token: crypto.randomUUID() });
    const sum = await require('../src/services/sales').summary();
    assert.equal(Number(sum.revenue.find((r) => r.currency === 'EGP').revenue), 360);
    assert.equal(sum.total_sales, 2); // cancelled excluded
    assert.equal(sum.paid_sales, 1); assert.equal(sum.pending_sales, 1);
    const d = await require('../src/services/stats').dashboard();
    const truth = await q1(`SELECT count(*) FILTER (WHERE status='active')::int a, count(*) FILTER (WHERE status='available')::int av FROM qr_codes`);
    assert.equal(d.qr.active, truth.a); assert.equal(d.qr.available, truth.av);
    assert.equal(d.customers, (await q1(`SELECT count(*)::int n FROM customers WHERE status <> 'archived'`)).n);
    assert.equal(d.vehicles, 3);
    const page = await S.ad.get('/admin');
    assert.match(page.text, /360\.00/);
  });

  it('filters sales by status and date, and exports CSV', async () => {
    const r = await S.ad.get('/admin/sales?status=paid&from=2026-11-01&to=2026-11-01');
    assert.match(r.text, /S-000001/); assert.doesNotMatch(r.text, /S-000002/);
    const csv = await S.ad.get('/admin/sales/export.csv?status=pending');
    assert.equal(csv.status, 200); assert.equal(csv.text.trim().split('\r\n').length, 2);
    assert.equal((await S.op.get('/admin/sales/export.csv')).status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('I. Security & reports', () => {
  it('sets security headers (CSP, frame-ancestors, nosniff)', async () => {
    const r = await request(getApp()).get('/');
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-powered-by'], undefined);
  });

  it('escapes user content (no stored XSS)', async () => {
    const r = await S.op.post('/admin/customers', { full_name: '<script>alert(1)</script>', mobile: '01099999999' });
    const id = locationId(r, '/admin/customers');
    const page = await S.op.get('/admin/customers/' + id);
    assert.ok(!page.text.includes('<script>alert(1)</script>'));
    assert.ok(page.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('SQL-like search input is treated as data', async () => {
    const r = await S.op.get("/admin/customers?q=" + encodeURIComponent("' OR 1=1; DROP TABLE customers; --"));
    assert.equal(r.status, 200);
    assert.ok((await q1('SELECT count(*)::int n FROM customers')).n > 0);
  });

  it('rate-limits public QR lookups for invalid codes', async () => {
    const agent = request(getApp());
    let last;
    for (let i = 0; i < 32; i++) last = await agent.get('/q/AAAAAAAA' + String(i).padStart(2, '0').replace(/[^0-9]/g, '0')).set('X-Forwarded-For', '203.0.113.9');
    assert.equal(last.status, 429);
  });

  it('activity log is append-only and records exports', async () => {
    await S.ad.get('/admin/reports/customers.csv');
    const n = await q1(`SELECT count(*)::int n FROM audit_logs WHERE action = 'export.report_csv'`);
    assert.ok(n.n >= 1);
    await assert.rejects(db.query('DELETE FROM audit_logs'), /append-only/);
    await assert.rejects(db.query(`UPDATE audit_logs SET action = 'x'`), /append-only/);
  });

  it('customer export masks mobiles for Admin, full for Super Admin', async () => {
    const ad = await S.ad.get('/admin/reports/customers.csv');
    assert.ok(!ad.text.includes('+201001234567')); assert.match(ad.text, /\+201•••••567/);
    const sa = await S.sa.get('/admin/reports/customers.csv');
    assert.ok(sa.text.includes('+201001234567'));
  });

  it('every report renders as CSV and PDF', async () => {
    for (const k of ['customers', 'vehicles', 'qr_codes', 'batches', 'sales', 'revenue', 'activation']) {
      const c = await S.sa.get(`/admin/reports/${k}.csv`);
      assert.equal(c.status, 200, k);
      const p = await S.sa.get(`/admin/reports/${k}.pdf?lang=ar`).buffer(true).parse((res, cb) => { const ch = []; res.on('data', (x) => ch.push(x)); res.on('end', () => cb(null, Buffer.concat(ch))); });
      assert.equal(p.status, 200, k); assert.equal(p.body.subarray(0, 5).toString(), '%PDF-');
    }
  });

  it('CSV export neutralises spreadsheet formulas', async () => {
    const { cell } = require('../src/lib/csv');
    assert.equal(cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(cell('-12.5'), '-12.5');
  });

  it('every admin page renders for every role without server errors', async () => {
    const pages = ['/admin', '/admin/customers', '/admin/customers/new', `/admin/customers/${S.c1}`, `/admin/customers/${S.c1}/edit`, '/admin/vehicles', `/admin/vehicles/${S.v1}`, `/admin/vehicles/${S.v1}/edit`, `/admin/vehicles/new?customer=${S.c1}`,
      '/admin/qr', `/admin/qr/${S.qr1.id}`, '/admin/batches', `/admin/batches/${S.b1}`, '/admin/sales', '/admin/sales/new', `/admin/sales/${S.s1}`, `/admin/sales/${S.s1}/edit`, '/admin/contact-requests', '/admin/reports', '/admin/users', '/admin/users/new', '/admin/settings', '/admin/activity', '/admin/account'];
    for (const [agent, label] of [[S.sa, 'super'], [S.ad, 'admin'], [S.op, 'operator']]) {
      for (const lang of ['ar', 'en']) {
        await agent.get('/admin/lang/' + lang);
        for (const p of pages) {
          const r = await agent.get(p);
          assert.ok([200, 403].includes(r.status), `${label} ${lang} ${p} -> ${r.status}`);
          assert.ok(!/\b(?:nav|errors|fields|common)\.[a-z_]+\b(?=<)/.test(r.text), `untranslated key on ${p}`);
        }
      }
    }
  });
});
