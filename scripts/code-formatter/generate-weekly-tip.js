#!/usr/bin/env node
/* Generador automático bi-semanal de tips técnicos (7 idiomas) para Code Formatter & Auto-Doc AI.
   Node.js 22 nativo (cero dependencias externas).

   Uso:
     node scripts/code-formatter/generate-weekly-tip.js
     node scripts/code-formatter/generate-weekly-tip.js --slot=tuesday
     node scripts/code-formatter/generate-weekly-tip.js --slot=thursday --lang=sql
     node scripts/code-formatter/generate-weekly-tip.js --mock=ruta/al/mock.json */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TIPS_BASE = path.join(ROOT, 'content', 'code-formatter-tips');
const DRAFTS_DIR = path.join(TIPS_BASE, 'drafts');
const PUBLISHED_DIR = path.join(TIPS_BASE, 'published');
const MANIFEST_FILE = path.join(TIPS_BASE, 'code-formatter-manifest.json');
const FIXES_FILE = path.join(TIPS_BASE, 'syntax-fixes.json');
const SEO_OPPORTUNITIES_FILE = path.join(TIPS_BASE, 'seo-opportunities.json');

const ALL_LOCALES = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
const TUESDAY_LANGS = ['python', 'javascript', 'typescript', 'java', 'csharp', 'php'];
const THURSDAY_LANGS = ['sql', 'dax', 'json', 'yaml'];
const ALL_PROG_LANGS = [...TUESDAY_LANGS, ...THURSDAY_LANGS];

const LANG_STANDARDS = {
  python: 'PEP 8, Black, Ruff, type hints y docstrings Google/NumPy',
  javascript: 'Prettier, ESLint, ES2024+ y JSDoc estructurado',
  typescript: 'TypeScript estricto, Prettier, satisfies/narrowing y TSDoc',
  java: 'Google Java Style, Java 21+ records/pattern matching y Javadoc',
  csharp: 'C# 12+, .NET analyzers, EditorConfig y XML Documentation Comments',
  php: 'PSR-12, PHP 8.3+ typed properties/enums y PHPDoc',
  sql: 'SQLFluff, CTEs legibles, formateo de JOINs y comentarios de consulta',
  dax: 'DAX Formatter, variables VAR/RETURN, CALCULATE limpio y documentación de medidas',
  json: 'RFC 8259, esquemas JSON Schema, ordenación y validación estricta',
  yaml: 'YAML 1.2, indentación de 2 espacios sin tabuladores, anclas y comentarios claros'
};

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const RETRYABLE_STATUSES = new Set([404, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 180000;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_WORDS = 350;

const log = (level, msg) => console.log(`[${new Date().toISOString()}][CF-TIP-GEN][${level}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const opts = { slot: null, lang: null, mock: null };
  for (const arg of argv) {
    if (arg.startsWith('--slot=')) opts.slot = arg.slice(7).trim().toLowerCase();
    else if (arg.startsWith('--lang=')) opts.lang = arg.slice(7).trim().toLowerCase();
    else if (arg.startsWith('--mock=')) opts.mock = arg.slice(7).trim();
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

function hasReadyDraft(draftsDir = DRAFTS_DIR) {
  if (!fs.existsSync(draftsDir)) return null;
  const files = fs.readdirSync(draftsDir).filter((f) => f.endsWith('.md') || f.endsWith('.json')).sort();
  for (const file of files) {
    // Ignorar traducciones si existe un base listo, o detectar cualquiera con status: ready
    const raw = fs.readFileSync(path.join(draftsDir, file), 'utf8');
    if (file.endsWith('.json')) {
      try {
        const j = JSON.parse(raw);
        if (j && j.status === 'ready') return file;
      } catch { /* ignorar */ }
    } else {
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fm && /^\s*status:\s*['"]?ready['"]?\s*$/m.test(fm[1])) return file;
    }
  }
  return null;
}

function loadContext() {
  const manifest = fs.existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
    : { version: 1, tips: [] };
  const fixes = fs.existsSync(FIXES_FILE)
    ? JSON.parse(fs.readFileSync(FIXES_FILE, 'utf8')).errors || []
    : [];

  const slugs = new Set();
  const titles = [];
  const counts = Object.fromEntries(ALL_PROG_LANGS.map((l) => [l, 0]));

  for (const t of manifest.tips || []) {
    if (t.slug) slugs.add(t.slug);
    if (t.title) titles.push(t.title);
    const pl = t.programming_language || t.language;
    if (pl && counts[pl] !== undefined) counts[pl] += 1;
  }

  if (fs.existsSync(PUBLISHED_DIR)) {
    for (const f of fs.readdirSync(PUBLISHED_DIR)) {
      if (f.endsWith('.md') && !/\.(en|pt-BR|pt-PT|fr|de|it)\.md$/.test(f)) {
        slugs.add(f.slice(0, -3));
      }
    }
  }

  if (fs.existsSync(DRAFTS_DIR)) {
    for (const f of fs.readdirSync(DRAFTS_DIR)) {
      if (f.endsWith('.md')) slugs.add(f.split('.')[0]);
    }
  }

  return { slugs, titles, counts, fixes };
}

function detectSlot(explicitSlot) {
  if (explicitSlot === 'tuesday' || explicitSlot === 'thursday') return explicitSlot;
  const day = new Date().getUTCDay();
  return day === 4 ? 'thursday' : 'tuesday';
}

function selectLanguage({ slot, explicitLang, counts }) {
  if (explicitLang) {
    if (!ALL_PROG_LANGS.includes(explicitLang)) {
      throw new Error(`Lenguaje no soportado: ${explicitLang}. Válidos: ${ALL_PROG_LANGS.join(', ')}`);
    }
    return explicitLang;
  }
  const pool = slot === 'thursday' ? THURSDAY_LANGS : TUESDAY_LANGS;
  return [...pool].sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || pool.indexOf(a) - pool.indexOf(b))[0];
}

function loadPendingSeoOpportunity(seoFilePath = SEO_OPPORTUNITIES_FILE, explicitLang = null) {
  if (!seoFilePath || !fs.existsSync(seoFilePath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(seoFilePath, 'utf8'));
  } catch {
    return null;
  }
  const queries = Array.isArray(parsed && parsed.priorityQueries) ? parsed.priorityQueries : [];
  const pendingEntries = queries
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && item.status === 'pending' && String(item.query || '').trim());

  if (pendingEntries.length === 0) return null;
  if (explicitLang) {
    const match = pendingEntries.find(
      ({ item }) => String(item.language || '').toLowerCase() === explicitLang.toLowerCase()
    );
    if (match) return match;
  }
  return pendingEntries[0];
}

function markSeoOpportunityPublished(seoFilePath = SEO_OPPORTUNITIES_FILE, index, slug) {
  if (!seoFilePath || !fs.existsSync(seoFilePath) || index === null || index === undefined || index < 0) return false;
  const parsed = JSON.parse(fs.readFileSync(seoFilePath, 'utf8'));
  if (!Array.isArray(parsed.priorityQueries) || !parsed.priorityQueries[index]) return false;
  parsed.priorityQueries[index].status = 'published';
  parsed.priorityQueries[index].slug = slug;
  parsed.priorityQueries[index].publishedAt = new Date().toISOString();
  writeAtomic(seoFilePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function sanitizeSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

function buildPrompt({ progLang, slot, existingTitles, existingSlugs, fixes, seoOpportunity = null }) {
  const today = new Date().toISOString().slice(0, 10);
  const focus = slot === 'thursday'
    ? 'Datos, configuración y flujos de Auto-Documentación con IA (Auto-Doc AI)'
    : 'Lenguajes de aplicación, refactorización de código legado y estándares oficiales';
  const fixSlugs = fixes.map((f) => `${f.slug} (${f.language})`).join(', ');
  const excludedTitles = existingTitles.length ? existingTitles.map((t) => `- ${t}`).join('\n') : '- (ninguno)';
  const seoSection = seoOpportunity && seoOpportunity.query
    ? [
        ``,
        `CONSULTA SEO PRIORITARIA (Google Search Console / Bing Webmaster Tools):`,
        `- Query objetivo: "${seoOpportunity.query}" (idioma principal de búsqueda: ${seoOpportunity.lang || 'en'}).`,
        `- Orienta el título, los encabezados H2, la meta_description y los ejemplos Antes/Después para responder con máxima autoridad técnica a esta consulta.`
      ].join('\n')
    : '';

  return [
    `Eres el arquitecto de software y editor técnico principal de JW Solutions para el producto "Code Formatter & Auto-Doc AI".`,
    `Fecha objetivo: ${today}.`,
    `Lenguaje de programación asignado: ${progLang} (Estándares clave: ${LANG_STANDARDS[progLang]}).`,
    `Enfoque editorial de hoy: ${focus}.${seoSection}`,
    ``,
    `Títulos YA publicados (PROHIBIDO repetir tema, enfoque o título similar):`,
    excludedTitles,
    ``,
    `Slugs prohibidos (ya existen): ${Array.from(existingSlugs).join(', ') || 'ninguno'}.`,
    `Landings /fix/ disponibles para related_fix_slug: ${fixSlugs || 'python-indentation-error'}.`,
    ``,
    `Genera UN tip técnico práctico, profundo y accionable en los 7 idiomas oficiales (${ALL_LOCALES.join(', ')}).`,
    `Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:`,
    `{`,
    `  "slug": "kebab-case-unico-sin-acentos",`,
    `  "date": "${today}",`,
    `  "programming_language": "${progLang}",`,
    `  "category": "Tips de Sintaxis | Buenas prácticas | Auto-Doc AI",`,
    `  "related_fix_slug": "uno de los slugs de /fix/ arriba listados",`,
    `  "interactive_snippet": "fragmento de código limpio y funcional en ${progLang} (5 a 20 líneas) listo para probar en el editor",`,
    `  "locales": {`,
    `    "es": { "title": "...", "meta_description": "140-160 chars", "summary": "resumen ejecutivo 1-2 frases para newsletter", "body_markdown": "mínimo ${MIN_WORDS} palabras en Markdown con bloques Antes/Después y buenas prácticas de documentación", "faq": [{ "q": "Pregunta técnica frecuente 1", "a": "Respuesta clara y concisa 1" }, { "q": "Pregunta técnica frecuente 2", "a": "Respuesta clara y concisa 2" }] },`,
    `    "en": { "title": "...", "meta_description": "...", "summary": "...", "body_markdown": "...", "faq": [{ "q": "...", "a": "..." }, { "q": "...", "a": "..." }] },`,
    `    "pt-BR": { "title": "...", "meta_description": "...", "summary": "...", "body_markdown": "...", "faq": [{ "q": "...", "a": "..." }, { "q": "...", "a": "..." }] },`,
    `    "pt-PT": { "title": "...", "meta_description": "...", "summary": "...", "body_markdown": "...", "faq": [{ "q": "...", "a": "..." }, { "q": "...", "a": "..." }] },`,
    `    "fr": { "title": "...", "meta_description": "...", "summary": "...", "body_markdown": "...", "faq": [{ "q": "...", "a": "..." }, { "q": "...", "a": "..." }] },`,
    `    "de": { "title": "...", "meta_description": "...", "summary": "...", "body_markdown": "...", "faq": [{ "q": "...", "a": "..." }, { "q": "...", "a": "..." }] },`,
    `    "it": { "title": "...", "meta_description": "...", "summary": "...", "body_markdown": "...", "faq": [{ "q": "...", "a": "..." }, { "q": "...", "a": "..." }] }`,
    `  }`,
    `}`,
    ``,
    `Reglas estrictas:`,
    `1. Cada idioma en "locales" DEBE tener entre 420 y 550 palabras en "body_markdown" (OBLIGATORIO >= ${MIN_WORDS} palabras en TODOS los idiomas, incluidos pt-BR, pt-PT, fr, de, it) y entre 2 y 3 elementos en "faq" ({ "q", "a" }).`,
    `2. Usa Markdown estándar (## encabezados, listas -, bloques \`\`\`${progLang} ... \`\`\`) con un ejemplo claro "Antes" y "Después" y sección de Auto-Documentación.`,
    `3. NO incluyas frontmatter YAML dentro de "body_markdown". Escapa correctamente comillas dobles (\\") y saltos de línea (\\n) en el JSON.`,
    `4. "meta_description" debe tener entre 130 y 165 caracteres optimizados para CTR.`
  ].join('\n');
}

async function callGemini(apiKey, prompt, validator = null) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.65 }
  };

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const err = new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 220)}`);
          if (RETRYABLE_STATUSES.has(res.status)) {
            lastError = err;
            log('WARN', `${err.message} (intento ${attempt}/2)`);
            if (res.status === 404) break; // pasar al siguiente modelo
            if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));
            continue;
          }
          throw err;
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error(`Respuesta vacía de ${model}`);
        const parsed = parseJsonResilient(text);
        if (validator) validator(parsed);
        return parsed;
      } catch (err) {
        lastError = err;
        log('WARN', `Fallo con ${model} (${attempt}/2): ${err.message}`);
        if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));
      }
    }
  }
  throw lastError || new Error('Todos los modelos Gemini fallaron.');
}

function parseJsonResilient(text) {
  try {
    return JSON.parse(text);
  } catch {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (inStr && ch.charCodeAt(0) < 0x20) {
        if (ch === '\n') out += '\\n';
        else if (ch === '\r') continue;
        else if (ch === '\t') out += '\\t';
        continue;
      }
      out += ch;
    }
    return JSON.parse(out);
  }
}
function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function validateTipPayload(raw, { existingSlugs, validFixSlugs, expectedLang }) {
  if (!raw || typeof raw !== 'object') throw new Error('Payload raíz inválido.');
  const slug = sanitizeSlug(raw.slug);
  if (!SLUG_RE.test(slug)) throw new Error(`Slug inválido: "${raw.slug}"`);
  if (existingSlugs.has(slug)) throw new Error(`Slug ya existente: "${slug}"`);

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))
    ? raw.date
    : new Date().toISOString().slice(0, 10);

  const progLang = ALL_PROG_LANGS.includes(raw.programming_language)
    ? raw.programming_language
    : expectedLang;

  const relatedFix = validFixSlugs.has(raw.related_fix_slug)
    ? raw.related_fix_slug
    : (Array.from(validFixSlugs)[0] || '');

  const snippet = String(raw.interactive_snippet || '').trim();
  if (snippet.length < 10) throw new Error('interactive_snippet demasiado corto.');

  if (!raw.locales || typeof raw.locales !== 'object') throw new Error('Falta objeto locales.');
  for (const loc of ALL_LOCALES) {
    const entry = raw.locales[loc];
    if (!entry || typeof entry !== 'object') throw new Error(`Falta locale "${loc}".`);
    if (!String(entry.title || '').trim()) throw new Error(`Falta title en locale "${loc}".`);
    if (!String(entry.meta_description || '').trim()) throw new Error(`Falta meta_description en locale "${loc}".`);
    if (!String(entry.summary || '').trim()) throw new Error(`Falta summary en locale "${loc}".`);
    const wc = wordCount(entry.body_markdown);
    if (wc < MIN_WORDS) throw new Error(`Locale "${loc}" tiene ${wc} palabras (mínimo ${MIN_WORDS}).`);
    if (entry.faq !== undefined) {
      if (!Array.isArray(entry.faq) || entry.faq.length < 2) {
        throw new Error(`Locale "${loc}" tiene faq inválido (se esperan >=2 preguntas).`);
      }
      for (const item of entry.faq) {
        if (!item || !String(item.q || '').trim() || !String(item.a || '').trim()) {
          throw new Error(`Locale "${loc}" contiene pregunta/respuesta vacía en faq.`);
        }
      }
    }
  }

  return {
    slug,
    date,
    programming_language: progLang,
    category: String(raw.category || 'Tips de Sintaxis').trim(),
    related_fix_slug: relatedFix,
    interactive_snippet: snippet,
    locales: raw.locales
  };
}

function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function formatFrontmatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${k}: ${Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : JSON.stringify(String(v))}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function writeTipDrafts(tip, draftsDir = DRAFTS_DIR) {
  const written = [];
  const esLoc = tip.locales.es;
  const baseFm = formatFrontmatter({
    title: esLoc.title,
    slug: tip.slug,
    date: tip.date,
    language: tip.programming_language,
    author: 'JW Solutions',
    category: tip.category,
    meta_description: esLoc.meta_description,
    summary: esLoc.summary,
    related_fix_slug: tip.related_fix_slug,
    interactive_snippet: tip.interactive_snippet,
    ...(Array.isArray(esLoc.faq) && esLoc.faq.length ? { faq: esLoc.faq } : {}),
    status: 'ready'
  });
  const basePath = path.join(draftsDir, `${tip.slug}.md`);
  writeAtomic(basePath, `${baseFm}\n${esLoc.body_markdown.trim()}\n`);
  written.push(basePath);

  for (const loc of ALL_LOCALES.filter((l) => l !== 'es')) {
    const tr = tip.locales[loc];
    const trFm = formatFrontmatter({
      title: tr.title,
      slug: tip.slug,
      locale: loc,
      category: tip.category,
      meta_description: tr.meta_description,
      summary: tr.summary,
      ...(Array.isArray(tr.faq) && tr.faq.length ? { faq: tr.faq } : {}),
      status: 'ready'
    });
    const trPath = path.join(draftsDir, `${tip.slug}.${loc}.md`);
    writeAtomic(trPath, `${trFm}\n${tr.body_markdown.trim()}\n`);
    written.push(trPath);
  }
  return written;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const readyFile = hasReadyDraft();
  if (readyFile) {
    log('INFO', `Borrador manual "ready" detectado (${readyFile}); se cede prioridad y se omite llamada a IA.`);
    return;
  }

  const ctx = loadContext();
  const slot = detectSlot(opts.slot);
  const seoOpp = loadPendingSeoOpportunity(SEO_OPPORTUNITIES_FILE, opts.lang);
  const seoLang =
    seoOpp && seoOpp.item && seoOpp.item.language && ALL_PROG_LANGS.includes(String(seoOpp.item.language).toLowerCase())
      ? String(seoOpp.item.language).toLowerCase()
      : null;
  const progLang = opts.lang
    ? selectLanguage({ slot, explicitLang: opts.lang, counts: ctx.counts })
    : (seoLang || selectLanguage({ slot, explicitLang: null, counts: ctx.counts }));
  if (seoOpp) {
    log('INFO', `Prioridad SEO detectada: "${seoOpp.item.query}" (lang=${seoOpp.item.lang || 'en'}, lenguaje=${progLang})`);
  }
  log('INFO', `Slot=${slot}, lenguaje seleccionado=${progLang}`);

  const validFixSlugs = new Set(ctx.fixes.map((f) => f.slug));
  let rawTip;
  let validated;
  if (opts.mock) {
    rawTip = JSON.parse(fs.readFileSync(path.resolve(opts.mock), 'utf8'));
    validated = validateTipPayload(rawTip, {
      existingSlugs: ctx.slugs,
      validFixSlugs,
      expectedLang: progLang
    });
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      log('WARN', 'GEMINI_API_KEY no configurada; se omite generación automática (fallback manual).');
      return;
    }
    const prompt = buildPrompt({
      progLang,
      slot,
      existingTitles: ctx.titles,
      existingSlugs: ctx.slugs,
      fixes: ctx.fixes,
      seoOpportunity: seoOpp ? seoOpp.item : null
    });
    rawTip = await callGemini(apiKey, prompt, (candidate) => {
      validated = validateTipPayload(candidate, {
        existingSlugs: ctx.slugs,
        validFixSlugs,
        expectedLang: progLang
      });
    });
  }
  const files = writeTipDrafts(validated);
  if (seoOpp && !opts.mock) {
    markSeoOpportunityPublished(SEO_OPPORTUNITIES_FILE, seoOpp.index, validated.slug);
    log('INFO', `Consulta SEO marcada como published con slug="${validated.slug}".`);
  }
  log('SUCCESS', `Tip generado en 7 idiomas (${validated.slug}): ${files.length} archivos escritos en drafts/.`);
}

if (require.main === module) {
  main().catch((err) => {
    log('ERROR', err.message);
    process.exit(1);
  });
}

module.exports = {
  ALL_LOCALES,
  TUESDAY_LANGS,
  THURSDAY_LANGS,
  ALL_PROG_LANGS,
  MIN_WORDS,
  hasReadyDraft,
  detectSlot,
  selectLanguage,
  loadPendingSeoOpportunity,
  markSeoOpportunityPublished,
  buildPrompt,
  validateTipPayload,
  writeTipDrafts
};
