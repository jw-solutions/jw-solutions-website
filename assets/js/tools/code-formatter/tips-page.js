// Páginas de tips por lenguaje (tools/code-formatter/tips/*). Lee el manifiesto de tips publicados
// y muestra el listado de la categoría o, con ?tip=<slug>, el artículo. Sin innerHTML: todo se
// construye con nodos de texto, así el contenido Markdown nunca se interpreta como HTML.
import { t, applyI18n, setupLangSelector, intlLocale } from './i18n.js';
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
      root.append(el('pre', { className: 'cf-tip__code' }, el('code', { textContent: code.join('\n') })));
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

function tipMeta(tip) {
  return el('p', { className: 'cf-muted cf-tip__meta' }, `${t('tipsPublished', { date: fmtDate(tip.published_at) })} · ${tip.category}`);
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

  const list = document.getElementById('cf-tips-list');
  const article = document.getElementById('cf-tip-article');
  try {
    const tips = (await fetchJson(MANIFEST_URL)).tips
      .filter((x) => langs.includes(x.language))
      .sort((a, b) => b.published_at.localeCompare(a.published_at));
    const slug = new URLSearchParams(location.search).get('tip');
    const current = slug && tips.find((x) => x.slug === slug); // el slug solo vale si está en el manifiesto

    if (current) {
      const md = await (await fetch(`${CONTENT}${current.file}`, { cache: 'no-cache' })).text();
      article.replaceChildren(
        el('h2', { className: 'cf-tip__title', textContent: current.title }),
        tipMeta(current),
        renderMarkdown(md),
        el('p', {}, el('a', { href: `?lang=${document.documentElement.lang}`, textContent: `← ${t('tipsBackList')}` }))
      );
      article.hidden = false;
      list.hidden = true;
      document.title = `${current.title} | Code Formatter & Auto-Doc AI`;
      return;
    }
    if (!tips.length) { list.replaceChildren(el('p', { className: 'cf-muted', textContent: t('tipsEmpty') })); return; }
    list.replaceChildren(...tips.map((tip) => {
      const href = `?lang=${document.documentElement.lang}&tip=${encodeURIComponent(tip.slug)}`;
      return el('article', { className: 'cf-card cf-tip-card' },
        el('h2', { className: 'cf-tip__title' }, el('a', { href, textContent: tip.title })),
        tipMeta(tip));
    }));
  } catch (err) {
    console.warn('[code-formatter] tips no cargados:', err.message);
    list.replaceChildren(el('p', { className: 'cf-form__status', dataset: { state: 'error' }, textContent: t('tipsLoadError') }));
  }
}

main();
