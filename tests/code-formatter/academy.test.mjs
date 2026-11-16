import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  createInitialState,
  isLevelUnlocked,
  recordAttempt,
  completeRemedialDrill,
  recordDailyCompletion,
} from '../../assets/js/tools/code-formatter/academy-engine.js';

const ROOT = resolve(process.cwd());
const LOCALES = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

test('Switch dual Formateador <-> Academia presente en tools/code-formatter/index.html', () => {
  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  assert.match(html, /id="cf-mode-switch"[^>]*role="tablist"/);
  assert.match(html, /id="cf-mode-formatter"[^>]*data-cf-work-mode="format"/);
  assert.match(html, /id="cf-mode-academy"[^>]*data-cf-work-mode="learn"/);
  assert.match(html, /'wasm-unsafe-eval'/);
  assert.match(html, /worker-src 'self' blob:/);
  assert.match(html, /frame-src 'self' blob:/);
});

test('Bloqueo secuencial: nivel N+1 bloqueado hasta aprobar nivel N', () => {
  const levels = [
    { id: 'python-1', level: 1, tier: 'free' },
    { id: 'python-2', level: 2, tier: 'free' },
    { id: 'python-3', level: 3, tier: 'pay' },
  ];
  const state = createInitialState();
  assert.equal(isLevelUnlocked(levels[0], 0, levels, state), true);
  assert.equal(isLevelUnlocked(levels[1], 1, levels, state), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, state), false);

  const after1 = recordAttempt(state, levels[0], { passed: true }).state;
  assert.equal(isLevelUnlocked(levels[1], 1, levels, after1), true);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, after1), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, { ...after1, isPro: true }), true);
});

test('Disparo automático de entrenamiento remedial tras 2 fallos consecutivos y racha diaria', () => {
  const lvl = {
    id: 'python-1',
    remedial_drills: [
      { id: 'd1', error_type: 'syntax', title: 'Syntax', prompt: 'Fix', starter_code: 'x', expected_pattern: ':', solution_hint: 'hint' },
      { id: 'd2', error_type: 'edge_case', title: 'Edge', prompt: 'Guard', starter_code: 'y', expected_pattern: 'if', solution_hint: 'hint' },
    ],
  };
  let state = createInitialState();
  const r1 = recordAttempt(state, lvl, { passed: false, errorType: 'syntax' });
  assert.equal(r1.triggerRemedial, false);
  const r2 = recordAttempt(r1.state, lvl, { passed: false, errorType: 'syntax' });
  assert.equal(r2.triggerRemedial, true);
  assert.equal(r2.recommendedDrill.id, 'd1');

  const afterDrill = completeRemedialDrill(r2.state, lvl.id, 'd1');
  assert.deepEqual(afterDrill.remedialCompleted, ['d1']);

  const s1 = recordDailyCompletion(afterDrill, '2026-11-14');
  const s2 = recordDailyCompletion(s1, '2026-11-15');
  assert.equal(s2.dailyStreak, 2);
});

test('Sandbox iframe usa sandbox="allow-scripts" sin allow-same-origin y verifica event.source', () => {
  const src = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/academy-sandbox.js'), 'utf8');
  assert.match(src, /setAttribute\('sandbox',\s*'allow-scripts'\)/);
  assert.doesNotMatch(src, /setAttribute\(['"]sandbox['"],[^)]*allow-same-origin/);
  assert.match(src, /event\.source !== iframe\.contentWindow/);
});

test('Paridad i18n de Academia en los 7 locales', async () => {
  const base = (await import('../../assets/js/tools/code-formatter/locales/es.js')).default;
  const acadKeys = Object.keys(base).filter((k) => k.startsWith('acad') || k === 'tipsPracticeAcademy');
  assert.ok(acadKeys.length >= 25);

  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of acadKeys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta ${k} en ${loc}`);
    }
  }
});

test('dist-public/: CTA Academia en /tips/ y /fix/ encima del footer, 0 pay y 0 data-cf-commercial', () => {
  const dist = join(ROOT, 'dist-public');
  assert.ok(existsSync(dist), 'dist-public/ debe existir');
  assert.equal(existsSync(join(dist, 'assets/js/tools/code-formatter/academy-pro.js')), false, 'academy-pro.js no debe estar en dist-public');

  const indexHtml = readFileSync(join(dist, 'tools/code-formatter/index.html'), 'utf8');
  assert.equal(indexHtml.includes('data-cf-commercial'), false);

  const tipsDir = join(dist, 'tools/code-formatter/tips');
  const fixDir = join(dist, 'tools/code-formatter/fix');

  const sampleTip = join(tipsDir, 'python', 'python-312-pep8-tips', 'es', 'index.html');
  assert.ok(existsSync(sampleTip), 'Debe existir tip compilado en dist-public');
  const tipHtml = readFileSync(sampleTip, 'utf8');
  assert.ok(tipHtml.includes('cf-academy-funnel-cta'), 'Tip debe incluir CTA Academia');
  assert.ok(tipHtml.indexOf('cf-academy-funnel-cta') < tipHtml.indexOf('<footer class="cf-footer">'), 'CTA debe ir encima del footer');
  assert.equal(tipHtml.includes('data-cf-commercial'), false);

  const fixSlugs = readdirSync(fixDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(fixSlugs.length > 0);
  const sampleFix = readFileSync(join(fixDir, fixSlugs[0].name, 'es', 'index.html'), 'utf8');
  assert.ok(sampleFix.includes('cf-academy-funnel-cta'), 'Landing /fix/ debe incluir CTA Academia');
  assert.ok(sampleFix.indexOf('cf-academy-funnel-cta') < sampleFix.indexOf('<footer class="cf-footer">'), 'CTA /fix/ debe ir encima del footer');
  assert.equal(sampleFix.includes('data-cf-commercial'), false);
});
