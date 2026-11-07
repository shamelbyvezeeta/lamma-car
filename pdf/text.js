'use strict';
// Bidi-aware, correctly shaped text for PDFKit.
// PDFKit cannot shape/reorder Arabic, so Arabic (and mixed) strings are shaped with HarfBuzz
// (WASM) and drawn as vector outlines. Pure Latin strings use PDFKit's native text so they stay
// selectable/searchable.
const fs = require('fs');
const path = require('path');
const bidiFactory = require('bidi-js');

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_FILES = {
  'manrope-regular': 'Manrope_400Regular.ttf',
  'manrope-bold': 'Manrope_700Bold.ttf',
  'manrope-extrabold': 'Manrope_800ExtraBold.ttf',
  'alexandria-regular': 'Alexandria_400Regular.ttf',
  'alexandria-bold': 'Alexandria_700Bold.ttf',
};
const ARABIC_FOR = {
  'manrope-regular': 'alexandria-regular',
  'manrope-bold': 'alexandria-bold',
  'manrope-extrabold': 'alexandria-bold',
  'alexandria-regular': 'alexandria-regular',
  'alexandria-bold': 'alexandria-bold',
};
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

let hb = null;
const fonts = {};
const glyphCache = new Map();
const bidi = bidiFactory();

async function init() {
  if (hb) return;
  hb = await import('harfbuzzjs');
  for (const [key, file] of Object.entries(FONT_FILES)) {
    const data = fs.readFileSync(path.join(FONT_DIR, file));
    const blob = new hb.Blob(new Uint8Array(data));
    const face = new hb.Face(blob, 0);
    const font = new hb.Font(face);
    fonts[key] = { face, font, upem: face.upem, file: path.join(FONT_DIR, file) };
  }
}

function hasArabic(s) { return ARABIC_RE.test(String(s || '')); }

function shapeRun(text, fontKey, rtl) {
  const f = fonts[fontKey];
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  if (rtl !== undefined) buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
  hb.shape(f.font, buf);
  const out = buf.getGlyphInfosAndPositions().map((g) => ({
    gid: g.codepoint, ax: g.xAdvance || 0, dx: g.xOffset || 0, dy: g.yOffset || 0,
  }));
  if (buf.destroy) buf.destroy();
  return { fontKey, glyphs: out, upem: f.upem };
}

function glyphPath(fontKey, gid) {
  const k = fontKey + ':' + gid;
  if (!glyphCache.has(k)) glyphCache.set(k, fonts[fontKey].font.glyphToPath(gid));
  return glyphCache.get(k);
}

// Split into bidi runs (logical order), shape each, then reorder runs visually (UAX#9 L2).
function layout(text, fontKey) {
  if (!hb) throw new Error('pdf text engine not initialised; call init() first');
  const str = String(text ?? '');
  if (!str) return [];
  const { levels, paragraphs } = bidi.getEmbeddingLevels(str, hasArabic(str) ? 'rtl' : 'ltr');
  void paragraphs;
  const runs = [];
  let start = 0;
  for (let i = 1; i <= str.length; i++) {
    if (i === str.length || levels[i] !== levels[start]) {
      runs.push({ text: str.slice(start, i), level: levels[start] });
      start = i;
    }
  }
  const maxLevel = Math.max(...runs.map((r) => r.level));
  const minOdd = Math.min(...runs.map((r) => r.level).filter((l) => l % 2 === 1).concat([maxLevel + 1]));
  for (let lvl = maxLevel; lvl >= minOdd && lvl > 0; lvl--) {
    for (let i = 0; i < runs.length; ) {
      if (runs[i].level >= lvl) {
        let j = i;
        while (j < runs.length && runs[j].level >= lvl) j++;
        const seg = runs.slice(i, j).reverse();
        runs.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  return runs.map((r) => {
    const fk = hasArabic(r.text) ? ARABIC_FOR[fontKey] : fontKey;
    return shapeRun(r.text, fk, r.level % 2 === 1);
  });
}

function measure(text, fontKey, size) {
  return layout(text, fontKey).reduce((w, run) => w + run.glyphs.reduce((a, g) => a + g.ax, 0) * (size / run.upem), 0);
}

/**
 * Draw text at (x, y) where y is the TOP of the line box (PDFKit convention).
 * opts: { font, size, color, align: 'left'|'right'|'center', width, ellipsisWidth }
 */
function draw(doc, text, x, y, opts = {}) {
  const fontKey = opts.font || 'manrope-regular';
  const size = opts.size || 10;
  const color = opts.color || '#1F222C';
  let str = String(text ?? '');
  const maxW = opts.maxWidth;
  if (maxW) {
    while (str.length > 1 && measure(str, fontKey, size) > maxW) str = str.slice(0, -2) + '…';
  }
  if (!hasArabic(str)) {
    doc.font(fonts[fontKey].file).fontSize(size).fillColor(color);
    const w = doc.widthOfString(str);
    let tx = x;
    if (opts.align === 'right' && opts.width) tx = x + opts.width - w;
    if (opts.align === 'center' && opts.width) tx = x + (opts.width - w) / 2;
    doc.text(str, tx, y, { lineBreak: false });
    return w;
  }
  const runs = layout(str, fontKey);
  const total = runs.reduce((w, run) => w + run.glyphs.reduce((a, g) => a + g.ax, 0) * (size / run.upem), 0);
  let pen = x;
  if (opts.align === 'right' && opts.width) pen = x + opts.width - total;
  if (opts.align === 'center' && opts.width) pen = x + (opts.width - total) / 2;
  // Baseline approximately at 0.8 * size below the top, matching PDFKit's native placement closely.
  const baseline = y + size * 0.93;
  doc.save();
  doc.fillColor(color);
  for (const run of runs) {
    const s = size / run.upem;
    for (const g of run.glyphs) {
      const p = glyphPath(run.fontKey, g.gid);
      if (p) {
        doc.save();
        doc.translate(pen + g.dx * s, baseline - g.dy * s);
        doc.scale(s, -s);
        doc.path(p).fill(color);
        doc.restore();
      }
      pen += g.ax * s;
    }
  }
  doc.restore();
  return total;
}

/** SVG <path> markup (for sticker SVG output). y is baseline. Returns { svg, width }. */
function toSvgPaths(text, x, baselineY, opts = {}) {
  const fontKey = opts.font || 'manrope-regular';
  const size = opts.size || 10;
  const runs = layout(String(text ?? ''), fontKey);
  const total = runs.reduce((w, run) => w + run.glyphs.reduce((a, g) => a + g.ax, 0) * (size / run.upem), 0);
  let pen = x;
  if (opts.align === 'center') pen = x - total / 2;
  if (opts.align === 'right') pen = x - total;
  const parts = [];
  for (const run of runs) {
    const s = size / run.upem;
    for (const g of run.glyphs) {
      const p = glyphPath(run.fontKey, g.gid);
      if (p) parts.push(`<path transform="translate(${(pen + g.dx * s).toFixed(3)} ${(baselineY - g.dy * s).toFixed(3)}) scale(${s.toFixed(6)} ${(-s).toFixed(6)})" d="${p}"/>`);
      pen += g.ax * s;
    }
  }
  return { svg: parts.join(''), width: total };
}

module.exports = { init, draw, measure, hasArabic, toSvgPaths, fontFile: (k) => path.join(FONT_DIR, FONT_FILES[k]) };
