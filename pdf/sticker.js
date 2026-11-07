'use strict';
// Lamma Car rear-windshield sticker: single source of geometry, rendered to PDF (PDFKit) and SVG.
// All geometry in millimetres, origin = top-left of the TRIM box, as seen from OUTSIDE the car.
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const T = require('./text');

const MM = 72 / 25.4; // PDF points per mm

const STICKER = {
  width_mm: 90,
  height_mm: 130,
  corner_radius_mm: 6,
  safe_margin_mm: 4,
  qr_panel: { x: 9, y: 33, size: 72, radius: 3 }, // includes the 4-module quiet zone
  qr_quiet_modules: 4,
  qr_ecc: 'H', // 30% recovery — tolerates defroster lines crossing the symbol
  band_y: 117,
};

// Brand colours. CMYK values are STARTING conversions for proofing; confirm against the printer's
// ICC profile and a physical proof (see STICKER_PRINT_SPECIFICATIONS.md).
const COLORS = {
  rgb: { navy: '#1F222C', coral: '#FE764F', lavender: '#9274D2', cream: '#FDF6EC', white: '#FFFFFF', qr: '#111111' },
  cmyk: { navy: [72, 62, 45, 72], coral: [0, 66, 72, 0], lavender: [45, 55, 0, 0], cream: [0, 2, 6, 0], white: [0, 0, 0, 0], qr: [0, 0, 0, 100] },
};
const SPOT_WHITE = process.env.STICKER_WHITE_SPOT_NAME || 'White';
const SPOT_CUT = process.env.STICKER_CUT_SPOT_NAME || 'CutContour';
const LOGO = path.join(__dirname, '..', '..', 'public', 'brand', 'lamma-car-wordmark.png');
const LOGO_RATIO = 431 / 1506; // height / width of the wordmark asset

function qrMatrix(text) {
  const q = QRCode.create(text, { errorCorrectionLevel: STICKER.qr_ecc });
  const n = q.modules.size;
  const rows = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) row.push(q.modules.get(y, x) ? 1 : 0);
    rows.push(row);
  }
  return { n, rows, version: q.version };
}

/** Horizontal runs of dark modules → fewer, cleaner rectangles. */
function qrRuns(m) {
  const out = [];
  for (let y = 0; y < m.n; y++) {
    let x = 0;
    while (x < m.n) {
      if (m.rows[y][x]) { const s = x; while (x < m.n && m.rows[y][x]) x++; out.push([s, y, x - s]); } else x++;
    }
  }
  return out;
}

/** Scene graph for one sticker. */
function scene({ url, serialLabel, bleed = 2 }) {
  const S = STICKER;
  const W = S.width_mm, H = S.height_mm;
  const p = S.qr_panel;
  const m = qrMatrix(url);
  const total = m.n + 2 * S.qr_quiet_modules;
  const mod = p.size / total;
  const qx = p.x + S.qr_quiet_modules * mod, qy = p.y + S.qr_quiet_modules * mod;
  const logoW = 70;
  const items = [
    { t: 'rect', x: -bleed, y: -bleed, w: W + 2 * bleed, h: H + 2 * bleed, fill: 'cream' },
    { t: 'rect', x: -bleed, y: S.band_y, w: W + 2 * bleed, h: H - S.band_y + bleed, fill: 'navy' },
    { t: 'image', x: (W - logoW) / 2, y: 8, w: logoW, h: logoW * LOGO_RATIO },
    // Coral corner brackets frame the scan area (outside the quiet zone).
    ...brackets(p.x - 2, p.y - 2, p.size + 4, 9, 1.3),
    { t: 'rect', x: p.x, y: p.y, w: p.size, h: p.size, r: p.radius, fill: 'white' },
    { t: 'qr', x: qx, y: qy, mod, runs: qrRuns(m) },
    { t: 'rect', x: 17, y: 107.6, w: 56, h: 7.4, r: 3.7, fill: 'coral' },
    { t: 'text', x: W / 2, y: 107.6 + 7.4 / 2, text: 'امسح الكود  ·  SCAN ME', font: 'manrope-extrabold', size: 9.5, fill: 'white', align: 'center' },
    { t: 'text', x: 6, y: S.band_y + (H - S.band_y) / 2 - 0.6, text: 'Find it. Sell it. Easy.', font: 'manrope-extrabold', size: 9, fill: 'cream', align: 'left' },
    { t: 'text', x: W - 6, y: S.band_y + (H - S.band_y) / 2 - 0.6, text: serialLabel, font: 'manrope-bold', size: 7.5, fill: 'coral', align: 'right' },
  ];
  return { W, H, bleed, items, qr: { version: m.version, modules: m.n, module_mm: mod, symbol_mm: m.n * mod } };
}

function brackets(x, y, size, len, th) {
  const r = [];
  const c = (bx, by, dx, dy) => {
    r.push({ t: 'rect', x: dx > 0 ? bx : bx - len, y: dy > 0 ? by : by - th, w: len, h: th, fill: 'coral', r: th / 2 });
    r.push({ t: 'rect', x: dx > 0 ? bx : bx - th, y: dy > 0 ? by : by - len, w: th, h: len, fill: 'coral', r: th / 2 });
  };
  c(x, y, 1, 1); c(x + size, y, -1, 1); c(x, y + size, 1, -1); c(x + size, y + size, -1, -1);
  return r;
}

// ---------------------------------------------------------------------------
// PDF rendering
// variant: 'proof' (RGB, reading orientation), 'print' (CMYK, mirrored for second-surface printing),
//          'white' (spot white underlay, mirrored), 'cut' (CutContour spot line, mirrored)
// ---------------------------------------------------------------------------
function ensureSpots(doc) {
  if (!doc.spotColors[SPOT_WHITE]) doc.addSpotColor(SPOT_WHITE, 0, 0, 0, 25);
  if (!doc.spotColors[SPOT_CUT]) doc.addSpotColor(SPOT_CUT, 0, 100, 0, 0);
  // PDFKit resolves CSS colour names (e.g. "white") before spot colours; check spot names first.
  if (!doc.__spotFirst) {
    const orig = doc._normalizeColor.bind(doc);
    doc._normalizeColor = (c) => (typeof c === 'string' && doc.spotColors[c] ? doc.spotColors[c] : orig(c));
    doc.__spotFirst = true;
  }
}

function roundedRectPath(doc, x, y, w, h, r) {
  if (r) doc.roundedRect(x, y, w, h, r); else doc.rect(x, y, w, h);
}

function drawPdf(doc, originXpt, originYpt, sc, variant) {
  const mirrored = variant !== 'proof';
  const pal = variant === 'proof' ? COLORS.rgb : COLORS.cmyk;
  const W = sc.W * MM;
  doc.save();
  if (mirrored) { doc.translate(originXpt + W, originYpt); doc.scale(-1, 1); } else doc.translate(originXpt, originYpt);
  if (variant === 'white') {
    ensureSpots(doc);
    doc.rect(-sc.bleed * MM, -sc.bleed * MM, (sc.W + 2 * sc.bleed) * MM, (sc.H + 2 * sc.bleed) * MM).fill(SPOT_WHITE);
  } else if (variant === 'cut') {
    ensureSpots(doc);
    doc.lineWidth(0.25);
    doc.roundedRect(0, 0, sc.W * MM, sc.H * MM, STICKER.corner_radius_mm * MM).stroke(SPOT_CUT);
  } else {
    for (const it of sc.items) {
      if (it.t === 'rect') { roundedRectPath(doc, it.x * MM, it.y * MM, it.w * MM, it.h * MM, (it.r || 0) * MM); doc.fill(pal[it.fill]); }
      else if (it.t === 'image') doc.image(LOGO, it.x * MM, it.y * MM, { width: it.w * MM });
      else if (it.t === 'qr') {
        for (const [x, y, len] of it.runs) doc.rect((it.x + x * it.mod) * MM, (it.y + y * it.mod) * MM, len * it.mod * MM + 0.01, it.mod * MM + 0.01);
        doc.fill(pal.qr);
      } else if (it.t === 'text') {
        const w = T.measure(it.text, it.font, it.size);
        let x = it.x * MM;
        if (it.align === 'center') x -= w / 2;
        if (it.align === 'right') x -= w;
        T.draw(doc, it.text, x, it.y * MM - it.size * 0.62, { font: it.font, size: it.size, color: pal[it.fill] });
      }
    }
  }
  doc.restore();
}

function cropMarks(doc, xpt, ypt, sc, room) {
  const len = Math.min(4, room - sc.bleed - 0.8);
  if (len < 1) return;
  const off = (sc.bleed + 0.8) * MM;
  const L = len * MM;
  const W = sc.W * MM, H = sc.H * MM;
  doc.save().lineWidth(0.25).strokeColor([0, 0, 0, 100]);
  for (const [cx, cy, sx, sy] of [[0, 0, -1, -1], [W, 0, 1, -1], [0, H, -1, 1], [W, H, 1, 1]]) {
    doc.moveTo(xpt + cx + sx * off, ypt + cy).lineTo(xpt + cx + sx * (off + L), ypt + cy).stroke();
    doc.moveTo(xpt + cx, ypt + cy + sy * off).lineTo(xpt + cx, ypt + cy + sy * (off + L)).stroke();
  }
  doc.restore();
}

// ---------------------------------------------------------------------------
// SVG rendering (editable vector master; text converted to outlines so it prints without fonts)
// ---------------------------------------------------------------------------
function toSvg(sc, { variant = 'proof', withCutLine = true } = {}) {
  const pal = COLORS.rgb;
  const b = sc.bleed;
  const logoB64 = fs.readFileSync(LOGO).toString('base64');
  const parts = [];
  const mirror = variant === 'print' ? ` transform="translate(${sc.W} 0) scale(-1 1)"` : '';
  parts.push(`<g id="artwork"${mirror}>`);
  for (const it of sc.items) {
    if (it.t === 'rect') parts.push(`<rect x="${it.x.toFixed(3)}" y="${it.y.toFixed(3)}" width="${it.w.toFixed(3)}" height="${it.h.toFixed(3)}"${it.r ? ` rx="${it.r}"` : ''} fill="${pal[it.fill]}"/>`);
    else if (it.t === 'image') parts.push(`<image id="lamma-car-logo" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h.toFixed(3)}" href="data:image/png;base64,${logoB64}"/>`);
    else if (it.t === 'qr') {
      const d = it.runs.map(([x, y, len]) => `M${(it.x + x * it.mod).toFixed(4)} ${(it.y + y * it.mod).toFixed(4)}h${(len * it.mod).toFixed(4)}v${it.mod.toFixed(4)}h${(-len * it.mod).toFixed(4)}z`).join('');
      parts.push(`<path id="qr-code" fill="${pal.qr}" d="${d}"/>`);
    } else if (it.t === 'text') {
      // y in scene is the visual centre line; convert to a baseline (~0.35 × size in mm from centre)
      const sizeMm = it.size / MM;
      const base = it.y + sizeMm * 0.36;
      const { svg } = T.toSvgPaths(it.text, it.x, base, { font: it.font, size: sizeMm, align: it.align });
      parts.push(`<g fill="${pal[it.fill]}" aria-label="${it.text.replace(/"/g, '')}">${svg}</g>`);
    }
  }
  parts.push('</g>');
  if (withCutLine) parts.push(`<rect id="CutContour" x="0" y="0" width="${sc.W}" height="${sc.H}" rx="${STICKER.corner_radius_mm}" fill="none" stroke="#E6007E" stroke-width="0.15"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sc.W + 2 * b}mm" height="${sc.H + 2 * b}mm" viewBox="${-b} ${-b} ${sc.W + 2 * b} ${sc.H + 2 * b}">
<title>Lamma Car rear-window sticker ${sc.W}×${sc.H} mm (${variant === 'print' ? 'MIRRORED for reverse printing' : 'as seen from outside'})</title>
${parts.join('\n')}
</svg>`;
}

module.exports = { STICKER, COLORS, MM, scene, drawPdf, cropMarks, toSvg, qrMatrix, SPOT_WHITE, SPOT_CUT };
