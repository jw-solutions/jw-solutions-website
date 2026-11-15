import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const gen = require('../../scripts/code-formatter/generate-weekly-tip.js');
const devto = require('../../scripts/code-formatter/syndicate-devto.js');
const hashnode = require('../../scripts/code-formatter/syndicate-hashnode.js');
const social = require('../../scripts/code-formatter/syndicate-social.js');
const distKit = require('../../scripts/code-formatter/generate-distribution-kit.js');
const ROOT = path.resolve(import.meta.dirname, '..', '..');

function makeWords(n, prefix = 'palabra') {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
}

test('selectLanguage rota equilibradamente entre Martes y Jueves', () => {
  const counts = { python: 3, javascript: 2, typescript: 0, java: 1, csharp: 0, php: 1, sql: 2, dax: 1, json: 0, yaml: 0 };
  assert.equal(gen.selectLanguage({ slot: 'tuesday', counts }), 'typescript');
  assert.equal(gen.selectLanguage({ slot: 'thursday', counts }), 'json');
  assert.equal(gen.selectLanguage({ slot: 'tuesday', explicitLang: 'php', counts }), 'php');
  assert.throws(() => gen.selectLanguage({ slot: 'tuesday', explicitLang: 'rust', counts }), /no soportado/i);
});

test('validateTipPayload exige 7 idiomas, >=350 palabras y anti-repetición de slug', () => {
  const validBody = `## Antes\n\`\`\`python\nx=1\n\`\`\`\n## Después\n${makeWords(360)}`;
  const locales = Object.fromEntries(
    gen.ALL_LOCALES.map((l) => [
      l,
      {
        title: `Título en ${l}`,
        meta_description: 'Descripción SEO optimizada de prueba para validar el esquema multilingüe.',
        summary: `Resumen en ${l}`,
        body_markdown: validBody
      }
    ])
  );

  const raw = {
    slug: 'nuevo-tip-python-prueba',
    date: '2026-11-14',
    programming_language: 'python',
    category: 'Tips de Sintaxis',
    related_fix_slug: 'python-indentation-error',
    interactive_snippet: 'def greet(name: str) -> str:\n    return f"Hi {name}"',
    locales
  };

  const ok = gen.validateTipPayload(raw, {
    existingSlugs: new Set(['python-312-pep8-tips']),
    validFixSlugs: new Set(['python-indentation-error']),
    expectedLang: 'python'
  });
  assert.equal(ok.slug, 'nuevo-tip-python-prueba');

  assert.throws(
    () => gen.validateTipPayload(raw, { existingSlugs: new Set(['nuevo-tip-python-prueba']), validFixSlugs: new Set(['python-indentation-error']), expectedLang: 'python' }),
    /ya existente/i
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-tip-'));
  try {
    const written = gen.writeTipDrafts(ok, tmpDir);
    assert.equal(written.length, 7);
    assert.ok(fs.existsSync(path.join(tmpDir, 'nuevo-tip-python-prueba.md')));
    for (const l of gen.ALL_LOCALES.filter((x) => x !== 'es')) {
      assert.ok(fs.existsSync(path.join(tmpDir, `nuevo-tip-python-prueba.${l}.md`)));
    }
    assert.ok(gen.hasReadyDraft(tmpDir));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HTML estático pre-renderizado por idioma y sitemap-code-formatter.xml tienen SEO completo', () => {
  const langs = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
  for (const loc of langs) {
    const htmlPath = path.join(ROOT, 'tools', 'code-formatter', 'tips', 'python', 'python-312-pep8-tips', loc, 'index.html');
    assert.ok(fs.existsSync(htmlPath), `Falta HTML estático ${htmlPath}`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.match(html, new RegExp(`<html lang="${loc}">`));
    assert.match(html, new RegExp(`href="https://jw-solutions.com/tools/code-formatter/tips/python/python-312-pep8-tips/${loc}/"`));
    assert.match(html, new RegExp(`python-312-pep8-tips-${loc}\\.png`));
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, /"@type":\s*"TechArticle"/);
    assert.match(html, /https:\/\/api\.jw-solutions\.com\/api\/newsletter\/subscribe/);
  }
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap-code-formatter.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/jw-solutions\.com\/tools\/code-formatter\/tips\/python\/python-312-pep8-tips\/pt-BR\//);
});

test('Enlazado bidireccional /fix/ -> /tips/ renderiza hasta 3 tips relacionados en 7 idiomas', () => {
  const langs = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
  const rootFix = fs.readFileSync(path.join(ROOT, 'tools', 'code-formatter', 'fix', 'python-indentation-error', 'index.html'), 'utf8');
  assert.match(rootFix, /Guías y Tips relacionados/);
  assert.match(rootFix, /https:\/\/jw-solutions\.com\/tools\/code-formatter\/tips\/[a-z0-9-]+\/[a-z0-9-]+\/es\//);

  for (const loc of langs) {
    const locFixPath = path.join(ROOT, 'tools', 'code-formatter', 'fix', 'python-indentation-error', loc, 'index.html');
    assert.ok(fs.existsSync(locFixPath), `Falta landing /fix/ localizada ${locFixPath}`);
    const html = fs.readFileSync(locFixPath, 'utf8');
    assert.match(html, new RegExp(`<html lang="${loc}">`));
    assert.match(html, new RegExp(`https://jw-solutions\\.com/tools/code-formatter/tips/[a-z0-9-]+/[a-z0-9-]+/${loc}/`));
    assert.match(html, new RegExp(`href="https://jw-solutions\\.com/tools/code-formatter/tips/feed\\.${loc}\\.xml"`));
  }
});

test('Feeds RSS feed.xml y feed.<lang>.xml son XML válidos con items publicados', () => {
  const langs = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
  const mainFeed = fs.readFileSync(path.join(ROOT, 'tools', 'code-formatter', 'tips', 'feed.xml'), 'utf8');
  assert.match(mainFeed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(mainFeed, /<rss version="2\.0"/);
  assert.match(mainFeed, /xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/);
  assert.match(mainFeed, /<image>[\s\S]*?<url>https:\/\/jw-solutions\.com\/assets\/images\/og\/code-formatter-default\.png<\/url>/);
  assert.match(mainFeed, /<atom:link rel="alternate" type="application\/rss\+xml" hreflang="es" href="https:\/\/jw-solutions\.com\/tools\/code-formatter\/tips\/feed\.es\.xml"\/>/);
  assert.match(mainFeed, /<content:encoded><!\[CDATA\[/);
  assert.match(mainFeed, /<item>/);

  for (const loc of langs) {
    const feedPath = path.join(ROOT, 'tools', 'code-formatter', 'tips', `feed.${loc}.xml`);
    assert.ok(fs.existsSync(feedPath), `Falta feed RSS ${feedPath}`);
    const xml = fs.readFileSync(feedPath, 'utf8');
    assert.match(xml, new RegExp(`<language>${loc}</language>`));
    assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
    assert.match(xml, /<media:content url="https:\/\/jw-solutions\.com\/assets\/images\/og\/tips\/[^"]+\.png" medium="image" \/>/);
    assert.match(xml, /<content:encoded><!\[CDATA\[/);
    assert.match(xml, /<item>[\s\S]*?<title>[\s\S]*?<link>https:\/\/jw-solutions\.com\/tools\/code-formatter\/tips\//);
  }
});

test('FAQPage JSON-LD y <section class="cf-tip-faq"> se generan cuando el tip incluye faq', () => {
  const validBody = `## Antes\n\`\`\`python\nx=1\n\`\`\`\n## Después\n${makeWords(360)}`;
  const locales = Object.fromEntries(
    gen.ALL_LOCALES.map((l) => [
      l,
      {
        title: `FAQ Test ${l}`,
        meta_description: 'Descripción SEO de prueba para validar la generación de FAQPage.',
        summary: `Resumen ${l}`,
        body_markdown: validBody,
        faq: [
          { q: `¿Cómo evitar errores de tipado en ${l}?`, a: 'Usa anotaciones explícitas y validación estática.' },
          { q: `¿Por qué usar formateo automático en ${l}?`, a: 'Reduce fricción en code reviews y mantiene consistencia.' },
        ],
      },
    ])
  );
  const validated = gen.validateTipPayload(
    {
      slug: 'faq-unit-test-tip',
      date: '2026-11-14',
      programming_language: 'python',
      category: 'Tips de Sintaxis',
      related_fix_slug: 'python-indentation-error',
      interactive_snippet: 'x: int = 1',
      locales,
    },
    { existingSlugs: new Set(), validFixSlugs: new Set(['python-indentation-error']), expectedLang: 'python' }
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-faq-'));
  try {
    gen.writeTipDrafts(validated, tmpDir);
    const mdRaw = fs.readFileSync(path.join(tmpDir, 'faq-unit-test-tip.en.md'), 'utf8');
    assert.match(mdRaw, /^faq:\s*\[/m);

    const parsed = devto.stripFrontmatter(mdRaw);
    assert.ok(Array.isArray(parsed.data.faq));
    assert.equal(parsed.data.faq.length, 2);

    // Verificar que build_public.py renderiza FAQPage y <section class="cf-tip-faq">
    const manifestPath = path.join(tmpDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        tips: [
          {
            slug: 'faq-unit-test-tip',
            language: 'python',
            programming_language: 'python',
            category: 'Tips de Sintaxis',
            title: 'FAQ Test es',
            meta_description: 'Desc',
            file: path.join(tmpDir, 'faq-unit-test-tip.md'),
            published_at: '2026-11-14',
            status: 'DEPLOYED',
            translations: Object.fromEntries(
              gen.ALL_LOCALES.filter((l) => l !== 'es').map((l) => [
                l,
                {
                  title: `FAQ Test ${l}`,
                  meta_description: 'Desc',
                  file: path.join(tmpDir, `faq-unit-test-tip.${l}.md`),
                  faq: locales[l].faq,
                },
              ])
            ),
          },
        ],
      }),
      'utf8'
    );

    const pyCheck = execFileSync(
      'python',
      [
        '-c',
        [
          'import sys; from pathlib import Path; sys.path.insert(0, "scripts/code-formatter")',
          'import build_public as bp',
          'bp.TIPS_MANIFEST = Path(sys.argv[1])',
          'bp.TIPS_PUBLISHED_DIR = Path(sys.argv[2])',
          'pages = bp.tip_pages()',
          'en_html = pages["tools/code-formatter/tips/python/faq-unit-test-tip/en/index.html"]',
          'assert "<section class=\\"cf-tip-faq\\"" in en_html',
          'assert "<details class=\\"cf-faq__item\\"><summary>" in en_html',
          'assert \'"@type": "FAQPage"\' in en_html',
          'print("FAQ_OK")',
        ].join('; '),
        manifestPath,
        tmpDir,
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.match(pyCheck, /FAQ_OK/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syndicate-devto.js es idempotente y hace fallback seguro sin DEVTO_API_KEY', async () => {
  const skipped = await devto.syndicateAll({ apiKey: '' });
  assert.equal(skipped.skippedReason, 'missing_api_key');
  assert.equal(skipped.published.length, 0);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-devto-'));
  try {
    const manifestPath = path.join(tmpDir, 'manifest.json');
    const publishedDir = path.join(tmpDir, 'published');
    fs.mkdirSync(publishedDir, { recursive: true });
    fs.writeFileSync(
      path.join(publishedDir, 'sample-tip.en.md'),
      '---\ntitle: "Sample Tip"\ndescription: "Desc"\ncategory: "python"\nlanguage: "python"\ntags: ["python","pep8"]\n---\n\n## Hello\nBody content here.\n',
      'utf8'
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        tips: [
          { slug: 'sample-tip', category: 'python', language: 'python', status: 'DEPLOYED' },
          {
            slug: 'already-tip',
            category: 'python',
            language: 'python',
            status: 'NOTIFIED',
            syndication: { devto: { status: 'published', url: 'https://dev.to/jw/already' } },
          },
        ],
      }),
      'utf8'
    );

    let calls = 0;
    const mockFetch = async (url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.article.canonical_url, 'https://jw-solutions.com/tools/code-formatter/tips/python/sample-tip/en/');
      assert.equal(init.headers['api-key'], 'test-key');
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 42, url: 'https://dev.to/jw/sample-tip' }),
      };
    };

    const first = await devto.syndicateAll({ manifestPath, publishedDir, apiKey: 'test-key', fetchImpl: mockFetch });
    assert.equal(first.published.length, 1);
    assert.equal(first.alreadyPublished, 1);
    assert.equal(calls, 1);

    const second = await devto.syndicateAll({ manifestPath, publishedDir, apiKey: 'test-key', fetchImpl: mockFetch });
    assert.equal(second.published.length, 0);
    assert.equal(second.alreadyPublished, 2);
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syndicate-hashnode.js es idempotente y hace fallback seguro sin credenciales', async () => {
  const skipped = await hashnode.syndicateAll({ token: '', publicationId: '' });
  assert.equal(skipped.skippedReason, 'missing_credentials');
  assert.equal(skipped.published.length, 0);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hn-'));
  try {
    const manifestPath = path.join(tmpDir, 'manifest.json');
    const publishedDir = path.join(tmpDir, 'published');
    fs.mkdirSync(publishedDir, { recursive: true });
    fs.writeFileSync(
      path.join(publishedDir, 'hn-tip.en.md'),
      '---\ntitle: "Hashnode Tip"\ndescription: "Desc"\nprogramming_language: "python"\ntags: ["python","pep8"]\n---\n\n## Guide\nContent here.\n',
      'utf8'
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        tips: [
          { slug: 'hn-tip', language: 'python', programming_language: 'python', status: 'DEPLOYED' },
          {
            slug: 'hn-done',
            language: 'python',
            status: 'NOTIFIED',
            syndication: { hashnode: { status: 'published', url: 'https://blog.jw.com/hn-done' } },
          },
        ],
      }),
      'utf8'
    );

    let calls = 0;
    const mockFetch = async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.variables.input.publicationId, 'pub-123');
      assert.equal(
        body.variables.input.originalArticleURL,
        'https://jw-solutions.com/tools/code-formatter/tips/python/hn-tip/en/'
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { publishPost: { post: { id: 'p1', slug: 'hn-tip', url: 'https://blog.jw.com/hn-tip' } } },
        }),
      };
    };

    const first = await hashnode.syndicateAll({
      manifestPath,
      publishedDir,
      token: 'hn-tok',
      publicationId: 'pub-123',
      fetchImpl: mockFetch,
    });
    assert.equal(first.published.length, 1);
    assert.equal(first.alreadyPublished, 1);
    assert.equal(calls, 1);

    const second = await hashnode.syndicateAll({
      manifestPath,
      publishedDir,
      token: 'hn-tok',
      publicationId: 'pub-123',
      fetchImpl: mockFetch,
    });
    assert.equal(second.published.length, 0);
    assert.equal(second.alreadyPublished, 2);
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('syndicate-social.js hace fallback seguro sin secretos configurados', async () => {
  const skipped = await social.syndicateAll({
    bskyHandle: '',
    bskyAppPassword: '',
    mastodonUrl: '',
    mastodonToken: '',
    telegramToken: '',
    telegramChatId: '',
    discordWebhookUrl: '',
    githubToken: '',
    githubRepository: '',
  });
  assert.equal(skipped.skippedReason, 'missing_credentials');
  assert.equal(skipped.published.length, 0);
});

test('syndicate-social.js publica en Discord (Dark Gold + OG + UTM) y GitHub Discussions de forma idempotente', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-social-'));
  try {
    const manifestPath = path.join(tmpDir, 'manifest.json');
    const publishedDir = path.join(tmpDir, 'published');
    fs.mkdirSync(publishedDir, { recursive: true });
    fs.writeFileSync(
      path.join(publishedDir, 'match-case-tip.en.md'),
      '---\ntitle: "Python 3.12 Match-Case Formatting"\ndescription: "Clean PEP 8 structural pattern matching."\nprogramming_language: "python"\n---\n\nBody.\n',
      'utf8'
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        tips: [{ slug: 'match-case-tip', language: 'python', programming_language: 'python', status: 'DEPLOYED' }],
      }),
      'utf8'
    );

    const calls = [];
    const mockFetch = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.startsWith('https://discord.com/api/webhooks/')) {
        assert.equal(body.embeds[0].color, 13938487);
        assert.equal(body.embeds[0].image.url, 'https://jw-solutions.com/assets/images/og/tips/match-case-tip-en.png');
        assert.match(body.embeds[0].url, /utm_source=discord&utm_medium=social&utm_campaign=match-case-tip/);
        return { ok: true, status: 200, json: async () => ({ id: 'disc-msg-1' }) };
      }
      if (url === 'https://api.github.com/graphql' && body.query.includes('discussionCategories')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              repository: {
                id: 'REPO_ID_1',
                discussionCategories: { nodes: [{ id: 'CAT_ANN', name: 'Announcements', slug: 'announcements' }] },
              },
            },
          }),
        };
      }
      if (url === 'https://api.github.com/graphql' && body.query.includes('createDiscussion')) {
        assert.equal(body.variables.repositoryId, 'REPO_ID_1');
        assert.equal(body.variables.categoryId, 'CAT_ANN');
        assert.match(body.variables.body, /utm_source=github_discussions&utm_medium=social&utm_campaign=match-case-tip/);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              createDiscussion: {
                discussion: { id: 'D_1', url: 'https://github.com/jw-solutions/jw-solutions-website/discussions/1', number: 1 },
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const first = await social.syndicateAll({
      manifestPath,
      publishedDir,
      bskyHandle: '',
      bskyAppPassword: '',
      mastodonUrl: '',
      mastodonToken: '',
      telegramToken: '',
      telegramChatId: '',
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
      githubToken: 'ghp_test',
      githubRepository: 'jw-solutions/jw-solutions-website',
      fetchImpl: mockFetch,
    });
    assert.equal(first.errors.length, 0);
    assert.deepEqual(
      first.published.map((p) => p.channel),
      ['discord', 'github_discussions']
    );

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(updated.tips[0].syndication.social.discord.status, 'published');
    assert.equal(updated.tips[0].syndication.social.github_discussions.status, 'published');

    const second = await social.syndicateAll({
      manifestPath,
      publishedDir,
      bskyHandle: '',
      bskyAppPassword: '',
      mastodonUrl: '',
      mastodonToken: '',
      telegramToken: '',
      telegramChatId: '',
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
      githubToken: 'ghp_test',
      githubRepository: 'jw-solutions/jw-solutions-website',
      fetchImpl: mockFetch,
    });
    assert.equal(second.published.length, 0);
    assert.equal(calls.length, 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('seo-opportunities.json prioriza consultas pending en generate-weekly-tip.js y marca published sin romper rotación', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-seo-'));
  try {
    const seoPath = path.join(tmpDir, 'seo-opportunities.json');
    fs.writeFileSync(
      seoPath,
      JSON.stringify({
        version: 1,
        priorityQueries: [
          { query: 'already done query', lang: 'en', language: 'sql', status: 'published', slug: 'old-slug' },
          { query: 'python 3.12 match case formatting pep8', lang: 'en', language: 'python', status: 'pending' },
        ],
      }),
      'utf8'
    );

    const opp = gen.loadPendingSeoOpportunity(seoPath);
    assert.ok(opp);
    assert.equal(opp.index, 1);
    assert.equal(opp.item.language, 'python');

    const prompt = gen.buildPrompt({
      progLang: opp.item.language,
      slot: 'tuesday',
      existingTitles: [],
      existingSlugs: new Set(),
      fixes: [],
      seoOpportunity: opp.item,
    });
    assert.match(prompt, /python 3\.12 match case formatting pep8/);

    const marked = gen.markSeoOpportunityPublished(seoPath, opp.index, 'python-312-match-case-pep8');
    assert.equal(marked, true);
    assert.equal(gen.loadPendingSeoOpportunity(seoPath), null);

    const saved = JSON.parse(fs.readFileSync(seoPath, 'utf8'));
    assert.equal(saved.priorityQueries[1].status, 'published');
    assert.equal(saved.priorityQueries[1].slug, 'python-312-match-case-pep8');

    // Rotación automática sigue intacta cuando no hay pendientes
    assert.equal(gen.selectLanguage({ slot: 'tuesday', counts: { python: 2, javascript: 0 } }), 'javascript');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('generate-distribution-kit.js genera 7 idiomas con comunidades y parámetros UTM correctos', () => {
  const kitPath = path.join(ROOT, 'content', 'code-formatter-tips', 'distribution', 'python-312-pep8-tips.json');
  assert.ok(fs.existsSync(kitPath), `Falta kit de distribución ${kitPath}`);
  const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
  assert.equal(kit.slug, 'python-312-pep8-tips');
  assert.equal(kit.language, 'python');
  for (const loc of distKit.ALL_LOCALES) {
    assert.ok(kit.locales[loc], `Falta locale ${loc} en kit`);
    assert.ok(Array.isArray(kit.locales[loc].communities) && kit.locales[loc].communities.length > 0);
    assert.match(kit.locales[loc].utm_url, /utm_source=/);
    assert.match(kit.locales[loc].utm_url, /utm_medium=community/);
    assert.match(kit.locales[loc].utm_url, /utm_campaign=python-312-pep8-tips/);
  }
  assert.ok(kit.locales.en.communities.includes('Reddit: r/Python'));
  assert.ok(kit.locales.es.communities.includes('Reddit: r/programacion'));
  assert.ok(kit.locales['pt-BR'].communities.includes('TabNews (tabnews.com.br)'));
  assert.ok(kit.locales.fr.communities.includes('Zeste de Savoir'));
  assert.ok(kit.daily_dev_squad, 'Falta sección daily_dev_squad');
  assert.equal(kit.daily_dev_squad.squad_url, 'https://dly.to/nmdN9vQObOU');
  assert.match(kit.daily_dev_squad.en.utm_url, /utm_source=dailydev&utm_medium=squad&utm_campaign=python-312-pep8-tips/);
  assert.match(kit.daily_dev_squad.es.utm_url, /utm_source=dailydev&utm_medium=squad&utm_campaign=python-312-pep8-tips/);

  const toolHtml = fs.readFileSync(path.join(ROOT, 'tools', 'code-formatter', 'index.html'), 'utf8');
  assert.match(toolHtml, /https:\/\/dly\.to\/nmdN9vQObOU/);
});
