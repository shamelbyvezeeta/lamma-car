'use strict';
// Loads and validates site.json and records/*.json (one record = one QR code = one person = one phone).
//
// PRIVACY RULE FOR THIS FILE: error and warning messages may mention file names (= codes) and field
// names, but must NEVER contain the submitted name or phone number. They appear in GitHub Actions logs.
const fs = require('fs');
const path = require('path');
const { CODE_RE } = require('./codes');

const ROOT = path.join(__dirname, '..', '..');

const STATUSES = ['active', 'hidden', 'retired'];
const RECORD_FIELDS = ['status', 'name', 'phone', 'consent_confirmed', 'consent_date'];
const SITE_FIELDS = ['public_base_url', 'support_phone', 'support_email', 'default_currency'];
const NAME_MAX = 30;

const empty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const str = (v) => (empty(v) ? '' : String(v).trim());

// Arabic-Indic (٠-٩) and Persian/Urdu (۰-۹) digits → 0-9
function westernDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * Egyptian MOBILE numbers only (010, 011, 012, 015) → "+201XXXXXXXXX". Anything else → null.
 * Accepts: 01001234567 · 1001234567 · 201001234567 · +201001234567 · 00201001234567 · +20 0100 123 4567,
 * with spaces, dashes, brackets, dots, direction marks, and Arabic-Indic digits.
 */
function normalizeEgyptMobile(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  let s = westernDigits(String(v)).trim().replace(/[\s\-().‎‏‪-‮⁦-⁩]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d+$/.test(s)) return null;
  if (/^2001[0125]\d{8}$/.test(s)) s = '20' + s.slice(3); // "+20 010…" written with the trunk 0
  else if (/^01[0125]\d{8}$/.test(s)) s = '2' + s;
  else if (/^1[0125]\d{8}$/.test(s)) s = '20' + s;
  return /^201[0125]\d{8}$/.test(s) ? '+' + s : null;
}

// Lamma Car's own support number (optional, site.json) may be a landline or international.
function normalizeAnyPhone(v) {
  const eg = normalizeEgyptMobile(v);
  if (eg) return eg;
  let s = westernDigits(String(v)).replace(/[\s\-().]/g, '');
  if (/^00\d+$/.test(s)) s = '+' + s.slice(2);
  if (/^0[2-9]\d{7,9}$/.test(s)) s = '+20' + s.slice(1); // Egyptian landline
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/**
 * Display name only: a first name, or first name + last initial.
 *   OK: "Ahmed" · "Ahmed M." · "أحمد م." · "Abdel Rahman" · "عبد الرحمن ع." · "Sara-Lynn"
 *   Refused: full names ("Ahmed Mohamed Ali"), digits, e-mails, links, symbols, > 30 characters.
 */
const LETTER = '[\\p{L}\\p{M}]';
const WORD = `${LETTER}(?:${LETTER}|['’\\-])*`;
const COMPOUND = '(?:عبد|ابو|أبو|abd|abdel|abdul|abdal|abdou|abou|abu)';
const NAME_RE = new RegExp(`^(?:${COMPOUND}\\s+${WORD}|${WORD})(?:\\s+${LETTER}\\.?)?$`, 'iu');
const cleanName = (v) => str(v).replace(/\s+/g, ' ');
const isDisplayName = (n) => n.length >= 2 && n.length <= NAME_MAX && NAME_RE.test(n);

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Reports a JSON syntax problem by LINE ONLY (Node's own message can quote the file content). */
function readJson(file, errors, label) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { errors.push(`${label}: the file cannot be read`); return null; }
  try { return JSON.parse(raw.replace(/^﻿/, '')); } catch (e) {
    const m = /position (\d+)/.exec(e.message) || /column (\d+)/.exec(e.message);
    const lm = /line (\d+)/.exec(e.message);
    const line = lm ? Number(lm[1]) : (m ? raw.slice(0, Number(m[1])).split('\n').length : null);
    errors.push(`${label}: the file is not valid JSON${line ? ` (problem near line ${line})` : ''}. Check for a missing comma, quote or bracket.`);
    return null;
  }
}

function loadSite(root = ROOT) {
  const errors = [];
  const data = readJson(path.join(root, 'site.json'), errors, 'site.json') || {};
  for (const k of Object.keys(data)) if (!SITE_FIELDS.includes(k)) errors.push(`site.json: unknown setting "${k}". Allowed: ${SITE_FIELDS.join(', ')}`);
  const site = {
    public_base_url: str(data.public_base_url).replace(/\/+$/, ''),
    support_phone: '',
    support_email: str(data.support_email),
    default_currency: str(data.default_currency || 'EGP').toUpperCase(),
  };
  if (site.public_base_url && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(site.public_base_url)) errors.push('site.json: "public_base_url" must start with https:// (example: https://lamma-car.github.io/car)');
  if (!empty(data.support_phone)) {
    const p = normalizeAnyPhone(data.support_phone);
    if (!p) errors.push('site.json: "support_phone" is not a valid phone number'); else site.support_phone = p;
  }
  if (site.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.support_email)) errors.push('site.json: "support_email" is not a valid e-mail address');
  if (!/^[A-Z]{3}$/.test(site.default_currency)) errors.push('site.json: "default_currency" must be a 3-letter code such as EGP');
  return { site, errors };
}

/** Validates one record. Returns the normalised record (phone in +201XXXXXXXXX form) when valid. */
function validateRecord(code, d) {
  const errors = [];
  const E = (msg) => errors.push(`records/${code}.json: ${msg}`);
  if (!d || typeof d !== 'object' || Array.isArray(d)) { E('must contain one { … } object'); return { errors }; }
  for (const k of Object.keys(d)) {
    if (!RECORD_FIELDS.includes(k)) E(`field "${k}" is not allowed. Only these fields may be used: ${RECORD_FIELDS.join(', ')}`);
  }
  const r = { code, status: str(d.status), name: cleanName(d.name), phone: null, consent_confirmed: d.consent_confirmed === true, consent_date: str(d.consent_date) };
  if (!STATUSES.includes(r.status)) E(`"status" must be one of: ${STATUSES.join(', ')}`);
  if (d.consent_confirmed !== undefined && d.consent_confirmed !== null && d.consent_confirmed !== '' && typeof d.consent_confirmed !== 'boolean') {
    E('"consent_confirmed" must be true or false, written without quotes');
  }

  if (r.status === 'retired') {
    // Retirement = erasure from the current record.
    if (!empty(d.name)) E('this record is retired, so "name" must be erased (set it to "")');
    if (!empty(d.phone)) E('this record is retired, so "phone" must be erased (set it to "")');
    r.name = '';
  } else if (r.status === 'active' || r.status === 'hidden') {
    if (!r.name) E('"name" is required (a display name such as "Ahmed" or "Ahmed M.")');
    else if (!isDisplayName(r.name)) E(`"name" must be a display name only: a first name, or first name + last initial (e.g. "Ahmed M."), letters only, ${NAME_MAX} characters at most. Full names, numbers, e-mails and links are not allowed.`);
    if (empty(d.phone)) E('"phone" is required (an Egyptian mobile number starting with 010, 011, 012 or 015)');
    else {
      r.phone = normalizeEgyptMobile(d.phone);
      if (!r.phone) E('"phone" must be an Egyptian MOBILE number: 11 digits starting with 010, 011, 012 or 015 (or the same in +20 format). Landlines and other countries are not accepted.');
    }
    if (d.consent_confirmed !== true) E('"consent_confirmed" must be true: the person must have agreed to publish their display name and phone number on the public page');
    if (!validDate(r.consent_date)) E('"consent_date" must be the date the person agreed, written as YYYY-MM-DD (e.g. 2026-11-07)');
    else if (Date.parse(r.consent_date + 'T00:00:00Z') > Date.now() + 864e5) E('"consent_date" cannot be in the future');
  }
  return { errors, record: errors.length ? undefined : r };
}

function loadRecords(root = ROOT) {
  const dir = path.join(root, 'records');
  const errors = [];
  const warnings = [];
  const records = [];
  if (!fs.existsSync(dir)) return { records, errors: ['the "records" folder is missing'], warnings };
  const names = fs.readdirSync(dir).sort();
  names.forEach((name, i) => {
    if (name.startsWith('_') || name.startsWith('.') || /^readme\.md$/i.test(name)) return;
    // A wrongly named file could carry a person's name, so it is identified by position only.
    const m = /^([0-9A-Z]{10})\.json$/.exec(name);
    if (!m || !CODE_RE.test(m[1])) {
      errors.push(`records folder: file number ${i + 1} (in alphabetical order) has an invalid name. Each file must be named with its 10-character code in CAPITAL letters/digits (no I, L, O, U), e.g. 7KQ2M9XH4D.json. Use the "Add record" action to create records.`);
      return;
    }
    const code = m[1];
    const d = readJson(path.join(dir, name), errors, `records/${name}`);
    if (!d) return;
    const v = validateRecord(code, d);
    errors.push(...v.errors);
    if (v.record) records.push(v.record);
  });
  // One QR = one person = one phone. The same number on several codes is allowed (e.g. two cars),
  // but reported so it is a conscious choice. Only codes are printed, never the number.
  const byPhone = new Map();
  for (const r of records) if (r.phone) byPhone.set(r.phone, [...(byPhone.get(r.phone) || []), r.code]);
  for (const codes of byPhone.values()) if (codes.length > 1) warnings.push(`records ${codes.join(', ')} use the same phone number (allowed, e.g. one person with two cars — check this is intended)`);
  return { records, errors, warnings };
}

module.exports = {
  loadSite, loadRecords, validateRecord, normalizeEgyptMobile, normalizeAnyPhone, isDisplayName, cleanName, validDate,
  STATUSES, RECORD_FIELDS, NAME_MAX, ROOT,
};
