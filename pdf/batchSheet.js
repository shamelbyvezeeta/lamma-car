'use strict';
const PDFDocument = require('pdfkit');
const T = require('./text');
const S = require('./sticker');
const { serialRef, qrUrl } = require('../lib/codes');

const VARIANTS = ['proof', 'print', 'white', 'cut'];
const VARIANT_LABEL = {
  proof: 'PROOF — reading orientation (as seen from outside). NOT FOR PRODUCTION.',
  print: 'PRINT — CMYK, MIRRORED for reverse (second-surface) printing on clear film',
  white: `PRINT — ${S.SPOT_WHITE} ink underlay (spot), MIRRORED, print after CMYK`,
  cut: `CUT — ${S.SPOT_CUT} contour (spot), MIRRORED`,
};

/**
 * Stream a print-ready PDF for the given codes using a configurable sheet layout.
 * Codes are only READ — regenerating a PDF never creates identifiers.
 */
async function render(stream, { title, batchRef, codes, layout, variant = 'print', generatedBy }) {
  if (!VARIANTS.includes(variant)) throw new Error('invalid variant');
  await T.init();
  const MM = S.MM;
  const perPage = layout.columns * layout.rows;
  const doc = new PDFDocument({
    size: [layout.page_width_mm * MM, layout.page_height_mm * MM],
    margin: 0, autoFirstPage: false, compress: true,
    info: { Title: title, Author: 'Lamma Car', Subject: `${batchRef} — ${variant}`, Creator: 'Lamma Car platform', Keywords: 'Lamma Car sticker' },
  });
  doc.pipe(stream);
  const pages = Math.max(1, Math.ceil(codes.length / perPage));
  const roomX = layout.columns > 1 ? Math.min(layout.gap_x_mm / 2, layout.margin_left_mm) : layout.margin_left_mm;
  const roomY = layout.rows > 1 ? Math.min(layout.gap_y_mm / 2, layout.margin_top_mm) : layout.margin_top_mm;
  for (let p = 0; p < pages; p++) {
    doc.addPage();
    const slice = codes.slice(p * perPage, (p + 1) * perPage);
    slice.forEach((c, i) => {
      const col = i % layout.columns;
      const row = Math.floor(i / layout.columns);
      // Mirrored variants also mirror the grid position so CMYK/white/cut pages register with each other.
      const visualCol = variant === 'proof' ? col : layout.columns - 1 - col;
      const x = (layout.margin_left_mm + visualCol * (S.STICKER.width_mm + layout.gap_x_mm)) * MM;
      const y = (layout.margin_top_mm + row * (S.STICKER.height_mm + layout.gap_y_mm)) * MM;
      const sc = S.scene({ url: qrUrl(c.public_code), serialLabel: serialRef(c.serial_no), bleed: Number(layout.bleed_mm) });
      S.drawPdf(doc, x, y, sc, variant);
      if (layout.crop_marks && (variant === 'proof' || variant === 'print')) S.cropMarks(doc, x, y, sc, Math.min(roomX, roomY));
    });
    // Slug line (only when the bottom margin can hold it without touching artwork/bleed)
    const usedH = layout.margin_top_mm + layout.rows * S.STICKER.height_mm + (layout.rows - 1) * layout.gap_y_mm + Number(layout.bleed_mm);
    const free = layout.page_height_mm - usedH;
    if (free >= 5) {
      const slug = `Lamma Car · ${batchRef} · page ${p + 1}/${pages} · ${slice.length} stickers · ${VARIANT_LABEL[variant]} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${generatedBy ? ' · ' + generatedBy : ''}`;
      T.draw(doc, slug, layout.margin_left_mm * MM, (layout.page_height_mm - Math.min(free, 8) + 1.5) * MM, { font: 'manrope-regular', size: 6, color: variant === 'proof' ? '#555555' : [0, 0, 0, 60], maxWidth: (layout.page_width_mm - 2 * layout.margin_left_mm) * MM });
    }
  }
  doc.end();
  return new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); doc.on('error', reject); });
}

module.exports = { render, VARIANTS };
