'use strict';
require('dotenv').config({ quiet: true });

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

const config = {
  env,
  isProd,
  isTest: env === 'test',
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  sessionSecret: required('SESSION_SECRET'),
  // Public base for QR destinations, e.g. https://car.lamma.app/q  — PRINTED INTO STICKERS, never change after printing.
  qrBaseUrl: required('QR_BASE_URL').replace(/\/+$/, ''),
  appBaseUrl: (process.env.APP_BASE_URL || '').replace(/\/+$/, ''),
  trustProxy: process.env.TRUST_PROXY || (isProd ? '1' : 'false'),
  storageDir: process.env.STORAGE_DIR || require('path').join(__dirname, '..', 'storage'),
  ipHashSalt: process.env.IP_HASH_SALT || process.env.SESSION_SECRET,
  rateLimits: {
    publicPerMinute: Number(process.env.RATE_LIMIT_PUBLIC_PER_MIN || 60),
    contactPerHour: Number(process.env.RATE_LIMIT_CONTACT_PER_HOUR || 5),
    loginPer15Min: Number(process.env.RATE_LIMIT_LOGIN_PER_15MIN || 10),
  },
};

if (isProd) {
  if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters in production');
  if (!config.qrBaseUrl.startsWith('https://')) throw new Error('QR_BASE_URL must use https:// in production');
}

module.exports = config;
