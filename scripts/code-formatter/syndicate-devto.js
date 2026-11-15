#!/usr/bin/env node
/**
 * Sindicación canónica hacia Dev.to para tips publicados de Code Formatter & Auto-Doc AI.
 *
 * Lee content/code-formatter-tips/code-formatter-manifest.json y publica en Dev.to
 * (con canonical_url apuntando a la versión EN estática en jw-solutions.com)
 * los artículos en estado DEPLOYED o NOTIFIED que aún no han sido sindicados.
 *
 * Cero dependencias externas (Node.js 22 nativo).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DEFAULT_MANIFEST = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const DEFAULT_PUBLISHED_DIR = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'published');
const BASE_URL = 'https://jw-solutions.com';

const CATEGORY_PATH = {
  python: 'tips/python/',
  javascript: 'tips/javascript/',
  typescript: 'tips/javascript/',
  sql: 'tips/sql-dax/',
  dax: 'tips/sql-dax/',
  java: 'tips/java/',
  csharp: 'tips/csharp/',
  php: 'tips/php/',
  json: 'tips/config/',
  yaml: 'tips/config/',
};

/**
 * Extrae frontmatter YAML simple y cuerpo Markdown sin dependencias externas.
 * @param {string} raw
 * @returns {{ data: Record<string, any>, body: string }}
 */
function stripFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw || '');
  if (!match) {
    return { data: {}, body: raw || '' };
  }
  const fmLines = match[1].split(/\r?\n/);
  const data = {};
  for (const line of fmLines) {
    const kv = /^([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    } else if (val.startsWith('[') || val.startsWith('{')) {
      try {
        val = JSON.parse(val);
      } catch (_) {
        // conservar como string si no es JSON válido
      }
    }
    data[key] = val;
  }
  return { data, body: match[2].trim() };
}

/**
 * Normaliza etiquetas para Dev.to (máx. 4 tags alfanuméricas minúsculas).
 * @param {string} language
 * @param {string[]} tags
 * @returns {string[]}
 */
function normalizeDevtoTags(language, tags) {
  const candidates = [language, ...(Array.isArray(tags) ? tags : [])];
  const clean = [];
  for (const raw of candidates) {
    const slug = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (slug && !clean.includes(slug)) {
      clean.push(slug);
    }
    if (clean.length >= 4) break;
  }
  return clean.length > 0 ? clean : ['programming', 'cleancode'];
}

/**
 * Construye el payload JSON para POST https://dev.to/api/articles.
 * @param {object} entry Entrada del manifiesto
 * @param {string} markdownRaw Contenido crudo de <slug>.en.md
 * @returns {object}
 */
function buildDevtoPayload(entry, markdownRaw) {
  const { data, body } = stripFrontmatter(markdownRaw);
  const slug = entry.slug;
  const progLang = String(entry.programming_language || data.programming_language || entry.language || data.language || 'python').toLowerCase();
  const catPath = CATEGORY_PATH[progLang] || 'tips/python/';
  const title = data.title || entry.title || slug;
  const description = data.description || entry.description || '';
  const canonicalUrl = `${BASE_URL}/tools/code-formatter/${catPath}${slug}/en/`;
  const langParam = encodeURIComponent(progLang);
  const interactiveUrl = `${BASE_URL}/tools/code-formatter/?lang=${langParam}&utm_source=devto&utm_medium=syndication&utm_campaign=${encodeURIComponent(slug)}`;

  const footer = [
    '',
    '---',
    '',
    `> **Try it interactively:** Format, validate, and auto-document your ${entry.language || 'code'} directly in [JW Solutions Code Formatter & Auto-Doc AI](${interactiveUrl}).`,
    `> *Originally published at [jw-solutions.com](${canonicalUrl}).*`,
  ].join('\n');

  return {
    article: {
      title,
      published: true,
      body_markdown: `${body}\n${footer}`,
      canonical_url: canonicalUrl,
      description,
      tags: normalizeDevtoTags(entry.language || data.language, data.tags || entry.tags),
    },
  };
}

/**
 * Ejecuta la sindicación idempotente hacia Dev.to.
 * @param {object} [options]
 * @param {string} [options.manifestPath]
 * @param {string} [options.publishedDir]
 * @param {string} [options.apiKey]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{ skippedReason?: string, published: Array<{slug: string, url: string}>, alreadyPublished: number, errors: Array<{slug: string, error: string}> }>}
 */
async function syndicateAll(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST;
  const publishedDir = options.publishedDir || DEFAULT_PUBLISHED_DIR;
  const apiKey = options.apiKey !== undefined ? options.apiKey : (process.env.DEVTO_API_KEY || '').trim();
  const fetchImpl = options.fetchImpl || fetch;
  const dryRun = Boolean(options.dryRun);
  const delayMs = options.delayMs !== undefined ? options.delayMs : (options.fetchImpl ? 0 : 4000);
  const limit = Number(options.limit || process.env.SYNDICATE_LIMIT || 0) || Infinity;

  if (!apiKey && !dryRun) {
    console.log('::warning::DEVTO_API_KEY no configurado; omitiendo sindicación externa a Dev.to.');
    return { skippedReason: 'missing_api_key', published: [], alreadyPublished: 0, errors: [] };
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe manifiesto en ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tips = Array.isArray(manifest.tips) ? manifest.tips : [];
  const published = [];
  const errors = [];
  let alreadyPublished = 0;

  for (const entry of tips) {
    if (published.length >= limit) break;
    if (entry.status && !['DEPLOYED', 'NOTIFIED'].includes(entry.status)) {
      continue;
    }
    if (entry.syndication && entry.syndication.devto && entry.syndication.devto.status === 'published') {
      alreadyPublished += 1;
      continue;
    }

    const enMdPath = path.join(publishedDir, `${entry.slug}.en.md`);
    if (!fs.existsSync(enMdPath)) {
      errors.push({ slug: entry.slug, error: `No existe ${enMdPath}` });
      continue;
    }

    const markdownRaw = fs.readFileSync(enMdPath, 'utf8');
    const payload = buildDevtoPayload(entry, markdownRaw);

    if (dryRun) {
      published.push({ slug: entry.slug, url: payload.article.canonical_url });
      continue;
    }

    if (published.length > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    try {
      const response = await fetchImpl('https://dev.to/api/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'User-Agent': 'jw-solutions-code-formatter-syndicator/1.0',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 429) {
        const errBody = await response.text().catch(() => '');
        console.log(`::warning::Rate limit de Dev.to alcanzado en ${entry.slug} (HTTP 429): ${errBody.slice(0, 180)}. Los artículos restantes continuarán en la próxima ejecución.`);
        break;
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        errors.push({ slug: entry.slug, error: `HTTP ${response.status}: ${errBody.slice(0, 300)}` });
        continue;
      }

      const resJson = await response.json();
      entry.syndication = {
        ...(entry.syndication || {}),
        devto: {
          status: 'published',
          id: resJson.id || null,
          url: resJson.url || payload.article.canonical_url,
          publishedAt: new Date().toISOString(),
        },
      };
      published.push({ slug: entry.slug, url: entry.syndication.devto.url });
    } catch (err) {
      errors.push({ slug: entry.slug, error: err && err.message ? err.message : String(err) });
    }
  }

  if (!dryRun && published.length > 0) {
    const tmpPath = `${manifestPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, manifestPath);
  }

  return { published, alreadyPublished, errors };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const result = await syndicateAll({ dryRun });
  if (result.skippedReason) {
    process.exit(0);
  }
  console.log(
    `Sindicación Dev.to: ${result.published.length} publicados, ${result.alreadyPublished} ya sindicados, ${result.errors.length} errores.`
  );
  for (const item of result.published) {
    console.log(`  - ${item.slug} -> ${item.url}`);
  }
  for (const err of result.errors) {
    console.error(`  ! ${err.slug}: ${err.error}`);
  }
  if (result.errors.length > 0 && result.published.length === 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  stripFrontmatter,
  normalizeDevtoTags,
  buildDevtoPayload,
  syndicateAll,
};
