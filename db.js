'use strict';
const { Pool, types } = require('pg');
const config = require('./config');

// Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting); NUMERIC as string (exact money).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v)); // bigint counts

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
});

async function query(text, params) { return pool.query(text, params); }

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
