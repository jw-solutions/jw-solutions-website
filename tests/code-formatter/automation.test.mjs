import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gen = require('../../scripts/code-formatter/generate-weekly-tip.js');
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
