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

    // Vista 2 · tree (Reto Diario): cabecera y rutas ocultas, solo la misión visible
    await nodes['cf-academy-daily-btn'].dispatchClick();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(nodes['cf-academy-shell'].hidden, false);
    assert.equal(nodes['cf-academy-head'].hidden, true);
    assert.equal(nodes['cf-academy-paths'].hidden, true);
    assert.equal(nodes['cf-academy-workspace'].hidden, false);
    assert.equal(nodes['cf-academy-workspace']._scrolled, true);
    assert.equal(paneMission.hidden, false);
    assert.equal(paneEditor.hidden, true);
    assert.equal(paneResults.hidden, true);
    assert.equal(visiblePanes(), 1);
    assert.ok(nodes['cf-academy-mission-card'].children.length >= 3, 'El panel de Misión debe renderizar título, descripción y cápsula');
    assert.ok(loadedCode.length > 10, 'El código inicial del reto debe cargarse en el editor');
    assert.ok(loadedLang.length > 0, 'El lenguaje del reto debe seleccionarse');
    assert.equal(tabResults.disabled, true, 'Resultados bloqueado hasta validar');

    // Vista 3 · editor
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
    await goEditor.dispatchClick();
    assert.equal(paneEditor.hidden, false);
    assert.equal(paneMission.hidden, true);
    assert.equal(paneResults.hidden, true);
    assert.equal(visiblePanes(), 1);

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

    // 2) Reto Diario sin sesión → pending daily_challenge; con sesión reanuda en 'tree'
    meState = 'anon';
    await nodes['cf-academy-daily-btn'].dispatchClick();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(pending()?.action, 'daily_challenge');
    assert.equal(nodes['cf-academy-workspace'].hidden, true);
    meState = 'free';
    await fireAuthSuccess({ plan: 'free' });
    assert.equal(nodes['cf-academy-workspace'].hidden, false);
    assert.equal(paneMission.hidden, false);
    assert.equal(nodes['cf-academy-head'].hidden, true);

    // 3) Tecnología sin sesión → pending open_topic; con sesión reanuda el tema exacto
    await nodes['cf-academy-back'].dispatchClick();
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
