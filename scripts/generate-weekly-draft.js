#!/usr/bin/env node
/* Generador automático semanal de borradores bilingües (es/en) con Gemini API.
   Sin dependencias externas (Node >= 18).

   Comportamiento:
     1. Si ya existe al menos un borrador con "status": "ready" en content/drafts/, no hace nada (prioridad manual).
     2. Si falta GEMINI_API_KEY (y no se pasa --mock=<ruta>), emite un aviso y sale con código 0 (fallback manual).
     3. Lee content/publication-manifest.json y content/articles.json para evitar repetir temas o slugs.
     4. Solicita a Gemini 2.5 Flash un artículo bilingüe (800-1200 palabras por idioma) en JSON estricto.
     5. Valida el resultado con validateDraft() de content/publish.js y lo guarda atómicamente en content/drafts/<slug>.json.

   Uso:
     node scripts/generate-weekly-draft.js
     node scripts/generate-weekly-draft.js --mock=ruta/al/mock.json */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateDraft, SLUG_RE } = require('../content/publish');
const pubManifest = require('./publication-manifest');

const ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'content', 'drafts');
const ARTICLES_FILE = path.join(ROOT, 'content', 'articles.json');
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TOPIC_PILLARS = [
  'Business Intelligence y diseño de dashboards ejecutivos accionables para PYMEs',
  'Automatización de procesos operativos y flujos con n8n e IA aplicada',
  'Estrategias data-driven para ventas, retención de clientes y reducción de costos',
  'Analítica empresarial, calidad de datos y gobernanza práctica sin infraestructura compleja',
  'Integración de CRM, ERP y reportes automatizados para toma de decisiones en tiempo real'
];

const log = (level, msg) => console.log(`[${new Date().toISOString()}][BLOG-GEN][${level}] ${msg}`);

function parseArgs(argv) {
  const opts = { mock: null };
  for (const arg of argv) {
    if (arg.startsWith('--mock=')) {
      opts.mock = arg.slice(7).trim();
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }
  return opts;
}

function hasReadyDraft() {
  if (!fs.existsSync(DRAFTS_DIR)) return null;
  const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, file), 'utf8'));
      if (data && data.status === 'ready') return file;
    } catch {
      // Un borrador corrupto será reportado por validate-drafts.js
    }
  }
  return null;
}

function collectExistingContext() {
  const slugs = new Set();
  const titles = [];

  if (fs.existsSync(ARTICLES_FILE)) {
    const articlesData = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8'));
    for (const a of articlesData.articles || []) {
      if (a.slug) slugs.add(a.slug);
      if (a.es && a.es.title) titles.push(a.es.title);
    }
  }

  const manifest = pubManifest.load();
  for (const a of manifest.articles || []) {
    if (a.slug) slugs.add(a.slug);
  }

  const blogDir = path.join(ROOT, 'blog');
  if (fs.existsSync(blogDir)) {
    for (const entry of fs.readdirSync(blogDir, { withFileTypes: true })) {
      if (entry.isDirectory()) slugs.add(entry.name);
    }
  }

  if (fs.existsSync(DRAFTS_DIR)) {
    for (const file of fs.readdirSync(DRAFTS_DIR)) {
      if (file.endsWith('.json')) slugs.add(file.slice(0, -5));
    }
  }

  return { slugs, titles };
}

function sanitizeSlug(rawSlug) {
  const base = String(rawSlug || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return base;
}

function buildPrompt(existingTitles, existingSlugs) {
  const weekSeed = new Date().toISOString().slice(0, 10);
  const pillar = TOPIC_PILLARS[new Date().getUTCDate() % TOPIC_PILLARS.length];
  const excluded = existingTitles.length
    ? existingTitles.map((t) => `- ${t}`).join('\n')
    : '- (ninguno aún)';

  return [
    `Eres el editor técnico senior de JW Solutions (consultora de Business Intelligence, automatización y estrategias data-driven para PYMEs).`,
    `Fecha objetivo de publicación: ${weekSeed}.`,
    `Pilar temático sugerido: ${pillar}.`,
    ``,
    `Artículos YA publicados (PROHIBIDO repetir tema, enfoque o título similar):`,
    excluded,
    ``,
    `Slugs ya existentes (PROHIBIDO reutilizar): ${Array.from(existingSlugs).join(', ') || 'ninguno'}.`,
    ``,
    `Genera UN artículo práctico, profundo y accionable (entre 800 y 1,200 palabras por idioma) en español ("es") e inglés ("en").`,
    `Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:`,
    `{`,
    `  "slug": "slug-en-minusculas-con-guiones",`,
    `  "tag": "Categoría corta (ej. Power BI | Automatización | Analítica | IA Aplicada | Estrategia Data-Driven)",`,
    `  "es": {`,
    `    "title": "Título atractivo <= 110 caracteres",`,
    `    "description": "Meta descripción SEO de 130 a 160 caracteres",`,
    `    "excerpt": "Extracto claro para tarjeta de portada de 120 a 190 caracteres",`,
    `    "body": [`,
    `      { "h": "Subtítulo de sección", "p": ["Párrafo 1...", "Párrafo 2..."], "ul": ["Punto práctico 1", "Punto práctico 2"] }`,
    `    ]`,
    `  },`,
    `  "en": {`,
    `    "title": "Compelling title <= 110 chars",`,
    `    "description": "SEO meta description 130 to 160 chars",`,
    `    "excerpt": "Clear homepage card excerpt 120 to 190 chars",`,
    `    "body": [`,
    `      { "h": "Section heading", "p": ["Paragraph 1...", "Paragraph 2..."], "ol": ["Step 1", "Step 2"] }`,
    `    ]`,
    `  }`,
    `}`,
    ``,
    `Reglas estrictas del JSON:`,
    `- Cada bloque de "body" debe tener "h" (string no vacío) y al menos uno de "p", "ul" u "ol" como arrays de strings no vacíos.`,
    `- Texto plano únicamente: SIN HTML, SIN Markdown (no uses **negritas**, # ni backticks).`,
    `- Incluye al menos 5 secciones en "body" por idioma con ejemplos concretos, métricas, pasos implementables y errores a evitar.`
  ].join('\n');
}

async function callGemini(apiKey, prompt) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7
    }
  };

  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data && data.candidates && data.candidates[0] &&
          data.candidates[0].content && data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

        if (!text) {
          throw new Error('Respuesta vacía de Gemini API (sin candidates[0].content.parts[0].text).');
        }

        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
      }

      const errText = await res.text().catch(() => '');
      lastError = new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 300)}`);
      if (!RETRYABLE_STATUSES.has(res.status) || attempt === maxAttempts) {
        throw lastError;
      }
      const waitMs = attempt * 5000;
      log('WARN', `Gemini API HTTP ${res.status} (intento ${attempt}/${maxAttempts}). Reintentando en ${waitMs / 1000}s...`);
      await sleep(waitMs);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || /HTTP 4\d\d/.test(err.message) && !/HTTP 429/.test(err.message)) {
        throw err;
      }
      if (!err.message.startsWith('Gemini API HTTP')) {
        const waitMs = attempt * 5000;
        log('WARN', `Error de red llamando a Gemini (${err.message}). Reintentando en ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

function sanitizeLangBlock(block) {
  if (!block || typeof block !== 'object') return block;
  const copy = { ...block };
  if (typeof copy.title === 'string') copy.title = copy.title.trim().slice(0, 120);
  if (typeof copy.description === 'string') copy.description = copy.description.trim();
  if (typeof copy.excerpt === 'string') copy.excerpt = copy.excerpt.trim();
  if (Array.isArray(copy.body)) {
    copy.body = copy.body.map((sec) => {
      if (!sec || typeof sec !== 'object') return sec;
      const out = {};
      if (typeof sec.h === 'string' && sec.h.trim()) out.h = sec.h.trim();
      for (const k of ['p', 'ul', 'ol']) {
        if (Array.isArray(sec[k])) {
          const items = sec[k].map((v) => String(v || '').trim()).filter(Boolean);
          if (items.length > 0) out[k] = items;
        }
      }
      return out;
    });
  }
  return copy;
}

function writeDraftAtomic(slug, draftObj) {
  if (!fs.existsSync(DRAFTS_DIR)) {
    fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  }
  const targetPath = path.join(DRAFTS_DIR, `${slug}.json`);
  const tmpPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(draftObj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, targetPath);
  return targetPath;
}

function normalizeAndValidate(generated, existingSlugs) {
  if (!generated || typeof generated !== 'object') {
    throw new Error('El payload generado no es un objeto JSON.');
  }

  const slug = sanitizeSlug(generated.slug);
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Slug generado inválido tras sanitizar: "${slug}"`);
  }
  if (existingSlugs.has(slug)) {
    throw new Error(`El slug generado "${slug}" ya existe en el repositorio.`);
  }

  const draft = {
    status: 'ready',
    tag: String(generated.tag || '').trim(),
    es: sanitizeLangBlock(generated.es),
    en: sanitizeLangBlock(generated.en)
  };

  const errors = validateDraft(draft, slug);
  if (errors.length > 0) {
    throw new Error(`El borrador generado no cumple el esquema:\n- ${errors.join('\n- ')}`);
  }

  return { slug, draft };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const existingReady = hasReadyDraft();
  if (existingReady) {
    log('INFO', `Ya existe un borrador "ready" (${existingReady}). Se respeta prioridad manual y no se genera otro.`);
    return;
  }

  let rawGenerated;
  const { slugs, titles } = collectExistingContext();

  if (opts.mock) {
    const mockPath = path.resolve(process.cwd(), opts.mock);
    log('INFO', `Modo mock activo: leyendo ${mockPath}`);
    rawGenerated = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
  } else {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      log('WARN', 'GEMINI_API_KEY no está definido. Se omite generación automática (fallback a borradores manuales).');
      return;
    }
    log('INFO', 'Generando borrador semanal bilingüe con Gemini 3.8 Flash...');
    const prompt = buildPrompt(titles, slugs);
    rawGenerated = await callGemini(apiKey, prompt);
  }

  const { slug, draft } = normalizeAndValidate(rawGenerated, slugs);
  const outPath = writeDraftAtomic(slug, draft);
  log('SUCCESS', `Borrador "ready" generado y validado: ${path.relative(ROOT, outPath)}`);
}

if (require.main === module) {
  main().catch((err) => {
    log('ERROR', err.message);
    process.exit(1);
  });
}

module.exports = { sanitizeSlug, normalizeAndValidate, hasReadyDraft, collectExistingContext };
