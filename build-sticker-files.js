#!/usr/bin/env node
'use strict';
// Builds the master sticker design files in ./sticker from the same geometry used for batch PDFs.
// Output (reading orientation = as seen from OUTSIDE the car):
//   lamma-car-sticker-90x130-proof.pdf       RGB proof with crop marks (not for production)
//   lamma-car-sticker-90x130-production.pdf  p1 CMYK mirrored · p2 White underlay (spot) · p3 CutContour (spot)
//   lamma-car-sticker-90x130-outside.png     600 dpi raster, reading orientation
//   lamma-car-sticker-90x130-outside.svg     editable vector (text as outlines; logo embedded raster — see docs)
//   lamma-car-sticker-90x130-mirrored.svg    editable vector, mirrored for reverse printing
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const T = require('../src/pdf/text');
const S = require('../src/pdf/sticker');

const OUT = path.join(__dirname, '..', 'sticker');
fs.mkdirSync(OUT, { recursive: true });
const base = (process.env.QR_BASE_URL && process.env.QR_BASE_URL.startsWith('https://')) ? process.env.QR_BASE_URL.replace(/\/+$/, '') : 'https://lamma-car.example/q';
const SAMPLE_URL = `${base}/TESTCARD01`;
const BLEED = 2, MARGIN = 8;

function pdf(file, variants, { marks }) {
  return new Promise((resolve) => {
    const MM = S.MM;
    const sc = S.scene({ url: SAMPLE_URL, serialLabel: 'SAMPLE', bleed: BLEED });
    const doc = new PDFDocument({ size: [(sc.W + 2 * MARGIN) * MM, (sc.H + 2 * MARGIN) * MM], margin: 0, autoFirstPage: false,
      info: { Title: 'Lamma Car rear-window sticker 90 × 130 mm', Author: 'Lamma Car', Subject: variants.join(', ') } });
    const stream = fs.createWriteStream(path.join(OUT, file));
    doc.pipe(stream);
    for (const v of variants) {
      doc.addPage();
      S.drawPdf(doc, MARGIN * MM, MARGIN * MM, sc, v);
      if (marks) S.cropMarks(doc, MARGIN * MM, MARGIN * MM, sc, MARGIN);
      const label = { proof: 'PROOF — reading orientation (outside view). Not for production.', print: 'LAYER 1 · CMYK · MIRRORED · print first', white: `LAYER 2 · ${S.SPOT_WHITE} (spot) · MIRRORED · print after CMYK, 2 passes`, cut: `LAYER 3 · ${S.SPOT_CUT} (spot) · MIRRORED · trim 90 × 130 mm, R6` }[v];
      T.draw(doc, label + `  ·  QR ${sc.qr.version >= 0 ? 'v' + sc.qr.version : ''} ECC-H, module ${sc.qr.module_mm.toFixed(2)} mm`, MARGIN * MM, (sc.H + MARGIN + 3.2) * MM, { font: 'manrope-regular', size: 5.5, color: v === 'proof' ? '#666666' : [0, 0, 0, 60] });
    }
    doc.end();
    stream.on('finish', () => resolve(sc));
  });
}

(async () => {
  await T.init();
  const sc = await pdf('lamma-car-sticker-90x130-proof.pdf', ['proof'], { marks: true });
  await pdf('lamma-car-sticker-90x130-production.pdf', ['print', 'white', 'cut'], { marks: false });
  const svg = S.toSvg(sc, { variant: 'proof' });
  fs.writeFileSync(path.join(OUT, 'lamma-car-sticker-90x130-outside.svg'), svg);
  fs.writeFileSync(path.join(OUT, 'lamma-car-sticker-90x130-mirrored.svg'), S.toSvg(sc, { variant: 'print' }));
  const svgNoCut = S.toSvg(sc, { variant: 'proof', withCutLine: false });
  // Rasterise at 600 dpi (pixel size set explicitly; sRGB, with 2 mm bleed included)
  const pxW = Math.round(((sc.W + 2 * BLEED) / 25.4) * 600), pxH = Math.round(((sc.H + 2 * BLEED) / 25.4) * 600);
  const svgPx = svgNoCut.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${pxW}" height="${pxH}"`);
  await sharp(Buffer.from(svgPx), { limitInputPixels: false }).withMetadata({ density: 600 }).png().toFile(path.join(OUT, 'lamma-car-sticker-90x130-outside.png'));
  const meta = await sharp(path.join(OUT, 'lamma-car-sticker-90x130-outside.png')).metadata();
  console.log(`QR version ${sc.qr.version}, ${sc.qr.modules} modules, module ${sc.qr.module_mm.toFixed(3)} mm, symbol ${sc.qr.symbol_mm.toFixed(1)} mm`);
  console.log(`PNG ${meta.width}×${meta.height}px @600dpi; sample URL ${SAMPLE_URL}`);
  console.log('Wrote', fs.readdirSync(OUT).join(', '));
})();
