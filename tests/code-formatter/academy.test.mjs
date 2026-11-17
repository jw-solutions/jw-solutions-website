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

test('Click autenticado en #cf-academy-daily-btn en móvil (375px) despliega workspace, misión y código en editor', async () => {
  const makeNode = (id, extra = {}) => {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const node = {
      id,
      hidden: true,
      disabled: false,
      textContent: '',
      children,
      dataset: extra.dataset || {},
      parentElement: null,
      classList: {
        toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      addEventListener: (ev, fn) => {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      dispatchClick: async () => {
        for (const fn of listeners.get('click') || []) await fn({ preventDefault() {} });
      },
      append: (...items) => items.forEach((it) => { if (it && typeof it === 'object') it.parentElement = node; children.push(it); }),
      prepend: (...items) => items.forEach((it) => { if (it && typeof it === 'object') it.parentElement = node; children.unshift(it); }),
      replaceChildren: (...items) => { children.length = 0; node.append(...items); },
      scrollIntoView: () => { node._scrolled = true; },
    };
    return node;
  };

  const nodes = {
    'cf-academy-shell': makeNode('cf-academy-shell'),
    'cf-mode-formatter': makeNode('cf-mode-formatter'),
    'cf-mode-academy': makeNode('cf-mode-academy'),
    'cf-formatter-toolbar': makeNode('cf-formatter-toolbar'),
    'cf-editor-slot-home': makeNode('cf-editor-slot-home'),
    'cf-editor-card': makeNode('cf-editor-card'),
    'cf-academy-editor-slot': makeNode('cf-academy-editor-slot'),
    'cf-academy-paths': makeNode('cf-academy-paths'),
    'cf-academy-workspace': makeNode('cf-academy-workspace'),
    'cf-academy-back': makeNode('cf-academy-back'),
    'cf-academy-daily-btn': makeNode('cf-academy-daily-btn'),
    'cf-academy-skill-tree': makeNode('cf-academy-skill-tree'),
    'cf-academy-mission-card': makeNode('cf-academy-mission-card'),
    'cf-academy-checklist': makeNode('cf-academy-checklist'),
    'cf-academy-live': makeNode('cf-academy-live'),
    'cf-academy-validate': makeNode('cf-academy-validate'),
    'cf-academy-diff': makeNode('cf-academy-diff'),
  };

  const tabMission = makeNode('tab-mission', { dataset: { acadPane: 'mission' } });
  const paneMission = makeNode('cf-academy-mission-pane', { dataset: { acadPaneBody: 'mission' } });
  const paneEditor = makeNode('cf-academy-editor-pane', { dataset: { acadPaneBody: 'editor' } });

  const prevFetch = globalThis.fetch;
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  const prevStorage = globalThis.localStorage;
  const prevSessionStorage = globalThis.sessionStorage;

  globalThis.location = { pathname: '/tools/code-formatter/', search: '?mode=learn&lang=es' };
  globalThis.window = {
    innerWidth: 375,
    location: { href: 'https://jw-solutions.com/tools/code-formatter/?mode=learn&lang=es', search: '?mode=learn&lang=es' },
    history: { replaceState() {} },
  };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    head: { append() {} },
    body: { append() {} },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.cf-academy-mobile-tab' ? [tabMission] : sel === '[data-acad-pane-body]' ? [paneMission, paneEditor] : []),
    createElement: (tag) => makeNode(tag),
    createTextNode: (txt) => ({ textContent: txt }),
    addEventListener: () => {},
    dispatchEvent: () => {},
  };

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/api/me')) {
      return { ok: true, status: 200, json: async () => ({ email: 'user@example.com', plan: 'free' }) };
    }
    if (u.includes('paths.json')) {
      return { ok: true, status: 200, json: async () => ({ paths: [] }) };
    }
    if (u.includes('daily-challenges.json')) {
      const daily = JSON.parse(readFileSync(join(ROOT, 'content/code-formatter-academy/daily-challenges.json'), 'utf8'));
      return { ok: true, status: 200, json: async () => daily };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  let loadedCode = '';
  let loadedLang = '';
  try {
    const { initAcademyUI } = await import(`../../assets/js/tools/code-formatter/academy-ui.js?t=${Date.now()}`);
    const api = initAcademyUI({
      getCode: () => loadedCode,
      setCode: (c) => { loadedCode = c; },
      setLanguage: (l) => { loadedLang = l; },
    });
    assert.ok(api, 'initAcademyUI debe inicializarse');

    await nodes['cf-academy-daily-btn'].dispatchClick();
    // Esperar microtasks asíncronos de fetch(/api/me) y fetch(daily-challenges.json)
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(nodes['cf-academy-shell'].hidden, false);
    assert.equal(nodes['cf-academy-workspace'].hidden, false);
    assert.equal(nodes['cf-academy-workspace']._scrolled, true);
    assert.equal(paneMission.classList.contains('is-active'), true);
    assert.ok(nodes['cf-academy-mission-card'].children.length >= 3, 'El panel de Misión debe renderizar título, descripción y cápsula');
    assert.ok(loadedCode.length > 10, 'El código inicial del reto debe cargarse en el editor');
    assert.ok(loadedLang.length > 0, 'El lenguaje del reto debe seleccionarse');
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
    globalThis.localStorage = prevStorage;
    globalThis.sessionStorage = prevSessionStorage;
  }
});

test('Flujo encadenado Duolingo/Brilliant: pistas progresivas, pre-carga N+1, remedial x2 y paridad i18n 7 locales', async () => {
  const newKeys = [
    'trialAutoWelcome',
    'acadStartLevelBtn',
    'acadGoToEditorBtn',
    'acadStickyBriefLabel',
    'acadLockedPrevMsg',
    'acadGoActiveLevelBtn',
    'acadHintBtn',
    'acadHintConcept',
    'acadHintSyntax',
    'acadProgressBar',
    'acadNextBadgeProgress',
    'acadNextLevelBtn',
    'acadFixInEditorBtn',
    'acadRemedialMastered',
  ];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of newKeys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta ${k} en ${loc}`);
    }
  }

  const indexHtml = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  assert.match(indexHtml, /id="cf-academy-progress-bar"/);
  assert.match(indexHtml, /id="cf-academy-mini-brief"/);

  const acadJs = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/academy-ui.js'), 'utf8');
  assert.match(acadJs, /cf-skill-node--pulse/);
  assert.match(acadJs, /preloadedNextLevel/);
  assert.match(acadJs, /cf-academy-next-level-btn/);
  assert.match(acadJs, /cf-academy-fix-editor-btn/);
  assert.match(acadJs, /cf-academy-remedial-box/);
  assert.match(acadJs, /acadHintBtn/);
});
