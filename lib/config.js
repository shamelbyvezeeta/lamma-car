'use strict';
// Resolves the public address of the site.
// Order: site.json "public_base_url" → PAGES_BASE_URL (set automatically by GitHub Actions) → error.
function resolveBase(site, env = process.env) {
  const url = (site.public_base_url || env.PAGES_BASE_URL || '').replace(/\/+$/, '');
  if (!url) throw new Error('Unknown site address: set "public_base_url" in site.json (e.g. https://lamma-car.github.io/car).');
  const u = new URL(url);
  return { url, path: u.pathname.replace(/\/+$/, ''), source: site.public_base_url ? 'site.json' : 'GitHub Pages' };
}
// The address encoded in each QR code. Format unchanged since v1: <base>/q/<CODE>
const pageUrl = (baseUrl, code) => `${baseUrl}/q/${code}`;
module.exports = { resolveBase, pageUrl };
