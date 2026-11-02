// i18n de la INTERFAZ en 7 idiomas. Es independiente del idioma de la documentación generada
// (config/documentation-languages.js). Prioridad: ?lang= > cf.ui_lang > jw_lang (sitio) > navegador.
export const SUPPORTED_LANGS = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];
const UI_KEY = 'cf.ui_lang';
export const MAX_CODE_BYTES = 16 * 1024; // límite físico por fragmento (cliente; el servidor aplica el mismo tope)
const SITE = 'https://jw-solutions.com';

function normalize(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'pt' || v === 'pt-br') return 'pt-BR';
  if (v === 'pt-pt') return 'pt-PT';
  const base = v.split('-')[0];
  return SUPPORTED_LANGS.find((l) => l.toLowerCase() === v) || (['es', 'en', 'fr', 'de', 'it'].includes(base) ? base : null);
}

function resolveLang() {
  try { const q = normalize(new URLSearchParams(location.search).get('lang')); if (q) return q; } catch { /* sin URLSearchParams */ }
  try { const s = normalize(localStorage.getItem(UI_KEY)) || normalize(localStorage.getItem('jw_lang')); if (s) return s; } catch { /* almacenamiento bloqueado */ }
  return normalize(navigator.language) || 'es';
}

export const lang = resolveLang();

const es = (await import('./locales/es.js')).default;
const current = lang === 'es' ? es : (await import(`./locales/${lang}.js`)).default;
const messages = { ...es, ...current };

/** Registra mensajes de módulos opcionales (p. ej. los de PRO). Cada módulo aporta es + el idioma activo. */
export function extendMessages(byLang) {
  Object.assign(messages, byLang.es, byLang[lang]);
}

export const t = (key, vars = {}) =>
  String(messages[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** Etiqueta BCP 47 para Intl (fechas, números). */
export const intlLocale = lang;

/** Traduce [data-i18n], [data-i18n-aria] y propaga ?lang= a los enlaces [data-site-link]. */
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  applySeo();
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  root.querySelectorAll('a[data-site-link]').forEach((a) => {
    const [path, hash = ''] = a.getAttribute('href').split('#');
    const base = path.split('?')[0];
    a.setAttribute('href', `${base}?lang=${lang}${hash ? `#${hash}` : ''}`);
  });
}

/** Traduce [data-i18n-pro] (textos comerciales: solo existen tras cargar locales-pro). */
export function applyProI18n(root = document) {
  root.querySelectorAll('[data-i18n-pro]').forEach((el) => { el.textContent = t(el.dataset.i18nPro); });
  root.querySelectorAll('[data-i18n-pro-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nProAria)); });
}

/** Rellena el selector de idioma de interfaz; al cambiar recarga con ?lang= y recuerda la elección. */
export async function setupLangSelector(select) {
  const names = await Promise.all(SUPPORTED_LANGS.map(async (l) => [l, l === lang ? messages.langName : (await import(`./locales/${l}.js`)).default.langName]));
  select.replaceChildren(...names.map(([l, name]) => Object.assign(document.createElement('option'), { value: l, textContent: name, selected: l === lang })));
  select.addEventListener('change', () => {
    try { localStorage.setItem(UI_KEY, select.value); } catch { /* ignorar */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', select.value);
    location.href = url.toString();
  });
}

/**
 * Canónica, hreflang y metadatos OpenGraph coherentes con el idioma activo (español = URL base sin ?lang=).
 * Opciones (páginas de tip): langs = idiomas con contenido real (solo esos llevan hreflang), contentLang = idioma del
 * contenido mostrado (la canónica apunta a él, así un idioma sin traducir no duplica contenido) y description.
 */
export function applySeo({ langs = SUPPORTED_LANGS, contentLang = lang, description } = {}) {
  const dir = location.pathname.replace(/index\.html$/, '');
  const tip = new URLSearchParams(location.search).get('tip');
  const urlFor = (l) => {
    const q = [l === 'es' ? '' : `lang=${l}`, tip ? `tip=${encodeURIComponent(tip)}` : ''].filter(Boolean).join('&');
    return `${SITE}${dir}${q ? `?${q}` : ''}`;
  };
  const head = document.head;
  const upsert = (selector, tag, attrs) => {
    let n = head.querySelector(selector);
    if (!n) { n = document.createElement(tag); head.append(n); }
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  };
  upsert('link[rel="canonical"]', 'link', { rel: 'canonical', href: urlFor(contentLang) });
  SUPPORTED_LANGS.forEach((l) => {
    const sel = `link[rel="alternate"][hreflang="${l}"]`;
    if (langs.includes(l)) upsert(sel, 'link', { rel: 'alternate', hreflang: l, href: urlFor(l) });
    else head.querySelector(sel)?.remove();
  });
  upsert('link[rel="alternate"][hreflang="x-default"]', 'link', { rel: 'alternate', hreflang: 'x-default', href: urlFor(langs.includes('es') ? 'es' : langs[0]) });
  const desc = description || (document.title === t('pageTitle') ? messages.metaDesc : '');
  if (desc) {
    upsert('meta[name="description"]', 'meta', { name: 'description', content: desc });
    upsert('meta[property="og:description"]', 'meta', { property: 'og:description', content: desc });
    upsert('meta[name="twitter:description"]', 'meta', { name: 'twitter:description', content: desc });
  }
  const og = { es: 'es_ES', en: 'en_US', fr: 'fr_FR', de: 'de_DE', it: 'it_IT', 'pt-BR': 'pt_BR', 'pt-PT': 'pt_PT' };
  upsert('meta[property="og:title"]', 'meta', { property: 'og:title', content: document.title });
  upsert('meta[name="twitter:title"]', 'meta', { name: 'twitter:title', content: document.title });
  upsert('meta[property="og:url"]', 'meta', { property: 'og:url', content: urlFor(contentLang) });
  upsert('meta[property="og:locale"]', 'meta', { property: 'og:locale', content: og[contentLang] || 'es_ES' });
}
