'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');
const nunjucks = require('nunjucks');
const config = require('./config');
const db = require('./db');
const { locale } = require('./middleware/locale');
const { csrfToken } = require('./middleware/csrf');
const { loadUser } = require('./middleware/auth');
const { flash } = require('./middleware/flash');
const { AppError, ValidationError } = require('./lib/errors');
const { serialRef } = require('./lib/codes');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy === 'false' ? false : /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  const env = nunjucks.configure(path.join(__dirname, '..', 'views'), { autoescape: true, express: app, noCache: !config.isProd, throwOnUndefined: false });
  env.addFilter('serial', (n) => (n ? serialRef(n) : '—'));
  env.addFilter('json', (v) => JSON.stringify(v));
  env.addGlobal('options', (t, prefix, keys) => keys.map((k) => ({ value: k, label: t(prefix + '.' + k) })));
  env.addGlobal('assetVersion', process.env.ASSET_VERSION || String(Date.now()).slice(0, 9));
  app.set('view engine', 'njk');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); next(); });

  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '7d' : 0, index: false }));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/brand/favicon-48.png'));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /q/\n'));

  app.get('/healthz', async (req, res) => {
    try { await db.query('SELECT 1'); res.json({ status: 'ok' }); } catch (_) { res.status(503).json({ status: 'db_unavailable' }); }
  });

  app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 200 }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(session({
    store: new PgSession({ pool: db.pool, tableName: 'http_sessions', createTableIfMissing: false, pruneSessionInterval: config.isTest ? false : 900 }),
    name: 'lc_sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 8 * 3600 * 1000 },
  }));
  app.use(locale);
  app.use(flash);
  app.use(csrfToken);
  app.use(loadUser);
  app.use((req, res, next) => { res.locals.path = req.path; res.locals.query = req.query; next(); });

  app.use('/', require('./routes/public'));
  app.use('/admin', require('./routes/admin'));

  app.use((req, res) => {
    res.status(404).render(req.path.startsWith('/admin') && req.user ? 'admin/error.njk' : 'public/error.njk', { status: 404, messageKey: 'errors.page_not_found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err instanceof AppError ? err.status : (err.status || err.statusCode || 500);
    if (err.type === 'entity.too.large') status = 413;
    if (err.code === 'LIMIT_FILE_SIZE') { status = 400; err.key = 'errors.photo_too_large'; }
    if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
    const key = err.key || (status === 404 ? 'errors.not_found' : status === 413 ? 'errors.too_large' : status === 400 ? 'errors.invalid_data' : 'errors.server');
    if (req.path.startsWith('/admin/api/') || (req.get('accept') || '').startsWith('application/json')) {
      return res.status(status).json({ error: req.t ? req.t(key) : key, fields: err instanceof ValidationError ? err.fieldErrors : undefined });
    }
    const view = req.user && req.originalUrl.startsWith('/admin') ? 'admin/error.njk' : 'public/error.njk';
    res.status(status).render(view, { status, messageKey: key, params: err.params });
  });

  return app;
}

module.exports = { createApp };
