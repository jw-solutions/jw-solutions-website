#!/usr/bin/env node
/* Renderiza blog/<slug>/index.html desde content/articles/<slug>.json y la plantilla compartida.
   Uso:  node content/render-article.js <slug> [<slug> ...]
         node content/render-article.js --all
   También se usa como módulo desde content/publish.js. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
};

function formatDate(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  return lang === 'es' ? `${d} ${MONTHS.es[m - 1]} ${y}` : `${MONTHS.en[m - 1]} ${d}, ${y}`;
}

function renderBody(sections) {
  return sections.map((s) => {
    const out = [];
    if (s.h) out.push(`<h2>${esc(s.h)}</h2>`);
    (s.p || []).forEach((p) => out.push(`<p>${esc(p)}</p>`));
    if (s.ul) out.push(`<ul>${s.ul.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`);
    if (s.ol) out.push(`<ol>${s.ol.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>`);
    return out.map((l) => `                ${l}`).join('\n');
  }).join('\n');
}

function renderHtml(slug, a, template) {
  const map = {
    SLUG: slug,
    DATE: a.date,
    DATE_ES: formatDate(a.date, 'es'),
    DATE_EN: formatDate(a.date, 'en'),
    TAG: esc(a.tag),
    TITLE_ES: esc(a.es.title),
    TITLE_EN: esc(a.en.title),
    TITLE_ES_URL: encodeURIComponent(a.es.title),
    DESC_ES: esc(a.es.description),
    DESC_EN: esc(a.en.description),
    BODY_ES: renderBody(a.es.body),
    BODY_EN: renderBody(a.en.body)
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in map)) throw new Error(`Marcador desconocido: ${k}`);
    return map[k];
  });
}

function render(slug, template) {
  const a = JSON.parse(read(`content/articles/${slug}.json`));
  const html = renderHtml(slug, a, template);
  const outDir = path.join(ROOT, 'blog', slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  console.log(`OK  blog/${slug}/index.html`);
}

function checkFeaturedLimit() {
  const cfg = JSON.parse(read('content/config.json'));
  const manifest = JSON.parse(read('content/articles.json'));
  const featured = manifest.articles.filter((x) => x.status === 'published' && x.featured);
  if (featured.length > cfg.featured.max) {
    console.warn(`AVISO: ${featured.length} destacados > máximo ${cfg.featured.max}. Archiva el más antiguo.`);
    process.exitCode = 1;
  }
}

module.exports = { ROOT, renderHtml, render, formatDate };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Uso: node content/render-article.js <slug> [...] | --all');
    process.exit(2);
  }
  const template = read('content/templates/article.template.html');
  const slugs = args[0] === '--all'
    ? fs.readdirSync(path.join(ROOT, 'content', 'articles')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    : args;
  slugs.forEach((s) => render(s, template));
  checkFeaturedLimit();
}
