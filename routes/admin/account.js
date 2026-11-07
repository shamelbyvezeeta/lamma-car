'use strict';
const express = require('express');
const users = require('../../services/users');
const { schemas, parse } = require('../../lib/validation');
const { h, formFail } = require('./_util');

const router = express.Router();
router.get('/', (req, res) => res.render('admin/account.njk', { nav: 'account', force: req.query.force === '1' || req.user.must_change_password }));
router.post('/password', h(async (req, res) => {
  const locals = { nav: 'account', force: req.user.must_change_password };
  try {
    const d = parse(schemas.passwordChange, req.body);
    await users.changeOwnPassword(req.user, d.current_password, d.new_password, req);
    req.flash('success', 'flash.password_changed');
    res.redirect(303, '/admin');
  } catch (e) { return formFail(res, 'admin/account.njk', locals)(e); }
}));
module.exports = router;
