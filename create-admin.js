#!/usr/bin/env node
'use strict';
// Secure first-admin setup. Creates the FIRST Super Admin only (refuses if one exists).
// Usage:  npm run create-admin -- --email you@company.com --name "Full Name"
// The password is read interactively (hidden) or from the LAMMA_ADMIN_PASSWORD env var for automation.
// Further users are created from the dashboard (Users), by a Super Admin.
require('dotenv').config({ quiet: true });
const readline = require('readline');
const db = require('../src/db');
const users = require('../src/services/users');
const audit = require('../src/lib/audit');

function arg(name) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : undefined; }

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const email = arg('email'); const name = arg('name');
  if (!email || !name) { console.error('Usage: npm run create-admin -- --email you@company.com --name "Full Name"'); process.exit(2); }
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM app_users WHERE role = 'super_admin'`);
  if (rows[0].n > 0) { console.error('A Super Admin already exists. Create further users from the dashboard.'); process.exit(3); }
  let pw = process.env.LAMMA_ADMIN_PASSWORD;
  if (!pw) {
    pw = await askHidden('Password (min 12 chars): ');
    const again = await askHidden('Repeat password: ');
    if (pw !== again) { console.error('Passwords do not match.'); process.exit(4); }
  }
  users.assertPasswordStrength(pw, email);
  const hash = await users.hashPassword(pw);
  const { rows: u } = await db.query(
    `INSERT INTO app_users (email, full_name, role, password_hash, must_change_password) VALUES ($1,$2,'super_admin',$3,false) RETURNING id, email`,
    [email.trim(), name.trim(), hash]);
  await audit.log(null, { actor: null, action: 'user.bootstrap_super_admin', entityType: 'user', entityId: u[0].id, details: { email: u[0].email } });
  console.log(`Super Admin created: ${u[0].email}`);
  await db.pool.end();
})().catch(async (e) => { console.error(e.key || e.message); await db.pool.end().catch(() => {}); process.exit(1); });
