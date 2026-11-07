'use strict';
// Tabular report PDF (A4 landscape) with correct Arabic shaping and RTL column order.
const path = require('path');
const PDFDocument = require('pdfkit');
const T = require('./text');
const fmt = require('../lib/format');

const LOGO = path.join(__dirname, '..', '..', 'public', 'brand', 'lamma-car-wordmark.png');
const C = { navy: '#1F222C', coral: '#FE764F', lavender: '#9274D2', cream: '#FDF6EC', line: '#E6DFD3', muted: '#6B6F7B' };

async function render(stream, { title, columns, rows, locale, t, user }) {
  await T.init();
  const rtl = locale === 'ar';
  const fontR = rtl ? 'alexandria-regular' : 'manrope-regular';
  const fontB = rtl ? 'alexandria-bold' : 'manrope-extrabold';
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true, info: { Title: title, Author: 'Lamma Car' } });
  doc.pipe(stream);
  const PW = doc.page.width, PH = doc.page.height, M = 36;
  const tableW = PW - 2 * M;
  const totalW = columns.reduce((a, c) => a + (c.w || 1), 0);
  let widths = columns.map((c) => ((c.w || 1) / totalW) * tableW);
  const cols = rtl ? columns.slice().reverse() : columns;
  if (rtl) widths = widths.slice().reverse();
  const rowH = 18, headH = 22, size = 7.6;

  const header = () => {
    doc.rect(0, 0, PW, 64).fill(C.cream);
    doc.image(LOGO, rtl ? PW - M - 120 : M, 16, { width: 120 });
    T.draw(doc, title, M, 18, { font: fontB, size: 15, color: C.navy, align: rtl ? 'left' : 'right', width: tableW - 140 + (rtl ? 0 : 140), maxWidth: tableW - 140 });
    const meta = `${t('reports.generated_at')}: ${fmt.dateTime(new Date(), locale)} · ${t('reports.generated_by')}: ${user.full_name} · ${t('reports.rows')}: ${rows.length}`;
    T.draw(doc, meta, M, 40, { font: fontR, size: 8, color: C.muted, align: rtl ? 'left' : 'right', width: tableW });
    doc.rect(0, 64, PW, 2).fill(C.coral);
    let x = M;
    const y = 80;
    doc.rect(M, y, tableW, headH).fill(C.navy);
    cols.forEach((c, i) => {
      const w = widths[i];
      const al = c.align === 'end' ? (rtl ? 'left' : 'right') : (rtl ? 'right' : 'left');
      T.draw(doc, c.label, x + 5, y + 6.5, { font: fontB, size: 7.4, color: '#FFFFFF', align: al, width: w - 10, maxWidth: w - 10 });
      x += w;
    });
    return y + headH;
  };

  let y = header();
  if (!rows.length) {
    T.draw(doc, t('common.no_records'), M, y + 20, { font: fontR, size: 10, color: C.muted, align: 'center', width: tableW });
  }
  rows.forEach((r, ri) => {
    if (y + rowH > PH - 40) { doc.addPage(); y = header(); }
    if (ri % 2 === 1) doc.rect(M, y, tableW, rowH).fill('#FBF8F2');
    let x = M;
    cols.forEach((c, i) => {
      const w = widths[i];
      let v = typeof c.value === 'function' ? c.value(r) : r[c.key];
      if (v === null || v === undefined || v === '') v = '—';
      if (v instanceof Date) v = fmt.date(v, locale);
      const al = c.align === 'end' ? (rtl ? 'left' : 'right') : (rtl ? 'right' : 'left');
      T.draw(doc, String(v), x + 5, y + 5.5, { font: fontR, size, color: C.navy, align: al, width: w - 10, maxWidth: w - 10 });
      x += w;
    });
    doc.moveTo(M, y + rowH).lineTo(M + tableW, y + rowH).lineWidth(0.4).strokeColor(C.line).stroke();
    y += rowH;
  });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const foot = `${t('reports.confidential')} · ${i + 1} / ${range.count}`;
    T.draw(doc, foot, M, PH - 26, { font: fontR, size: 7, color: C.muted, align: 'center', width: tableW });
  }
  doc.end();
  return new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
}

module.exports = { render };
