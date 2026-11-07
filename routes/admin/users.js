'use strict';
const express = require('express');
const users = require('../../services/users');
const { requirePerm } = require('../../middleware/auth');
const { schemas, parse } = require('../../lib/validation');
const { notFound, badRequest } = require('../../lib/errors');
const { h, formFail } = require('./_util');

const router = express.Router();
const nav = 'users';
router.use(requirePerm('users.manage'));

router.get('/', h(async (req, res) => res.render('admin/users/index.njk', { nav, users: await users.list() })));
router.get('/new', (req, res) => res.render('admin/users/form.njk', { nav, form: { role: 'sales_operator' }, isNew: true }));
router.post('/', h(async (req, res) => {
  try {
    const d = parse(schemas.user, req.body);
    const u = await users.create(req.user, d, req);
    req.flash('success', 'flash.user_created', { email: u.email });
    res.redirect(303, '/admin/users');
  } catch (e) { return formFail(res, 'admin/users/form.njk', { nav, form: { ...req.body, password: '' }, isNew: true })(e); }
}));
router.get('/:id/edit', h(async (req, res) => {
  const u = await users.getById(req.params.id).catch(() => null);
  if (!u) throw notFound();
  res.render('admin/users/form.njk', { nav, form: u, u, isNew: false });
}));
router.post('/:id', h(async (req, res) => {
  const u = await users.getById(req.params.id).catch(() => null);
  if (!u) throw notFound();
  try {
    const d = parse(schemas.userUpdate, req.body);
    await users.update(req.user, u.id, d, req);
    req.flash('success', 'flash.saved');
    res.redirect(303, '/admin/users');
  } catch (e) { return formFail(res, 'admin/users/form.njk', { nav, form: { ...u, ...req.body }, u, isNew: false })(e); }
}));
router.post('/:id/reset-password', h(async (req, res) => {
  const u = await users.getById(req.params.id).catch(() => null);
  if (!u) throw notFound();
  try {
    if (!req.body.password) throw badRequest('validation.password_too_short');
    await users.resetPassword(req.user, u.id, req.body.password, req);
    req.flash('success', 'flash.password_reset', { email: u.email });
    res.redirect(303, '/admin/users');
  } catch (e) { return formFail(res, 'admin/users/form.njk', { nav, form: u, u, isNew: false })(e); }
}));
module.exports = router;
