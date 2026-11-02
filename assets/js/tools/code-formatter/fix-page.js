// Páginas de soluciones (tools/code-formatter/fix/): el HTML estático ya trae el contenido en español (lo que ve el rastreador);
// aquí se localiza al idioma activo desde fix-data.json (generado por build_public.py) y se actualizan SEO y JSON-LD.
// Sin innerHTML: todo se construye con nodos de texto.
import { t, lang, SUPPORTED_LANGS, applyI18n, applySeo, setupLangSelector, MAX_CODE_BYTES } from './i18n.js';
import { initNewsletter } from './newsletter.js';

const SITE = 'https://jw-solutions.com';
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
};

/** CTA: lleva el código con error al formateador (sessionStorage + ?sample=1; el editor lo inserta como texto). */
function ctaButton(entry, root) {
  const a = el('a', { className: 'cf-btn cf-btn--primary cf-fix__cta', href: `${root}?lang=${lang}&sample=1`, textContent: t('fixCta') });
  a.addEventListener('click', () => {
    try { if (entry.before.length <= MAX_CODE_BYTES) sessionStorage.setItem('cf.sample', JSON.stringify({ lang: entry.language, code: entry.before })); } catch { /* sin almacenamiento */ }
  });
  return el('p', {}, a);
}

function jsonLd(slug, entry, loc, url, image) {
  const base = { inLanguage: lang, name: loc.title, description: loc.summary, url };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'TechArticle', headline: loc.title, description: loc.summary, inLanguage: lang, url, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, image,
        about: { '@type': 'Thing', name: entry.error }, datePublished: entry.published_at, dateModified: entry.published_at,
        author: { '@type': 'Organization', name: 'JW Solutions' }, publisher: { '@type': 'Organization', name: 'JW Solutions', url: SITE } },
      { '@type': 'HowTo', ...base, step: loc.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, name: text, text })) },
    ],
  };
}

function renderEntry(slug, data, root) {
  const entry = { ...data.errors[slug], published_at: data.published_at };
  const loc = entry.i18n[lang] || entry.i18n.es;
  const mainEl = document.getElementById('cf-main');
  const others = Object.entries(data.errors).filter(([s]) => s !== slug);
  document.getElementById('cf-fix-title').textContent = loc.title;
  document.getElementById('cf-fix-lead').textContent = loc.summary;
  document.title = `${loc.title} | Code Formatter & Auto-Doc AI`;
  document.getElementById('cf-fix-body').replaceChildren(
    el('div', { className: 'cf-fix__pair' },
      el('div', {}, el('p', { className: 'cf-fix__label cf-fix__label--bad', textContent: t('fixBefore') }), el('pre', { className: 'cf-tip__code' }, el('code', { textContent: entry.before }))),
      el('div', {}, el('p', { className: 'cf-fix__label cf-fix__label--good', textContent: t('fixAfter') }), el('pre', { className: 'cf-tip__code' }, el('code', { textContent: entry.after })))),
    el('h2', { className: 'cf-tip__h', textContent: t('fixSteps') }),
    el('ol', { className: 'cf-fix__steps' }, ...loc.steps.map((s) => el('li', { textContent: s }))),
    ctaButton(entry, root),
    el('h2', { className: 'cf-tip__h', textContent: t('fixOthers') }),
    el('ul', { className: 'cf-fix__list' }, ...others.map(([s, e]) => el('li', { className: 'cf-card' }, el('a', { href: `../${s}/?lang=${lang}`, textContent: (e.i18n[lang] || e.i18n.es).title })))),
  );
  mainEl.lang = lang;
  applySeo({ description: loc.summary });
  const url = document.querySelector('link[rel="canonical"]').href;
  document.getElementById('cf-jsonld')?.remove();
  document.head.append(el('script', { id: 'cf-jsonld', type: 'application/ld+json', textContent: JSON.stringify(jsonLd(slug, entry, loc, url, document.querySelector('meta[property="og:image"]')?.content)) }));
}

function renderHub(data) {
  document.getElementById('cf-fix-title').textContent = t('fixHubTitle');
  document.getElementById('cf-fix-lead').textContent = t('fixHubLead');
  document.title = `${t('fixHubTitle')} | Code Formatter & Auto-Doc AI`;
  document.getElementById('cf-fix-body').replaceChildren(
    el('ul', { className: 'cf-fix__list' }, ...Object.entries(data.errors).map(([s, e]) => {
      const loc = e.i18n[lang] || e.i18n.es;
      return el('li', { className: 'cf-card' }, el('a', { href: `${s}/?lang=${lang}` }, el('span', { className: 'cf-fix__chip', textContent: e.language }), el('br'), loc.title));
    })),
  );
  applySeo({ description: t('fixHubLead') });
}

async function main() {
  applyI18n();
  await setupLangSelector(document.getElementById('cf-ui-lang'));
  initNewsletter();
  const mainEl = document.getElementById('cf-main');
  try {
    const res = await fetch(mainEl.dataset.fixData, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const slug = mainEl.dataset.fixSlug;
    if (slug && data.errors[slug]) renderEntry(slug, data, mainEl.dataset.fixRoot);
    else if (!slug) renderHub(data);
  } catch (err) {
    console.warn('[code-formatter] soluciones no localizadas:', err.message); // queda el contenido estático en español
  }
}

main();
