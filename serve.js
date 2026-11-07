#!/usr/bin/env node
'use strict';
// Local preview that behaves like GitHub Pages: site under its base path, folder → index.html,
// "/folder" → 301 "/folder/", "/name" → name.html, anything else → 404.html with status 404.
//   npm run build && npm run serve   → http://localhost:4000/<repo>/
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain', '.svg': 'image/svg+xml' };

function createServer(siteDir, basePath) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const send = (file, status = 200) => { res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); fs.createReadStream(file).pipe(res); };
    const notFound = () => send(path.join(siteDir, '404.html'), 404);
    if (basePath && p !== basePath && !p.startsWith(basePath + '/')) return notFound();
    if (p === basePath) { res.writeHead(301, { Location: basePath + '/' }); return res.end(); }
    const rel = p.slice(basePath.length);
    const abs = path.normalize(path.join(siteDir, rel));
    if (!abs.startsWith(siteDir)) return notFound();
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }); return res.end(); }
      return fs.existsSync(path.join(abs, 'index.html')) ? send(path.join(abs, 'index.html')) : notFound();
    }
    if (fs.existsSync(abs)) return send(abs);
    if (fs.existsSync(abs + '.html')) return send(abs + '.html');
    return notFound();
  });
}

if (require.main === module) {
  const site = path.join(__dirname, '..', '_site');
  const robots = fs.existsSync(path.join(site, 'robots.txt')) ? fs.readFileSync(path.join(site, 'robots.txt'), 'utf8') : '';
  const base = (/Disallow: (.*)\/q\//.exec(robots) || [])[1] || '';
  const port = Number(process.env.PORT || 4000);
  createServer(site, base).listen(port, () => console.log(`Preview: http://localhost:${port}${base}/  (Ctrl+C to stop)`));
}
module.exports = { createServer };
