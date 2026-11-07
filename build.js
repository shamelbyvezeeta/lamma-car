#!/usr/bin/env node
'use strict';
// Builds the public website into _site/ — the ONLY folder GitHub Pages publishes.
//   _site/index.html, _site/en/                 home page (AR default, EN)
//   _site/q/<CODE>/index.html, …/en/index.html  one contact page per record (address printed in its QR)
//   _site/404.html                              bilingual "code not recognised" page
// Never copied to _site: records/, site.json, tools/, docs/, sticker/ — the private source stays private.
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate');
const { resolveBase } = require('./lib/config');
const R = require('./lib/render');
const { ROOT } = require('./lib/data');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name); const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };

function build({ root = ROOT, out = path.join(ROOT, '_site'), env = process.env, quiet = false } = {}) {
  const r = validate(root, { quiet });
  if (r.errors.length) { const e = new Error('Validation failed — nothing was built.'); e.errors = r.errors; throw e; }
  const base = resolveBase(r.site, env);
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'web'), path.join(out, 'assets')); // design files only (CSS, fonts, logo, 404 script)
  write(path.join(out, '.nojekyll'), '');
  write(path.join(out, 'robots.txt'), `User-agent: *\nDisallow: ${base.path}/q/\n`);
  write(path.join(out, 'index.html'), R.homePage({ base: base.path, lang: 'ar' }));
  write(path.join(out, 'en', 'index.html'), R.homePage({ base: base.path, lang: 'en' }));
  write(path.join(out, '404.html'), R.notFoundPage({ base: base.path, site: r.site }));
  const stats = { active: 0, hidden: 0, retired: 0 };
  for (const rec of r.records) {
    stats[rec.status]++;
    const dir = path.join(out, 'q', rec.code);
    for (const lang of ['ar', 'en']) {
      const file = path.join(dir, ...(lang === 'en' ? ['en'] : []), 'index.html');
      // Hidden and retired codes stay reachable (a printed sticker never shows "invalid"),
      // but their page contains NO name and NO phone number.
      write(file, rec.status === 'active'
        ? R.contactPage(rec, { base: base.path, lang })
        : R.inactivePage(rec.code, { base: base.path, lang, site: r.site }));
    }
  }
  if (!quiet) console.log(`🏗  Built ${out} for ${base.url} (address from ${base.source}): ${stats.active} active, ${stats.hidden} hidden, ${stats.retired} retired.`);
  return { base, records: r.records, site: r.site, stats, out };
}

if (require.main === module) {
  try { build(); } catch (e) { console.error('\n' + e.message); process.exit(1); }
}
module.exports = { build };
