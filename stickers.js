#!/usr/bin/env node
'use strict';
// Generates sticker print files into _stickers/ (NOT published on the website).
//   npm run stickers                  → every active and hidden record
//   npm run stickers -- --code 7KQ2M9XH4D,ABCD123456
// The files contain ONLY the QR (page address) and the code — never a name or phone number.
// Per record (folder _stickers/<CODE>/):
//   <CODE>-1-proof.pdf         check this: how the sticker looks from OUTSIDE the car
//   <CODE>-2-print-cmyk.pdf    printer layer 1 (mirrored)
//   <CODE>-3-print-white.pdf   printer layer 2, white ink (mirrored)
//   <CODE>-4-cut.pdf           printer layer 3, cut line (mirrored)
//   <CODE>-qr.svg / -qr.png    the bare QR code (for checks or other uses)
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sheet = require('./pdf/sheet');
const S = require('./pdf/sticker');
const { validate } = require('./validate');
const { resolveBase, pageUrl } = require('./lib/config');
const { displayCode } = require('./lib/codes');
const { ROOT } = require('./lib/data');

const SINGLE = { columns: 1, rows: 1, page_width_mm: 98, page_height_mm: 138, margin_left_mm: 4, margin_top_mm: 4, gap_x_mm: 0, gap_y_mm: 0, bleed_mm: 2, crop_marks: true };
const A4 = { columns: 2, rows: 2, page_width_mm: 210, page_height_mm: 297, margin_left_mm: 9, margin_top_mm: 12, gap_x_mm: 12, gap_y_mm: 12, bleed_mm: 2, crop_marks: true };
const render = (file, opts) => sheet.render(fs.createWriteStream(file), opts);

async function stickers({ root = ROOT, out = path.join(ROOT, '_stickers'), codes = null, env = process.env, quiet = false } = {}) {
  const r = validate(root, { quiet: true });
  if (r.errors.length) { const e = new Error('Fix the records first (run: npm run validate).'); e.errors = r.errors; throw e; }
  const base = resolveBase(r.site, env);
  let list = r.records.filter((v) => v.status !== 'retired');
  if (codes && codes.length) {
    const missing = codes.filter((c) => !r.records.some((v) => v.code === c));
    if (missing.length) throw new Error(`No record file for: ${missing.join(', ')}`);
    const retired = codes.filter((c) => r.records.some((v) => v.code === c && v.status === 'retired'));
    if (retired.length) throw new Error(`These records are retired; no sticker is made for them: ${retired.join(', ')}`);
    list = r.records.filter((v) => codes.includes(v.code));
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const items = [];
  for (const v of list) {
    const dir = path.join(out, v.code);
    fs.mkdirSync(dir, { recursive: true });
    const url = pageUrl(base.url, v.code);
    const item = [{ url, label: displayCode(v.code) }];
    items.push(item[0]);
    const title = `Lamma Car sticker ${v.code}`; // no personal data in PDF metadata
    await render(path.join(dir, `${v.code}-1-proof.pdf`), { title, batchRef: v.code, codes: item, layout: SINGLE, variant: 'proof' });
    await render(path.join(dir, `${v.code}-2-print-cmyk.pdf`), { title, batchRef: v.code, codes: item, layout: SINGLE, variant: 'print' });
    await render(path.join(dir, `${v.code}-3-print-white.pdf`), { title, batchRef: v.code, codes: item, layout: SINGLE, variant: 'white' });
    await render(path.join(dir, `${v.code}-4-cut.pdf`), { title, batchRef: v.code, codes: item, layout: SINGLE, variant: 'cut' });
    const qrOpts = { errorCorrectionLevel: S.STICKER.qr_ecc, margin: 4 };
    fs.writeFileSync(path.join(dir, `${v.code}-qr.svg`), await QRCode.toString(url, { ...qrOpts, type: 'svg' }));
    await QRCode.toFile(path.join(dir, `${v.code}-qr.png`), url, { ...qrOpts, width: 1200 });
  }
  if (items.length > 1) {
    for (const [variant, n] of [['proof', '1-proof'], ['print', '2-print-cmyk'], ['white', '3-print-white'], ['cut', '4-cut']]) {
      await render(path.join(out, `ALL-A4-sheets-${n}.pdf`), { title: 'Lamma Car stickers — A4 sheets', batchRef: `${items.length} stickers`, codes: items, layout: A4, variant });
    }
  }
  fs.writeFileSync(path.join(out, 'READ-ME-FIRST.txt'), [
    'Lamma Car sticker print files',
    `QR codes point to: ${base.url}/q/<CODE>`,
    '',
    'Each folder is one record (folder name = its code). These files contain no name or phone number.',
    '  -1-proof.pdf       Check this one: the sticker as seen from OUTSIDE the car. Do not print it for production.',
    '  -2-print-cmyk.pdf  Send to the printer: colour layer (mirrored, printed on the back of clear film).',
    '  -3-print-white.pdf Send to the printer: white ink layer (spot colour "' + S.SPOT_WHITE + '"), printed after colour, 2 passes.',
    '  -4-cut.pdf         Send to the printer: cut line (spot colour "' + S.SPOT_CUT + '"), 90 x 130 mm, rounded corners 6 mm.',
    '  -qr.svg / -qr.png  The QR code alone.',
    '',
    items.length > 1 ? 'ALL-A4-sheets-*.pdf contain every sticker above, 4 per A4 page, in the same order (same 4 file types).' : '',
    'Full specification: docs/STICKER_PRINT_SPECIFICATIONS.md in the repository.',
  ].join('\n'));
  if (!quiet) console.log(`🖨  Sticker files for ${list.length} record(s) written to ${out}`);
  return { base, count: list.length, out };
}

if (require.main === module) {
  const i = process.argv.indexOf('--code');
  const raw = i > -1 ? process.argv[i + 1] : (process.env.STICKER_CODES || '');
  const codes = raw.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  stickers({ codes }).catch((e) => { console.error(e.message); (e.errors || []).forEach((x) => console.error(' - ' + x)); process.exit(1); });
}
module.exports = { stickers };
