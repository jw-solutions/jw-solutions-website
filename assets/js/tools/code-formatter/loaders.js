// Loaders por nicho (Dark Glass Gold, WCAG 2.2 AA, cero innerHTML).
// Opción A: Skeleton Screen + Barra dorada fina superior.
// Opción B: Llaves { } + cursor animado para Modo Academia.
// Opción C: Splash compacto con porcentaje y salida rápida ("Entrar ahora").
import { t } from './i18n.js';

let topLoaderTimer = null;

function ensureTopLoaderNode() {
  if (typeof document === 'undefined') return null;
  let bar = document.getElementById('cf-top-loader');
  if (!bar && document.body) {
    bar = document.createElement('div');
    bar.id = 'cf-top-loader';
    bar.className = 'cf-top-loader';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', t('loaderTopAria'));
    bar.hidden = true;
    const fill = document.createElement('span');
    fill.className = 'cf-top-loader__bar';
    bar.append(fill);
    document.body.prepend(bar);
  }
  return bar;
}

/** Opción A: activa la barra dorada fina superior con cierre de seguridad automático. */
export function startTopLoader({ safetyMs = 10000 } = {}) {
  const bar = ensureTopLoaderNode();
  if (!bar) return null;
  bar.hidden = false;
  bar.setAttribute('aria-busy', 'true');
  bar.setAttribute('aria-label', t('loaderTopAria'));
  if (topLoaderTimer) clearTimeout(topLoaderTimer);
  topLoaderTimer = setTimeout(() => stopTopLoader(), safetyMs);
  return bar;
}

/** Opción A: oculta inmediatamente la barra dorada superior. */
export function stopTopLoader() {
  if (topLoaderTimer) {
    clearTimeout(topLoaderTimer);
    topLoaderTimer = null;
  }
  if (typeof document === 'undefined') return;
  const bar = document.getElementById('cf-top-loader');
  if (bar) {
    bar.hidden = true;
    bar.removeAttribute('aria-busy');
  }
}

/** Opción A: crea un Skeleton Screen estable (CLS-friendly) usando solo createElement + textContent. */
export function createSkeleton(lines = 3, label = t('loaderSkeletonLabel')) {
  const wrap = document.createElement('div');
  wrap.className = 'cf-skeleton';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  wrap.setAttribute('aria-busy', 'true');

  const sr = document.createElement('span');
  sr.className = 'cf-sr-only';
  sr.textContent = label;
  wrap.append(sr);

  const count = Math.max(1, Math.min(8, Number(lines) || 3));
  for (let i = 0; i < count; i += 1) {
    const line = document.createElement('span');
    line.className = i === 0
      ? 'cf-skeleton__line cf-skeleton__line--title'
      : i === count - 1
        ? 'cf-skeleton__line cf-skeleton__line--short'
        : 'cf-skeleton__line';
    line.setAttribute('aria-hidden', 'true');
    wrap.append(line);
  }
  return wrap;
}

/** Opción B: muestra el loader de llaves { } + cursor en Modo Academia. */
export function showAcademyLoader(container, label = t('loaderAcademyLoading')) {
  if (!container) return null;
  let box = container.querySelector?.('#cf-academy-loader') || (typeof document !== 'undefined' ? document.getElementById('cf-academy-loader') : null);
  if (!box) {
    box = document.createElement('div');
    box.id = 'cf-academy-loader';
    box.className = 'cf-academy-loader';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');

    const glyph = document.createElement('span');
    glyph.className = 'cf-academy-loader__glyph';
    glyph.setAttribute('aria-hidden', 'true');
    const openBrace = document.createElement('span');
    openBrace.textContent = '{';
    const cursor = document.createElement('span');
    cursor.className = 'cf-academy-loader__cursor';
    cursor.textContent = '|';
    const closeBrace = document.createElement('span');
    closeBrace.textContent = '}';
    glyph.append(openBrace, cursor, closeBrace);

    const txt = document.createElement('span');
    txt.className = 'cf-academy-loader__text';
    box.append(glyph, txt);
    container.prepend?.(box);
  }
  const txtNode = box.querySelector?.('.cf-academy-loader__text');
  if (txtNode) txtNode.textContent = label;
  box.hidden = false;
  box.setAttribute('aria-busy', 'true');
  return box;
}

/** Opción B: oculta el loader de Modo Academia. */
export function hideAcademyLoader(container) {
  const box = container?.querySelector?.('#cf-academy-loader')
    || (typeof document !== 'undefined' ? document.getElementById('cf-academy-loader') : null);
  if (!box) return;
  box.hidden = true;
  box.removeAttribute('aria-busy');
}

/** Opción C: Splash compacto con porcentaje y botón de salida rápida ("Entrar ahora"), sin atrapar foco. */
export function createCompactSplash({ onSkip = null } = {}) {
  if (typeof document === 'undefined') {
    return { show() {}, setProgress() {}, dismiss() {} };
  }
  let el = document.getElementById('cf-splash-loader');
  if (!el && document.body) {
    el = document.createElement('div');
    el.id = 'cf-splash-loader';
    el.className = 'cf-splash';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;

    const card = document.createElement('div');
    card.className = 'cf-splash__card';

    const title = document.createElement('p');
    title.className = 'cf-splash__title';
    title.textContent = t('loaderSplashTitle');

    const track = document.createElement('div');
    track.className = 'cf-splash__track';
    const fill = document.createElement('div');
    fill.className = 'cf-splash__fill';
    track.append(fill);

    const meta = document.createElement('div');
    meta.className = 'cf-splash__meta';
    const pct = document.createElement('span');
    pct.className = 'cf-splash__pct';
    pct.textContent = '0%';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.id = 'cf-splash-skip';
    skipBtn.className = 'cf-btn cf-btn--small';
    skipBtn.textContent = t('loaderSplashSkip');
    meta.append(pct, skipBtn);

    card.append(title, track, meta);
    el.append(card);
    document.body.append(el);
  }

  let dismissed = false;
  let safetyTimer = null;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    if (el) {
      el.hidden = true;
      el.removeAttribute('aria-busy');
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onEsc);
    }
  };

  const onEsc = (ev) => {
    if (ev.key === 'Escape') {
      dismiss();
      if (typeof onSkip === 'function') onSkip();
    }
  };

  const skipBtn = el?.querySelector?.('#cf-splash-skip');
  if (skipBtn && !skipBtn._cfBound) {
    skipBtn._cfBound = true;
    skipBtn.addEventListener('click', () => {
      dismiss();
      if (typeof onSkip === 'function') onSkip();
    });
  }

  const setProgress = (value) => {
    if (dismissed || !el) return;
    const clamped = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const pctNode = el.querySelector?.('.cf-splash__pct');
    const fillNode = el.querySelector?.('.cf-splash__fill');
    if (pctNode) pctNode.textContent = `${clamped}%`;
    if (fillNode && fillNode.style) fillNode.style.width = `${clamped}%`;
    if (clamped >= 100) dismiss();
  };

  const show = ({ initialProgress = 15, safetyMs = 6000 } = {}) => {
    if (dismissed || !el) return;
    el.hidden = false;
    el.setAttribute('aria-busy', 'true');
    setProgress(initialProgress);
    document.addEventListener('keydown', onEsc);
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(dismiss, safetyMs);
  };

  return { show, setProgress, dismiss, element: el };
}
