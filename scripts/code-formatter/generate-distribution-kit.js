#!/usr/bin/env node
/**
 * Generador de Kit de Distribución Regional en 7 Idiomas para Code Formatter & Auto-Doc AI.
 *
 * Crea content/code-formatter-tips/distribution/<slug>.json con textos nativos anti-spam,
 * bloques de código antes/después, hashtags y enlaces UTM listos para copiar y pegar.
 * Si GITHUB_STEP_SUMMARY está definido, añade un resumen Markdown en la ejecución.
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
const DEFAULT_DIST_DIR = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'distribution');
const BASE_URL = 'https://jw-solutions.com';

const ALL_LOCALES = ['en', 'es', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

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

const COMMUNITY_MAP = {
  python: {
    en: ['Reddit: r/Python', 'Hacker News'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Reddit: r/taquerosprogramadores', 'Reddit: r/chileIT', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt', 'TabNews (tabnews.com.br)'],
    fr: ['Zeste de Savoir', 'Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  javascript: {
    en: ['Reddit: r/typescript', 'Reddit: r/webdev', 'Reddit: r/javascript', 'Hacker News'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Reddit: r/taquerosprogramadores', 'Reddit: r/chileIT', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  typescript: {
    en: ['Reddit: r/typescript', 'Reddit: r/webdev', 'Reddit: r/javascript', 'Hacker News'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Reddit: r/taquerosprogramadores', 'Reddit: r/chileIT', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  sql: {
    en: ['Reddit: r/SQL', 'Reddit: r/PowerBI', 'Reddit: r/BusinessIntelligence', 'Hacker News'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  dax: {
    en: ['Reddit: r/PowerBI', 'Reddit: r/BusinessIntelligence', 'Reddit: r/SQL'],
    es: ['Reddit: r/programacion', 'Reddit: r/chileIT'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  java: {
    en: ['Reddit: r/java', 'Hacker News'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  csharp: {
    en: ['Reddit: r/csharp', 'Reddit: r/dotnet', 'Hacker News'],
    es: ['Reddit: r/programacion', 'Reddit: r/taquerosprogramadores', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  php: {
    en: ['Reddit: r/PHP', 'Reddit: r/webdev'],
    es: ['Reddit: r/programacion', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  json: {
    en: ['Reddit: r/devops', 'Reddit: r/webdev'],
    es: ['Reddit: r/programacion', 'Reddit: r/chileIT'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  yaml: {
    en: ['Reddit: r/devops', 'Reddit: r/webdev'],
    es: ['Reddit: r/programacion', 'Reddit: r/chileIT'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Reddit: r/developpeurs'],
    de: ['Heise Developer', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
};

const LOCALE_CTA = {
  en: { readMore: 'Full guide & interactive sandbox', hashtags: '#CleanCode #DevTools' },
  es: { readMore: 'Guía completa y sandbox interactivo', hashtags: '#Programación #CódigoLimpio' },
  'pt-BR': { readMore: 'Guia completo e sandbox interativo', hashtags: '#Programação #CódigoLimpo' },
  'pt-PT': { readMore: 'Guia completo e sandbox interativo', hashtags: '#Programação #CódigoLimpo' },
  fr: { readMore: 'Guide complet et bac à sable interactif', hashtags: '#Développement #CleanCode' },
  de: { readMore: 'Vollständiger Leitfaden & interaktive Sandbox', hashtags: '#CleanCode #Entwicklung' },
  it: { readMore: 'Guida completa e sandbox interattivo', hashtags: '#Sviluppo #CleanCode' },
};

function extractCodeBlocks(body, maxBlocks = 2) {
  const matches = [];
  const regex = /```[\w-]*\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(body || '')) !== null && matches.length < maxBlocks) {
    matches.push(m[0].trim());
  }
  return matches;
}

function getUtmSourceForCommunity(loc, communities) {
  if (loc === 'pt-BR') return 'tabnews';
  if (communities.some((c) => c.toLowerCase().includes('reddit'))) return 'reddit';
  return 'community';
}

function buildKitForTip(entry, publishedDir = DEFAULT_PUBLISHED_DIR) {
  const progLang = String(entry.programming_language || entry.language || 'python').toLowerCase();
  const catPath = CATEGORY_PATH[progLang] || 'tips/python/';
  const langMap = COMMUNITY_MAP[progLang] || COMMUNITY_MAP.python;

  const locales = {};
  for (const loc of ALL_LOCALES) {
    const tr = loc === 'es' ? entry : (entry.translations && entry.translations[loc]) || null;
    if (!tr) continue;

    const mdFile = tr.file ? path.basename(tr.file) : loc === 'es' ? `${entry.slug}.md` : `${entry.slug}.${loc}.md`;
    const mdPath = path.join(publishedDir, mdFile);
    const parsed = fs.existsSync(mdPath) ? stripFrontmatter(fs.readFileSync(mdPath, 'utf8')) : { data: {}, body: '' };
    const title = parsed.data.title || tr.title || entry.title;
    const summary = parsed.data.description || tr.meta_description || entry.meta_description || title;
    const codeBlocks = extractCodeBlocks(parsed.body, 2);
    const communities = langMap[loc] || langMap.en;
    const utmSource = getUtmSourceForCommunity(loc, communities);
    const articleUrl = `${BASE_URL}/tools/code-formatter/${catPath}${entry.slug}/${loc}/?utm_source=${utmSource}&utm_medium=community&utm_campaign=${encodeURIComponent(entry.slug)}`;
    const cta = LOCALE_CTA[loc] || LOCALE_CTA.en;
    const langHashtag = `#${progLang.replace(/[^a-z0-9]/gi, '')}`;

    const bodyParts = [summary];
    if (codeBlocks.length > 0) {
      bodyParts.push('', ...codeBlocks);
    }
    bodyParts.push('', `${cta.readMore}: ${articleUrl}`, `${langHashtag} ${cta.hashtags}`);

    locales[loc] = {
      title,
      communities,
      utm_url: articleUrl,
      hashtags: `${langHashtag} ${cta.hashtags}`,
      post_markdown: bodyParts.join('\n'),
    };
  }

  return {
    slug: entry.slug,
    language: progLang,
    generated_at: new Date().toISOString(),
    locales,
  };
}

function formatSummaryMarkdown(kit) {
  const lines = [`### Kit de Distribución Regional — \`${kit.slug}\` (${kit.language.toUpperCase()})`, ''];
  for (const [loc, data] of Object.entries(kit.locales)) {
    lines.push(`<details><summary><strong>${loc}</strong> — ${data.communities.join(' · ')}</summary>`, '');
    lines.push(`**Título:** ${data.title}`, '');
    lines.push('```markdown', data.post_markdown, '```', '');
    lines.push('</details>', '');
  }
  return `${lines.join('\n')}\n`;
}

function generateDistributionKits(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST;
  const publishedDir = options.publishedDir || DEFAULT_PUBLISHED_DIR;
  const distDir = options.distDir || DEFAULT_DIST_DIR;
  const all = Boolean(options.all);
  const targetSlug = options.slug || null;
  const summaryPath = options.summaryPath !== undefined ? options.summaryPath : process.env.GITHUB_STEP_SUMMARY;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe manifiesto en ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tips = (Array.isArray(manifest.tips) ? manifest.tips : []).filter(
    (t) => !t.status || ['DEPLOYED', 'NOTIFIED'].includes(t.status)
  );
  if (tips.length === 0) {
    return [];
  }

  let selected = tips;
  if (targetSlug) {
    selected = tips.filter((t) => t.slug === targetSlug);
  } else if (!all) {
    selected = [tips[tips.length - 1]];
  }

  fs.mkdirSync(distDir, { recursive: true });
  const generated = [];
  for (const entry of selected) {
    const kit = buildKitForTip(entry, publishedDir);
    const outPath = path.join(distDir, `${entry.slug}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(kit, null, 2)}\n`, 'utf8');
    generated.push({ slug: entry.slug, path: outPath, kit });
  }

  if (summaryPath && generated.length > 0) {
    const md = generated.map((g) => formatSummaryMarkdown(g.kit)).join('\n');
    fs.appendFileSync(summaryPath, md, 'utf8');
  }

  return generated;
}

function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const slugIdx = args.indexOf('--slug');
  const slug = slugIdx >= 0 ? args[slugIdx + 1] : null;
  const results = generateDistributionKits({ all, slug });
  console.log(`Kit de distribución generado para ${results.length} tip(s):`);
  for (const r of results) {
    console.log(`  - ${r.slug} -> ${path.relative(ROOT_DIR, r.path)}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ALL_LOCALES,
  COMMUNITY_MAP,
  buildKitForTip,
  generateDistributionKits,
};
