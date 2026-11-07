'use strict';
const { translator, LOCALES } = require('../i18n');
const fmt = require('../lib/format');

// Arabic is the default. ?lang=xx switches and persists in a cookie.
function locale(req, res, next) {
  let l = req.cookies && LOCALES.includes(req.cookies.lc_lang) ? req.cookies.lc_lang : null;
  if (!l && req.session && req.session.locale) l = req.session.locale;
  if (LOCALES.includes(req.query.lang)) {
    l = req.query.lang;
    res.cookie('lc_lang', l, { maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', secure: req.secure });
  }
  l = l || 'ar';
  req.locale = l;
  req.t = translator(l);
  res.locals.locale = l;
  res.locals.dir = l === 'ar' ? 'rtl' : 'ltr';
  res.locals.t = req.t;
  res.locals.fmt = {
    number: (n, o) => fmt.number(n, l, o), money: (a, c) => fmt.money(a, c, l), date: (d) => fmt.date(d, l),
    dateTime: (d) => fmt.dateTime(d, l), phone: fmt.phone,
  };
  // URL of current page in the other language
  const u = new URL(req.originalUrl, 'http://x');
  u.searchParams.set('lang', l === 'ar' ? 'en' : 'ar');
  res.locals.switchLangUrl = u.pathname + u.search;
  next();
}

module.exports = { locale };
