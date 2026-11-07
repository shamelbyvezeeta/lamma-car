// Derives web-ready raster variants from the ORIGINAL supplied logo PNG (already transparent).
// No artwork is redrawn: only trimming, cropping and resizing.
const sharp = require('sharp');
const path = require('path');
const SRC = path.join(__dirname, '..', 'assets', 'brand', 'Lamma_Car_Motion_Logo.original.png');
const OUT = path.join(__dirname, '..', 'web', 'brand');

async function whiteToAlpha(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // GIMP-style colour-to-alpha against white
    const a = Math.max((255 - r) / 255, (255 - g) / 255, (255 - b) / 255);
    if (a <= 0.01) { data[i + 3] = 0; continue; }
    data[i] = Math.round(255 - (255 - r) / a);
    data[i + 1] = Math.round(255 - (255 - g) / a);
    data[i + 2] = Math.round(255 - (255 - b) / a);
    data[i + 3] = Math.round(a * 255);
  }
  return sharp(data, { raw: info }).png();
}

(async () => {
  const meta = await sharp(SRC).metadata();
  const full = await sharp(SRC).png().toBuffer();
  await sharp(full).trim({ threshold: 1 }).png().toFile(path.join(OUT, 'lamma-car-logo.png'));
  // Lockup without the tagline line (tagline is set live in brand type instead)
  const noTag = await sharp(full).extract({ left: 0, top: 0, width: meta.width, height: 540 }).png().toBuffer();
  await sharp(noTag).trim({ threshold: 1 }).png().toFile(path.join(OUT, 'lamma-car-wordmark.png'));
  // Original Lamma "L" symbol (with sparks) — cropped, not redrawn
  // The L symbol's bounding box overlaps the first "a"; clear navy pixels of the "a" (x>=700 & y<340 in source px).
  const { data: md, info: mi } = await sharp(full).extract({ left: 320, top: 70, width: 450, height: 410 }).raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < mi.height; y++) for (let x = 0; x < mi.width; x++) {
    const sx = x + 320, sy = y + 70;
    const o = (y * mi.width + x) * 4;
    if (sx >= 700 && sy < 340 && md[o] < 150) md[o + 3] = 0; // navy "a" only; coral wedge kept
  }
  const mark = await sharp(md, { raw: mi }).png().toBuffer();
  const markT = await sharp(mark).trim({ threshold: 1 }).png().toBuffer();
  await sharp(markT).toFile(path.join(OUT, 'lamma-mark.png'));
  const m = await sharp(markT).metadata();
  const side = Math.max(m.width, m.height) + 40;
  const sq = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: markT, gravity: 'center' }]).png().toBuffer();
  await sharp(sq).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  await sharp(sq).resize(180, 180).flatten({ background: '#FDF6EC' }).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
  await sharp(sq).resize(48, 48).png().toFile(path.join(OUT, 'favicon-48.png'));
  console.log('brand assets written to', OUT);
})();
