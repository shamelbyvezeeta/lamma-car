'use strict';
const ar = require('./ar');
const en = require('./en');
const DICTS = { ar, en };
const LOCALES = ['ar', 'en'];

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined), dict);
}

function translator(locale) {
  const dict = DICTS[locale] || DICTS.ar;
  return function t(key, params) {
    let s = lookup(dict, key);
    if (typeof s !== 'string') {
      s = lookup(DICTS.en, key);
      if (typeof s !== 'string') {
        if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
    }
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
    return s;
  };
}

module.exports = { translator, LOCALES, DICTS, lookup };
