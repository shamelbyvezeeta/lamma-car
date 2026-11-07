'use strict';
// Reads the form fields of a manually started GitHub Actions run ("Run workflow" form).
//
// Why not environment variables? GitHub prints a step's `env:` values at the top of that step's log.
// The form values are read here from the run's event file instead, so names and phone numbers are never
// printed. They are additionally registered as secrets with `::add-mask::`, so if anything ever tried to
// print them, the log would show *** instead.
const fs = require('fs');
const { normalizeEgyptMobile } = require('./data');

function readWorkflowInputs(env = process.env) {
  const file = env.GITHUB_EVENT_PATH;
  if (!file || !fs.existsSync(file)) return {};
  try {
    const ev = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (ev && typeof ev.inputs === 'object' && ev.inputs) || {};
  } catch (_) { return {}; }
}

/** Mask personal values (and the usual spellings of a phone number) in GitHub Actions logs. */
function maskInLogs(values, env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') return;
  const out = new Set();
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) continue;
    out.add(v.trim());
    const p = normalizeEgyptMobile(v);
    if (p) { out.add(p); out.add(p.slice(1)); out.add('0' + p.slice(3)); out.add(p.slice(3)); }
  }
  for (const v of out) process.stdout.write(`::add-mask::${v.replace(/\r?\n/g, ' ')}\n`);
}

const isTrue = (v) => v === true || v === 'true';

/** Local use: --name … --phone … (values typed on your own computer, not in GitHub). */
function readCliArgs(names, argv = process.argv.slice(2)) {
  const o = {};
  for (const n of names) {
    const i = argv.indexOf('--' + n);
    if (i > -1 && argv[i + 1] !== undefined) o[n] = argv[i + 1];
  }
  return o;
}

module.exports = { readWorkflowInputs, maskInLogs, isTrue, readCliArgs };
