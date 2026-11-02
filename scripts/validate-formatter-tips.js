#!/usr/bin/env node
/* Tips semanales de Code Formatter: validación y publicación (content/code-formatter-tips/).
   Independiente del blog principal (content/drafts, publication-manifest.json).
   Única dependencia: gray-matter.

   Uso:
     node scripts/validate-formatter-tips.js                 valida borradores, publicados y manifiesto
     node scripts/validate-formatter-tips.js --require-ready además falla si no hay ningún tip "ready"
     node scripts/validate-formatter-tips.js --publish       mueve a published/ el tip "ready" más antiguo (+ traducciones listas)
     node scripts/validate-formatter-tips.js --publish --dry-run   muestra qué se publicaría, sin escribir
     node scripts/validate-formatter-tips.js --publish --force     ignora el límite de un tip por semana ISO

   Reglas:
     - Frontmatter obligatorio: title, slug, date (AAAA-MM-DD), language, author, category, status.
     - slug = nombre del archivo, formato kebab-case; language ∈ python|javascript|sql|dax.
     - status en drafts/: draft | ready. En published/: published.
     - Idempotencia: un slug presente en el manifiesto o en published/ nunca se republica.
     - Un solo tip por semana ISO (UTC), salvo --force.
   Traducciones:
     - <slug>.md es la versión base (español). <slug>.<locale>.md con locale ∈ en|pt-BR|pt-PT|fr|de|it es su traducción.
     - Frontmatter de una traducción: title, slug (= base), locale (= sufijo), category, status.
     - Una traducción "ready" en drafts/ cuyo tip base ya está publicado (o se publica a la vez) pasa a published/ y se
       registra en el manifiesto (tips[].translations[locale]). Se procesa en cada --publish, aunque no haya tip base listo
       ni se haya cumplido el límite semanal.
   Escribe en $GITHUB_OUTPUT: valid, ready_count, draft_count, published, slug, count, translations, changed, summary. */
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
const TR_REQUIRED = ['title', 'slug', 'locale', 'category', 'status'];
const LANGUAGES = ['python', 'javascript', 'sql', 'dax'];
const LOCALES = ['en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it']; // idiomas de traducción (es = archivo base)
const DRAFT_STATUSES = ['draft', 'ready'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TR_RE = new RegExp(`^(.+)\\.(${LOCALES.join('|')})\\.md$`);

const log = (level, msg) => console.log(`[${new Date().toISOString()}][FORMATTER-TIPS][${level}] ${msg}`);
const setOutput = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

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
const listBases = (dir) => listMd(dir).filter((f) => !TR_RE.test(f));
const listTranslations = (dir) => listMd(dir).filter((f) => TR_RE.test(f)).map((file) => {
  const [, slug, locale] = file.match(TR_RE);
  return { file, slug, locale };
});

/* Valida un archivo base; devuelve { errors, data, content }. */
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

/* Valida una traducción <slug>.<locale>.md; devuelve { errors, data, content }. */
function validateTranslation(dir, tr, allowedStatuses) {
  const errors = [];
  let parsed;
  try {
    parsed = matter(fs.readFileSync(path.join(dir, tr.file), 'utf8'));
  } catch (e) {
    return { errors: [`Frontmatter ilegible (${e.message})`], data: {}, content: '' };
  }
  const data = parsed.data;
  TR_REQUIRED.forEach((k) => {
    if (data[k] === undefined || data[k] === null || String(data[k]).trim() === '') errors.push(`falta el campo "${k}"`);
  });
  if (data.slug && data.slug !== tr.slug) errors.push(`slug "${data.slug}" no coincide con "${tr.slug}"`);
  if (data.locale && data.locale !== tr.locale) errors.push(`locale "${data.locale}" no coincide con el sufijo "${tr.locale}"`);
  if (data.status && !allowedStatuses.includes(data.status)) errors.push(`status "${data.status}" inválido aquí (${allowedStatuses.join(' | ')})`);
  if (parsed.content.trim().length < 50) errors.push('la traducción necesita cuerpo de contenido');
  return { errors, data, content: parsed.content };
}

function validateAll(requireReady) {
  const errors = [];
  const manifest = loadManifest();
  const slugsInManifest = new Set(manifest.tips.map((t) => t.slug));
  const publishedFiles = listBases(PUBLISHED_DIR);
  const drafts = [];

  if (!fs.existsSync(DRAFTS_DIR)) errors.push(`Directorio inexistente: ${DRAFTS_DIR}`);
  if (slugsInManifest.size !== manifest.tips.length) errors.push('manifiesto: slugs duplicados');

  listBases(DRAFTS_DIR).forEach((f) => {
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

  // Traducciones: pendientes en drafts/ y registradas en published/
  const draftSlugs = new Set(drafts.map((d) => d.slug));
  const trDrafts = listTranslations(DRAFTS_DIR).map((tr) => {
    const r = validateTranslation(DRAFTS_DIR, tr, DRAFT_STATUSES);
    r.errors.forEach((e) => errors.push(`drafts/${tr.file}: ${e}`));
    if (!draftSlugs.has(tr.slug) && !slugsInManifest.has(tr.slug)) errors.push(`drafts/${tr.file}: no existe el tip base "${tr.slug}"`);
    const entry = manifest.tips.find((x) => x.slug === tr.slug);
    if (entry && entry.translations && entry.translations[tr.locale]) errors.push(`drafts/${tr.file}: la traducción ya está publicada`);
    log('INFO', `drafts/${tr.file}: ${r.data.status || '?'}`);
    return { ...tr, ...r };
  });
  listTranslations(PUBLISHED_DIR).forEach((tr) => {
    const r = validateTranslation(PUBLISHED_DIR, tr, ['published']);
    r.errors.forEach((e) => errors.push(`published/${tr.file}: ${e}`));
    const entry = manifest.tips.find((x) => x.slug === tr.slug);
    if (!entry || !(entry.translations && entry.translations[tr.locale])) errors.push(`published/${tr.file}: sin entrada en el manifiesto`);
  });
  manifest.tips.forEach((t) => Object.keys(t.translations || {}).forEach((loc) => {
    if (!fs.existsSync(path.join(PUBLISHED_DIR, `${t.slug}.${loc}.md`))) errors.push(`manifiesto: "${t.slug}" (${loc}) no tiene archivo en published/`);
  }));

  const ready = drafts.filter((d) => d.data.status === 'ready' && d.errors.length === 0);
  const readyTranslations = trDrafts.filter((d) => d.data.status === 'ready' && d.errors.length === 0);
  if (requireReady && ready.length === 0) errors.push('No hay ningún tip "ready" para publicar.');
  return { errors, drafts, ready, readyTranslations, manifest };
}

/* Mueve una traducción lista de drafts/ a published/ y la registra en la entrada del manifiesto. */
function publishTranslation(tr, entry, today) {
  const dest = path.join(PUBLISHED_DIR, tr.file);
  if (fs.existsSync(dest)) throw new Error(`published/${tr.file} ya existe; abortado para no sobrescribir.`);
  fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
  const out = matter.stringify(tr.content, { ...tr.data, status: 'published', published_at: today });
  fs.writeFileSync(dest, out, 'utf8');
  entry.translations = entry.translations || {};
  entry.translations[tr.locale] = {
    title: tr.data.title,
    category: tr.data.category,
    file: `published/${tr.file}`,
    sha256: sha256(out)
  };
  fs.unlinkSync(path.join(DRAFTS_DIR, tr.file));
  log('SUCCESS', `Traducción publicada ${tr.slug} [${tr.locale}] → published/${tr.file}`);
}

function publish({ ready, readyTranslations, manifest }, { dryRun, force }) {
  const today = new Date().toISOString().slice(0, 10);
  let picked = null;
  if (ready.length === 0) {
    log('INFO', 'Nada que publicar (sin tips "ready").');
  } else {
    const week = isoWeek(today);
    const dup = !force && manifest.tips.find((t) => isoWeek(t.published_at) === week);
    if (dup) log('INFO', `Ya se publicó "${dup.slug}" en la semana ${week}; se omite (usa --force para ignorar).`);
    else picked = [...ready].sort((a, b) => a.data.date.localeCompare(b.data.date) || a.slug.localeCompare(b.slug))[0];
  }
  if (picked && dryRun) log('INFO', `[dry-run] Se publicaría "${picked.slug}" (${picked.data.language}, ${picked.data.date}).`);

  if (picked && !dryRun) {
    const dest = path.join(PUBLISHED_DIR, picked.file);
    if (fs.existsSync(dest)) throw new Error(`published/${picked.file} ya existe; abortado para no sobrescribir.`);
    fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
    const out = matter.stringify(picked.content, { ...picked.data, status: 'published', published_at: today });
    fs.writeFileSync(dest, out, 'utf8');
    manifest.tips.push({
      slug: picked.slug,
      title: picked.data.title,
      language: picked.data.language,
      category: picked.data.category,
      date: picked.data.date,
      published_at: today,
      file: `published/${picked.file}`,
      sha256: sha256(out)
    });
    fs.unlinkSync(path.join(DRAFTS_DIR, picked.file));
    log('SUCCESS', `Publicado "${picked.slug}" → published/${picked.file}`);
  }

  // Traducciones listas cuyo tip base está (o acaba de quedar) publicado
  const moved = [];
  readyTranslations.forEach((tr) => {
    const entry = manifest.tips.find((x) => x.slug === tr.slug);
    if (!entry) return; // el tip base sigue en drafts/: la traducción espera
    if (dryRun) { log('INFO', `[dry-run] Se publicaría la traducción ${tr.slug} [${tr.locale}].`); return; }
    publishTranslation(tr, entry, today);
    moved.push(`${tr.slug}.${tr.locale}`);
  });
  if (!dryRun && (picked || moved.length)) saveManifest(manifest);
  return { slug: picked && !dryRun ? picked.slug : null, translations: moved, dryRun };
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
  setOutput('translations', 0);
  setOutput('changed', false);
  setOutput('summary', '');
  if (res.errors.length) {
    log('FAILED', `${res.errors.length} error(es).`);
    process.exit(1);
  }
  if (args.includes('--publish')) {
    const r = publish(res, { dryRun: args.includes('--dry-run'), force: args.includes('--force') });
    if (!r.dryRun) {
      const parts = [r.slug, ...r.translations].filter(Boolean);
      setOutput('published', r.slug || '');
      setOutput('slug', r.slug || '');
      setOutput('count', r.slug ? 1 : 0);
      setOutput('translations', r.translations.length);
      setOutput('changed', parts.length > 0);
      setOutput('summary', parts.join(', '));
    }
  }
  log('SUCCESS', `${res.drafts.length} borrador(es), ${res.ready.length} listo(s).`);
}

module.exports = { validateAll, publish, isoWeek };
