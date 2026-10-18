#!/usr/bin/env node
/* Motor de publicación semanal del blog (sin dependencias, Node >= 18).

   Toma los borradores con "status": "ready" de content/drafts/*.json, los valida, los mueve a
   content/articles/, genera blog/<slug>/index.html con la plantilla compartida, actualiza
   content/articles.json (aplicando el límite de destacados de content/config.json) y
   regenera sitemap.xml con la fecha de despliegue.

   Uso:
     node content/publish.js                 publica hasta --max borradores listos (por defecto 1)
     node content/publish.js --dry-run       valida y muestra qué haría, sin escribir nada
     node content/publish.js --check         solo verifica la consistencia del repositorio
     node content/publish.js --ping          además notifica el sitemap a Google (opcional)
     node content/publish.js --max=2 --date=2026-11-02

   Salida: código 0 si todo está bien (aunque no haya nada que publicar); distinto de 0 si algo falla.
   Si corre en GitHub Actions escribe "published" y "count" en $GITHUB_OUTPUT. */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, renderHtml } = require('./render-article');

const SITE = 'https://jw-solutions.com';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANGS = ['es', 'en'];

const abs = (...p) => path.join(ROOT, ...p);
const readText = (p) => fs.readFileSync(abs(p), 'utf8').replace(/\r\n/g, '\n');
const readJson = (p) => JSON.parse(readText(p));
const writeText = (p, s) => fs.writeFileSync(abs(p), s, 'utf8');
const writeJson = (p, o) => writeText(p, JSON.stringify(o, null, 2) + '\n');

/* ───────── argumentos ───────── */
function parseArgs(argv) {
  const o = { check: false, dryRun: false, ping: false, max: 1, date: new Date().toISOString().slice(0, 10) };
  argv.forEach((a) => {
    if (a === '--check') o.check = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--ping') o.ping = true;
    else if (a.startsWith('--max=')) o.max = parseInt(a.slice(6), 10);
    else if (a.startsWith('--date=')) o.date = a.slice(7);
    else throw new Error(`Argumento desconocido: ${a}`);
  });
  if (!Number.isInteger(o.max) || o.max < 1) throw new Error('--max debe ser un entero >= 1');
  if (!DATE_RE.test(o.date)) throw new Error('--date debe tener formato YYYY-MM-DD');
  return o;
}

/* ───────── validación ───────── */
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

function validateDraft(d, slug) {
  const errors = [];
  if (!SLUG_RE.test(slug)) errors.push(`slug inválido "${slug}" (usa minúsculas, números y guiones)`);
  if (!isStr(d.tag)) errors.push('falta "tag"');
  LANGS.forEach((l) => {
    const x = d[l];
    if (!x || typeof x !== 'object') { errors.push(`falta bloque "${l}"`); return; }
    ['title', 'description', 'excerpt'].forEach((k) => { if (!isStr(x[k])) errors.push(`${l}.${k} vacío o ausente`); });
    if (isStr(x.title) && x.title.length > 120) errors.push(`${l}.title supera 120 caracteres`);
    if (!Array.isArray(x.body) || x.body.length === 0) { errors.push(`${l}.body vacío o ausente`); return; }
    x.body.forEach((s, i) => {
      const where = `${l}.body[${i}]`;
      if (!s || typeof s !== 'object') { errors.push(`${where} no es un objeto`); return; }
      if (s.h !== undefined && !isStr(s.h)) errors.push(`${where}.h inválido`);
      ['p', 'ul', 'ol'].forEach((k) => { if (s[k] !== undefined && !isStrList(s[k])) errors.push(`${where}.${k} debe ser una lista de textos`); });
      if (!s.p && !s.ul && !s.ol) errors.push(`${where} no tiene contenido (p, ul u ol)`);
    });
  });
  return errors;
}

/* ───────── ciclo de vida ───────── */
function applyLifecycle(manifest, max) {
  const archived = [];
  const featured = manifest.articles
    .filter((a) => a.status === 'published' && a.featured)
    .sort((a, b) => b.date.localeCompare(a.date));
  featured.slice(max).forEach((a) => {
    a.status = 'archived';
    a.featured = false;
    archived.push(a.slug);
  });
  return archived;
}

/* ───────── sitemap ───────── */
function buildSitemap(manifest, homeLastmod) {
  const url = (loc, lastmod, freq, prio) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>`;
  const entries = [url(`${SITE}/`, homeLastmod, 'weekly', '1.0')];
  manifest.articles
    .filter((a) => a.status !== 'draft')
    .forEach((a) => entries.push(url(`${SITE}/blog/${a.slug}/`, a.date, a.status === 'archived' ? 'yearly' : 'monthly', a.status === 'archived' ? '0.5' : '0.7')));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function currentHomeLastmod(fallback) {
  try {
    const m = readText('sitemap.xml').match(/<loc>https:\/\/jw-solutions\.com\/<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/);
    return m ? m[1] : fallback;
  } catch (e) { return fallback; }
}

/* ───────── verificación del repositorio ───────── */
function checkRepo(opts) {
  const problems = [];
  const cfg = readJson('content/config.json');
  const manifest = readJson('content/articles.json');
  const template = readText('content/templates/article.template.html');
  const slugs = new Set();

  manifest.articles.forEach((a) => {
    if (slugs.has(a.slug)) problems.push(`slug duplicado en articles.json: ${a.slug}`);
    slugs.add(a.slug);
    if (!DATE_RE.test(a.date)) problems.push(`${a.slug}: fecha inválida`);
    const srcPath = `content/articles/${a.slug}.json`;
    const pagePath = `blog/${a.slug}/index.html`;
    if (!fs.existsSync(abs(srcPath))) { problems.push(`falta ${srcPath}`); return; }
    if (!fs.existsSync(abs(pagePath))) { problems.push(`falta ${pagePath}`); return; }
    const src = readJson(srcPath);
    const errs = validateDraft({ ...src, es: { ...src.es, excerpt: a.es.excerpt }, en: { ...src.en, excerpt: a.en.excerpt } }, a.slug);
    errs.forEach((e) => problems.push(`${a.slug}: ${e}`));
    if (errs.length) return;
    const html = readText(pagePath);
    if (/\{\{[A-Z_]+\}\}/.test(html)) problems.push(`${pagePath}: marcadores sin resolver`);
    if (!html.includes(`<link rel="canonical" href="${SITE}/blog/${a.slug}/">`)) problems.push(`${pagePath}: canonical incorrecto`);
    if (html !== renderHtml(a.slug, src, template).replace(/\r\n/g, '\n')) {
      problems.push(`${pagePath}: desactualizado respecto a la plantilla (ejecuta node content/render-article.js ${a.slug})`);
    }
  });

  const featured = manifest.articles.filter((a) => a.status === 'published' && a.featured).length;
  if (featured > cfg.featured.max) problems.push(`${featured} destacados > máximo ${cfg.featured.max}`);

  const expected = buildSitemap(manifest, currentHomeLastmod(opts.date));
  if (readText('sitemap.xml') !== expected) problems.push('sitemap.xml no coincide con articles.json');

  fs.readdirSync(abs('blog'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !slugs.has(e.name))
    .forEach((e) => problems.push(`blog/${e.name}/ no está registrado en articles.json`));

  return problems;
}

/* ───────── ping a Google (opcional) ───────── */
async function pingGoogle() {
  const url = `https://www.google.com/ping?sitemap=${encodeURIComponent(`${SITE}/sitemap.xml`)}`;
  try {
    const res = await fetch(url);
    if (res.ok) console.log(`PING OK (${res.status})`);
    else console.warn(`PING sin efecto (HTTP ${res.status}). Google retiró este endpoint en 2023: se rastrea el sitemap declarado en robots.txt y Search Console.`);
  } catch (e) {
    console.warn(`PING falló (${e.message}). No afecta a la publicación.`);
  }
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/* ───────── principal ───────── */
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.check) {
    const problems = checkRepo(opts);
    problems.forEach((p) => console.error(`ERROR  ${p}`));
    console.log(problems.length ? `CHECK FALLÓ: ${problems.length} problema(s)` : 'CHECK OK');
    process.exit(problems.length ? 1 : 0);
  }

  const cfg = readJson('content/config.json');
  const manifest = readJson('content/articles.json');
  const template = readText('content/templates/article.template.html');
  const draftsDir = abs(cfg.lifecycle.draftsDir);

  const ready = [];
  const files = fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir).filter((f) => f.endsWith('.json')).sort() : [];
  let invalid = 0;
  files.forEach((f) => {
    const slug = f.slice(0, -5);
    const draft = JSON.parse(fs.readFileSync(path.join(draftsDir, f), 'utf8'));
    if (draft.status !== 'ready') return;
    const errors = validateDraft(draft, slug);
    if (manifest.articles.some((a) => a.slug === slug) || fs.existsSync(abs('blog', slug))) errors.push(`el slug "${slug}" ya existe`);
    if (errors.length) {
      invalid++;
      errors.forEach((e) => console.error(`ERROR  borrador ${f}: ${e}`));
    } else {
      ready.push({ file: f, slug, draft });
    }
  });

  if (invalid) { console.error(`Hay ${invalid} borrador(es) inválido(s). No se publica nada.`); process.exit(1); }
  if (ready.length === 0) {
    console.log('Sin borradores listos (status "ready"). Nada que publicar.');
    setOutput('published', '');
    setOutput('count', '0');
    return;
  }

  const batch = ready.slice(0, opts.max);
  console.log(`${opts.dryRun ? 'DRY-RUN: ' : ''}Publicar ${batch.length} de ${ready.length} borrador(es) listo(s) con fecha ${opts.date}`);
  if (opts.dryRun) { batch.forEach((b) => console.log(`  - ${b.slug}`)); return; }

  const written = [];
  try {
    batch.forEach(({ file, slug, draft }) => {
      const article = {
        date: opts.date,
        tag: draft.tag,
        es: { title: draft.es.title, description: draft.es.description, body: draft.es.body },
        en: { title: draft.en.title, description: draft.en.description, body: draft.en.body }
      };
      const html = renderHtml(slug, article, template);
      writeJson(`content/articles/${slug}.json`, article);
      written.push(`content/articles/${slug}.json`);
      fs.mkdirSync(abs('blog', slug), { recursive: true });
      writeText(`blog/${slug}/index.html`, html);
      written.push(`blog/${slug}/index.html`);
      manifest.articles.push({
        slug, date: opts.date, tag: draft.tag, status: 'published', featured: true,
        es: { title: draft.es.title, excerpt: draft.es.excerpt },
        en: { title: draft.en.title, excerpt: draft.en.excerpt }
      });
      fs.unlinkSync(path.join(draftsDir, file));
      console.log(`OK  ${slug}`);
    });

    manifest.articles.sort((a, b) => b.date.localeCompare(a.date));
    const archived = applyLifecycle(manifest, cfg.featured.max);
    archived.forEach((s) => console.log(`ARCHIVADO  ${s} (límite de destacados: ${cfg.featured.max})`));
    writeJson('content/articles.json', manifest);
    writeText('sitemap.xml', buildSitemap(manifest, opts.date));
  } catch (e) {
    console.error(`Fallo durante la publicación: ${e.message}`);
    process.exit(1);
  }

  const problems = checkRepo(opts);
  if (problems.length) {
    problems.forEach((p) => console.error(`ERROR  ${p}`));
    console.error('La verificación posterior falló. NO confirmes estos cambios.');
    process.exit(1);
  }

  setOutput('published', batch.map((b) => b.slug).join(','));
  setOutput('count', String(batch.length));
  console.log('CHECK OK tras publicar');
  if (opts.ping) await pingGoogle();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
