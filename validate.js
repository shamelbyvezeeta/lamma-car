#!/usr/bin/env node
'use strict';
// Checks site.json and every file in records/. Exit code 1 if anything must be fixed.
// Messages name the file (code) and field only — never the name or phone number.
const fs = require('fs');
const { loadSite, loadRecords, ROOT } = require('./lib/data');

function validate(root = ROOT, { quiet = false } = {}) {
  const s = loadSite(root);
  const r = loadRecords(root);
  const errors = [...s.errors, ...r.errors];
  if (!quiet) {
    for (const w of r.warnings) console.log('⚠️  ' + w);
    if (errors.length) {
      console.log(`\n❌ ${errors.length} problem(s) must be fixed before the site can be published:\n`);
      errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
      const c = (st) => r.records.filter((x) => x.status === st).length;
      console.log(`✅ All good: ${r.records.length} record(s) — ${c('active')} active, ${c('hidden')} hidden, ${c('retired')} retired.`);
    }
  }
  return { records: r.records, warnings: r.warnings, site: s.site, errors };
}

if (require.main === module) {
  const r = validate();
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = r.errors.length ? ['## ❌ Records need fixing (nothing was published)', '', ...r.errors.map((e) => `- ${e}`)] : ['## ✅ Records are valid'];
    if (r.warnings.length) lines.push('', ...r.warnings.map((w) => `- ⚠️ ${w}`));
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
  process.exit(r.errors.length ? 1 : 0);
}
module.exports = { validate };
