// Páginas de tips por lenguaje (tools/code-formatter/tips/*). Lee el manifiesto de tips publicados
// y muestra el listado de la categoría o, con ?tip=<slug>, el artículo. Sin innerHTML: todo se
// construye con nodos de texto, así el contenido Markdown nunca se interpreta como HTML.
import { t, lang, SUPPORTED_LANGS, applyI18n, applySeo, setupLangSelector, intlLocale, MAX_CODE_BYTES } from './i18n.js';
import { initNewsletter } from './newsletter.js';

const CONTENT = '../../../../content/code-formatter-tips/';
const MANIFEST_URL = `${CONTENT}code-formatter-manifest.json`;

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
};

/* Inline mínimo: `código` y **negrita**. */
function inline(text) {
  const frag = document.createDocumentFragment();
  text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    if (part.startsWith('`')) frag.append(el('code', { textContent: part.slice(1, -1) }));
    else if (part.startsWith('**')) frag.append(el('strong', { textContent: part.slice(2, -2) }));
    else frag.append(part);
  });
  return frag;
}

/** CTA: lleva el fragmento al formateador (sessionStorage + ?sample=1; el editor lo inserta como texto). */
function tryItButton(lang, code) {
  const a = el('a', { className: 'cf-btn cf-btn--small cf-tip__cta', href: `../../?lang=${document.documentElement.lang}&sample=1`, textContent: t('tipTryIt') });
  a.addEventListener('click', () => { try { sessionStorage.setItem('cf.sample', JSON.stringify({ lang, code })); } catch { /* sin almacenamiento: abre el formateador vacío */ } });
  return el('p', {}, a);
}

/** Markdown → nodos DOM (encabezados, listas, bloques de código y párrafos). */
export function renderMarkdown(md) {
  const root = document.createDocumentFragment();
  const lines = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').split(/\r?\n/);
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) root.append(el('p', {}, inline(para.join(' ')))); para = []; };
  const flushList = () => { list = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      flushPara(); flushList();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      const text = code.join('\n');
      root.append(el('pre', { className: 'cf-tip__code' }, el('code', { textContent: text })));
      if (fence[1] && text.length <= MAX_CODE_BYTES) root.append(tryItButton(fence[1].toLowerCase(), text));
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { flushPara(); flushList(); root.append(el(h[1].length === 1 ? 'h2' : 'h3', { className: 'cf-tip__h' }, inline(h[2]))); continue; }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      flushPara();
      if (!list) { list = el('ul', { className: 'cf-tip__list' }); root.append(list); }
      list.append(el('li', {}, inline(li[1])));
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  return root;
}

const fmtDate = (iso) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Contenido localizado: <slug>.md = español (base); manifest.tips[].translations[locale] = { title, category, file }.
const FALLBACK_CHAIN = { 'pt-PT': ['pt-BR'], 'pt-BR': ['pt-PT'] }; // el portugués vecino antes que el inglés
const langName = (code) => { try { return new Intl.DisplayNames([lang], { type: 'language' }).of(code); } catch { return code; } };

/** Idiomas con contenido real del tip (los únicos que llevan hreflang). */
const availableLangs = (tip) => SUPPORTED_LANGS.filter((l) => l === 'es' || Boolean(tip.translations && tip.translations[l]));

/** Variante a mostrar: idioma activo → portugués vecino → inglés → español (base), con indicador de fallback. */
function variantFor(tip) {
  const have = availableLangs(tip);
  const locale = [lang, ...(FALLBACK_CHAIN[lang] || []), 'en', 'es'].find((l) => have.includes(l));
  const tr = locale === 'es' ? null : tip.translations[locale];
  return { locale, fallback: locale !== lang, title: tr ? tr.title : tip.title, category: tr ? tr.category : tip.category, file: tr ? tr.file : tip.file };
}

function tipMeta(tip, v) {
  return el('p', { className: 'cf-muted cf-tip__meta' }, `${t('tipsPublished', { date: fmtDate(tip.published_at) })} · ${v.category}`);
}

/** Primer párrafo del Markdown (sin frontmatter, encabezados ni código) para la meta description. */
function excerptOf(md) {
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/```[\s\S]*?```/g, '');
  const para = body.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !x.startsWith('#') && !/^[-*]\s/.test(x)) || '';
  return para.replace(/[`*]/g, '').replace(/\s+/g, ' ').slice(0, 300);
}

/** Datos estructurados Schema.org (TechArticle) del tip en el idioma mostrado. Es un bloque de datos, no código ejecutable. */
function injectJsonLd(tip, v, description) {
  const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: v.title,
    description,
    inLanguage: v.locale,
    articleSection: v.category,
    keywords: [tip.language, 'code formatter', 'syntax', 'best practices'].join(', '),
    datePublished: tip.published_at,
    dateModified: tip.published_at,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: 'JW Solutions' },
    publisher: { '@type': 'Organization', name: 'JW Solutions', url: 'https://jw-solutions.com' },
    image: 'https://jw-solutions.com/tools/code-formatter/apple-touch-icon.png',
  };
  document.getElementById('cf-jsonld')?.remove();
  document.head.append(el('script', { id: 'cf-jsonld', type: 'application/ld+json', textContent: JSON.stringify(data) }));
}

async function main() {
  applyI18n();
  await setupLangSelector(document.getElementById('cf-ui-lang'));
  initNewsletter();

  const page = document.getElementById('cf-main');
  const langs = page.dataset.tipsLangs.split(',');
  const titleEl = document.getElementById('cf-tips-title');
  titleEl.textContent = t(page.dataset.tipsTitle);
  document.getElementById('cf-tips-lead').textContent = t(page.dataset.tipsLead);
  document.title = `${t(page.dataset.tipsTitle)} | Code Formatter & Auto-Doc AI`;
  applySeo();

  const list = document.getElementById('cf-tips-list');
  const article = document.getElementById('cf-tip-article');
  try {
    const tips = (await fetchJson(MANIFEST_URL)).tips
      .filter((x) => langs.includes(x.language))
      .sort((a, b) => b.published_at.localeCompare(a.published_at));
    const slug = new URLSearchParams(location.search).get('tip');
    const current = slug && tips.find((x) => x.slug === slug); // el slug solo vale si está en el manifiesto

    if (current) {
      const v = variantFor(current);
      const md = await (await fetch(`${CONTENT}${v.file}`, { cache: 'no-cache' })).text();
      article.lang = v.locale;
      article.replaceChildren(
        el('h2', { className: 'cf-tip__title', textContent: v.title }),
        tipMeta(current, v),
        ...(v.fallback ? [el('p', { className: 'cf-muted cf-tip__note', lang, textContent: t('tipsFallback', { lang: langName(lang), shown: langName(v.locale) }) })] : []),
        renderMarkdown(md),
        el('p', {}, el('a', { href: `?lang=${lang}`, textContent: `← ${t('tipsBackList')}` }))
      );
      article.hidden = false;
      list.hidden = true;
      document.title = `${v.title} | Code Formatter & Auto-Doc AI`;
      const description = excerptOf(md);
      applySeo({ langs: availableLangs(current), contentLang: v.locale, description });
      injectJsonLd(current, v, description);
      return;
    }
    if (!tips.length) { list.replaceChildren(el('p', { className: 'cf-muted', textContent: t('tipsEmpty') })); return; }
    list.replaceChildren(...tips.map((tip) => {
      const v = variantFor(tip);
      const href = `?lang=${lang}&tip=${encodeURIComponent(tip.slug)}`;
      return el('article', { className: 'cf-card cf-tip-card', lang: v.locale },
        el('h2', { className: 'cf-tip__title' }, el('a', { href, textContent: v.title })),
        tipMeta(tip, v));
    }));
  } catch (err) {
    console.warn('[code-formatter] tips no cargados:', err.message);
    list.replaceChildren(el('p', { className: 'cf-form__status', dataset: { state: 'error' }, textContent: t('tipsLoadError') }));
  }
}

main();
