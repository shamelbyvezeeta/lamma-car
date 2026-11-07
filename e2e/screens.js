// Visual QA: captures key screens at desktop/tablet/mobile in Arabic and English.
// Usage: BASE=http://localhost:3000 EMAIL=.. PASSWORD=.. node tests/e2e/screens.js <outdir> [pages...]
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3000';
const out = process.argv[2] || 'screens';
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const VIEWS = { desktop: { width: 1440, height: 900 }, tablet: { width: 834, height: 1112 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'], headless: true });
  const errors = [];
  const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
  const login = async (page) => {
    await page.goto(BASE + '/admin/login', { waitUntil: 'networkidle0' });
    await page.type('#email', process.env.EMAIL); await page.type('#password', process.env.PASSWORD);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
  };
  const pages = JSON.parse(process.env.PAGES || '[]');
  for (const p of pages) {
    if (only.length && !only.includes(p.name)) continue;
    for (const vp of p.views || ['desktop']) {
      for (const lang of p.langs || ['ar']) {
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.name}/${vp}/${lang}: ${m.text()}`); });
        page.on('pageerror', (e) => errors.push(`${p.name}/${vp}/${lang}: ${e.message}`));
        await page.setViewport(VIEWS[vp]);
        await page.setCookie({ name: 'lc_lang', value: lang, url: BASE });
        if (p.auth) await login(page);
        await page.goto(BASE + p.url, { waitUntil: 'networkidle0' });
        await shot(page, `${p.name}-${vp}-${lang}`);
        await ctx.close();
      }
    }
  }
  await browser.close();
  if (errors.length) { console.log('BROWSER ERRORS:\n' + errors.join('\n')); } else console.log('no browser console errors');
})().catch((e) => { console.error(e); process.exit(1); });
