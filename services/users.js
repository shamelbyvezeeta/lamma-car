'use strict';
const argon2 = require('@node-rs/argon2');
const db = require('../db');
const audit = require('../lib/audit');
const { can } = require('../lib/permissions');
const { forbidden, notFound, conflict, badRequest, fromPg } = require('../lib/errors');

const HASH_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }; // OWASP 2023+ argon2id baseline
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
let dummyHash = null;

const USER_COLS = 'id, email, full_name, role, is_active, must_change_password, last_login_at, preferred_locale, created_at, locked_until';

async function hashPassword(pw) { return argon2.hash(pw, HASH_OPTS); }

function assertPasswordStrength(pw, email) {
  if (typeof pw !== 'string' || pw.length < 12) throw badRequest('validation.password_too_short');
  if (email && pw.toLowerCase().includes(String(email).split('@')[0].toLowerCase())) throw badRequest('validation.password_contains_email');
  if (/^(.)\1+$/.test(pw)) throw badRequest('validation.password_too_weak');
}

async function authenticate(email, password, req) {
  if (!dummyHash) dummyHash = await hashPassword('lamma-car-timing-equaliser-' + Math.random());
  const { rows } = await db.query(`SELECT ${USER_COLS}, password_hash, failed_login_count FROM app_users WHERE email = $1`, [String(email).trim()]);
  const u = rows[0];
  if (!u) {
    await argon2.verify(dummyHash, password).catch(() => false); // equalise timing
    await audit.log(null, { actor: null, action: 'auth.login_failed', entityType: 'user', details: { email: String(email).slice(0, 160), reason: 'unknown_email' }, req });
    return { ok: false, reason: 'invalid' };
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    await audit.log(null, { actor: u, action: 'auth.login_blocked', entityType: 'user', entityId: u.id, details: { reason: 'locked' }, req });
    return { ok: false, reason: 'locked' };
  }
  const valid = await argon2.verify(u.password_hash, password).catch(() => false);
  if (!valid || !u.is_active) {
    const failed = u.failed_login_count + 1;
    const lock = failed >= MAX_FAILED;
    await db.query(
      `UPDATE app_users SET failed_login_count = $2, locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END WHERE id = $1`,
      [u.id, lock ? 0 : failed, lock, String(LOCK_MINUTES)]);
    await audit.log(null, { actor: u, action: 'auth.login_failed', entityType: 'user', entityId: u.id, details: { reason: !u.is_active ? 'inactive' : 'bad_password', locked: lock }, req });
    return { ok: false, reason: lock ? 'locked' : 'invalid' };
  }
  await db.query('UPDATE app_users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
  await audit.log(null, { actor: u, action: 'auth.login', entityType: 'user', entityId: u.id, req });
  delete u.password_hash;
  return { ok: true, user: u };
}

async function getById(id) {
  const { rows } = await db.query(`SELECT ${USER_COLS} FROM app_users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function list() {
  const { rows } = await db.query(`SELECT ${USER_COLS} FROM app_users ORDER BY is_active DESC, role, full_name`);
  return rows;
}

async function activeStaff() {
  const { rows } = await db.query(`SELECT id, full_name, role FROM app_users WHERE is_active ORDER BY full_name`);
  return rows;
}

async function create(actor, data, req) {
  if (!can(actor, 'users.manage')) throw forbidden();
  assertPasswordStrength(data.password, data.email);
  const hash = await hashPassword(data.password);
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO app_users (email, full_name, role, password_hash, must_change_password, created_by)
         VALUES ($1,$2,$3,$4,true,$5) RETURNING ${USER_COLS}`,
        [data.email, data.full_name, data.role, hash, actor.id]);
      await audit.log(c, { actor, action: 'user.create', entityType: 'user', entityId: rows[0].id, details: { email: data.email, role: data.role }, req });
      return rows[0];
    });
  } catch (e) { throw fromPg(e); }
}

async function update(actor, id, data, req) {
  if (!can(actor, 'users.manage')) throw forbidden();
  return db.tx(async (c) => {
    const { rows: cur } = await c.query(`SELECT ${USER_COLS} FROM app_users WHERE id = $1 FOR UPDATE`, [id]);
    if (!cur[0]) throw notFound();
    const before = cur[0];
    if (id === actor.id && (data.role !== before.role || !data.is_active)) throw conflict('errors.cannot_change_own_role');
    if (before.role === 'super_admin' && before.is_active && (data.role !== 'super_admin' || !data.is_active)) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM app_users WHERE role = 'super_admin' AND is_active AND id <> $1`, [id]);
      if (rows[0].n === 0) throw conflict('errors.last_super_admin');
    }
    const { rows } = await c.query(
      `UPDATE app_users SET full_name = $2, role = $3, is_active = $4 WHERE id = $1 RETURNING ${USER_COLS}`,
      [id, data.full_name, data.role, data.is_active]);
    if (!data.is_active) await c.query(`DELETE FROM http_sessions WHERE (sess->>'userId') = $1`, [id]);
    await audit.log(c, { actor, action: 'user.update', entityType: 'user', entityId: id,
      details: { before: { role: before.role, is_active: before.is_active, full_name: before.full_name }, after: { role: data.role, is_active: data.is_active, full_name: data.full_name } }, req });
    return rows[0];
  });
}

async function resetPassword(actor, id, newPassword, req) {
  if (!can(actor, 'users.manage')) throw forbidden();
  const target = await getById(id);
  if (!target) throw notFound();
  assertPasswordStrength(newPassword, target.email);
  const hash = await hashPassword(newPassword);
  await db.tx(async (c) => {
    await c.query(`UPDATE app_users SET password_hash = $2, must_change_password = true, failed_login_count = 0, locked_until = NULL WHERE id = $1`, [id, hash]);
    await c.query(`DELETE FROM http_sessions WHERE (sess->>'userId') = $1`, [id]);
    await audit.log(c, { actor, action: 'user.password_reset', entityType: 'user', entityId: id, req });
  });
}

async function changeOwnPassword(user, current, next, req) {
  const { rows } = await db.query('SELECT password_hash, email FROM app_users WHERE id = $1', [user.id]);
  if (!rows[0] || !(await argon2.verify(rows[0].password_hash, current).catch(() => false))) throw badRequest('errors.current_password_wrong');
  if (current === next) throw badRequest('validation.password_must_differ');
  assertPasswordStrength(next, rows[0].email);
  const hash = await hashPassword(next);
  await db.tx(async (c) => {
    await c.query('UPDATE app_users SET password_hash = $2, must_change_password = false WHERE id = $1', [user.id, hash]);
    await audit.log(c, { actor: user, action: 'user.password_changed', entityType: 'user', entityId: user.id, req });
  });
}

async function setLocale(userId, locale) {
  if (!['ar', 'en'].includes(locale)) return;
  await db.query('UPDATE app_users SET preferred_locale = $2 WHERE id = $1', [userId, locale]);
}

module.exports = { authenticate, getById, list, activeStaff, create, update, resetPassword, changeOwnPassword, hashPassword, assertPasswordStrength, setLocale };
