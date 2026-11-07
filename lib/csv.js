'use strict';
// RFC 4180 CSV with UTF-8 BOM (Excel opens Arabic correctly) and formula-injection protection.
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(headers, rows) {
  const lines = [headers.map((h) => cell(h.label)).join(',')];
  for (const r of rows) lines.push(headers.map((h) => cell(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
module.exports = { toCsv, cell };
