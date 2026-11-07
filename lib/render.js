'use strict';
// Static HTML templates. Every value is HTML-escaped.
// The contact page shows ONLY: display name, phone number, Call button, WhatsApp button
// (inside the Lamma Car page frame: logo, language switch, tagline, sticker code).
const I18N = require('./i18n');
const { displayCode } = require('./codes');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// +201001234567 → "+20 100 123 4567"
const phoneDisplay = (p) => { const m = /^\+20(\d{3})(\d{3})(\d{4})$/.exec(p || ''); return m ? `+20 ${m[1]} ${m[2]} ${m[3]}` : p; };
// WhatsApp click-to-chat link: international number, digits only, no "+"
const waLink = (p) => `https://wa.me/${String(p).replace(/\D/g, '')}`;

const ICON = {
  phone: '<path d="M5 3.5h3.5l1.5 4.5-2.2 1.6a12 12 0 0 0 6.6 6.6L16 14l4.5 1.5V19a2 2 0 0 1-2 2C10.4 21 3 13.6 3 5.5a2 2 0 0 1 2-2Z"/>',
  chat: '<path d="M4 20.5l1.2-3.6A8.5 8.5 0 1 1 8.4 19.6Z"/><path d="M9.2 8.6c.3 2.4 2 4.4 4.6 5.4l1.2-1.3 1.9.9-.4 1.6c-3.8.2-7.3-3.2-7.4-6.9l1.6-.4.9 1.9Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18.5 14h2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[n]}</svg>`;

/** Shared page frame. The <title> and description never contain personal data (link previews, history). */
function page({ base, lang, title, robots = 'noindex, nofollow, noarchive', altHref, body, extraHead = '' }) {
  const t = I18N[lang];
  const A = `${base}/assets`;
  return `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FDF6EC">
<meta name="robots" content="${robots}">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<meta name="description" content="${esc(t.meta_description)}">
<link rel="icon" type="image/png" href="${A}/brand/favicon-48.png">
<link rel="apple-touch-icon" href="${A}/brand/apple-touch-icon.png">
<link rel="preload" href="${A}/fonts/${lang === 'ar' ? 'alexandria-arabic-400-normal' : 'manrope-latin-400-normal'}.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${A}/css/base.css">
<link rel="stylesheet" href="${A}/css/site.css">
${extraHead}</head>
<body class="pub">
<header class="pub-top">
  <a href="${base}/${lang === 'en' ? 'en/' : ''}"><img src="${A}/brand/lamma-car-wordmark.png" alt="Lamma Car" width="119" height="34"></a>
  ${altHref ? `<a class="lang" href="${altHref}" lang="${t.other}" hreflang="${t.other}">${t.other_label}</a>` : ''}
</header>
<main class="pub-main">
${body}
</main>
<footer class="pub-foot">
  <img src="${A}/brand/lamma-mark.png" alt="" width="29" height="26">
  <div class="tag" lang="en" dir="ltr">Find it. Sell it. Easy.</div>
  <div>${esc(t.footer)}</div>
</footer>
</body>
</html>
`;
}

function supportButtons(site, t) {
  if (!site || (!site.support_phone && !site.support_email)) return '';
  return `<div class="support">${site.support_phone ? `<a class="btn" href="tel:${esc(site.support_phone)}">${icon('phone')} ${esc(t.contact_lamma)}</a>` : ''}${site.support_email ? `<a class="btn" href="mailto:${esc(site.support_email)}">${icon('mail')} ${esc(t.email_lamma)}</a>` : ''}</div>`;
}

/** Active record: display name, phone number, Call, WhatsApp. Nothing else from the record is used. */
function contactPage(rec, { base, lang }) {
  const t = I18N[lang];
  const self = `${base}/q/${rec.code}/`;
  const body = `<article class="ccard">
  <div class="ccard-head">
    <span class="ccard-ico">${icon('user')}</span>
    <p class="ccard-label">${esc(t.contact_label)}</p>
    <h1 dir="auto">${esc(rec.name)}</h1>
    <p class="ccard-phone ltr num">${esc(phoneDisplay(rec.phone))}</p>
  </div>
  <div class="ccard-actions">
    <a class="btn btn-primary btn-xl" href="tel:${esc(rec.phone)}" aria-label="${esc(t.call_aria)}">${icon('phone')} ${esc(t.call)}</a>
    <a class="btn btn-dark btn-xl" href="${esc(waLink(rec.phone))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t.whatsapp_aria)}">${icon('chat')} ${esc(t.whatsapp)}</a>
  </div>
</article>
<p class="code-ref ltr">Lamma Car · ${esc(displayCode(rec.code))}</p>`;
  return page({ base, lang, title: `${t.page_title} · Lamma Car`, altHref: lang === 'ar' ? `${self}en/` : self, body });
}

/** Hidden / retired: no name, no phone. */
function inactivePage(code, { base, lang, site }) {
  const t = I18N[lang];
  const self = `${base}/q/${code}/`;
  const body = `<article class="vcard state">
  <div class="ico">${icon('pause')}</div>
  <h1>${esc(t.inactive_title)}</h1>
  <p>${esc(t.inactive_text)}</p>
  ${supportButtons(site, t)}
</article>`;
  return page({ base, lang, title: `${t.inactive_title} · Lamma Car`, altHref: lang === 'ar' ? `${self}en/` : self, body });
}

function homePage({ base, lang }) {
  const t = I18N[lang];
  const body = `<section class="home-hero">
  <img src="${base}/assets/brand/lamma-car-logo.png" alt="Lamma Car — Find it. Sell it. Easy." width="1506" height="577">
  <p>${esc(t.home_intro)}</p>
</section>
<div class="steps">
  <div class="step"><i>1</i><div><b>${esc(t.step1_t)}</b><span>${esc(t.step1)}</span></div></div>
  <div class="step"><i>2</i><div><b>${esc(t.step2_t)}</b><span>${esc(t.step2)}</span></div></div>
  <div class="step"><i>3</i><div><b>${esc(t.step3_t)}</b><span>${esc(t.step3)}</span></div></div>
</div>`;
  return page({ base, lang, title: 'Lamma Car — Find it. Sell it. Easy.', robots: 'index, follow', altHref: lang === 'ar' ? `${base}/en/` : `${base}/`, body });
}

/** GitHub Pages serves this for ANY unknown address. Bilingual because the language is unknown. */
function notFoundPage({ base, site }) {
  const ar = I18N.ar; const en = I18N.en;
  const body = `<article class="vcard state">
  <div class="ico">${icon('qr')}</div>
  <h1>${esc(ar.invalid_title)}</h1>
  <p>${esc(ar.invalid_text)}</p>
  <hr class="sep">
  <h2 lang="en" dir="ltr">${esc(en.invalid_title)}</h2>
  <p lang="en" dir="ltr">${esc(en.invalid_text)}</p>
  ${supportButtons(site, ar)}
  <div class="support"><a class="btn" href="${base}/">${esc(ar.go_home)} · <span lang="en">Home</span></a></div>
</article>`;
  return page({ base, lang: 'ar', title: `${ar.invalid_title} · Lamma Car`, body, extraHead: `<script src="${base}/assets/js/not-found.js" data-base="${esc(base)}" defer></script>\n` });
}

module.exports = { contactPage, inactivePage, homePage, notFoundPage, esc, phoneDisplay, waLink };
