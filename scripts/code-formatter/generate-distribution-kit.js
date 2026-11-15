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
    en: ['Reddit: r/Python', 'Hacker News', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Reddit: r/taquerosprogramadores', 'Reddit: r/chileIT', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt', 'TabNews (tabnews.com.br)'],
    fr: ['Zeste de Savoir', 'Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  javascript: {
    en: ['Reddit: r/typescript', 'Reddit: r/webdev', 'Reddit: r/javascript', 'Hacker News', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Reddit: r/taquerosprogramadores', 'Reddit: r/chileIT', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  typescript: {
    en: ['Reddit: r/typescript', 'Reddit: r/webdev', 'Reddit: r/javascript', 'Hacker News', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Reddit: r/taquerosprogramadores', 'Reddit: r/chileIT', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  sql: {
    en: ['Reddit: r/SQL', 'Reddit: r/PowerBI', 'Reddit: r/BusinessIntelligence', 'Hacker News', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  dax: {
    en: ['Reddit: r/PowerBI', 'Reddit: r/BusinessIntelligence', 'Reddit: r/SQL', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/chileIT'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  java: {
    en: ['Reddit: r/java', 'Hacker News', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/devsarg', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  csharp: {
    en: ['Reddit: r/csharp', 'Reddit: r/dotnet', 'Hacker News', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/taquerosprogramadores', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  php: {
    en: ['Reddit: r/PHP', 'Reddit: r/webdev', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Menéame'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Developpez.com', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  json: {
    en: ['Reddit: r/devops', 'Reddit: r/webdev', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/chileIT'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
    it: ['HTML.it', 'Reddit: r/ItalyInformatica'],
  },
  yaml: {
    en: ['Reddit: r/devops', 'Reddit: r/webdev', 'Medium (Importar URL canónica)'],
    es: ['Reddit: r/programacion', 'Reddit: r/chileIT'],
    'pt-BR': ['TabNews (tabnews.com.br)', 'Reddit: r/brdev'],
    'pt-PT': ['Reddit: r/devpt'],
    fr: ['Zeste de Savoir', 'Reddit: r/developpeurs'],
    de: ['Heise Developer / iX', 'Reddit: r/de_EDV'],
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

  const dailyDevSquad = {
    squad_url: 'https://dly.to/nmdN9vQObOU',
    en: locales.en
      ? {
          title: locales.en.title,
          utm_url: `${BASE_URL}/tools/code-formatter/${catPath}${entry.slug}/en/?utm_source=dailydev&utm_medium=squad&utm_campaign=${encodeURIComponent(entry.slug)}`,
          post_markdown: locales.en.post_markdown.replace(/utm_source=[a-z]+&utm_medium=community/, 'utm_source=dailydev&utm_medium=squad'),
        }
      : null,
    es: locales.es
      ? {
          title: locales.es.title,
          utm_url: `${BASE_URL}/tools/code-formatter/${catPath}${entry.slug}/es/?utm_source=dailydev&utm_medium=squad&utm_campaign=${encodeURIComponent(entry.slug)}`,
          post_markdown: locales.es.post_markdown.replace(/utm_source=[a-z]+&utm_medium=community/, 'utm_source=dailydev&utm_medium=squad'),
        }
      : null,
  };

  return {
    slug: entry.slug,
    language: progLang,
    generated_at: new Date().toISOString(),
    daily_dev_squad: dailyDevSquad,
    locales,
  };
}

function formatSummaryMarkdown(kit) {
  const lines = [`### Kit de Distribución Regional — \`${kit.slug}\` (${kit.language.toUpperCase()})`, ''];
  if (kit.daily_dev_squad) {
    lines.push(`<details open><summary><strong>Daily.dev Squad</strong> — ${kit.daily_dev_squad.squad_url}</summary>`, '');
    for (const loc of ['en', 'es']) {
      const sq = kit.daily_dev_squad[loc];
      if (!sq) continue;
      lines.push(`**${loc.toUpperCase()} — ${sq.title}**`, '', '```markdown', sq.post_markdown, '```', '');
    }
    lines.push('</details>', '');
  }
  for (const [loc, data] of Object.entries(kit.locales)) {
    lines.push(`<details><summary><strong>${loc}</strong> — ${data.communities.join(' · ')}</summary>`, '');
    lines.push(`**Título:** ${data.title}`, '');
    lines.push('```markdown', data.post_markdown, '```', '');
    lines.push('</details>', '');
  }
  return `${lines.join('\n')}\n`;
}

function buildConsolidatedMarkdown(kits) {
  const lines = [
    '# Ready to Post — All Published Code Formatter & Auto-Doc AI Articles',
    '',
    `> **Generado:** ${new Date().toISOString()} · **Artículos:** ${kits.length} · **Squad oficial:** https://dly.to/nmdN9vQObOU`,
    '',
    '---',
    '',
    '## Bloque 1 — Para daily.dev Squad (https://dly.to/nmdN9vQObOU)',
    '',
  ];

  for (const kit of kits) {
    const sq = kit.daily_dev_squad;
    if (!sq) continue;
    lines.push(`### ${kit.slug} (\`${kit.language.toUpperCase()}\`)`, '');
    for (const loc of ['en', 'es']) {
      if (!sq[loc]) continue;
      lines.push(`#### [${loc.toUpperCase()}] ${sq[loc].title}`, '');
      lines.push(`- **URL rastreable:** ${sq[loc].utm_url}`, '');
      lines.push('```markdown', sq[loc].post_markdown, '```', '');
    }
  }

  lines.push('---', '', '## Bloque 2 — Para Comunidades Regionales (7 Idiomas)', '');
  const regionalGroups = [
    { label: 'EN (Reddit / Hacker News / Medium)', locs: ['en'] },
    { label: 'ES (r/programacion / r/devsarg / Menéame)', locs: ['es'] },
    { label: 'PT-BR / PT-PT (TabNews Markdown nativo / r/brdev / r/devpt)', locs: ['pt-BR', 'pt-PT'] },
    { label: 'FR / DE / IT (Zeste de Savoir / Heise Developer / r/de_EDV / r/ItalyInformatica)', locs: ['fr', 'de', 'it'] },
  ];

  for (const grp of regionalGroups) {
    lines.push(`### ${grp.label}`, '');
    for (const kit of kits) {
      for (const loc of grp.locs) {
        const d = kit.locales[loc];
        if (!d) continue;
        lines.push(`#### \`${kit.slug}\` [${loc}] — ${d.communities.join(' · ')}`, '');
        lines.push(`**Título:** ${d.title}`, '');
        lines.push('```markdown', d.post_markdown, '```', '');
      }
    }
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

  if (all && generated.length > 0) {
    const consolidatedPath = path.join(distDir, 'READY_TO_POST_ALL_6_ARTICLES.md');
    fs.writeFileSync(consolidatedPath, buildConsolidatedMarkdown(generated.map((g) => g.kit)), 'utf8');
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
