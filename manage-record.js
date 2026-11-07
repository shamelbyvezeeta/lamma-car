#!/usr/bin/env node
'use strict';
// Changes an existing record. Used by the "Manage record" GitHub Action (form values read from the
// run's event file, never printed). Actions:
//   update-details  new display name and/or phone (requires fresh consent confirmation + date)
//   hide            active → hidden   (page shows "not active"; name/phone stay in the private record)
//   reactivate      hidden → active
//   retire          ERASES name, phone and consent from the record; page shows "not active"; code never reused
// Local use: npm run manage-record -- --code 7KQ2M9XH4D --action hide
const fs = require('fs');
const path = require('path');
const { normalizeCode } = require('./lib/codes');
const { validateRecord, normalizeEgyptMobile, cleanName, ROOT } = require('./lib/data');
const { readWorkflowInputs, maskInLogs, isTrue, readCliArgs } = require('./lib/inputs');

const ACTIONS = ['update-details', 'hide', 'reactivate', 'retire'];
const FIELDS = ['code', 'action', 'name', 'phone', 'consent_confirmed', 'consent_date'];

function fail(...errors) { const e = new Error('The record was NOT changed.'); e.errors = errors; throw e; }

function manageRecord(input, { root = ROOT } = {}) {
  const code = normalizeCode(String(input.code || ''));
  if (!code) fail('"code" must be the 10-character code of the record (e.g. 7KQ2M9XH4D)');
  const action = String(input.action || '').trim();
  if (!ACTIONS.includes(action)) fail(`"action" must be one of: ${ACTIONS.join(', ')}`);
  const file = path.join(root, 'records', `${code}.json`);
  if (!fs.existsSync(file)) fail(`there is no record with the code ${code}`);
  let cur;
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (_) { cur = null; }
  if ((!cur || typeof cur !== 'object') && action !== 'retire') fail(`records/${code}.json is not valid JSON — fix the file first, or retire the record`);
  cur = cur || {};
  const status = String(cur.status || '').trim();
  let next;
  if (action === 'retire') {
    if (status === 'retired') fail(`record ${code} is already retired`);
    next = { status: 'retired', name: '', phone: '', consent_confirmed: false, consent_date: '' };
  } else {
    if (status === 'retired') fail(`record ${code} is retired: its details were erased and it cannot be reused. Use "Add record" to create a new code`);
    next = { status, name: cleanName(cur.name), phone: normalizeEgyptMobile(cur.phone) || String(cur.phone ?? ''), consent_confirmed: cur.consent_confirmed === true, consent_date: String(cur.consent_date ?? '') };
    if (action === 'hide') {
      if (status !== 'active') fail(`record ${code} is not active, so it cannot be hidden`);
      next.status = 'hidden';
    } else if (action === 'reactivate') {
      if (status !== 'hidden') fail(`record ${code} is not hidden, so it cannot be reactivated`);
      next.status = 'active';
    } else { // update-details
      const hasName = String(input.name || '').trim() !== '';
      const hasPhone = String(input.phone || '').trim() !== '';
      if (!hasName && !hasPhone) fail('enter a new display name and/or a new phone number');
      if (!isTrue(input.consent_confirmed)) fail('tick the consent box: the person must agree to publish the new details');
      if (hasName) next.name = cleanName(input.name);
      if (hasPhone) next.phone = normalizeEgyptMobile(input.phone) || String(input.phone).trim();
      next.consent_confirmed = true;
      next.consent_date = String(input.consent_date || '').trim();
    }
  }
  const v = validateRecord(code, next);
  if (v.errors.length) fail(...v.errors.map((x) => x.replace(`records/${code}.json: `, '')));
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return { code, action, status: next.status, file: `records/${code}.json` };
}

if (require.main === module) {
  const input = process.env.GITHUB_ACTIONS === 'true' ? readWorkflowInputs() : readCliArgs(FIELDS);
  maskInLogs([input.name, input.phone]);
  const summary = (lines) => process.env.GITHUB_STEP_SUMMARY && fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  try {
    const r = manageRecord(input);
    console.log(`Record ${r.code}: ${r.action} done (status now: ${r.status})`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `code=${r.code}\naction=${r.action}\n`);
    summary([`## ✅ Record \`${r.code}\`: ${r.action}`, '', `- Status now: **${r.status}**`, '- The public page updates in about 2 minutes (phones may show the old page for up to 10 minutes).',
      ...(r.action === 'retire' ? ['- Name and phone were erased from the current record. Older versions still exist in the repository history — see docs/PRIVACY_AND_PUBLIC_DATA.md for full deletion.'] : []), '']);
  } catch (e) {
    console.error('❌ ' + e.message);
    (e.errors || []).forEach((x) => console.error('   - ' + x));
    summary(['## ❌ Record not changed', '', ...(e.errors || [e.message]).map((x) => '- ' + x), '', 'Nothing was saved or published.']);
    process.exit(1);
  }
}
module.exports = { manageRecord, ACTIONS };
