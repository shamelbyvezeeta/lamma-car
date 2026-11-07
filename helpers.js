'use strict';
// Test harness: isolated database (TEST_DATABASE_URL), fresh schema per run, real HTTP via supertest.
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://lamma:lamma_dev_only@localhost:5432/lamma_car_test';
process.env.SESSION_SECRET = 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.QR_BASE_URL = 'https://car.lamma.test/q';
process.env.STORAGE_DIR = path.join(require('os').tmpdir(), 'lamma-car-test-storage');
process.env.RATE_LIMIT_LOGIN_PER_15MIN = '1000';
process.env.RATE_LIMIT_PUBLIC_PER_MIN = '100000';

const { Client } = require('pg');
const request = require('supertest');
const { migrate } = require('../scripts/migrate');

async function resetDb() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.query('DROP SEQUENCE IF EXISTS customer_ref_seq');
  await c.end();
  await migrate(process.env.DATABASE_URL, { quiet: true });
}

let app;
function getApp() {
  if (!app) app = require('../src/app').createApp();
  return app;
}

/** A logged-in browser-like agent that keeps cookies and extracts CSRF tokens. */
class Agent {
  constructor() { this.a = request.agent(getApp()); this.csrf = null; }
  async token(pathname = '/admin/account') {
    const r = await this.a.get(pathname);
    const m = /name="_csrf" value="([a-f0-9]+)"/.exec(r.text);
    if (m) this.csrf = m[1];
    return this.csrf;
  }
  async login(email, password) {
    await this.token('/admin/login');
    const r = await this.a.post('/admin/login').type('form').send({ email, password, _csrf: this.csrf });
    await this.token('/admin/account');
    return r;
  }
  get(p) { return this.a.get(p); }
  async post(p, data = {}) {
    if (!this.csrf) await this.token();
    return this.a.post(p).type('form').send({ ...data, _csrf: this.csrf });
  }
}

async function makeUser(role, email, password = 'Correct-Horse-Battery-9') {
  const db = require('../src/db');
  const users = require('../src/services/users');
  const hash = await users.hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO app_users (email, full_name, role, password_hash, must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING *`,
    [email, `Test ${role}`, role, hash]);
  return { ...rows[0], password };
}

function locationId(res, prefix) {
  const m = new RegExp(`^${prefix}/([0-9a-f-]{36})`).exec(res.headers.location || '');
  return m ? m[1] : null;
}

module.exports = { resetDb, getApp, Agent, makeUser, locationId, request };
