// Vista comparativa Antes/Después con @codemirror/merge (carga bajo demanda).
// Seguridad: fallback y capa flotante móvil 100% DOM seguro (createElement + textContent, cero innerHTML).

let current = null;
let lastContainer = null;
let floatingCleanup = null;
let floatingReturnFocus = null;

export function isMobileDiffViewport() {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(max-width: 640px)');
    if (mq && typeof mq.matches === 'boolean') return mq.matches;
  }
  return Number(window.innerWidth || 0) > 0 && Number(window.innerWidth) <= 640;
}

function getFocusableElements(panel) {
  if (!panel) return [];
  if (typeof panel.querySelectorAll === 'function') {
    const found = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hidden);
    if (found.length) return found;
  }
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (!n || n.hidden || n.disabled) continue;
      if (typeof n.focus === 'function' && (n.tagName === 'BUTTON' || String(n.id || '').startsWith('cf-diff-'))) {
        out.push(n);
      }
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  if (Array.isArray(panel.children)) walk(panel.children);
  return out;
}

/**
 * Activa o limpia el modo ventana flotante temporal para #cf-diff-panel en móvil (<= 640px).
 * Crea/gestiona el backdrop, trampa de foco (Tab/Shift+Tab), retorno de foco, Escape y bloqueo de scroll (cero innerHTML).
 */
export function setDiffFloatingMode(panel, { active, onClose, returnFocusEl } = {}) {
  if (floatingCleanup) {
    floatingCleanup();
    floatingCleanup = null;
  }
  if (!panel) return false;

  const existingBackdrop = typeof document !== 'undefined' ? document.getElementById('cf-diff-backdrop') : null;
  if (!active) {
    panel.classList?.remove('cf-diff--floating');
    panel.removeAttribute?.('role');
    panel.removeAttribute?.('aria-modal');
    if (existingBackdrop) existingBackdrop.hidden = true;
    document?.body?.classList?.remove('cf-no-scroll');
    const target = returnFocusEl || floatingReturnFocus;
    floatingReturnFocus = null;
    if (target && typeof target.focus === 'function' && target.isConnected !== false) {
      target.focus();
    }
    return false;
  }

  floatingReturnFocus = returnFocusEl || (typeof document !== 'undefined' ? document.activeElement : null) || null;

  let backdrop = existingBackdrop;
  if (!backdrop && typeof document !== 'undefined') {
    backdrop = document.createElement('div');
    backdrop.id = 'cf-diff-backdrop';
    backdrop.className = 'cf-diff-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body?.append?.(backdrop);
  }
  if (backdrop) backdrop.hidden = false;

  panel.classList?.add('cf-diff--floating');
  panel.setAttribute?.('role', 'dialog');
  panel.setAttribute?.('aria-modal', 'true');
  document?.body?.classList?.add('cf-no-scroll');

  const onBackdropClick = () => { if (typeof onClose === 'function') onClose(); };
  const onKeyDown = (ev) => {
    if (!ev) return;
    if (ev.key === 'Escape' && typeof onClose === 'function') {
      ev.preventDefault?.();
      onClose();
      return;
    }
    if (ev.key === 'Tab') {
      const focusables = getFocusableElements(panel);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (ev.shiftKey) {
        if (activeEl === first || !focusables.includes(activeEl)) {
          ev.preventDefault?.();
          last.focus?.();
        }
      } else if (activeEl === last || !focusables.includes(activeEl)) {
        ev.preventDefault?.();
        first.focus?.();
      }
    }
  };
  backdrop?.addEventListener?.('click', onBackdropClick);
  document?.addEventListener?.('keydown', onKeyDown);

  floatingCleanup = () => {
    backdrop?.removeEventListener?.('click', onBackdropClick);
    document?.removeEventListener?.('keydown', onKeyDown);
  };
  return true;
}

function renderFallbackDiff(container, original, result) {
  container.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'cf-diff-fallback';

  const mkPane = (cls, text) => {
    const pre = document.createElement('pre');
    pre.className = `cf-diff-fallback__pane ${cls}`;
    const code = document.createElement('code');
    code.textContent = String(text ?? '');
    pre.append(code);
    return pre;
  };

  wrap.append(
    mkPane('cf-diff-fallback__pane--before', original),
    mkPane('cf-diff-fallback__pane--after', result),
  );
  container.append(wrap);
}

/** Fuerza recálculo de medidas de CodeMirror MergeView cuando el panel ya es visible. */
export function measureDiff() {
  if (!current) return;
  try {
    current.a?.requestMeasure?.();
    current.b?.requestMeasure?.();
  } catch { /* opcional */ }
}

/** Muestra el diff en `container`. Devuelve true si hay diferencias, false si el texto es idéntico. */
export async function showDiff(container, { original, result, lang }) {
  closeDiff();
  if (!container) return false;
  lastContainer = container;
  const before = String(original ?? '');
  const after = String(result ?? '');
  if (before === after) return false;

  container.replaceChildren();
  try {
    const [{ MergeView }, { EditorView, lineNumbers }, { EditorState }, { oneDark }, { languageExtension }] = await Promise.all([
      import('@codemirror/merge'),
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@codemirror/theme-one-dark'),
      import('./editor.js'),
    ]);
    const extensions = [
      lineNumbers(), oneDark, languageExtension(lang),
      EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false),
    ];
    current = new MergeView({
      parent: container,
      a: { doc: before, extensions },
      b: { doc: after, extensions },
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    });
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => measureDiff());
  } catch {
    renderFallbackDiff(container, before, after);
  }
  return true;
}

export function closeDiff() {
  if (current) {
    current.destroy();
    current = null;
  }
  if (lastContainer) {
    lastContainer.replaceChildren();
    lastContainer = null;
  }
}
