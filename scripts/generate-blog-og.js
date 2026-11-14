#!/usr/bin/env node
/* Genera imágenes OpenGraph 1200x630 (Dark Gold) para artículos del blog principal:
 *   assets/images/og/blog/<slug>-es.png
 *   assets/images/og/blog/<slug>-en.png
 * Usa @resvg/resvg-js (binario precompilado).
 * Uso: node scripts/generate-blog-og.js <slug> [<slug> ...] | --all */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'images', 'og', 'blog');
const FONT = "'Segoe UI', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif";
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadResvg() {
  try {
    return require('@resvg/resvg-js').Resvg;
  } catch {
    return null;
  }
}

function layoutTitle(title) {
  for (const size of [66, 58, 50, 44]) {
    const maxChars = Math.floor(980 / (size * 0.58));
    const lines = [];
    let line = '';
    for (const word of String(title || '').split(/\s+/)) {
      if (!word) continue;
      if (!line) line = word;
      else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length <= 3 && lines.every((l) => l.length <= maxChars + 4)) return { size, lines };
  }
  const size = 44;
  const maxTotal = 3 * Math.floor(980 / (size * 0.58)) - 3;
  const lines = String(title || '').slice(0, maxTotal).match(/.{1,34}(\s|$)/g)?.slice(0, 3).map((l) => l.trim()) || [String(title || '').slice(0, 60)];
  lines[lines.length - 1] += '…';
  return { size, lines };
}

function pill(x, y, text, solid) {
  const w = 36 + text.length * 16;
  const fill = solid ? '#D4AF37' : 'rgba(212,175,55,0.12)';
  const color = solid ? '#0B0E12' : '#D4AF37';
  return `<rect x="${x - w}" y="${y}" width="${w}" height="48" rx="24" fill="${fill}" stroke="#D4AF37" stroke-opacity="0.75" stroke-width="2"/>`
    + `<text x="${x - w / 2}" y="${y + 32}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="2" fill="${color}">${esc(text)}</text>`;
}

function buildSvg({ title, tag, lang, date }) {
  const { size, lines } = layoutTitle(title);
  const top = Math.max(215, 305 - ((lines.length - 1) * size * 1.2) / 2 + size * 0.3);
  const tspans = lines.map((l, i) => `<tspan x="100" y="${Math.round(top + i * size * 1.2)}">${esc(l)}</tspan>`).join('');
  const langBadge = lang.toUpperCase();
  const tagText = String(tag || 'DATA-DRIVEN').toUpperCase().slice(0, 22);
  const langW = 36 + langBadge.length * 16;
  const badges = pill(1100, 76, langBadge, true) + pill(1100 - langW - 14, 76, tagText, false);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="85%" cy="-10%" r="70%">
      <stop offset="0" stop-color="#D4AF37" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#D4AF37" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F5D77F"/>
      <stop offset="1" stop-color="#D4AF37" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0B0E12"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="40" y="40" width="1120" height="550" rx="28" fill="#111827" fill-opacity="0.82" stroke="url(#edge)" stroke-width="2.5"/>
  <rect x="80" y="74" width="64" height="52" rx="12" fill="#D4AF37"/>
  <text x="112" y="111" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" fill="#0B0E12">JW</text>
  <text x="160" y="110" font-family="${FONT}" font-size="25" font-weight="700" letter-spacing="6" fill="#FFFFFF">SOLUTIONS</text>
  ${badges}
  <text font-family="${FONT}" font-size="${size}" font-weight="700" fill="#FFFFFF">${tspans}</text>
  <rect x="100" y="472" width="96" height="5" rx="2.5" fill="#D4AF37"/>
  <text x="100" y="520" font-family="${FONT}" font-size="26" font-weight="600" fill="#D4AF37">${lang === 'en' ? 'Data-Driven Strategy &amp; Automation' : 'Estrategia Data-Driven &amp; Automatización'}</text>
  <text x="100" y="560" font-family="${FONT}" font-size="21" fill="#9CA3AF">jw-solutions.com/blog  ·  ${esc(date || '')}</text>
</svg>`;
}

function generateOgForArticle(slug, article) {
  const Resvg = loadResvg();
  if (!Resvg) {
    console.warn(`AVISO: @resvg/resvg-js no instalado; se omite OG PNG para ${slug}`);
    return [];
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const generated = [];
  for (const lang of ['es', 'en']) {
    const block = article[lang];
    if (!block || !block.title) continue;
    const svgStr = buildSvg({ title: block.title, tag: article.tag, lang, date: article.date });
    const png = new Resvg(svgStr, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
    const outFile = path.join(OUT_DIR, `${slug}-${lang}.png`);
    fs.writeFileSync(outFile, png);
    generated.push(outFile);
  }
  return generated;
}

if (require.main === module) {
  const Resvg = loadResvg();
  if (!Resvg) {
    console.error('Falta @resvg/resvg-js: npm install --no-save --no-package-lock @resvg/resvg-js@2.6.2');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Uso: node scripts/generate-blog-og.js <slug> [...] | --all');
    process.exit(2);
  }
  const articlesDir = path.join(ROOT, 'content', 'articles');
  const slugs = args[0] === '--all'
    ? fs.readdirSync(articlesDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    : args;

  for (const slug of slugs) {
    const art = JSON.parse(fs.readFileSync(path.join(articlesDir, `${slug}.json`), 'utf8'));
    const files = generateOgForArticle(slug, art);
    files.forEach((f) => console.log(`OG OK  ${path.relative(ROOT, f)}`));
  }
}

module.exports = { generateOgForArticle };
