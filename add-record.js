#!/usr/bin/env node
'use strict';
// Creates records/<NEW-CODE>.json for one person (display name + Egyptian mobile + consent).
// Used by the "Add record" GitHub Action; the form values are read from the run's event file
// (see lib/inputs.js) and are never printed. Local use:
//   npm run add-record -- --name "Ahmed M." --phone 01001234567 --consent_confirmed true --consent_date 2026-11-07
const fs = require('fs');
const path = require('path');
const { generateCode } = require('./lib/codes');
const { validateRecord, loadSite, normalizeEgyptMobile, cleanName, ROOT } = require('./lib/data');
const { resolveBase, pageUrl } = require('./lib/config');
const { readWorkflowInputs, maskInLogs, isTrue, readCliArgs } = require('./lib/inputs');

const FIELDS = ['name', 'phone', 'consent_confirmed', 'consent_date'];

function addRecord(input, { root = ROOT, env = process.env } = {}) {
  const dir = path.join(root, 'records');
  fs.mkdirSync(dir, { recursive: true });
  // Every existing file name counts, including retired records: a code is never reused.
  const existing = new Set(fs.readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)));
  const code = generateCode(existing);
  const record = {
    status: 'active',
    name: cleanName(input.name),
    phone: normalizeEgyptMobile(input.phone) || String(input.phone ?? '').trim(),
    consent_confirmed: isTrue(input.consent_confirmed),
    consent_date: String(input.consent_date ?? '').trim(),
  };
  const r = validateRecord(code, record);
  if (r.errors.length) {
    const e = new Error('The record was NOT added.');
    e.errors = r.errors.map((x) => x.replace(`records/${code}.json: `, ''));
    throw e;
  }
  fs.writeFileSync(path.join(dir, `${code}.json`), JSON.stringify(record, null, 2) + '\n');
  let url = null;
  try { url = pageUrl(resolveBase(loadSite(root).site, env).url, code); } catch (_) { /* address not set yet */ }
  return { code, url, file: `records/${code}.json` };
}

if (require.main === module) {
  const input = process.env.GITHUB_ACTIONS === 'true' ? readWorkflowInputs() : readCliArgs(FIELDS);
  maskInLogs([input.name, input.phone]);
  const summary = (lines) => process.env.GITHUB_STEP_SUMMARY && fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  try {
    const r = addRecord(input);
    // Only the code and the page address are printed — never the name or number.
    console.log(`Record added: ${r.file}\nCode: ${r.code}\nPage: ${r.url || '(set public_base_url in site.json)'}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `code=${r.code}\n`);
    summary([`## ✅ Record added: \`${r.code}\``, '',
      `- Public contact page (live in about 2 minutes): ${r.url || 'set public_base_url in site.json'}`,
      '- Sticker print files: download **sticker-files-' + r.code + '** under *Artifacts* at the bottom of this page.',
      '- Keep the signed consent with this code **outside GitHub**.', '']);
  } catch (e) {
    console.error('❌ ' + e.message);
    (e.errors || []).forEach((x) => console.error('   - ' + x));
    summary(['## ❌ Record not added', '', ...(e.errors || [e.message]).map((x) => '- ' + x), '', 'Nothing was saved or published. Run **Add record** again with corrected values.']);
    process.exit(1);
  }
}
module.exports = { addRecord };
