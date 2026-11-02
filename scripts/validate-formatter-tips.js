#!/usr/bin/env node
/* Tips semanales de Code Formatter: validación y publicación (content/code-formatter-tips/).
   Independiente del blog principal (content/drafts, publication-manifest.json).
   Única dependencia: gray-matter.

   Uso:
     node scripts/validate-formatter-tips.js                 valida borradores, publicados y manifiesto
     node scripts/validate-formatter-tips.js --require-ready además falla si no hay ningún tip "ready"
     node scripts/validate-formatter-tips.js --publish       mueve a published/ el tip "ready" más antiguo
     node scripts/validate-formatter-tips.js --publish --dry-run   muestra qué se publicaría, sin escribir
     node scripts/validate-formatter-tips.js --publish --force     ignora el límite de un tip por semana ISO

   Reglas:
     - Frontmatter obligatorio: title, slug, date (AAAA-MM-DD), language, author, category, status.
     - slug = nombre del archivo, formato kebab-case; language ∈ python|javascript|sql|dax.
     - status en drafts/: draft | ready. En published/: published.
     - Idempotencia: un slug presente en el manifiesto o en published/ nunca se republica.
     - Un solo tip por semana ISO (UTC), salvo --force.
   Escribe en $GITHUB_OUTPUT: valid, ready_count, draft_count, published, slug, count. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let matter;
try {
  matter = require('gray-matter');
} catch (e) {
  console.error('Falta la dependencia gray-matter (npm install gray-matter).');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'content', 'code-formatter-tips');
const DRAFTS_DIR = path.join(BASE, 'drafts');
const PUBLISHED_DIR = path.join(BASE, 'published');
const MANIFEST = path.join(BASE, 'code-formatter-manifest.json');

const REQUIRED = ['title', 'slug', 'date', 'language', 'author', 'category', 'status'];
const LANGUAGES = ['python', 'javascript', 'sql', 'dax'];
const DRAFT_STATUSES = ['draft', 'ready'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const log = (level, msg) => console.log(`[${new Date().toISOString()}][FORMATTER-TIPS][${level}] ${msg}`);
const setOutput = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

/* gray-matter/js-yaml convierte fechas sin comillas en Date; se normaliza a texto AAAA-MM-DD. */
const asText = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

function isoWeek(dateStr) {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { version: 1, tips: [] };
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function saveManifest(m) {
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, MANIFEST);
}

function listMd(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
}

/* Valida un archivo; devuelve { errors, data, content }. */
function validateFile(dir, file, allowedStatuses) {
  const errors = [];
  let parsed;
  try {
    parsed = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    return { errors: [`Frontmatter ilegible (${e.message})`], data: {}, content: '' };
  }
  const data = { ...parsed.data, date: asText(parsed.data.date) };
  REQUIRED.forEach((k) => {
    if (data[k] === undefined || data[k] === null || String(data[k]).trim() === '') errors.push(`falta el campo "${k}"`);
  });
  const slug = file.slice(0, -3);
  if (data.slug && data.slug !== slug) errors.push(`slug "${data.slug}" no coincide con el nombre del archivo "${slug}"`);
  if (!SLUG_RE.test(slug)) errors.push(`slug inválido "${slug}"`);
  if (data.date && (!DATE_RE.test(data.date) || Number.isNaN(Date.parse(data.date)))) errors.push(`date inválida "${data.date}" (AAAA-MM-DD)`);
  if (data.language && !LANGUAGES.includes(data.language)) errors.push(`language "${data.language}" no soportado (${LANGUAGES.join(', ')})`);
  if (data.status && !allowedStatuses.includes(data.status)) errors.push(`status "${data.status}" inválido aquí (${allowedStatuses.join(' | ')})`);
  if (data.status === 'ready' && parsed.content.trim().length < 50) errors.push('un tip "ready" necesita cuerpo de contenido');
  return { errors, data, content: parsed.content };
}

function validateAll(requireReady) {
  const errors = [];
  const manifest = loadManifest();
  const slugsInManifest = new Set(manifest.tips.map((t) => t.slug));
  const publishedFiles = listMd(PUBLISHED_DIR);
  const drafts = [];

  if (!fs.existsSync(DRAFTS_DIR)) errors.push(`Directorio inexistente: ${DRAFTS_DIR}`);
  if (slugsInManifest.size !== manifest.tips.length) errors.push('manifiesto: slugs duplicados');

  listMd(DRAFTS_DIR).forEach((f) => {
    const r = validateFile(DRAFTS_DIR, f, DRAFT_STATUSES);
    const slug = f.slice(0, -3);
    r.errors.forEach((e) => errors.push(`drafts/${f}: ${e}`));
    if (slugsInManifest.has(slug) || publishedFiles.includes(f)) errors.push(`drafts/${f}: el slug "${slug}" ya está publicado`);
    log('INFO', `drafts/${f}: ${r.data.status || '?'}`);
    drafts.push({ file: f, slug, ...r });
  });

  publishedFiles.forEach((f) => {
    const r = validateFile(PUBLISHED_DIR, f, ['published']);
    r.errors.forEach((e) => errors.push(`published/${f}: ${e}`));
    if (!slugsInManifest.has(f.slice(0, -3))) errors.push(`published/${f}: sin entrada en el manifiesto`);
  });
  manifest.tips.forEach((t) => {
    if (!publishedFiles.includes(`${t.slug}.md`)) errors.push(`manifiesto: "${t.slug}" no tiene archivo en published/`);
  });

  const ready = drafts.filter((d) => d.data.status === 'ready' && d.errors.length === 0);
  if (requireReady && ready.length === 0) errors.push('No hay ningún tip "ready" para publicar.');
  return { errors, drafts, ready, manifest };
}

function publish({ ready, manifest }, { dryRun, force }) {
  if (ready.length === 0) {
    log('INFO', 'Nada que publicar (sin tips "ready").');
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!force) {
    const week = isoWeek(today);
    const dup = manifest.tips.find((t) => isoWeek(t.published_at) === week);
    if (dup) {
      log('INFO', `Ya se publicó "${dup.slug}" en la semana ${week}; se omite (usa --force para ignorar).`);
      return null;
    }
  }
  const pick = [...ready].sort((a, b) => a.data.date.localeCompare(b.data.date) || a.slug.localeCompare(b.slug))[0];
  if (dryRun) {
    log('INFO', `[dry-run] Se publicaría "${pick.slug}" (${pick.data.language}, ${pick.data.date}).`);
    return { slug: pick.slug, dryRun: true };
  }

  const src = path.join(DRAFTS_DIR, pick.file);
  const dest = path.join(PUBLISHED_DIR, pick.file);
  if (fs.existsSync(dest)) throw new Error(`published/${pick.file} ya existe; abortado para no sobrescribir.`);
  fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
  const out = matter.stringify(pick.content, { ...pick.data, status: 'published', published_at: today });
  fs.writeFileSync(dest, out, 'utf8');
  manifest.tips.push({
    slug: pick.slug,
    title: pick.data.title,
    language: pick.data.language,
    category: pick.data.category,
    date: pick.data.date,
    published_at: today,
    file: `published/${pick.file}`,
    sha256: crypto.createHash('sha256').update(out).digest('hex')
  });
  saveManifest(manifest);
  fs.unlinkSync(src);
  log('SUCCESS', `Publicado "${pick.slug}" → published/${pick.file}`);
  return { slug: pick.slug, dryRun: false };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const res = validateAll(args.includes('--require-ready'));
  res.errors.forEach((e) => log('ERROR', e));
  setOutput('valid', res.errors.length === 0);
  setOutput('draft_count', res.drafts.length);
  setOutput('ready_count', res.ready.length);
  setOutput('published', '');
  setOutput('count', 0);
  if (res.errors.length) {
    log('FAILED', `${res.errors.length} error(es).`);
    process.exit(1);
  }
  if (args.includes('--publish')) {
    const r = publish(res, { dryRun: args.includes('--dry-run'), force: args.includes('--force') });
    if (r && !r.dryRun) {
      setOutput('published', r.slug);
      setOutput('slug', r.slug);
      setOutput('count', 1);
    }
  }
  log('SUCCESS', `${res.drafts.length} borrador(es), ${res.ready.length} listo(s).`);
}

module.exports = { validateAll, publish, isoWeek };
