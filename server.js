'use strict';
const config = require('./config');
const { createApp } = require('./app');
const db = require('./db');
const T = require('./pdf/text');

(async () => {
  await T.init(); // load fonts / HarfBuzz once at boot
  const app = createApp();
  const server = app.listen(config.port, () => console.log(`Lamma Car listening on :${config.port} (${config.env})`));
  const shutdown = () => { server.close(() => db.pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})().catch((e) => { console.error(e); process.exit(1); });
