'use strict';
// End-to-end tests for the contact-only site: fixture repository → build → served like GitHub Pages →
// checked over HTTP and in headless Chrome. Also covers validation, add/manage record tools, privacy
// of logs, and the sticker QR → page round trip.
// All names and numbers below are FICTIONAL test data.
// Run: npm test (needs Google Chrome and poppler-utils).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const { build } = require('../tools/build');
const { stickers } = require('../tools/stickers');
const { addRecord } = require('../tools/add-record');
const { manageRecord } = require('../tools/manage-record');
const { validate } = require('../tools/validate');
const { createServer } = require('../tools/serve');
const { normalizeEgyptMobile, isDisplayName } = require('../tools/lib/data');

const BASE_URL = 'https://lamma.test/car';
const BASE_PATH = '/car';
const C = { active: 'A1B2C3D4E5', arabic: 'AAAAAAAAAA', hidden: 'HHHHHHHHHH', retired: 'RRRRRRRRRR', xss: 'XXXXXXXXXX' };
const FIX = {
  [C.active]: { status: 'active', name: 'Test M.', phone: '01000000001', consent_confirmed: true, consent_date: '2026-11-01' },
  [C.arabic]: { status: 'active', name: 'تجربة ع.', phone: '+20 115 000 0002', consent_confirmed: true, consent_date: '2026-11-02' },
  [C.hidden]: { status: 'hidden', name: 'Hidden', phone: '01200000003', consent_confirmed: true, consent_date: '2026-10-01' },
  [C.retired]: { status: 'retired', name: '', phone: '', consent_confirmed: false, consent_date: '' },
  [C.xss]: { status: 'active', name: 'Evil', phone: '01500000005', consent_confirmed: true, consent_date: '2026-11-03' },
};
const SITE = { public_base_url: BASE_URL, support_phone: '', support_email: 'help@lamma.test', default_currency: 'EGP' };

let tmp, out, server, port;
const get = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: b })); }).on('error', reject);
});
const follow = async (p) => { let r = await get(p); let n = 0; while ([301, 302].includes(r.status) && n++ < 5) r = await get(new URL(r.headers.location, 'http://x').pathname); return r; };

function makeRepo(dir, records, site = SITE) {
  fs.mkdirSync(path.join(dir, 'records'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'site.json'), JSON.stringify(site, null, 2));
  for (const [code, data] of Object.entries(records)) fs.writeFileSync(path.join(dir, 'records', code + '.json'), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}
const listFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(d, e.name)) : [path.join(d, e.name)]));

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lamma-contact-'));
  makeRepo(tmp, FIX);
  out = path.join(tmp, '_site');
  build({ root: tmp, out, env: {}, quiet: true });
  server = createServer(out, BASE_PATH);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => { server && server.close(); });

describe('Phone and name rules', () => {
  it('normalises Egyptian mobiles (incl. Arabic-Indic digits) to +201XXXXXXXXX', () => {
    for (const [input, want] of [['01000000001', '+201000000001'], ['+201000000001', '+201000000001'], ['00201000000001', '+201000000001'],
      ['201000000001', '+201000000001'], ['1000000001', '+201000000001'], ['+20 0100 000 0001', '+201000000001'],
      ['٠١٠٠٠٠٠٠٠٠١', '+201000000001'], ['011-0000-0002', '+201100000002'], ['(012) 0000 0003', '+201200000003'], ['01500000004', '+201500000004']]) {
      assert.equal(normalizeEgyptMobile(input), want, input);
    }
  });
  it('rejects landlines, other prefixes, other countries and malformed numbers', () => {
    for (const bad of ['0223456789', '+20223456789', '01300000000', '01400000000', '0100000000', '010000000011', '+971500000000', '+441234567890', 'abc', '', 'a@b.com']) {
      assert.equal(normalizeEgyptMobile(bad), null, bad);
    }
  });
  it('accepts display names only', () => {
    for (const ok of ['Ahmed', 'Ahmed M.', 'Ahmed M', 'أحمد', 'أحمد م.', 'Abdel Rahman', 'عبد الرحمن', 'عبد الرحمن ع.', 'Sara-Lynn', 'O’Neil']) assert.ok(isDisplayName(ok), ok);
    for (const bad of ['Ahmed Mohamed Ali', 'Ahmed Mohamed', 'A', 'Ahmed 2', 'ahmed@mail.com', 'www.site.com', 'Ahmed!', 'x'.repeat(31)]) assert.ok(!isDisplayName(bad), bad);
  });
});

describe('Build & public pages', () => {
  it('builds home, 404, robots and an Arabic + English page per code; never copies private sources', () => {
    for (const f of ['index.html', 'en/index.html', '404.html', 'robots.txt', '.nojekyll', 'assets/css/site.css']) assert.ok(fs.existsSync(path.join(out, f)), f);
    for (const code of Object.values(C)) {
      assert.ok(fs.existsSync(path.join(out, 'q', code, 'index.html')), code);
      assert.ok(fs.existsSync(path.join(out, 'q', code, 'en', 'index.html')), code + ' en');
    }
    for (const f of listFiles(out)) assert.ok(!/\.json$/.test(f) && !f.includes(`${path.sep}records`), `private source published: ${f}`);
    assert.ok(!fs.existsSync(path.join(out, 'site.json')));
  });

  it('QR address /q/<CODE> → 301 → 200, Arabic by default, English available', async () => {
    for (const code of Object.values(C)) {
      assert.equal((await get(`${BASE_PATH}/q/${code}`)).status, 301);
      const r = await follow(`${BASE_PATH}/q/${code}`);
      assert.equal(r.status, 200); assert.match(r.text, /<html lang="ar" dir="rtl">/);
      const en = await get(`${BASE_PATH}/q/${code}/en/`);
      assert.equal(en.status, 200); assert.match(en.text, /<html lang="en" dir="ltr">/);
    }
  });

  it('active page shows ONLY display name, phone, Call and WhatsApp', async () => {
    const r = (await get(`${BASE_PATH}/q/${C.active}/`)).text;
    assert.match(r, /Test M\./);
    assert.match(r, /\+20 100 000 0001/);
    assert.match(r, /href="tel:\+201000000001"/);
    assert.match(r, /href="https:\/\/wa\.me\/201000000001"/);
    assert.match(r, /اتصال/); assert.match(r, /واتساب/);
    const main = /<main[\s\S]*<\/main>/.exec(r)[0];
    const links = [...main.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(links, ['tel:+201000000001', 'https://wa.me/201000000001'], 'no other links/actions in the page body');
    for (const w of ['Toyota', 'model', 'plate', 'vehicle', 'سيارة', 'لوحة', '<img', 'photo']) assert.ok(!main.toLowerCase().includes(w.toLowerCase()), `unexpected content: ${w}`);
  });

  it('page <title> and description never contain the name or number', async () => {
    const r = (await get(`${BASE_PATH}/q/${C.active}/en/`)).text;
    const head = /<head>[\s\S]*<\/head>/.exec(r)[0];
    assert.ok(!head.includes('Test M.') && !head.includes('1000000001'));
    assert.match(head, /noindex, nofollow, noarchive/);
    assert.match(head, /<meta name="referrer" content="no-referrer">/);
  });

  it('each page shows only its own person', async () => {
    const a = (await get(`${BASE_PATH}/q/${C.active}/`)).text;
    const b = (await get(`${BASE_PATH}/q/${C.arabic}/en/`)).text;
    assert.ok(!a.includes('تجربة') && !a.includes('1150000002'));
    assert.match(b, /تجربة ع\./); assert.match(b, /wa\.me\/201150000002/); assert.ok(!b.includes('Test M.'));
  });

  it('hidden and retired codes publish NO name and NO phone', async () => {
    for (const code of [C.hidden, C.retired]) {
      for (const p of [`/q/${code}/`, `/q/${code}/en/`]) {
        const r = await get(BASE_PATH + p);
        assert.equal(r.status, 200);
        assert.ok(!r.text.includes('Hidden') && !r.text.includes('1200000003') && !/tel:\+20|wa\.me/.test(r.text), `${p} leaked`);
        assert.match(r.text, /غير مفعّل|isn.t active/);
      }
    }
  });

  it('a phone number appears only on its own active page', () => {
    for (const f of listFiles(out).filter((x) => x.endsWith('.html'))) {
      const t = fs.readFileSync(f, 'utf8');
      assert.ok(!t.includes('1200000003'), `hidden number in ${f}`);
      if (t.includes('1000000001')) assert.ok(f.includes(C.active), `number outside its page: ${f}`);
    }
  });

  it('escapes all text (no HTML injection) — via a name that is refused by validation anyway', () => {
    const { esc } = require('../tools/lib/render');
    assert.equal(esc('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  });

  it('invalid codes and unknown paths return the bilingual 404 page', async () => {
    for (const p of ['/q/ZZZZZZZZZZ/', '/q/not-a-code', '/q/', '/something']) {
      const r = await get(BASE_PATH + p);
      assert.equal(r.status, 404, p);
      assert.match(r.text, /كود غير معروف/); assert.match(r.text, /Code not recognised/);
    }
  });

  it('home page and 404 never list codes or people', () => {
    const t = fs.readFileSync(path.join(out, 'index.html'), 'utf8') + fs.readFileSync(path.join(out, '404.html'), 'utf8');
    for (const code of Object.values(C)) assert.ok(!t.includes(code));
    assert.ok(!t.includes('Test M.'));
  });
});

describe('Browser (headless Chrome)', () => {
  let browser;
  before(async () => { browser = await require('puppeteer-core').launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); });
  after(async () => { await browser.close(); });
  const open = async (p) => {
    const page = await browser.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/q/')) errs.push(`${r.status()} ${r.url()}`); });
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${port}${p}`, { waitUntil: 'networkidle0' });
    return { page, errs };
  };
  it('lower-case codes are corrected and redirected', async () => {
    const { page } = await open(`${BASE_PATH}/q/a1b2c3d4e5/`);
    await page.waitForFunction(() => location.pathname.includes('A1B2C3D4E5'), { timeout: 5000 });
    assert.match(await page.content(), /Test M\./);
    await page.close();
  });
  it('no horizontal overflow at 390 px, all assets load, brand fonts applied', async () => {
    for (const p of [`/q/${C.active}/`, `/q/${C.active}/en/`, `/q/${C.arabic}/`, `/q/${C.hidden}/`, '/', '/en/', '/q/ZZZZZZZZZZ/']) {
      const { page, errs } = await open(BASE_PATH + p);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, font: getComputedStyle(document.body).fontFamily }));
      assert.ok(m.sw <= m.vw, `${p} overflows`); assert.deepEqual(errs, [], p); assert.match(m.font, /Alexandria|Manrope/);
      await page.close();
    }
  });
});

describe('Validation', () => {
  const errorsFor = (records) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lamma-val-')); makeRepo(d, records); return validate(d, { quiet: true }).errors.join('\n'); };
  const ok = { status: 'active', name: 'Test', phone: '01000000009', consent_confirmed: true, consent_date: '2026-11-01' };
  it('accepts a valid record', () => assert.equal(errorsFor({ AAAAAAAAAA: ok }), ''));
  it('rejects unknown fields (e.g. vehicle or private data)', () => {
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, make: 'X' } }), /field "make" is not allowed/);
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, national_id: '1' } }), /field "national_id" is not allowed/);
  });
  it('requires consent (true, not "true") and a valid past date for active and hidden', () => {
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, consent_confirmed: false } }), /consent_confirmed/);
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, status: 'hidden', consent_confirmed: 'true' } }), /without quotes/);
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, consent_date: '07/11/2026' } }), /consent_date/);
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, consent_date: '2999-01-01' } }), /future/);
  });
  it('rejects landlines and full names', () => {
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, phone: '0223456789' } }), /MOBILE/);
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, name: 'Test Person Full' } }), /display name/);
  });
  it('retired records must have name and phone erased', () => {
    assert.match(errorsFor({ AAAAAAAAAA: { ...ok, status: 'retired' } }), /retired, so "name" must be erased[\s\S]*"phone" must be erased/);
    assert.equal(errorsFor({ AAAAAAAAAA: { status: 'retired', name: '', phone: '' } }), '');
  });
  it('error messages never contain the submitted name or number', () => {
    const msg = errorsFor({ AAAAAAAAAA: { ...ok, name: 'Secret Person Name', phone: '0223456789' }, 'Secret.json': ok, BBBBBBBBBB: '{ "name": "Hidden Value" "phone": "01000000008" }' });
    for (const s of ['Secret', 'Person', '0223456789', '223456789', 'Hidden Value', '01000000008']) assert.ok(!msg.includes(s), `leaked "${s}"`);
    assert.match(msg, /file number 1/); assert.match(msg, /not valid JSON/);
  });
  it('the build refuses to publish invalid data', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lamma-bad-'));
    makeRepo(d, { AAAAAAAAAA: { ...ok, extra: 'x' } });
    assert.throws(() => build({ root: d, out: path.join(d, '_site'), env: {}, quiet: true }), /Validation failed/);
    assert.ok(!fs.existsSync(path.join(d, '_site')));
  });
  it('the repository\'s own records/ and site.json are valid', () => assert.deepEqual(validate(REPO, { quiet: true }).errors, []));
});

describe('Add record & Manage record', () => {
  const repo = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lamma-mgmt-')); makeRepo(d, {}); return d; };
  const read = (d, code) => JSON.parse(fs.readFileSync(path.join(d, 'records', code + '.json'), 'utf8'));

  it('add: unique codes, normalised phone, consent stored, only allowed fields', () => {
    const d = repo(); const codes = new Set();
    for (let i = 0; i < 20; i++) {
      const r = addRecord({ name: ' Test   M. ', phone: '٠١٠٠٠٠٠٠٠١٠', consent_confirmed: 'true', consent_date: '2026-11-07' }, { root: d, env: {} });
      assert.match(r.code, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/); codes.add(r.code);
      assert.equal(r.url, `${BASE_URL}/q/${r.code}`);
    }
    assert.equal(codes.size, 20);
    assert.deepEqual(read(d, [...codes][0]), { status: 'active', name: 'Test M.', phone: '+201000000010', consent_confirmed: true, consent_date: '2026-11-07' });
  });
  it('add: refuses without consent, with a landline or a full name — writes nothing, messages hold no values', () => {
    const d = repo();
    for (const bad of [{ name: 'Test', phone: '01000000011', consent_confirmed: false, consent_date: '2026-11-07' },
      { name: 'Test', phone: '0223456789', consent_confirmed: true, consent_date: '2026-11-07' },
      { name: 'Test Person Full', phone: '01000000011', consent_confirmed: true, consent_date: '2026-11-07' }]) {
      let err; try { addRecord(bad, { root: d, env: {} }); } catch (e) { err = e; }
      assert.ok(err && /NOT added/.test(err.message));
      const all = [err.message, ...err.errors].join(' ');
      assert.ok(!all.includes('0223456789') && !all.includes('01000000011') && !all.includes('Person Full'));
    }
    assert.deepEqual(fs.readdirSync(path.join(d, 'records')), []);
  });
  it('manage: hide → reactivate → update-details → retire (erases) → cannot reuse', () => {
    const d = repo();
    const { code } = addRecord({ name: 'Test', phone: '01000000012', consent_confirmed: true, consent_date: '2026-11-01' }, { root: d, env: {} });
    manageRecord({ code, action: 'hide' }, { root: d }); assert.equal(read(d, code).status, 'hidden');
    assert.throws(() => manageRecord({ code, action: 'hide' }, { root: d }), /not active/);
    manageRecord({ code: code.toLowerCase(), action: 'reactivate' }, { root: d }); assert.equal(read(d, code).status, 'active');
    assert.throws(() => manageRecord({ code, action: 'update-details', phone: '01100000013' }, { root: d }), /consent/);
    manageRecord({ code, action: 'update-details', phone: '01100000013', consent_confirmed: 'true', consent_date: '2026-11-05' }, { root: d });
    assert.equal(read(d, code).phone, '+201100000013'); assert.equal(read(d, code).name, 'Test'); assert.equal(read(d, code).consent_date, '2026-11-05');
    manageRecord({ code, action: 'retire' }, { root: d });
    assert.deepEqual(read(d, code), { status: 'retired', name: '', phone: '', consent_confirmed: false, consent_date: '' });
    assert.throws(() => manageRecord({ code, action: 'reactivate' }, { root: d }), /retired/);
    assert.throws(() => manageRecord({ code: 'ZZZZZZZZZZ', action: 'hide' }, { root: d }), /no record/);
  });
  it('GitHub Actions mode: form values come from the event file, are masked, and never printed in clear', () => {
    const d = repo();
    const ev = path.join(d, 'event.json');
    fs.writeFileSync(ev, JSON.stringify({ inputs: { name: 'Fictional Q.', phone: '01000000014', consent_confirmed: 'true', consent_date: '2026-11-07' } }));
    const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: ev, GITHUB_OUTPUT: path.join(d, 'out.txt'), GITHUB_STEP_SUMMARY: path.join(d, 'sum.md'), PAGES_BASE_URL: BASE_URL };
    // Run the CLI against a copy of the tool pointed at the temp repo
    const res = spawnSync(process.execPath, ['-e', `process.chdir(${JSON.stringify(d)}); const m=require(${JSON.stringify(path.join(REPO, 'tools/lib/inputs'))}); const i=m.readWorkflowInputs(); m.maskInLogs([i.name,i.phone]); const r=require(${JSON.stringify(path.join(REPO, 'tools/add-record'))}).addRecord(i,{root:${JSON.stringify(d)}}); console.log('code', r.code);`], { env, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    const clear = res.stdout.split('\n').filter((l) => !l.startsWith('::add-mask::')).join('\n');
    assert.ok(!clear.includes('Fictional') && !clear.includes('1000000014'));
    assert.match(res.stdout, /::add-mask::Fictional Q\./); assert.match(res.stdout, /::add-mask::\+201000000014/);
    const wf = fs.readFileSync(path.join(REPO, '.github/workflows/add-record.yml'), 'utf8') + fs.readFileSync(path.join(REPO, '.github/workflows/manage-record.yml'), 'utf8');
    assert.ok(!/inputs\.(name|phone|consent)/.test(wf), 'form values must not be passed through env:/run: in workflows');
  });
});

describe('Stickers', () => {
  let st;
  before(async () => { st = await stickers({ root: tmp, out: path.join(tmp, '_stickers'), env: {}, quiet: true }); });
  it('files per non-retired record; none for retired; contain no personal data', () => {
    for (const code of [C.active, C.arabic, C.hidden]) for (const f of ['1-proof.pdf', '2-print-cmyk.pdf', '3-print-white.pdf', '4-cut.pdf', 'qr.svg', 'qr.png']) assert.ok(fs.existsSync(path.join(st.out, code, `${code}-${f}`)), `${code} ${f}`);
    assert.ok(!fs.existsSync(path.join(st.out, C.retired)));
    for (const f of listFiles(st.out)) {
      const b = fs.readFileSync(f).toString('latin1');
      assert.ok(!b.includes('Test M.') && !b.includes('1000000001') && !b.includes('Hidden'), `personal data in ${f}`);
    }
  });
  it('the printed QR opens exactly its own contact page; the mirrored layer reads correctly from outside', async () => {
    const decode = async (pdf, flip) => {
      const png = path.join(tmp, 'dec'); execFileSync('pdftoppm', ['-r', '200', '-singlefile', '-png', pdf, png]);
      const { Jimp } = require('jimp'); const q = require('jsqr'); const jsQR = typeof q === 'function' ? q : q.default;
      const img = await Jimp.read(png + '.png'); if (flip) img.flip({ horizontal: true, vertical: false });
      const r = jsQR(new Uint8ClampedArray(img.bitmap.data), img.bitmap.width, img.bitmap.height); return r && r.data;
    };
    const url = await decode(path.join(st.out, C.active, `${C.active}-1-proof.pdf`), false);
    assert.equal(url, `${BASE_URL}/q/${C.active}`);
    assert.match((await follow(new URL(url).pathname)).text, /Test M\./);
    assert.equal(await decode(path.join(st.out, C.active, `${C.active}-2-print-cmyk.pdf`), true), `${BASE_URL}/q/${C.active}`);
  });
});
