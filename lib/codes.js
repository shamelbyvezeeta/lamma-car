'use strict';
const crypto = require('crypto');

// Crockford Base32 without I, L, O, U — unambiguous when typed or read aloud.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10; // 32^10 ≈ 1.1e15 possibilities — random, so codes cannot be guessed in sequence
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

function generateCode(existing = new Set()) {
  for (;;) {
    let s = '';
    for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[crypto.randomInt(0, 32)];
    if (!existing.has(s)) return s;
  }
}

// Tolerant input: case-insensitive, O→0, I/L→1 (Crockford). Returns null if not a valid code.
function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE_RE.test(s) ? s : null;
}

// Printed under the QR, grouped for readability: 7KQ2 M9XH 4D
function displayCode(code) { return `${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8)}`; }

module.exports = { generateCode, normalizeCode, displayCode, CODE_RE, ALPHABET };
