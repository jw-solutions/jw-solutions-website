// Barra reutilizable de compartir social para artículos (/tips/), guías (/fix/) y modal del carrusel.
// Seguridad: cero innerHTML; validación estricta de URL canónica https://jw-solutions.com/... y rel="noopener noreferrer".
import { t } from './i18n.js';

const CANONICAL_ORIGIN = 'https://jw-solutions.com';

/** Valida que la URL pertenezca estrictamente al dominio canónico https://jw-solutions.com. */
export function isSafeCanonicalUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    return parsed.protocol === 'https:' && parsed.origin === CANONICAL_ORIGIN;
  } catch {
    return false;
  }
}

/** Normaliza una URL local o relativa hacia el dominio canónico si es segura; devuelve null si es externa. */
export function resolveCanonicalShareUrl(rawUrl) {
  if (isSafeCanonicalUrl(rawUrl)) return new URL(String(rawUrl)).href;
  try {
    const u = new URL(String(rawUrl || ''), CANONICAL_ORIGIN);
    if (u.protocol === 'https:' && u.origin === CANONICAL_ORIGIN) return u.href;
  } catch { /* inválida */ }
  return null;
}

/** Construye los enlaces oficiales de compartir codificados con encodeURIComponent. */
export function buildShareLinks(url, title) {
  const safeUrl = resolveCanonicalShareUrl(url);
  if (!safeUrl) return null;
  const safeTitle = String(title || '').trim().slice(0, 200);
  const u = encodeURIComponent(safeUrl);
  const txt = encodeURIComponent(safeTitle);
  return {
    url: safeUrl,
    title: safeTitle,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    x: `https://twitter.com/intent/tweet?text=${txt}&url=${u}`,
    whatsapp: `https://api.whatsapp.com/send?text=${txt}%20${u}`,
  };
}

function copyTextSafe(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'cf-sr-only';
      document.body.append(ta);
      ta.select();
      const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      ta.remove();
      if (ok) resolve(); else reject(new Error('copy_failed'));
    } catch (err) {
      reject(err);
    }
  });
}

function setStatusMessage(statusEl, message) {
  if (!statusEl) return;
  statusEl.textContent = message;
  if (statusEl._cfTimer) clearTimeout(statusEl._cfTimer);
  statusEl._cfTimer = setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

/** Crea una barra de compartir accesible usando solo createElement y textContent. */
export function createShareBar({ url, title, compact = false } = {}) {
  const links = buildShareLinks(url, title);
  if (!links) return null;

  const section = document.createElement('section');
  section.className = compact ? 'cf-share cf-share--compact' : 'cf-card cf-share';
  section.setAttribute('aria-label', t('shareArticleTitle'));
  section.dataset.cfShare = '1';
  section.dataset.shareUrl = links.url;
  section.dataset.shareTitle = links.title;

  const heading = document.createElement(compact ? 'p' : 'h2');
  heading.className = 'cf-share__title';
  heading.textContent = t('shareArticleTitle');

  const actions = document.createElement('div');
  actions.className = 'cf-share__actions';

  const status = document.createElement('p');
  status.className = 'cf-share__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const nativeBtn = document.createElement('button');
    nativeBtn.type = 'button';
    nativeBtn.className = 'cf-share__btn cf-share__btn--primary';
    nativeBtn.textContent = t('shareNative');
    nativeBtn.addEventListener('click', () => {
      navigator.share({ title: links.title, url: links.url }).catch(() => { /* cancelado por el usuario */ });
    });
    actions.append(nativeBtn);
  }

  const external = [
    { id: 'linkedin', href: links.linkedin, label: 'LinkedIn', aria: t('shareLinkedIn') },
    { id: 'x', href: links.x, label: 'X', aria: t('shareX') },
    { id: 'whatsapp', href: links.whatsapp, label: 'WhatsApp', aria: t('shareWhatsApp') },
  ];

  for (const item of external) {
    const a = document.createElement('a');
    a.className = 'cf-share__btn';
    a.dataset.cfShareNet = item.id;
    a.href = item.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', item.aria);
    a.textContent = item.label;
    actions.append(a);
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'cf-share__btn';
  copyBtn.dataset.cfShareCopy = '1';
  copyBtn.textContent = t('shareCopyLink');
  copyBtn.addEventListener('click', () => {
    copyTextSafe(links.url).then(
      () => setStatusMessage(status, t('shareCopied')),
      () => setStatusMessage(status, t('shareCopyFail')),
    );
  });
  actions.append(copyBtn);

  section.append(heading, actions, status);
  return section;
}

/** Hidrata barras de compartir estáticas generadas por build_public.py (Web Share + Copiar enlace). */
export function bindStaticShareBars(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-cf-share]').forEach((section) => {
    if (section.dataset.cfShareBound === '1') return;
    section.dataset.cfShareBound = '1';

    const rawUrl = section.dataset.shareUrl || document.querySelector('link[rel="canonical"]')?.href || '';
    const safeUrl = resolveCanonicalShareUrl(rawUrl);
    if (!safeUrl) return;
    const shareTitle = section.dataset.shareTitle || document.title || '';
    const status = section.querySelector('.cf-share__status');

    const nativeBtn = section.querySelector('[data-cf-share-native]');
    if (nativeBtn && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener('click', () => {
        navigator.share({ title: shareTitle, url: safeUrl }).catch(() => { /* cancelado */ });
      });
    }

    const copyBtn = section.querySelector('[data-cf-share-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const okMsg = copyBtn.dataset.copiedMsg || t('shareCopied');
        const failMsg = copyBtn.dataset.copyFailMsg || t('shareCopyFail');
        copyTextSafe(safeUrl).then(
          () => setStatusMessage(status, okMsg),
          () => setStatusMessage(status, failMsg),
        );
      });
    }
  });
}
