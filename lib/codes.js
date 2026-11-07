'use strict';
const crypto = require('crypto');
const config = require('../config');

// Crockford Base32 without I, L, O, U — unambiguous when typed or read aloud.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10; // 32^10 ≈ 1.1e15 possibilities (50 bits of entropy)
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

function generatePublicCode() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[crypto.randomInt(0, 32)];
  return s;
}

// Normalises user/URL input: case-insensitive, tolerant of O/I/L look-alikes per Crockford.
function normalizePublicCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE_RE.test(s) ? s : null;
}

function serialRef(serialNo) { return 'LC-' + String(serialNo).padStart(6, '0'); }
function parseSerialRef(input) {
  const m = String(input || '').trim().toUpperCase().match(/^(?:LC-?)?0*(\d{1,12})$/);
  return m ? Number(m[1]) : null;
}

function qrUrl(publicCode) { return `${config.qrBaseUrl}/${publicCode}`; }

module.exports = { generatePublicCode, normalizePublicCode, serialRef, parseSerialRef, qrUrl, CODE_RE, ALPHABET };
