#!/usr/bin/env node
/* Genera imágenes OpenGraph 1200x630 (Dark Glass Gold) para cada tip publicado × idioma con contenido real.
 *   assets/images/og/tips/<slug>-<lang>.png     (una por tip e idioma)
 *   assets/images/og/code-formatter-default.png (herramienta, soluciones /fix/ y respaldo)
 * Plantilla SVG → PNG con @resvg/resvg-js (binarios precompilados, sin compilar nada). Idempotente: og-manifest.json guarda el
 * hash de cada imagen y solo se regenera lo que cambia. Uso: node scripts/code-formatter/generate-og-images.js [--force] */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let Resvg;
try { ({ Resvg } = require('@resvg/resvg-js')); } catch {
  console.error('Falta @resvg/resvg-js: npm install --no-save --no-package-lock @resvg/resvg-js@2.6.2');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const OUT = path.join(ROOT, 'assets', 'images', 'og');
const TIPS_OUT = path.join(OUT, 'tips');
const STATE = path.join(TIPS_OUT, 'og-manifest.json');
const TEMPLATE_VERSION = 2; // súbelo al cambiar el diseño para regenerar todo
const FORCE = process.argv.includes('--force');

const LANG_BADGE = { python: 'PYTHON', javascript: 'JS', sql: 'SQL', dax: 'DAX' };
const FONT = "'Segoe UI', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Ajusta el título a ≤3 líneas reduciendo el cuerpo de letra si hace falta. */
function layoutTitle(title) {
  for (const size of [70, 62, 54, 46]) {
    const maxChars = Math.floor(1000 / (size * 0.6));
    const lines = [];
    let line = '';
    for (const word of title.split(/\s+/)) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length <= 3 && lines.every((l) => l.length <= maxChars + 4)) return { size, lines };
  }
  const size = 46;
  const lines = title.slice(0, 3 * Math.floor(1000 / (size * 0.6)) - 3).match(/.{1,34}(\s|$)/g).slice(0, 3).map((l) => l.trim());
  lines[lines.length - 1] += '…';
  return { size, lines };
}

function pill(x, y, text, solid) {
  const w = 34 + text.length * 17;
  const fill = solid ? '#fbb200' : 'rgba(251,178,0,0.10)';
  const color = solid ? '#000' : '#fbb200';
  return `<rect x="${x - w}" y="${y}" width="${w}" height="52" rx="26" fill="${fill}" stroke="#fbb200" stroke-opacity="0.7" stroke-width="2"/>`
    + `<text x="${x - w / 2}" y="${y + 35}" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="2" fill="${color}">${esc(text)}</text>`;
}

function svg({ title, kicker, langBadge, localeBadge }) {
  const { size, lines } = layoutTitle(title);
  const top = Math.max(215, 310 - ((lines.length - 1) * size * 1.18) / 2 + size * 0.3);
  const tspans = lines.map((l, i) => `<tspan x="100" y="${Math.round(top + i * size * 1.18)}">${esc(l)}</tspan>`).join('');
  const badges = (localeBadge ? pill(1100, 76, localeBadge, true) : '') + (langBadge ? pill(localeBadge ? 1100 - (34 + localeBadge.length * 17) - 14 : 1100, 76, langBadge, false) : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="85%" cy="-10%" r="70%"><stop offset="0" stop-color="#fbb200" stop-opacity="0.22"/><stop offset="1" stop-color="#fbb200" stop-opacity="0"/></radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#fbb200" stop-opacity="0.35"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0f17"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="40" y="40" width="1120" height="550" rx="28" fill="#111827" fill-opacity="0.78" stroke="url(#edge)" stroke-width="3"/>
  <text x="1090" y="560" text-anchor="end" font-family="'Consolas', 'DejaVu Sans Mono', monospace" font-size="210" font-weight="700" fill="#fbb200" fill-opacity="0.05">{ }</text>
  <rect x="80" y="76" width="64" height="52" rx="12" fill="#fbb200"/>
  <text x="112" y="113" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" fill="#000">JW</text>
  <text x="160" y="112" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="6" fill="#ffffff">SOLUTIONS</text>
  ${badges}
  <text font-family="${FONT}" font-size="${size}" font-weight="700" fill="#ffffff">${tspans}</text>
  <rect x="100" y="470" width="90" height="5" rx="2.5" fill="#fbb200"/>
  <text x="100" y="520" font-family="${FONT}" font-size="28" font-weight="600" fill="#fbb200">${esc(kicker)}</text>
  <text x="100" y="565" font-family="${FONT}" font-size="22" fill="#9ca3af">jw-solutions.com/tools/code-formatter</text>
</svg>`;
}

const render = (spec) => new Resvg(svg(spec), { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng();

function main() {
  fs.mkdirSync(TIPS_OUT, { recursive: true });
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const jobs = [{ file: path.join(OUT, 'code-formatter-default.png'), key: 'default', spec: { title: 'Code Formatter & Auto-Doc AI', kicker: 'Python · JavaScript · TypeScript · SQL · DAX · Java · C# · PHP · JSON · YAML', langBadge: '', localeBadge: '' } }];
  const tips = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).tips || [] : [];
  for (const tip of tips) {
    const variants = [['es', tip.title], ...Object.entries(tip.translations || {}).map(([l, v]) => [l, v.title])];
    for (const [locale, title] of variants) {
      jobs.push({
        file: path.join(TIPS_OUT, `${tip.slug}-${locale}.png`),
        key: `tips/${tip.slug}-${locale}`,
        spec: { title, kicker: 'Code Formatter & Auto-Doc AI', langBadge: LANG_BADGE[tip.language] || String(tip.language).toUpperCase(), localeBadge: locale.toUpperCase() },
      });
    }
  }

  let made = 0;
  let skipped = 0;
  const live = new Set();
  for (const job of jobs) {
    const hash = crypto.createHash('sha256').update(JSON.stringify([TEMPLATE_VERSION, job.spec])).digest('hex').slice(0, 16);
    live.add(job.key);
    if (!FORCE && state[job.key] === hash && fs.existsSync(job.file)) { skipped++; continue; }
    fs.writeFileSync(job.file, render(job.spec));
    state[job.key] = hash;
    made++;
  }
  for (const key of Object.keys(state)) if (!live.has(key)) delete state[key]; // tips retirados del manifiesto
  fs.writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`OG: ${made} generadas, ${skipped} sin cambios (${jobs.length} total)`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `og_generated=${made}\n`);
}

main();
