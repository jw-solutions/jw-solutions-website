import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const LOCALES = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

function makeNode(tag) {
  const attrs = new Map();
  const listeners = new Map();
  const node = {
    tag,
    id: '',
    className: '',
    textContent: '',
    hidden: false,
    style: {},
    children: [],
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    removeAttribute(k) { attrs.delete(k); },
    append(...items) { this.children.push(...items); },
    prepend(...items) { this.children.unshift(...items); },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    dispatchClick() {
      for (const fn of listeners.get('click') || []) fn({ preventDefault() {} });
    },
    querySelector(sel) {
      const walk = (n) => {
        for (const c of n.children || []) {
          if (!c) continue;
          if (sel.startsWith('#') && c.id === sel.slice(1)) return c;
          if (sel.startsWith('.') && String(c.className).split(/\s+/).includes(sel.slice(1))) return c;
          const deep = walk(c);
          if (deep) return deep;
        }
        return null;
      };
      return walk(this);
    },
  };
  return node;
}

test('Loaders por Nicho (Opciones A, B y C): comportamiento, cierre garantizado y 0 innerHTML', async () => {
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  const body = makeNode('body');
  const byId = new Map();
  const trackIds = (n) => {
    if (n?.id) byId.set(n.id, n);
    for (const c of n?.children || []) trackIds(c);
  };
  const origAppend = body.append.bind(body);
  const origPrepend = body.prepend.bind(body);
  body.append = (...items) => { origAppend(...items); items.forEach(trackIds); };
  body.prepend = (...items) => { origPrepend(...items); items.forEach(trackIds); };

  globalThis.location = { href: 'https://jw-solutions.com/tools/code-formatter/', pathname: '/tools/code-formatter/', search: '' };
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    body,
    getElementById: (id) => byId.get(id) || body.querySelector(`#${id}`) || null,
    querySelector: (sel) => body.querySelector(sel),
    createElement: (tag) => makeNode(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  try {
    const {
      startTopLoader,
      stopTopLoader,
      createSkeleton,
      showAcademyLoader,
      hideAcademyLoader,
      createCompactSplash,
    } = await import('../../assets/js/tools/code-formatter/loaders.js');

    // Opción A: barra dorada superior + skeleton
    const top = startTopLoader({ safetyMs: 5000 });
    assert.ok(top);
    assert.equal(top.hidden, false);
    assert.equal(top.getAttribute('aria-busy'), 'true');
    stopTopLoader();
    assert.equal(top.hidden, true);
    assert.equal(top.getAttribute('aria-busy'), null);

    const sk = createSkeleton(4, 'Cargando');
    assert.equal(sk.className, 'cf-skeleton');
    assert.equal(sk.getAttribute('aria-live'), 'polite');
    assert.equal(sk.children.length, 5); // 1 sr-only + 4 líneas

    // Opción B: llaves { } + cursor en Modo Academia
    const workspace = makeNode('div');
    const acLoader = showAcademyLoader(workspace, 'Cargando reto...');
    assert.equal(acLoader.hidden, false);
    assert.equal(acLoader.getAttribute('aria-busy'), 'true');
    assert.equal(acLoader.querySelector('.cf-academy-loader__text').textContent, 'Cargando reto...');
    hideAcademyLoader(workspace);
    assert.equal(acLoader.hidden, true);

    // Opción C: splash compacto con porcentaje y salida rápida ("Entrar ahora")
    let skipped = false;
    const splash = createCompactSplash({ onSkip: () => { skipped = true; } });
    splash.show({ initialProgress: 25, safetyMs: 5000 });
    assert.equal(splash.element.hidden, false);
    assert.equal(splash.element.querySelector('.cf-splash__pct').textContent, '25%');
    splash.setProgress(65);
    assert.equal(splash.element.querySelector('.cf-splash__pct').textContent, '65%');
    const skipBtn = splash.element.querySelector('#cf-splash-skip');
    assert.ok(skipBtn);
    skipBtn.dispatchClick();
    assert.equal(skipped, true);
    assert.equal(splash.element.hidden, true);
  } finally {
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
  }

  const src = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/loaders.js'), 'utf8');
  assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML/, 'loaders.js no debe usar innerHTML');
});

test('Bloque 3: CSS respeta [hidden] y prefers-reduced-motion, paridad 7 locales y 0 fugas en dist-public/', async () => {
  const css = readFileSync(join(ROOT, 'assets/css/tools/code-formatter.css'), 'utf8');
  assert.match(css, /\.cf-top-loader\[hidden\]/);
  assert.match(css, /\.cf-academy-loader\[hidden\]/);
  assert.match(css, /\.cf-splash\[hidden\]/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*cf-academy-loader__cursor/);

  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  assert.match(html, /name="_gotcha"[^>]*tabindex="-1"[^>]*aria-hidden="true"/);

  const keys = ['loaderTopAria', 'loaderSkeletonLabel', 'loaderAcademyLoading', 'loaderSplashTitle', 'loaderSplashSkip'];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of keys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave ${k} en ${loc}`);
    }
  }

  const distLoader = join(ROOT, 'dist-public/assets/js/tools/code-formatter/loaders.js');
  if (existsSync(distLoader)) {
    assert.equal(existsSync(join(ROOT, 'dist-public/assets/js/tools/code-formatter/pro-modal.js')), false);
  }
});
