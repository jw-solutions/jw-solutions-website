#!/usr/bin/env node
/**
 * Sindicación canónica hacia Hashnode (GraphQL API) para tips publicados de Code Formatter & Auto-Doc AI.
 *
 * Lee content/code-formatter-tips/code-formatter-manifest.json y publica en Hashnode
 * los artículos en estado DEPLOYED o NOTIFIED sin syndication.hashnode.status === 'published'.
 *
 * Cero dependencias externas (Node.js 22 nativo).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stripFrontmatter, normalizeDevtoTags } = require('./syndicate-devto.js');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DEFAULT_MANIFEST = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const DEFAULT_PUBLISHED_DIR = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'published');
const BASE_URL = 'https://jw-solutions.com';
const HASHNODE_GQL_ENDPOINT = 'https://gql.hashnode.com';

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

const PUBLISH_POST_MUTATION = `
mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) {
    post {
      id
      slug
      url
    }
  }
}
`;

/**
 * Construye las variables GraphQL para publishPost en Hashnode.
 * @param {object} entry
 * @param {string} markdownRaw
 * @param {string} publicationId
 * @returns {object}
 */
function buildHashnodeInput(entry, markdownRaw, publicationId) {
  const { data, body } = stripFrontmatter(markdownRaw);
  const slug = entry.slug;
  const progLang = entry.programming_language || data.programming_language || entry.language || data.language || 'python';
  const catPath = CATEGORY_PATH[progLang] || 'tips/python/';
  const enTr = (entry.translations && entry.translations.en) || {};
  const title = data.title || enTr.title || entry.title || slug;
  const canonicalUrl = `${BASE_URL}/tools/code-formatter/${catPath}${slug}/en/`;
  const coverImageURL = `${BASE_URL}/assets/images/og/tips/${slug}-en.png`;

  const langParam = encodeURIComponent(String(progLang).toLowerCase());
  const snippetParam = data.interactive_snippet ? `&snippet=${encodeURIComponent(String(data.interactive_snippet))}` : '';
  const interactiveUrl = `${BASE_URL}/tools/code-formatter/?lang=${langParam}${snippetParam}&utm_source=hashnode&utm_medium=syndication&utm_campaign=${encodeURIComponent(slug)}`;

  const faqLines = [];
  if (Array.isArray(data.faq) && data.faq.length > 0) {
    faqLines.push('', '## Frequently Asked Questions', '');
    for (const item of data.faq) {
      if (item && item.q && item.a) {
        faqLines.push(`### ${item.q}`, '', String(item.a), '');
      }
    }
  }

  const footer = [
    ...faqLines,
    '',
    '---',
    '',
    `> **Try it interactively:** Format, validate, and auto-document your ${progLang} code in [JW Solutions Code Formatter & Auto-Doc AI](${interactiveUrl}).`,
    `> *Originally published at [jw-solutions.com](${canonicalUrl}).*`,
  ].join('\n');

  const rawTags = normalizeDevtoTags(progLang, data.tags || entry.tags);
  const tags = rawTags.map((t) => ({ name: t, slug: t }));

  return {
    publicationId,
    title,
    contentMarkdown: `${body}\n${footer}`,
    originalArticleURL: canonicalUrl,
    coverImageOptions: { coverImageURL },
    tags,
  };
}

/**
 * Ejecuta la sindicación idempotente hacia Hashnode.
 * @param {object} [options]
 */
async function syndicateAll(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST;
  const publishedDir = options.publishedDir || DEFAULT_PUBLISHED_DIR;
  const token = options.token !== undefined ? options.token : (process.env.HASHNODE_TOKEN || '').trim();
  const publicationId =
    options.publicationId !== undefined ? options.publicationId : (process.env.HASHNODE_PUBLICATION_ID || '').trim();
  const fetchImpl = options.fetchImpl || fetch;
  const dryRun = Boolean(options.dryRun);

  if ((!token || !publicationId) && !dryRun) {
    console.log('::warning::HASHNODE_TOKEN o HASHNODE_PUBLICATION_ID no configurados; omitiendo Hashnode.');
    return { skippedReason: 'missing_credentials', published: [], alreadyPublished: 0, errors: [] };
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
    if (!['DEPLOYED', 'NOTIFIED'].includes(entry.status)) {
      continue;
    }
    if (entry.syndication && entry.syndication.hashnode && entry.syndication.hashnode.status === 'published') {
      alreadyPublished += 1;
      continue;
    }

    const enMdPath = path.join(publishedDir, `${entry.slug}.en.md`);
    if (!fs.existsSync(enMdPath)) {
      errors.push({ slug: entry.slug, error: `No existe ${enMdPath}` });
      continue;
    }

    const markdownRaw = fs.readFileSync(enMdPath, 'utf8');
    const input = buildHashnodeInput(entry, markdownRaw, publicationId || 'dry-run-pub');

    if (dryRun) {
      published.push({ slug: entry.slug, url: input.originalArticleURL });
      continue;
    }

    try {
      const response = await fetchImpl(HASHNODE_GQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({ query: PUBLISH_POST_MUTATION, variables: { input } }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        errors.push({ slug: entry.slug, error: `HTTP ${response.status}: ${errBody.slice(0, 300)}` });
        continue;
      }

      const resJson = await response.json();
      if (Array.isArray(resJson.errors) && resJson.errors.length > 0) {
        errors.push({ slug: entry.slug, error: resJson.errors.map((e) => e.message).join('; ') });
        continue;
      }

      const post = resJson.data && resJson.data.publishPost && resJson.data.publishPost.post;
      if (!post || !post.url) {
        errors.push({ slug: entry.slug, error: 'Respuesta GraphQL sin post.url' });
        continue;
      }

      entry.syndication = {
        ...(entry.syndication || {}),
        hashnode: {
          status: 'published',
          id: post.id || null,
          url: post.url,
          publishedAt: new Date().toISOString(),
        },
      };
      published.push({ slug: entry.slug, url: post.url });
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
    `Sindicación Hashnode: ${result.published.length} publicados, ${result.alreadyPublished} ya sindicados, ${result.errors.length} errores.`
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
  buildHashnodeInput,
  syndicateAll,
};
