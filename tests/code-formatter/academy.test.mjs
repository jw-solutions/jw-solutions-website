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

test('Bloqueo secuencial estricto: nivel N+1 (free o pay) bloqueado hasta aprobar nivel N incluso con isPro=true', () => {
  const levels = [
    { id: 'python-1', level: 1, tier: 'free' },
    { id: 'python-2', level: 2, tier: 'free' },
    { id: 'python-3', level: 3, tier: 'pay' },
    { id: 'python-4', level: 4, tier: 'pay' },
    { id: 'python-5', level: 5, tier: 'pay' },
  ];
  const freeState = createInitialState();
  const proState = { ...createInitialState(), isPro: true };

  // Con isPro=true y Nivel 1 sin completar: SOLO Nivel 1 está activo; 2, 3, 4 y 5 bloqueados
  assert.equal(isLevelUnlocked(levels[0], 0, levels, proState), true);
  assert.equal(isLevelUnlocked(levels[1], 1, levels, proState), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, proState), false);
  assert.equal(isLevelUnlocked(levels[3], 3, levels, proState), false);
  assert.equal(isLevelUnlocked(levels[4], 4, levels, proState), false);

  // Al completar Nivel 1: se abre Nivel 2, pero 3, 4 y 5 siguen bloqueados incluso con isPro=true
  const after1 = recordAttempt(freeState, levels[0], { passed: true }).state;
  assert.equal(isLevelUnlocked(levels[1], 1, levels, after1), true);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, after1), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, { ...after1, isPro: true }), false);
  assert.equal(isLevelUnlocked(levels[3], 3, levels, { ...after1, isPro: true }), false);

  // Al completar Nivel 2: Nivel 3 exige isPro=true; Nivel 4 sigue bloqueado hasta completar Nivel 3
  const after2 = recordAttempt(after1, levels[1], { passed: true }).state;
  assert.equal(isLevelUnlocked(levels[2], 2, levels, after2), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, { ...after2, isPro: true }), true);
  assert.equal(isLevelUnlocked(levels[3], 3, levels, { ...after2, isPro: true }), false);

  // Al completar Nivel 3 con Pro: se abre Nivel 4, Nivel 5 sigue bloqueado
  const after3 = recordAttempt(after2, levels[2], { passed: true }).state;
  assert.equal(isLevelUnlocked(levels[3], 3, levels, { ...after3, isPro: true }), true);
  assert.equal(isLevelUnlocked(levels[4], 4, levels, { ...after3, isPro: true }), false);
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

test('Flujo de vista única (375px) + Gate de usuario: paths → tree → editor → results, remedial, 401 → modal y reanudación', async () => {
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
      querySelector: () => null,
    };
    return node;
  };

  const nodes = {
    'cf-academy-shell': makeNode('cf-academy-shell'),
    'cf-academy-head': makeNode('cf-academy-head'),
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
    'cf-academy-mini-brief': makeNode('cf-academy-mini-brief'),
    'cf-academy-mini-brief-title': makeNode('cf-academy-mini-brief-title'),
    'cf-academy-mini-brief-body': makeNode('cf-academy-mini-brief-body'),
    'cf-academy-editor-hint': makeNode('cf-academy-editor-hint'),
    'cf-academy-editor-hint-box': makeNode('cf-academy-editor-hint-box'),
  };

  const tabMission = makeNode('tab-mission', { dataset: { acadPane: 'mission' } });
  const tabEditor = makeNode('tab-editor', { dataset: { acadPane: 'editor' } });
  const tabResults = makeNode('tab-results', { dataset: { acadPane: 'results' } });
  const paneMission = makeNode('cf-academy-mission-pane', { dataset: { acadPaneBody: 'mission' } });
  const paneEditor = makeNode('cf-academy-editor-pane', { dataset: { acadPaneBody: 'editor' } });
  const paneResults = makeNode('cf-academy-results-pane', { dataset: { acadPaneBody: 'results' } });
  const docListeners = new Map();
  const dispatched = [];
  let meState = 'free'; // anon | free | pro
  const memStore = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  };

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
  globalThis.localStorage = memStore();
  globalThis.sessionStorage = memStore();
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    head: { append() {} },
    body: { append() {} },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.cf-academy-mobile-tab' ? [tabMission, tabEditor, tabResults] : sel === '[data-acad-pane-body]' ? [paneMission, paneEditor, paneResults] : []),
    createElement: (tag) => makeNode(tag),
    createTextNode: (txt) => ({ textContent: txt }),
    addEventListener: (ev, fn) => {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    dispatchEvent: (ev) => { dispatched.push(ev); },
  };

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('features.runtime.json')) {
      return { ok: true, status: 200, json: async () => ({ features: [{ id: 'accounts_auth', tier: 'free', active: true }] }) };
    }
    if (u.includes('/api/me')) {
      if (meState === 'anon') return { ok: false, status: 401, json: async () => ({}) };
      const user = meState === 'pro' ? { email: 'user@example.com', plan: 'pro', pro_active: true } : { email: 'user@example.com', plan: 'free' };
      return { ok: true, status: 200, json: async () => user };
    }
    if (u.includes('paths.json')) {
      return { ok: true, status: 200, json: async () => ({ paths: [] }) };
    }
    if (u.includes('daily-challenges.json')) {
      const daily = JSON.parse(readFileSync(join(ROOT, 'content/code-formatter-academy/daily-challenges.json'), 'utf8'));
      return { ok: true, status: 200, json: async () => daily };
    }
    if (u.includes('curriculum/') && u.endsWith('/python.json')) {
      const curriculum = {
        tech: 'python',
        standard: 'PEP 8',
        levels: [{
          id: 'python-1', level: 1, tier: 'free', title: 'Nivel remedial', concept_capsule: 'Cápsula',
          starter_code: 'pass', reference_solution: 'def total(items):\n    return 0\n', style_rules: [],
          tests: [{ id: 't1', name: 'Define total', visible: true, type: 'pattern', expected: 'def total(', description: 'Define la función' }],
          remedial_drills: [{ id: 'drill-edge', error_type: 'edge_case', title: 'Guardia vacía', prompt: 'Protege la lista vacía', starter_code: '# drill start', expected_pattern: 'if not items', solution_hint: 'hint' }],
        }, {
          id: 'python-2', level: 2, tier: 'pay', title: 'Nivel Pro', concept_capsule: 'Cápsula Pro',
          starter_code: 'pass', reference_solution: 'pass', style_rules: [],
          tests: [{ id: 't2', name: 'Pro', visible: true, type: 'pattern', expected: 'pass', description: 'Pro' }],
        }],
      };
      return { ok: true, status: 200, json: async () => curriculum };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  let loadedCode = '';
  let loadedLang = '';
  try {
    const { featuresReady } = await import('../../assets/js/tools/code-formatter/ui-controller.js');
    await featuresReady; // accounts_auth activo: el Gate de usuario se aplica
    const { initAcademyUI } = await import(`../../assets/js/tools/code-formatter/academy-ui.js?t=${Date.now()}`);
    const api = initAcademyUI({
      getCode: () => loadedCode,
      setCode: (c) => { loadedCode = c; },
      setLanguage: (l) => { loadedLang = l; },
    });
    assert.ok(api, 'initAcademyUI debe inicializarse');

    const visiblePanes = () => [paneMission, paneEditor, paneResults].filter((p) => p.hidden === false).length;

    // Vista 1 · paths: solo cabecera + rutas; workspace oculto
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(nodes['cf-academy-head'].hidden, false);
    assert.equal(nodes['cf-academy-paths'].hidden, false);
    assert.equal(nodes['cf-academy-workspace'].hidden, true);

    // Reto Diario directo: entra en vista editor lista para trabajar con mini-brief visible
    await nodes['cf-academy-daily-btn'].dispatchClick();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(nodes['cf-academy-shell'].hidden, false);
    assert.equal(nodes['cf-academy-head'].hidden, true);
    assert.equal(nodes['cf-academy-paths'].hidden, true);
    assert.equal(nodes['cf-academy-workspace'].hidden, false);
    assert.equal(nodes['cf-academy-workspace']._scrolled, true);
    assert.equal(paneEditor.hidden, false, 'Reto Diario debe abrir directamente en el editor');
    assert.equal(paneMission.hidden, true);
    assert.equal(paneResults.hidden, true);
    assert.equal(visiblePanes(), 1);
    assert.equal(nodes['cf-academy-mini-brief'].hidden, false, 'Mini-brief visible en cabecera del editor');
    assert.ok(nodes['cf-academy-mission-card'].children.length >= 3, 'El panel de Misión debe renderizar título, descripción y cápsula');
    assert.ok(loadedCode.length > 10, 'El código inicial del reto debe cargarse en el editor');
    assert.ok(loadedLang.length > 0, 'El lenguaje del reto debe seleccionarse');
    assert.equal(tabResults.disabled, true, 'Resultados bloqueado hasta validar');

    const findById = (node, id) => {
      for (const c of node.children || []) {
        if (c && c.id === id) return c;
        const deep = c && c.children ? findById(c, id) : null;
        if (deep) return deep;
      }
      return null;
    };
    const goEditor = findById(nodes['cf-academy-mission-card'], 'cf-academy-go-editor');
    assert.ok(goEditor, 'Debe existir #cf-academy-go-editor en la misión');

    // cf:lang conserva paso, nivel y el código del usuario
    loadedCode = 'def total(items):\n    return 0\n';
    for (const fn of docListeners.get('cf:lang') || []) await fn({});
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(paneEditor.hidden, false, 'cf:lang debe conservar el paso editor');
    assert.equal(paneMission.hidden, true);
    assert.equal(loadedCode, 'def total(items):\n    return 0\n', 'cf:lang no debe resetear el código');

    // Vista 4 · results
    await nodes['cf-academy-validate'].dispatchClick();
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(paneResults.hidden, false);
    assert.equal(paneMission.hidden, true);
    assert.equal(paneEditor.hidden, true);
    assert.equal(visiblePanes(), 1);

    // Volver: results → editor → tree
    await nodes['cf-academy-back'].dispatchClick();
    assert.equal(paneEditor.hidden, false);
    assert.equal(paneResults.hidden, true);
    await nodes['cf-academy-back'].dispatchClick();
    assert.equal(paneMission.hidden, false);
    assert.equal(paneEditor.hidden, true);

    // Volver a Rutas desde el reto diario
    await nodes['cf-academy-back'].dispatchClick();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(nodes['cf-academy-head'].hidden, false);
    assert.equal(nodes['cf-academy-paths'].hidden, false);
    assert.equal(nodes['cf-academy-workspace'].hidden, true);

    // Flujo remedial: 2 fallos → remedial → aprobar contra SUS criterios → retorno al reto principal
    await api.openTopic('python', 1, '');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(paneMission.hidden, false);
    await findById(nodes['cf-academy-mission-card'], 'cf-academy-go-editor').dispatchClick();
    assert.equal(paneEditor.hidden, false);

    loadedCode = 'x = 1';
    await nodes['cf-academy-validate'].dispatchClick();
    assert.equal(paneResults.hidden, false);
    assert.equal(findById(nodes['cf-academy-checklist'], 'cf-academy-remedial-box'), null, '1.er fallo no abre remedial');
    await nodes['cf-academy-back'].dispatchClick();
    await nodes['cf-academy-validate'].dispatchClick();
    const practiceBtn = findById(nodes['cf-academy-checklist'], 'cf-academy-remedial-practice-btn');
    assert.ok(findById(nodes['cf-academy-checklist'], 'cf-academy-remedial-box'), '2.º fallo abre #cf-academy-remedial-box');
    assert.ok(practiceBtn, 'Botón de práctica remedial');

    await practiceBtn.dispatchClick();
    assert.equal(paneEditor.hidden, false);
    assert.equal(paneResults.hidden, true);
    assert.equal(loadedCode, '# drill start', 'El editor carga el micro-ejercicio');
    assert.ok(nodes['cf-academy-mini-brief-title'].textContent.includes('Guardia vacía'), 'Mini-brief debe actualizarse con el título del drill remedial');
    assert.ok(nodes['cf-academy-mini-brief-body'].textContent.includes('Protege la lista vacía'), 'Mini-brief debe mostrar la consigna del drill remedial');

    // Código que cumple el drill pero NO las pruebas del nivel principal ('def total(')
    loadedCode = 'if not items:\n    pass';
    await nodes['cf-academy-validate'].dispatchClick();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(paneResults.hidden, false);
    assert.ok(nodes['cf-academy-live'].textContent.includes('Guardia vacía'), 'Confirmación de refuerzo superado en #cf-academy-live');
    assert.equal(findById(nodes['cf-academy-checklist'], 'cf-academy-next-level-btn'), null, 'El remedial no libera el siguiente nivel');
    const returnBtn = findById(nodes['cf-academy-checklist'], 'cf-academy-remedial-return-btn');
    assert.ok(returnBtn, 'Botón para volver al reto principal');

    await returnBtn.dispatchClick();
    assert.equal(paneEditor.hidden, false);
    assert.equal(paneResults.hidden, true);
    assert.equal(loadedCode, 'x = 1', 'Se restaura el código del reto principal');
    assert.equal(findById(nodes['cf-academy-checklist'], 'cf-academy-remedial-box'), null, 'Remedial cerrado');

    // Blindaje de selectLevel: con isPro=true pero Nivel 1 sin completar, rechaza abrir Nivel 2 por secuencia
    for (const fn of docListeners.get('cf:pro-activated') || []) await fn({});
    assert.equal(api.selectLevel(2), false, 'selectLevel debe rechazar nivel bloqueado por secuencia');

    // Aprobar nivel 1 y pulsar Siguiente nivel -> navega directo a editor (sin paso intermedio en tree)
    loadedCode = 'def total(items):\n    return 0\n';
    await nodes['cf-academy-validate'].dispatchClick();
    await new Promise((r) => setTimeout(r, 60));
    const nextBtn = findById(nodes['cf-academy-checklist'], 'cf-academy-next-level-btn');
    assert.ok(nextBtn, 'Debe ofrecer botón Siguiente nivel tras aprobar');
    await nextBtn.dispatchClick();
    assert.equal(paneEditor.hidden, false, 'Siguiente nivel debe abrir directamente en vista editor');
    assert.equal(paneMission.hidden, true);

    // ===== Gate de usuario =====
    const collect = (node, pred, acc = []) => {
      for (const c of node.children || []) {
        if (!c) continue;
        if (pred(c)) acc.push(c);
        if (c.children) collect(c, pred, acc);
      }
      return acc;
    };
    const authEvents = () => dispatched.filter((e) => e && e.type === 'cf:open-auth');
    const pending = () => JSON.parse(globalThis.sessionStorage.getItem('cf_pending_action') || 'null');
    const fireAuthSuccess = async (detail) => {
      for (const fn of docListeners.get('cf:auth-success') || []) await fn({ detail });
      await new Promise((r) => setTimeout(r, 80));
    };

    // Volver al Formateador (sin sesión no se puede reentrar a Academia)
    await nodes['cf-mode-formatter'].dispatchClick();
    assert.equal(nodes['cf-academy-shell'].hidden, true);

    // 1) Sin sesión (401): pestaña Academia → modal + pending open_academy, workspace NO visible
    meState = 'anon';
    const before = authEvents().length;
    await nodes['cf-mode-academy'].dispatchClick();
    assert.equal(authEvents().length, before + 1, 'Debe dispararse cf:open-auth');
    const ev1 = authEvents().at(-1);
    assert.equal(ev1.detail.mode, 'register');
    assert.ok(ev1.detail.bannerText.length > 20, 'Banner explicativo');
    assert.equal(pending()?.action, 'open_academy');
    assert.equal(nodes['cf-academy-shell'].hidden, true, 'Academia no se abre sin sesión');

    // Reanudación open_academy tras cf:auth-success
    meState = 'free';
    await fireAuthSuccess({ plan: 'free', trial_auto_activated: false });
    assert.equal(nodes['cf-academy-shell'].hidden, false);
    assert.equal(nodes['cf-academy-head'].hidden, false);
    assert.equal(nodes['cf-academy-paths'].hidden, false);
    assert.equal(nodes['cf-academy-workspace'].hidden, true);
    assert.equal(pending(), null, 'pending consumido');

    // 2) Reto Diario sin sesión → pending daily_challenge; con sesión reanuda directo en 'editor'
    meState = 'anon';
    await nodes['cf-academy-daily-btn'].dispatchClick();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(pending()?.action, 'daily_challenge');
    assert.equal(nodes['cf-academy-workspace'].hidden, true);
    meState = 'free';
    await fireAuthSuccess({ plan: 'free' });
    assert.equal(nodes['cf-academy-workspace'].hidden, false);
    assert.equal(paneEditor.hidden, false);
    assert.equal(nodes['cf-academy-head'].hidden, true);

    // 3) Tecnología sin sesión → pending open_topic; con sesión reanuda el tema exacto
    await nodes['cf-academy-back'].dispatchClick(); // editor -> tree
    await nodes['cf-academy-back'].dispatchClick(); // tree -> paths
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(nodes['cf-academy-paths'].hidden, false);
    const pill = () => collect(nodes['cf-academy-paths'], (c) => c.textContent === 'PYTHON' && String(c.className).includes('cf-academy-tech-btn'))[0];
    assert.ok(pill(), 'Píldora de tecnología PYTHON');
    meState = 'anon';
    loadedLang = '';
    await pill().dispatchClick();
    await new Promise((r) => setTimeout(r, 80));
    const pt = pending();
    assert.equal(pt?.action, 'open_topic');
    assert.equal(pt.tech, 'python');
    assert.equal(nodes['cf-academy-workspace'].hidden, true, 'Sin sesión no abre el tema');
    meState = 'free';
    await fireAuthSuccess({ plan: 'free' });
    assert.equal(nodes['cf-academy-workspace'].hidden, false);
    assert.equal(paneMission.hidden, false);
    assert.equal(loadedLang, 'python');
    const proLabels = (arr) => arr.filter((c) => String(c.className).includes('cf-skill-node__state') && c.textContent === 'PRO').length;
    assert.equal(proLabels(collect(nodes['cf-academy-skill-tree'], () => true)), 1, 'Usuario free: nivel Pro marcado PRO');

    // 4) Usuario autenticado Pro (pro_active): entra sin fricción y desbloquea niveles Pro
    await nodes['cf-academy-back'].dispatchClick();
    await new Promise((r) => setTimeout(r, 40));
    meState = 'pro';
    const authBefore = authEvents().length;
    await pill().dispatchClick();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(authEvents().length, authBefore, 'Autenticado: sin modal');
    assert.equal(paneMission.hidden, false);
    assert.equal(JSON.parse(globalThis.localStorage.getItem('cf_academy_state_v1')).isPro, true);
    assert.equal(proLabels(collect(nodes['cf-academy-skill-tree'], () => true)), 0, 'Pro: sin etiqueta PRO en niveles 3-5');

    // 5) Logout: isPro se limpia y Academia vuelve al Formateador
    for (const fn of docListeners.get('cf:auth-logout') || []) await fn({});
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(JSON.parse(globalThis.localStorage.getItem('cf_academy_state_v1')).isPro, false);
    assert.equal(nodes['cf-academy-shell'].hidden, true);
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

test('Vista única: HTML/CSS/JS exponen la máquina de estados y respetan selectores protegidos', () => {
  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  for (const id of ['cf-academy-shell', 'cf-academy-head', 'cf-academy-paths', 'cf-academy-workspace', 'cf-academy-progress-bar',
    'cf-academy-mini-brief', 'cf-academy-skill-tree', 'cf-academy-mission-card', 'cf-academy-editor-slot', 'cf-academy-diff-slot',
    'cf-academy-live', 'cf-academy-checklist', 'cf-academy-validate', 'cf-academy-diff', 'cf-academy-back', 'cf-academy-daily-btn']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `id único: ${id}`);
  }
  assert.match(html, /data-acad-pane-body="editor"[^>]*hidden/);
  assert.match(html, /data-acad-pane-body="results"[^>]*hidden/);

  const js = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/academy-ui.js'), 'utf8');
  for (const needle of ['setAcademyView', 'ACADEMY_VIEWS', 'requestMeasure', 'cf-academy-checklist-list', 'step', 'restoreDiffPanelHome']) {
    assert.ok(js.includes(needle), `academy-ui.js debe contener ${needle}`);
  }
  assert.doesNotMatch(js, /\.innerHTML\s*=|insertAdjacentHTML/);

  const css = readFileSync(join(ROOT, 'assets/css/tools/code-formatter.css'), 'utf8');
  assert.match(css, /\.cf-academy-pane\[hidden\]/);
  assert.match(css, /\.cf-academy-head\[hidden\]/);
  assert.doesNotMatch(css, /grid-template-columns:\s*minmax\(260px/);
  assert.match(css, /prefers-reduced-motion[\s\S]*cf-academy-pane/);
});

test('Header: #cf-btn-login visible sin data-cf-commercial y ensureAuthenticated exportado', () => {
  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  const tag = html.match(/<button[^>]*id="cf-btn-login"[^>]*>/);
  assert.ok(tag, 'Debe existir #cf-btn-login');
  assert.match(tag[0], /data-cf-open-auth/);
  assert.doesNotMatch(tag[0], /data-cf-commercial/);
  assert.match(html, /id="cf-auth-modal"/);
  const auth = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/auth-modal.js'), 'utf8');
  assert.match(auth, /export async function ensureAuthenticated/);
  assert.match(auth, /loginBtn\.hidden = Boolean\(authenticated\)/);
  const dist = join(ROOT, 'dist-public/tools/code-formatter/index.html');
  if (existsSync(dist)) {
    const d = readFileSync(dist, 'utf8');
    assert.ok(d.includes('id="cf-btn-login"'), 'dist-public debe conservar #cf-btn-login');
    assert.ok(d.includes('id="cf-auth-modal"'), 'dist-public debe conservar #cf-auth-modal');
    assert.equal(d.includes('data-cf-commercial'), false);
  }
});

test('Bloque 1: resolveTipHref con categoría (sin 404), sin textos hardcodeados en academy-ui.js y paridad i18n compartir', async () => {
  const { resolveTipHref } = await import('../../assets/js/tools/code-formatter/academy-ui.js');
  assert.equal(resolveTipHref('python', 'python-312-pep8-tips', 'es'), 'tips/python/python-312-pep8-tips/es/');
  assert.equal(resolveTipHref('typescript', 'ts-strict-tips', 'en'), 'tips/javascript/ts-strict-tips/en/');
  assert.equal(resolveTipHref('dax', 'dax-calculate', 'pt-BR'), 'tips/sql-dax/dax-calculate/pt-BR/');
  assert.equal(resolveTipHref('python', 'python/python-312-pep8-tips', 'fr'), 'tips/python/python-312-pep8-tips/fr/');

  const acadJs = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/academy-ui.js'), 'utf8');
  assert.doesNotMatch(acadJs, /Desbloquea el diagnóstico completo con Tutor IA Pro/);
  assert.match(acadJs, /t\('acadProTutorTeaser'/);

  const shareKeys = [
    'acadHintEditorBtn',
    'acadProTutorTeaser',
    'acadPathTechSwitchAria',
    'shareArticleTitle',
    'shareNative',
    'shareLinkedIn',
    'shareX',
    'shareWhatsApp',
    'shareCopyLink',
    'shareCopied',
    'shareCopyFail',
  ];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of shareKeys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave ${k} en ${loc}`);
    }
  }
});

test('Bloqueo secuencial estricto (N1→N5 incluidos niveles Pro) y guía tutorial en Editor', async () => {
  const { isLevelUnlocked } = await import('../../assets/js/tools/code-formatter/academy-engine.js');
  const { buildTutorialSteps, ASSIST_PREF_KEY } = await import('../../assets/js/tools/code-formatter/academy-ui.js');

  const levels = [
    { id: 'py-1', level: 1, tier: 'free', title: 'N1' },
    { id: 'py-2', level: 2, tier: 'free', title: 'N2' },
    { id: 'py-3', level: 3, tier: 'pay', title: 'N3 Pro' },
    { id: 'py-4', level: 4, tier: 'pay', title: 'N4 Pro' },
    { id: 'py-5', level: 5, tier: 'pay', title: 'N5 Pro' },
  ];

  // Sin niveles completados: incluso con isPro=true, solo N1 está desbloqueado
  const proEmpty = { completed: [], isPro: true };
  assert.equal(isLevelUnlocked(levels[0], 0, levels, proEmpty), true);
  assert.equal(isLevelUnlocked(levels[1], 1, levels, proEmpty), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, proEmpty), false);
  assert.equal(isLevelUnlocked(levels[3], 3, levels, proEmpty), false);
  assert.equal(isLevelUnlocked(levels[4], 4, levels, proEmpty), false);

  // Con N1 y N2 completados: N3 Pro requiere isPro=true; N4 sigue bloqueado hasta completar N3
  assert.equal(isLevelUnlocked(levels[2], 2, levels, { completed: ['py-1', 'py-2'], isPro: false }), false);
  assert.equal(isLevelUnlocked(levels[2], 2, levels, { completed: ['py-1', 'py-2'], isPro: true }), true);
  assert.equal(isLevelUnlocked(levels[3], 3, levels, { completed: ['py-1', 'py-2'], isPro: true }), false);
  assert.equal(isLevelUnlocked(levels[3], 3, levels, { completed: ['py-1', 'py-2', 'py-3'], isPro: true }), true);

  // Guía tutorial paso a paso genera 4 pestañas claras sin filtrar firstTest.expected ni reference_solution
  const es = (await import('../../assets/js/tools/code-formatter/locales/es.js')).default;
  const tr = (k, vars = {}) => String(es[k] || k).replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? ''));
  const steps = buildTutorialSteps({
    title: 'Indentación',
    concept_capsule: 'Usa 4 espacios.',
    reference_solution: 'def clean() -> None:\n    """Doc."""\n    pass\n',
    tests: [{ visible: true, description: 'Define función limpia', expected: 'def clean():' }],
  }, 'PEP 8', tr);
  assert.equal(steps.length, 4);
  assert.ok(steps[0].includes('PEP 8') && steps[0].includes('Usa 4 espacios.'));
  assert.ok(steps[1].includes('Define función limpia'));
  assert.equal(steps.some((s) => s.includes('def clean():') || s.includes('def clean() -> None:')), false, 'La guía no debe revelar la solución');
  assert.equal(ASSIST_PREF_KEY, 'cf_academy_assist_v1');

  // Paridad i18n de las 13 nuevas llaves de tutorial/asistencia en los 7 idiomas
  const tutKeys = [
    'acadTutTitle',
    'acadAssistOn',
    'acadAssistOff',
    'acadAssistAnnounceOn',
    'acadAssistAnnounceOff',
    'acadTutPrev',
    'acadTutNext',
    'acadTutStep1',
    'acadTutStep2',
    'acadTutStep3',
    'acadIdleNudgeText',
    'acadIdleEnableBtn',
    'acadFixWithAssistBtn',
  ];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of tutKeys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave tutorial ${k} en ${loc}`);
    }
  }

  // Verificar nodos del tutorial en index.html
  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  for (const id of [
    'cf-academy-tutorial',
    'cf-academy-assist-toggle',
    'cf-academy-assist-status',
    'cf-academy-tutorial-body',
    'cf-academy-tut-step-badge',
    'cf-academy-tut-text',
    'cf-academy-tut-prev',
    'cf-academy-tut-next',
    'cf-academy-idle-nudge',
    'cf-academy-idle-enable',
  ]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `Falta o duplicado id="${id}"`);
  }
});

test('Bloque A · Esquema curricular v2 (Data & BI en 7 locales) y no duplicación con reference_solution', () => {
  const dataBi = ['sql', 'python', 'dax', 'json'];
  const norm = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

  for (const tech of dataBi) {
    const capsulesL1 = new Set();
    for (const loc of LOCALES) {
      const doc = JSON.parse(readFileSync(join(ROOT, `content/code-formatter-academy/curriculum/${loc}/${tech}.json`), 'utf8'));
      for (const lvl of doc.levels) {
        if (lvl.tier === 'pay') {
          assert.equal('keywords_glossary' in lvl, false, `Fuga pay keywords_glossary en ${loc}/${tech}#${lvl.id}`);
          assert.equal('formatting_mechanics' in lvl, false, `Fuga pay formatting_mechanics en ${loc}/${tech}#${lvl.id}`);
          assert.equal('analogous_example' in lvl, false, `Fuga pay analogous_example en ${loc}/${tech}#${lvl.id}`);
          continue;
        }
        assert.ok(Array.isArray(lvl.keywords_glossary) && lvl.keywords_glossary.length >= 3, `${loc}/${tech}#${lvl.id} requiere keywords_glossary`);
        for (const entry of lvl.keywords_glossary) {
          assert.ok(entry.term?.trim() && entry.role?.trim() && entry.example_inline?.trim());
        }
        const fm = lvl.formatting_mechanics;
        assert.ok(fm?.indentation?.trim() && fm?.line_breaks?.trim() && fm?.punctuation?.trim() && fm?.documentation_standard?.trim());
        const ex = lvl.analogous_example;
        assert.ok(ex?.title?.trim() && ex?.code?.trim() && ex?.why_it_works?.trim());
        assert.notEqual(norm(ex.code), norm(lvl.reference_solution), `Ejemplo análogo no puede copiar reference_solution en ${loc}/${tech}#${lvl.id}`);
        if (lvl.level === 1 && loc === 'es') capsulesL1.add(lvl.concept_capsule);
      }
    }
    assert.equal(capsulesL1.size, 1);
  }
});

test('Bloque A · Limpieza i18n en academy-ui.js, currículo no-EN y paridad de claves acadStyle* en 7 locales', async () => {
  const uiSrc = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/academy-ui.js'), 'utf8');
  assert.equal(uiSrc.includes('(Hidden edge case)'), false, 'academy-ui.js no debe contener literal inglés (Hidden edge case)');

  // Verificar que los 6 locales no-ingleses localizan tests[] y drills[] respecto a en/
  const nonEn = ['es', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
  for (const loc of nonEn) {
    const enSql = JSON.parse(readFileSync(join(ROOT, 'content/code-formatter-academy/curriculum/en/sql.json'), 'utf8'));
    const locSql = JSON.parse(readFileSync(join(ROOT, `content/code-formatter-academy/curriculum/${loc}/sql.json`), 'utf8'));
    assert.notEqual(locSql.levels[0].tests[0].description, enSql.levels[0].tests[0].description, `sql-1 test sin localizar en ${loc}`);
    assert.notEqual(locSql.levels[0].remedial_drills[0].solution_hint, enSql.levels[0].remedial_drills[0].solution_hint, `sql-1 drill sin localizar en ${loc}`);
  }

  const { STYLE_RULE_SPECS } = await import('../../assets/js/tools/code-formatter/academy-sandbox.js');
  const styleKeys = [...new Set(Object.values(STYLE_RULE_SPECS).map((s) => s.key))];
  const required = ['acadHiddenEdgeCase', 'acadLevelFallback', ...styleKeys];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of required) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave ${k} en ${loc}`);
    }
  }
});

test('Bloque A · evaluateStyleRules cubre 100% de style_rules del currículo y devuelve mensajes localizados', async () => {
  const { evaluateStyleRules, STYLE_RULE_SPECS } = await import('../../assets/js/tools/code-formatter/academy-sandbox.js');
  const esDict = (await import('../../assets/js/tools/code-formatter/locales/es.js')).default;
  const frDict = (await import('../../assets/js/tools/code-formatter/locales/fr.js')).default;
  const techs = ['sql', 'python', 'dax', 'json', 'javascript', 'typescript', 'java', 'csharp', 'php', 'yaml'];

  for (const tech of techs) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/code-formatter-academy/curriculum/es/${tech}.json`), 'utf8'));
    for (const lvl of doc.levels) {
      if (lvl.tier !== 'free') continue;
      for (const r of lvl.style_rules) {
        assert.ok(STYLE_RULE_SPECS[r], `Regla no implementada en STYLE_RULE_SPECS: ${r}`);
      }
      const okRes = evaluateStyleRules(tech, lvl.reference_solution, lvl.style_rules, (k) => esDict[k]);
      assert.equal(okRes.ok, true, `reference_solution de ${lvl.id} falló reglas: ${okRes.violations.join('; ')}`);
    }
  }

  // Violaciones reales localizadas en ES y FR
  const sqlBad = evaluateStyleRules('sql', 'select id from users', ['uppercase_keywords', 'multiline_select', 'header_comment'], (k) => esDict[k]);
  assert.equal(sqlBad.ok, false);
  assert.equal(sqlBad.violations.length, 3);
  assert.equal(sqlBad.violations[0], esDict.acadStyleSqlUppercase);

  const daxBadFr = evaluateStyleRules('dax', 'Margin := [Sales]/[Cost]', ['var_return', 'safe_divide', 'header_comment'], (k) => frDict[k]);
  assert.equal(daxBadFr.ok, false);
  assert.equal(daxBadFr.violations.length, 3);
  assert.equal(daxBadFr.violations[0], frDict.acadStyleVarReturn);
  assert.equal(daxBadFr.violationKeys[1].key, 'acadStyleSafeDivide');
});

test('Bloque B · Panel tutorial en 4 pestañas sin spoilers, intención rápida y paridad i18n 7 locales', async () => {
  const { buildTutorialTabs, QUICK_INTENTS } = await import('../../assets/js/tools/code-formatter/academy-ui.js');
  const esDict = (await import('../../assets/js/tools/code-formatter/locales/es.js')).default;
  const tr = (k, v = {}) => String(esDict[k] || k).replace(/\{(\w+)\}/g, (_, m) => (m in v ? String(v[m]) : `{${m}}`));

  const sqlDoc = JSON.parse(readFileSync(join(ROOT, 'content/code-formatter-academy/curriculum/es/sql.json'), 'utf8'));
  const sql1 = sqlDoc.levels[0];
  const tabs = buildTutorialTabs(sql1, sqlDoc.standard, tr);
  assert.deepEqual(tabs.map((tb) => tb.id), ['concept', 'keywords', 'style', 'example']);
  assert.ok(tabs[1].glossary.length >= 3);
  assert.ok(tabs[2].mechanics?.indentation && tabs[2].mechanics?.line_breaks);
  assert.ok(tabs[3].example?.code && tabs[3].example.code !== sql1.reference_solution);
  // Jamás filtrar la solución del reto
  for (const tb of tabs) {
    assert.equal(tb.summary.includes(sql1.reference_solution.trim()), false);
  }
  // Blindaje anti-spoiler si un nivel copiara reference_solution en analogous_example
  const spoiledTabs = buildTutorialTabs({
    ...sql1,
    analogous_example: { title: 'Copia', code: sql1.reference_solution, why_it_works: 'No debe mostrarse' },
  }, sqlDoc.standard, tr);
  assert.equal(spoiledTabs[3].example, null, 'Debe bloquear analogous_example idéntico a reference_solution');

  // Intenciones rápidas + nodos HTML + CSS 375px
  assert.ok(QUICK_INTENTS.length >= 4);
  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  for (const id of [
    'cf-academy-tut-tabs',
    'cf-academy-tut-rich',
    'cf-academy-own-code-btn',
    'cf-academy-own-bar',
    'cf-academy-own-lang',
    'cf-academy-own-snapshot',
    'cf-academy-own-compare',
  ]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `Falta o duplicado id="${id}"`);
  }
  const css = readFileSync(join(ROOT, 'assets/css/tools/code-formatter.css'), 'utf8');
  assert.match(css, /\.cf-academy-tut-rich\[hidden\]/);
  assert.match(css, /\.cf-academy-own-bar\[hidden\]/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);

  // Paridad de claves Bloque B en los 7 locales
  const bKeys = [
    'acadTutTabsAria', 'acadTutTabConcept', 'acadTutTabKeywords', 'acadTutTabStyle', 'acadTutTabExample',
    'acadQuickIntentsTitle', 'acadIntentSqlTitle', 'acadIntentPythonTitle', 'acadIntentDaxTitle', 'acadIntentOwnTitle',
    'acadOwnCodeBtn', 'acadOwnBarTitle', 'acadOwnSnapshotBtn', 'acadOwnCompareBtn', 'acadOwnCompareOk',
  ];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of bKeys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave Bloque B ${k} en ${loc}`);
    }
  }
});

test('Bloque B · Flujo "Practicar con mi código" (Antes vs. Después) en #cf-academy-diff-slot', async () => {
  const makeNode = (id, extra = {}) => {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const node = {
      id,
      hidden: true,
      disabled: false,
      value: extra.value || '',
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
      scrollIntoView: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return node;
  };

  const nodes = {
    'cf-academy-shell': makeNode('cf-academy-shell'),
    'cf-academy-head': makeNode('cf-academy-head'),
    'cf-academy-diff-slot': makeNode('cf-academy-diff-slot'),
    'cf-diff-panel': makeNode('cf-diff-panel'),
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
    'cf-academy-own-code-btn': makeNode('cf-academy-own-code-btn'),
    'cf-academy-own-bar': makeNode('cf-academy-own-bar'),
    'cf-academy-own-lang': makeNode('cf-academy-own-lang', { value: 'sql' }),
    'cf-academy-own-snapshot': makeNode('cf-academy-own-snapshot'),
    'cf-academy-own-compare': makeNode('cf-academy-own-compare'),
    'cf-academy-skill-tree': makeNode('cf-academy-skill-tree'),
    'cf-academy-mission-card': makeNode('cf-academy-mission-card'),
    'cf-academy-checklist': makeNode('cf-academy-checklist'),
    'cf-academy-live': makeNode('cf-academy-live'),
    'cf-academy-validate': makeNode('cf-academy-validate'),
    'cf-academy-diff': makeNode('cf-academy-diff'),
  };
  const paneEditor = makeNode('cf-academy-editor-pane', { dataset: { acadPaneBody: 'editor' } });
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  const prevStorage = globalThis.localStorage;
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.location = { pathname: '/tools/code-formatter/', search: '' };
  globalThis.window = { location: { href: 'https://jw-solutions.com/tools/code-formatter/', search: '' }, history: { replaceState() {} } };
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    head: { append() {} },
    body: { append() {} },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '[data-acad-pane-body]' ? [paneEditor] : []),
    createElement: (tag) => makeNode(tag),
    createTextNode: (txt) => ({ textContent: txt }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  let editorCode = 'select id from users';
  let diffPayload = null;
  let closedDiff = false;
  let measured = false;
  try {
    const { initAcademyUI } = await import(`../../assets/js/tools/code-formatter/academy-ui.js?own=${Date.now()}`);
    const api = initAcademyUI({
      getCode: () => editorCode,
      setCode: (c) => { editorCode = c; },
      getEditorView: () => ({ requestMeasure: () => { measured = true; }, focus: () => {} }),
      formatOwnCode: async (code) => ({ code: '-- Clean query\nSELECT\n  id\nFROM users;\n', engine: 'sql-formatter' }),
      openDiffWith: (p) => { diffPayload = p; },
      closeDiffPanel: () => { closedDiff = true; },
    });
    api.openOwnCodePractice('sql');
    assert.equal(nodes['cf-academy-own-bar'].hidden, false);
    assert.equal(paneEditor.hidden, false);

    await nodes['cf-academy-own-snapshot'].dispatchClick();
    await nodes['cf-academy-own-compare'].dispatchClick();
    await new Promise((r) => setTimeout(r, 30));

    assert.ok(diffPayload, 'Debe invocar openDiffWith con Antes vs. Después');
    assert.equal(diffPayload.original, 'select id from users');
    assert.ok(diffPayload.result.includes('SELECT'));
    assert.equal(nodes['cf-diff-panel'].parentElement, nodes['cf-academy-diff-slot']);
    assert.equal(measured, true, 'Debe invocar requestMeasure en CodeMirror');

    api.destroy();
    assert.equal(closedDiff, true, 'Debe cerrar el diff al destruir/salir');
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
    globalThis.localStorage = prevStorage;
  }
});

test('Bloque C · SQLJS_SRI válido, CSP en _headers/index.html, WASM bajo demanda y jw-api.service', async () => {
  const { SQLJS_SRI, evaluateChallenge } = await import('../../assets/js/tools/code-formatter/academy-sandbox.js');
  assert.match(SQLJS_SRI, /^sha512-[A-Za-z0-9+/]{86}==$/, 'SQLJS_SRI debe ser un hash SHA-512 base64 válido (88 chars)');

  // CSP en _headers e index.html debe permitir cdnjs + jsdelivr en script-src y connect-src conservando importmap
  const headersTxt = readFileSync(join(ROOT, '_headers'), 'utf8');
  const htmlTxt = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  for (const src of [headersTxt, htmlTxt]) {
    assert.ok(src.includes("'wasm-unsafe-eval'"));
    assert.ok(src.includes('https://cdnjs.cloudflare.com'));
    assert.ok(src.includes('https://cdn.jsdelivr.net'));
    assert.ok(src.includes("sha256-ZCh9uLobU/eLEHs011X4CeRT/9JAjSY8bKMuPaZL1pU="));
  }

  // Carga estrictamente bajo demanda: un reto sin sql_eval ni py_eval NO invoca loaders WASM
  let sqlCalls = 0;
  let pyCalls = 0;
  const patternRes = await evaluateChallenge('sql', '-- ok\nSELECT\n  id\nFROM users;\n', {
    tests: [{ id: 't1', name: 'SELECT', visible: true, type: 'pattern', expected: 'SELECT' }],
    style_rules: ['uppercase_keywords', 'multiline_select', 'header_comment'],
  }, {
    sqlLoader: async () => { sqlCalls += 1; return null; },
    pyLoader: async () => { pyCalls += 1; return null; },
  });
  assert.equal(patternRes.passed, true);
  assert.equal(sqlCalls, 0, 'No debe cargar sql.js si no hay tests sql_eval');
  assert.equal(pyCalls, 0, 'No debe cargar Pyodide si no hay tests py_eval');

  // sql_eval invoca sqlLoader y cierra Database
  let dbClosed = false;
  const sqlEvalRes = await evaluateChallenge('sql', '-- ok\nSELECT\n  id\nFROM users;\n', {
    tests: [{ id: 's1', name: 'Row count', visible: true, type: 'sql_eval', setup_sql: 'CREATE TABLE users(id INT); INSERT INTO users VALUES (1);', expected: [[1]] }],
    style_rules: ['uppercase_keywords', 'multiline_select', 'header_comment'],
  }, {
    sqlLoader: async () => {
      sqlCalls += 1;
      return {
        Database: class {
          run() {}
          exec() { return [{ values: [[1]] }]; }
          close() { dbClosed = true; }
        },
      };
    },
  });
  assert.equal(sqlCalls, 1);
  assert.equal(dbClosed, true);
  assert.equal(sqlEvalRes.passed, true);

  // py_eval invoca pyLoader y libera globals
  let globalsDestroyed = false;
  const pyEvalRes = await evaluateChallenge('python', 'def add(a: int, b: int) -> int:\n    """Add."""\n    return a + b\n', {
    tests: [{ id: 'p1', name: 'add(2,3)', visible: true, type: 'py_eval', input: 'add(2, 3)', expected: 5 }],
    style_rules: ['pep8_indent_4', 'type_hints', 'docstring_pep257'],
  }, {
    pyLoader: async () => {
      pyCalls += 1;
      return {
        toPy: () => ({ destroy: () => { globalsDestroyed = true; } }),
        runPythonAsync: async (expr) => (expr === 'add(2, 3)' ? 5 : null),
      };
    },
  });
  assert.equal(pyCalls, 1);
  assert.equal(globalsDestroyed, true);
  assert.equal(pyEvalRes.passed, true);

  // Paridad VPS en deploy/jw-api.service
  const svc = readFileSync(join(ROOT, 'deploy/jw-api.service'), 'utf8');
  assert.match(svc, /^MemoryMax=768M$/m);
  assert.match(svc, /^MemoryHigh=512M$/m);
});

test('Bloque C · selectLevel() hidrata nivel Pro stub vía loadProLevel/fetchProLevel y revoca en 403', async () => {
  const makeNode = (id, extra = {}) => {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const node = {
      id, hidden: true, disabled: false, textContent: '', children,
      dataset: extra.dataset || {}, parentElement: null,
      classList: {
        toggle: (c, f) => (f === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (f ? classes.add(c) : classes.delete(c))),
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      addEventListener: (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(fn); },
      append: (...items) => items.forEach((it) => { if (it && typeof it === 'object') it.parentElement = node; children.push(it); }),
      prepend: (...items) => items.forEach((it) => { if (it && typeof it === 'object') it.parentElement = node; children.unshift(it); }),
      replaceChildren: (...items) => { children.length = 0; node.append(...items); },
      scrollIntoView: () => {}, querySelector: () => null, querySelectorAll: () => [],
    };
    return node;
  };
  const nodes = {
    'cf-academy-shell': makeNode('cf-academy-shell'),
    'cf-academy-head': makeNode('cf-academy-head'),
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
  const paneEditor = makeNode('cf-academy-editor-pane', { dataset: { acadPaneBody: 'editor' } });
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  const prevStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;
  const mem = new Map([['cf_academy_state_v1', JSON.stringify({ completed: ['sql-1', 'sql-2'], isPro: true })]]);
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.location = { pathname: '/tools/code-formatter/', search: '' };
  globalThis.window = { location: { href: 'https://jw-solutions.com/tools/code-formatter/', search: '' }, history: { replaceState() {} } };
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    head: { append() {} }, body: { append() {} },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '[data-acad-pane-body]' ? [paneEditor] : []),
    createElement: (tag) => makeNode(tag),
    createTextNode: (txt) => ({ textContent: txt }),
    addEventListener: () => {}, removeEventListener: () => {},
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('curriculum/es/sql.json')) {
      const doc = JSON.parse(readFileSync(join(ROOT, 'content/code-formatter-academy/curriculum/es/sql.json'), 'utf8'));
      return { ok: true, status: 200, json: async () => doc };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  let editorCode = '';
  const proCalls = [];
  try {
    const { initAcademyUI } = await import(`../../assets/js/tools/code-formatter/academy-ui.js?pro=${Date.now()}`);
    const api = initAcademyUI({
      getCode: () => editorCode,
      setCode: (c) => { editorCode = c; },
      loadProLevel: async (tech, lvl, loc) => {
        proCalls.push({ tech, lvl, loc });
        return {
          id: 'sql-3', tier: 'pay', concept_capsule: 'CTE modular Pro',
          starter_code: 'with t as (select 1) select * from t',
          reference_solution: '-- ok\nWITH t AS (SELECT 1)\nSELECT * FROM t;\n',
          style_rules: ['uppercase_keywords'],
          tests: [{ id: 'sql3-t1', name: 'CTE', visible: true, type: 'pattern', expected: 'WITH ', description: 'Usa CTE' }],
        };
      },
    });
    await api.openTopic('sql', 3, 'data-bi', 'editor');
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(proCalls.length, 1);
    assert.deepEqual(proCalls[0], { tech: 'sql', lvl: 3, loc: 'es' });
    assert.equal(editorCode, 'with t as (select 1) select * from t');
    api.destroy();
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
    globalThis.localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});

test('Fix #cf-academy-diff: visible antes de MergeView, fallback seguro, manejo remedial y retorno limpio al Formateador (375px)', async () => {
  const makeNode = (id, extra = {}) => {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    const node = {
      id, hidden: true, disabled: false, textContent: '', children,
      dataset: extra.dataset || {}, parentElement: null,
      classList: {
        toggle: (c, f) => (f === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (f ? classes.add(c) : classes.delete(c))),
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      addEventListener: (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(fn); },
      dispatchClick: async () => { for (const fn of listeners.get('click') || []) await fn({ preventDefault() {} }); },
      append: (...items) => items.forEach((it) => { if (it && typeof it === 'object') it.parentElement = node; children.push(it); }),
      prepend: (...items) => items.forEach((it) => { if (it && typeof it === 'object') it.parentElement = node; children.unshift(it); }),
      insertBefore: (item) => { if (item && typeof item === 'object') item.parentElement = node; children.push(item); },
      replaceChildren: (...items) => { children.length = 0; node.append(...items); },
      scrollIntoView: () => {}, querySelector: () => null, querySelectorAll: () => [],
    };
    return node;
  };
  const nodes = {
    'cf-academy-shell': makeNode('cf-academy-shell'),
    'cf-academy-head': makeNode('cf-academy-head'),
    'cf-academy-diff-slot': makeNode('cf-academy-diff-slot'),
    'cf-diff-panel': makeNode('cf-diff-panel'),
    'cf-diff-body': makeNode('cf-diff-body'),
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
    'cf-academy-editor-hint-box': makeNode('cf-academy-editor-hint-box'),
  };
  nodes['cf-editor-slot-home'].append(nodes['cf-editor-card'], nodes['cf-diff-panel']);
  const paneEditor = makeNode('cf-academy-editor-pane', { dataset: { acadPaneBody: 'editor' } });
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  const prevStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.location = { pathname: '/tools/code-formatter/', search: '' };
  globalThis.window = { innerWidth: 375, location: { href: 'https://jw-solutions.com/tools/code-formatter/', search: '' }, history: { replaceState() {} } };
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    head: { append() {} }, body: { append() {} },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '[data-acad-pane-body]' ? [paneEditor] : []),
    createElement: (tag) => makeNode(tag),
    createTextNode: (txt) => ({ textContent: txt }),
    addEventListener: () => {}, removeEventListener: () => {},
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes('curriculum/es/sql.json')) {
      const doc = JSON.parse(readFileSync(join(ROOT, 'content/code-formatter-academy/curriculum/es/sql.json'), 'utf8'));
      return { ok: true, status: 200, json: async () => doc };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  let editorCode = 'select id from users';
  let visibleBeforeOpen = false;
  let closedCount = 0;
  try {
    const { showDiff, closeDiff } = await import('../../assets/js/tools/code-formatter/diff-view.js');
    const { initAcademyUI } = await import(`../../assets/js/tools/code-formatter/academy-ui.js?diff=${Date.now()}`);
    const api = initAcademyUI({
      getCode: () => editorCode,
      setCode: (c) => { editorCode = c; },
      openDiffWith: async (payload) => {
        // Debe llegar con slot y panel YA visibles para que CodeMirror MergeView mida > 0px
        visibleBeforeOpen = nodes['cf-academy-diff-slot'].hidden === false && nodes['cf-diff-panel'].hidden === false;
        await showDiff(nodes['cf-diff-body'], payload);
      },
      closeDiffPanel: () => {
        closedCount += 1;
        closeDiff();
        nodes['cf-diff-panel'].hidden = true;
        nodes['cf-academy-diff-slot'].hidden = true;
      },
    });
    await api.openTopic('sql', 1, 'data-bi', 'editor');
    await nodes['cf-academy-diff'].dispatchClick();
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(visibleBeforeOpen, true, '#cf-academy-diff-slot y #cf-diff-panel deben estar visibles antes de montar MergeView');
    assert.equal(nodes['cf-diff-panel'].parentElement, nodes['cf-academy-diff-slot']);
    assert.ok(nodes['cf-diff-body'].children.length > 0, '#cf-diff-body debe renderizar el diff (o fallback DOM seguro) sin quedar vacío');

    // Volver al Formateador devuelve #cf-diff-panel a #cf-editor-slot-home y oculta el slot
    await api.setWorkMode('format');
    assert.equal(nodes['cf-diff-panel'].parentElement, nodes['cf-editor-slot-home']);
    assert.equal(nodes['cf-diff-panel'].hidden, true);
    assert.equal(nodes['cf-academy-diff-slot'].hidden, true);
    assert.ok(closedCount >= 1);

    // Verificar CSS móvil 375px para MergeView y fallback
    const css = readFileSync(join(ROOT, 'assets/css/tools/code-formatter.css'), 'utf8');
    assert.match(css, /\.cf-academy-diff-slot\[hidden\]/);
    assert.match(css, /\.cf-diff__body\s*\{[^}]*min-height:\s*160px/);
    assert.match(css, /\.cf-diff-fallback/);

    api.destroy();
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
    globalThis.localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});

test('Ventana flotante temporal móvil (375px) para #cf-diff-panel: apertura, Escape, backdrop y cierre al elegir acción', async () => {
  const makeNode = (id = '') => {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const children = [];
    return {
      id, hidden: true, children,
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      addEventListener: (ev, fn) => {
        if (!listeners.has(ev)) listeners.set(ev, new Set());
        listeners.get(ev).add(fn);
      },
      removeEventListener: (ev, fn) => listeners.get(ev)?.delete(fn),
      dispatch: (ev, payload = {}) => { for (const fn of listeners.get(ev) || []) fn(payload); },
      append: (...items) => items.forEach((it) => children.push(it)),
      replaceChildren: (...items) => { children.length = 0; items.forEach((it) => children.push(it)); },
    };
  };

  const panel = makeNode('cf-diff-panel');
  const body = makeNode('body');
  let createdBackdrop = null;
  const docListeners = new Map();
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;

  globalThis.window = {
    innerWidth: 375,
    matchMedia: (q) => ({ matches: q.includes('640px') }),
  };
  globalThis.document = {
    body,
    getElementById: (id) => (id === 'cf-diff-backdrop' ? createdBackdrop : null),
    createElement: (tag) => {
      const n = makeNode(tag);
      createdBackdrop = n;
      return n;
    },
    addEventListener: (ev, fn) => {
      if (!docListeners.has(ev)) docListeners.set(ev, new Set());
      docListeners.get(ev).add(fn);
    },
    removeEventListener: (ev, fn) => docListeners.get(ev)?.delete(fn),
  };

  try {
    const { isMobileDiffViewport, setDiffFloatingMode } = await import(`../../assets/js/tools/code-formatter/diff-view.js?float=${Date.now()}`);
    assert.equal(isMobileDiffViewport(), true, 'Debe detectar viewport móvil en 375px');

    let closed = 0;
    const close = () => {
      closed += 1;
      setDiffFloatingMode(panel, { active: false });
      panel.hidden = true;
    };

    // Apertura flotante en móvil
    panel.hidden = false;
    assert.equal(setDiffFloatingMode(panel, { active: true, onClose: close }), true);
    assert.equal(panel.classList.contains('cf-diff--floating'), true);
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-modal'), 'true');
    assert.ok(createdBackdrop && createdBackdrop.hidden === false);
    assert.equal(body.classList.contains('cf-no-scroll'), true);

    // Cierre automático por tecla Escape
    for (const fn of docListeners.get('keydown') || []) fn({ key: 'Escape', preventDefault() {} });
    assert.equal(closed, 1);
    assert.equal(panel.hidden, true);
    assert.equal(panel.classList.contains('cf-diff--floating'), false);
    assert.equal(panel.getAttribute('role'), null);
    assert.equal(createdBackdrop.hidden, true);
    assert.equal(body.classList.contains('cf-no-scroll'), false);

    // Reapertura y cierre al pulsar backdrop (equivalente a cancelar / seleccionar acción)
    panel.hidden = false;
    setDiffFloatingMode(panel, { active: true, onClose: close });
    createdBackdrop.dispatch('click');
    assert.equal(closed, 2);
    assert.equal(panel.hidden, true);

    // En escritorio (1280px) no es móvil
    globalThis.window = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };
    assert.equal(isMobileDiffViewport(), false);

    // Seguridad DOM (0 innerHTML) y reglas CSS móvil flotante
    const diffSrc = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/diff-view.js'), 'utf8');
    assert.doesNotMatch(diffSrc, /\.innerHTML\b/, 'diff-view.js no debe usar innerHTML');
    const css = readFileSync(join(ROOT, 'assets/css/tools/code-formatter.css'), 'utf8');
    assert.match(css, /\.cf-diff\.cf-diff--floating/);
    assert.match(css, /\.cf-diff-backdrop\[hidden\]/);
    assert.match(css, /min-height:\s*44px/);
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
  }
});
