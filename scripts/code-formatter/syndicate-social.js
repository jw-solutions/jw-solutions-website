#!/usr/bin/env node
/**
 * Difusión social automática (Bluesky, Mastodon, Telegram, Discord, GitHub Discussions)
 * para tips publicados de Code Formatter & Auto-Doc AI.
 *
 * Cada conector es independiente y opcional: si faltan sus credenciales, se omite con ::warning::
 * y nunca falla el pipeline. Registra los canales publicados en syndication.social dentro del manifiesto.
 *
 * Cero dependencias externas (Node.js 22 nativo).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stripFrontmatter } = require('./syndicate-devto.js');

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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTipUrls(entry, utmSource, utmMedium = 'social') {
  const progLang = entry.programming_language || entry.language || 'python';
  const catPath = CATEGORY_PATH[progLang] || 'tips/python/';
  const articleUrl = `${BASE_URL}/tools/code-formatter/${catPath}${entry.slug}/en/?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${encodeURIComponent(entry.slug)}`;
  const toolUrl = `${BASE_URL}/tools/code-formatter/?lang=${encodeURIComponent(progLang)}&utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${encodeURIComponent(entry.slug)}`;
  return { progLang, articleUrl, toolUrl };
}

function graphemeLength(str) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(String(str || ''))].length;
  }
  return Array.from(String(str || '')).length;
}

/**
 * Construye el texto y facets UTF-8 para Bluesky (máx. 300 graphemes).
 */
function buildBlueskyPost(entry, enMeta) {
  const { progLang, articleUrl } = buildTipUrls(entry, 'bluesky');
  const title = enMeta.title || (entry.translations && entry.translations.en && entry.translations.en.title) || entry.title;
  const description = enMeta.description || (entry.translations && entry.translations.en && entry.translations.en.meta_description) || title;
  const tag = `#${String(progLang).replace(/[^a-zA-Z0-9]/g, '')}`;
  const tagsLine = `\n\n${tag} #CodeQuality #DevTools`;
  let maxTitleLen = Math.max(30, 295 - graphemeLength(articleUrl) - graphemeLength(tagsLine) - 2);
  let clippedTitle = Array.from(String(title)).slice(0, maxTitleLen).join('');
  let header = `${clippedTitle}\n\n`;
  let text = `${header}${articleUrl}${tagsLine}`;
  while (graphemeLength(text) > 300 && maxTitleLen > 10) {
    maxTitleLen -= 5;
    clippedTitle = `${Array.from(String(title)).slice(0, maxTitleLen).join('')}…`;
    header = `${clippedTitle}\n\n`;
    text = `${header}${articleUrl}${tagsLine}`;
  }

  const encoder = new TextEncoder();
  const urlStart = encoder.encode(header).byteLength;
  const urlEnd = urlStart + encoder.encode(articleUrl).byteLength;
  const facets = [
    {
      index: { byteStart: urlStart, byteEnd: urlEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: articleUrl }],
    },
  ];

  let cursor = urlEnd + encoder.encode('\n\n').byteLength;
  for (const ht of [tag, '#CodeQuality', '#DevTools']) {
    const htBytes = encoder.encode(ht).byteLength;
    facets.push({
      index: { byteStart: cursor, byteEnd: cursor + htBytes },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: ht.slice(1) }],
    });
    cursor += htBytes + 1;
  }

  const embed = {
    $type: 'app.bsky.embed.external',
    external: {
      uri: articleUrl,
      title,
      description,
    },
  };

  return { text, facets, embed };
}

async function publishBluesky(entry, enMeta, creds, fetchImpl) {
  const sessionRes = await fetchImpl('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: creds.handle, password: creds.appPassword }),
    signal: AbortSignal.timeout(20000),
  });
  if (!sessionRes.ok) {
    throw new Error(`Bluesky auth HTTP ${sessionRes.status}`);
  }
  const session = await sessionRes.json();
  const { text, facets, embed } = buildBlueskyPost(entry, enMeta);

  const ogPngPath = path.join(ROOT_DIR, 'assets', 'images', 'og', 'tips', `${entry.slug}-en.png`);
  if (fs.existsSync(ogPngPath)) {
    try {
      const pngBytes = fs.readFileSync(ogPngPath);
      const blobRes = await fetchImpl('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          Authorization: `Bearer ${session.accessJwt}`,
        },
        body: pngBytes,
        signal: AbortSignal.timeout(20000),
      });
      if (blobRes.ok) {
        const blobData = await blobRes.json();
        if (blobData && blobData.blob) {
          embed.external.thumb = blobData.blob;
        }
      }
    } catch (_) {
      // fallback sin miniatura si uploadBlob no está disponible
    }
  }

  const postRes = await fetchImpl('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        facets,
        embed,
        langs: ['en'],
        createdAt: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!postRes.ok) {
    throw new Error(`Bluesky post HTTP ${postRes.status}`);
  }
  const data = await postRes.json();
  return { uri: data.uri || null, cid: data.cid || null };
}

async function publishMastodon(entry, enMeta, creds, fetchImpl) {
  const { progLang, articleUrl } = buildTipUrls(entry, 'mastodon');
  const title = enMeta.title || (entry.translations && entry.translations.en && entry.translations.en.title) || entry.title;
  const summary = enMeta.description || '';
  const tag = `#${String(progLang).replace(/[^a-zA-Z0-9]/g, '')}`;
  const status = `${title}\n\n${summary.slice(0, 180)}\n\n${articleUrl}\n\n${tag} #CleanCode #AutoDocAI`;
  const instanceBase = creds.instanceUrl.replace(/\/+$/, '');

  const res = await fetchImpl(`${instanceBase}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.accessToken}`,
    },
    body: JSON.stringify({ status, visibility: 'public', language: 'en' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Mastodon HTTP ${res.status}`);
  }
  const data = await res.json();
  return { id: data.id || null, url: data.url || null };
}

async function publishTelegram(entry, enMeta, creds, fetchImpl) {
  const { progLang, articleUrl, toolUrl } = buildTipUrls(entry, 'telegram');
  const title = enMeta.title || (entry.translations && entry.translations.en && entry.translations.en.title) || entry.title;
  const summary = enMeta.description || '';
  const text = [
    `<code>[${escapeHtml(progLang.toUpperCase())}]</code> <b>${escapeHtml(title)}</b>`,
    `<i>Code Formatter &amp; Auto-Doc AI</i>`,
    '',
    escapeHtml(summary),
    '',
    `👉 <a href="${escapeHtml(articleUrl)}">Leer guía completa</a>`,
  ].join('\n');

  const res = await fetchImpl(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: creds.chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Leer guía completa', url: articleUrl },
          { text: 'Probar en el formateador', url: toolUrl },
        ]],
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Telegram HTTP ${res.status}`);
  }
  const data = await res.json();
  return { messageId: data.result && data.result.message_id ? data.result.message_id : null };
}

function buildDiscordPayload(entry, enMeta) {
  const { progLang, articleUrl } = buildTipUrls(entry, 'discord');
  const title = enMeta.title || (entry.translations && entry.translations.en && entry.translations.en.title) || entry.title;
  const description =
    enMeta.description ||
    (entry.translations && entry.translations.en && entry.translations.en.meta_description) ||
    title;
  const ogImageUrl = `${BASE_URL}/assets/images/og/tips/${encodeURIComponent(entry.slug)}-en.png`;

  return {
    embeds: [
      {
        title: String(title).slice(0, 256),
        description: String(description).slice(0, 2048),
        url: articleUrl,
        color: 13938487,
        fields: [
          { name: 'Language', value: String(progLang).toUpperCase(), inline: true },
          { name: 'Category', value: String(entry.category || 'Code Quality').slice(0, 1024), inline: true },
          { name: 'Format', value: 'Before / After + Auto-Doc AI', inline: true },
        ],
        image: { url: ogImageUrl },
        footer: {
          text: `JW Solutions · ${String(progLang).toUpperCase()} · Code Formatter & Auto-Doc AI`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function publishDiscord(entry, enMeta, creds, fetchImpl) {
  const parsedUrl = new URL(creds.webhookUrl);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Discord webhook debe usar HTTPS.');
  }
  const targetUrl = `${creds.webhookUrl}${creds.webhookUrl.includes('?') ? '&' : '?'}wait=true`;
  const payload = buildDiscordPayload(entry, enMeta);

  const res = await fetchImpl(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Discord HTTP ${res.status}`);
  }
  if (res.status === 204) {
    return { messageId: null };
  }
  const data = await res.json().catch(() => ({}));
  return { messageId: data && data.id ? data.id : null };
}

async function publishGitHubDiscussion(entry, enMeta, creds, fetchImpl) {
  const [owner, name] = String(creds.repository || '').split('/');
  if (!owner || !name) {
    throw new Error('GITHUB_REPOSITORY inválido (esperado owner/repo).');
  }
  const { progLang, articleUrl, toolUrl } = buildTipUrls(entry, 'github', 'discussions');
  const title = enMeta.title || (entry.translations && entry.translations.en && entry.translations.en.title) || entry.title;
  const description =
    enMeta.description ||
    (entry.translations && entry.translations.en && entry.translations.en.meta_description) ||
    '';
  const snippet = String(entry.interactive_snippet || '').trim();

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${creds.token}`,
    'User-Agent': 'jw-solutions-code-formatter-bot',
  };

  const queryRes = await fetchImpl('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          discussionCategories(first: 25) {
            nodes { id name slug }
          }
        }
      }`,
      variables: { owner, name },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!queryRes.ok) {
    throw new Error(`GitHub GraphQL query HTTP ${queryRes.status}`);
  }
  const queryJson = await queryRes.json();
  if (Array.isArray(queryJson.errors) && queryJson.errors.length > 0) {
    throw new Error(`GitHub GraphQL query error: ${queryJson.errors[0].message}`);
  }
  const repo = queryJson.data && queryJson.data.repository;
  if (!repo || !repo.id) {
    throw new Error('Repositorio no encontrado en GitHub GraphQL.');
  }
  const categories = (repo.discussionCategories && repo.discussionCategories.nodes) || [];
  const targetCat =
    categories.find((c) => String(c.slug || c.name).toLowerCase() === 'announcements') ||
    categories.find((c) => String(c.slug || c.name).toLowerCase() === 'general') ||
    categories[0];
  if (!targetCat) {
    throw new Error('El repositorio no tiene categorías de GitHub Discussions habilitadas.');
  }

  const bodyLines = [
    `### ${title}`,
    '',
    description,
    '',
  ];
  if (snippet) {
    bodyLines.push(`\`\`\`${progLang}`, snippet, '```', '');
  }
  bodyLines.push(
    `- **Language:** \`${String(progLang).toUpperCase()}\``,
    `- **Full Guide (EN):** [Read article on jw-solutions.com](${articleUrl})`,
    `- **Try it live:** [Open Code Formatter & Auto-Doc AI](${toolUrl})`,
  );
  const body = bodyLines.join('\n');

  const mutationRes = await fetchImpl('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId,
          categoryId: $categoryId,
          title: $title,
          body: $body
        }) {
          discussion { id url number }
        }
      }`,
      variables: {
        repositoryId: repo.id,
        categoryId: targetCat.id,
        title: `[${String(progLang).toUpperCase()}] ${title}`.slice(0, 240),
        body,
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!mutationRes.ok) {
    throw new Error(`GitHub GraphQL mutation HTTP ${mutationRes.status}`);
  }
  const mutationJson = await mutationRes.json();
  if (Array.isArray(mutationJson.errors) && mutationJson.errors.length > 0) {
    throw new Error(`GitHub GraphQL mutation error: ${mutationJson.errors[0].message}`);
  }
  const discussion =
    mutationJson.data &&
    mutationJson.data.createDiscussion &&
    mutationJson.data.createDiscussion.discussion;
  return {
    id: discussion && discussion.id ? discussion.id : null,
    url: discussion && discussion.url ? discussion.url : null,
    number: discussion && discussion.number ? discussion.number : null,
  };
}

/**
 * Ejecuta difusión social idempotente para todos los canales configurados.
 * @param {object} [options]
 */
async function syndicateAll(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST;
  const publishedDir = options.publishedDir || DEFAULT_PUBLISHED_DIR;
  const fetchImpl = options.fetchImpl || fetch;
  const dryRun = Boolean(options.dryRun);
  const delayMs = options.delayMs !== undefined ? options.delayMs : (options.fetchImpl ? 0 : 2000);
  const limit = Number(options.limit || process.env.SYNDICATE_LIMIT || 0) || Infinity;

  const bskyHandle = options.bskyHandle !== undefined ? options.bskyHandle : (process.env.BSKY_HANDLE || '').trim();
  const bskyAppPassword =
    options.bskyAppPassword !== undefined ? options.bskyAppPassword : (process.env.BSKY_APP_PASSWORD || '').trim();
  const mastodonUrl =
    options.mastodonUrl !== undefined ? options.mastodonUrl : (process.env.MASTODON_INSTANCE_URL || '').trim();
  const mastodonToken =
    options.mastodonToken !== undefined ? options.mastodonToken : (process.env.MASTODON_ACCESS_TOKEN || '').trim();
  const telegramToken =
    options.telegramToken !== undefined ? options.telegramToken : (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const telegramChatId =
    options.telegramChatId !== undefined ? options.telegramChatId : (process.env.TELEGRAM_CHAT_ID || '').trim();
  const discordWebhookUrl =
    options.discordWebhookUrl !== undefined
      ? options.discordWebhookUrl
      : (process.env.DISCORD_WEBHOOK_URL || '').trim();
  const githubToken =
    options.githubToken !== undefined
      ? options.githubToken
      : (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  const githubRepository =
    options.githubRepository !== undefined
      ? options.githubRepository
      : (process.env.GITHUB_REPOSITORY || '').trim();

  const hasBsky = Boolean(bskyHandle && bskyAppPassword);
  const hasMastodon = Boolean(mastodonUrl && mastodonToken);
  const hasTelegram = Boolean(telegramToken && telegramChatId);
  const hasDiscord = Boolean(discordWebhookUrl);
  const hasGithubDiscussions = Boolean(githubToken && githubRepository && githubRepository.includes('/'));

  if (!hasBsky && !hasMastodon && !hasTelegram && !hasDiscord && !hasGithubDiscussions && !dryRun) {
    console.log(
      '::warning::Ningún conector social configurado (Bluesky/Mastodon/Telegram/Discord/GitHub Discussions); omitiendo difusión social.'
    );
    return { skippedReason: 'missing_credentials', published: [], errors: [] };
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe manifiesto en ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tips = Array.isArray(manifest.tips) ? manifest.tips : [];
  const published = [];
  const errors = [];
  let manifestDirty = false;

  const processedSlugs = new Set();
  for (const entry of tips) {
    if (processedSlugs.size >= limit) break;
    if (entry.status && !['DEPLOYED', 'NOTIFIED'].includes(entry.status)) continue;

    const socialState = (entry.syndication && entry.syndication.social) || {};
    const enMdPath = path.join(publishedDir, `${entry.slug}.en.md`);
    const enMeta = fs.existsSync(enMdPath) ? stripFrontmatter(fs.readFileSync(enMdPath, 'utf8')).data : {};

    const channels = [
      {
        name: 'bluesky',
        enabled: hasBsky,
        run: () => publishBluesky(entry, enMeta, { handle: bskyHandle, appPassword: bskyAppPassword }, fetchImpl),
      },
      {
        name: 'mastodon',
        enabled: hasMastodon,
        run: () => publishMastodon(entry, enMeta, { instanceUrl: mastodonUrl, accessToken: mastodonToken }, fetchImpl),
      },
      {
        name: 'telegram',
        enabled: hasTelegram,
        run: () => publishTelegram(entry, enMeta, { botToken: telegramToken, chatId: telegramChatId }, fetchImpl),
      },
      {
        name: 'discord',
        enabled: hasDiscord,
        run: () => publishDiscord(entry, enMeta, { webhookUrl: discordWebhookUrl }, fetchImpl),
      },
      {
        name: 'github_discussions',
        enabled: hasGithubDiscussions,
        run: () =>
          publishGitHubDiscussion(
            entry,
            enMeta,
            { token: githubToken, repository: githubRepository },
            fetchImpl
          ),
      },
    ];

    for (const ch of channels) {
      if (!ch.enabled) continue;
      if (socialState[ch.name] && socialState[ch.name].status === 'published') continue;
      if (dryRun) {
        published.push({ slug: entry.slug, channel: ch.name });
        continue;
      }
      try {
        if (published.length > 0 && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const res = await ch.run();
        entry.syndication = entry.syndication || {};
        entry.syndication.social = entry.syndication.social || {};
        entry.syndication.social[ch.name] = {
          status: 'published',
          ...res,
          publishedAt: new Date().toISOString(),
        };
        manifestDirty = true;
        processedSlugs.add(entry.slug);
        published.push({ slug: entry.slug, channel: ch.name });
      } catch (err) {
        errors.push({ slug: entry.slug, channel: ch.name, error: err && err.message ? err.message : String(err) });
      }
    }
  }

  if (!dryRun && manifestDirty) {
    const tmpPath = `${manifestPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, manifestPath);
  }

  return { published, errors };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const result = await syndicateAll({ dryRun });
  if (result.skippedReason) {
    process.exit(0);
  }
  console.log(`Difusión social: ${result.published.length} envíos, ${result.errors.length} errores.`);
  for (const err of result.errors) {
    console.log(`::warning::Social (${err.channel}) ${err.slug}: ${err.error}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildBlueskyPost,
  buildDiscordPayload,
  syndicateAll,
};
