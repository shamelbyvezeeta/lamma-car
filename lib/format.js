'use strict';
const TZ = process.env.APP_TIMEZONE || 'Africa/Cairo';
// Always Western (Latin) digits, in both languages.
const LOC = { ar: 'ar-EG-u-nu-latn', en: 'en-GB-u-nu-latn' };

function loc(l) { return LOC[l] || LOC.ar; }

function number(n, l, opts = {}) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat(loc(l), opts).format(Number(n));
}
function money(amount, currency = 'EGP', l = 'ar') {
  if (amount === null || amount === undefined || amount === '') return '—';
  try {
    return new Intl.NumberFormat(loc(l), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
  } catch (_) {
    return `${number(amount, l, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}
function date(d, l) {
  if (!d) return '—';
  const v = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d);
  return new Intl.DateTimeFormat(loc(l), { timeZone: typeof d === 'string' && d.length === 10 ? 'UTC' : TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(v);
}
function dateTime(d, l) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(loc(l), { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
}
function todayIso() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
// Display +201001234567 as +20 100 123 4567 (LTR isolated in templates).
function phone(p) {
  if (!p) return '';
  const m = /^\+20(\d{3})(\d{3})(\d{4})$/.exec(p);
  return m ? `+20 ${m[1]} ${m[2]} ${m[3]}` : p;
}
function maskPhone(p) { return p ? p.slice(0, 4) + '•••••' + p.slice(-3) : ''; }

module.exports = { number, money, date, dateTime, todayIso, phone, maskPhone, TZ };
