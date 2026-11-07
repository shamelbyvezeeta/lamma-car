'use strict';
// No-database checks: translation parity, sticker geometry, and that the MIRRORED production file
// decodes correctly once flipped (i.e. as seen from outside through the glass).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused/unused';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.QR_BASE_URL = process.env.QR_BASE_URL || 'https://car.lamma.test/q';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

describe('Translations', () => {
  it('Arabic and English dictionaries have identical keys and no empty strings', () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, v]]));
    const ar = new Map(flat(require('../src/i18n/ar'))); const en = new Map(flat(require('../src/i18n/en')));
    assert.deepEqual([...ar.keys()].sort(), [...en.keys()].sort());
    for (const [k, v] of [...ar, ...en]) assert.ok(typeof v === 'string' && v.trim(), `empty: ${k}`);
  });
  it('every static t(\'…\') key used in templates and code exists', () => {
    const { lookup, DICTS } = require('../src/i18n');
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
    walk(path.join(__dirname, '..', 'views')); walk(path.join(__dirname, '..', 'src'));
    const missing = new Set();
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-z_]+(?:\.[a-z_]+)+)'/g)) if (typeof lookup(DICTS.en, m[1]) !== 'string') missing.add(m[1]);
      for (const m of src.matchAll(/'((?:errors|validation|flash)\.[a-z_]+)'/g)) if (typeof lookup(DICTS.en, m[1]) !== 'string') missing.add(m[1]);
    }
    assert.deepEqual([...missing], []);
  });
});

describe('Sticker artwork', () => {
  it('keeps QR, logo and text inside the 4 mm safe margin and the QR quiet zone intact', () => {
    const S = require('../src/pdf/sticker');
    const sc = S.scene({ url: 'https://car.lamma.test/q/7KQ2M9XH4D', serialLabel: 'LC-000001', bleed: 2 });
    const p = S.STICKER.qr_panel;
    assert.ok(p.x >= 4 && p.y >= 4 && p.x + p.size <= 86 && p.y + p.size <= 126);
    assert.equal(sc.qr.version, 4);
    assert.ok(sc.qr.module_mm >= 1.7, `module ${sc.qr.module_mm}`);
    const qr = sc.items.find((i) => i.t === 'qr');
    assert.ok(Math.abs(qr.x - p.x - 4 * qr.mod) < 1e-9, 'quiet zone = 4 modules');
  });

  it('the mirrored CMYK production page decodes to the right URL when viewed from outside (flipped)', async () => {
    const T = require('../src/pdf/text'); await T.init();
    const B = require('../src/pdf/batchSheet');
    const f = path.join(os.tmpdir(), 'lc-mirror.pdf');
    const layout = { columns: 1, rows: 1, page_width_mm: 98, page_height_mm: 138, margin_left_mm: 4, margin_top_mm: 4, gap_x_mm: 0, gap_y_mm: 0, bleed_mm: 2, crop_marks: true };
    await B.render(fs.createWriteStream(f), { title: 't', batchRef: 'B-TEST', codes: [{ public_code: '7KQ2M9XH4D', serial_no: 42 }], layout, variant: 'print' });
    const out = path.join(os.tmpdir(), 'lc-mirror');
    execFileSync('pdftoppm', ['-r', '200', '-singlefile', '-png', f, out]);
    const { Jimp } = require('jimp');
    const jsQRmod = require('jsqr'); const jsQR = typeof jsQRmod === 'function' ? jsQRmod : jsQRmod.default;
    const img = await Jimp.read(out + '.png');
    // Flipped horizontally = what a visitor sees through the glass from outside.
    img.flip({ horizontal: true, vertical: false });
    const seen = jsQR(new Uint8ClampedArray(img.bitmap.data), img.bitmap.width, img.bitmap.height);
    assert.ok(seen, 'not decoded after flip');
    assert.equal(seen.data, 'https://car.lamma.test/q/7KQ2M9XH4D');
  });
});
