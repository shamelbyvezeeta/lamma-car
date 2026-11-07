'use strict';
function flash(req, res, next) {
  req.flash = (type, key, params) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, key, params });
  };
  res.locals.flashes = (req.session && req.session.flash) || [];
  if (req.session) req.session.flash = [];
  next();
}
module.exports = { flash };
