// i18n ES/EN de la herramienta. Prioridad: ?lang= > localStorage 'jw_lang' (misma clave que el sitio) > navegador.
const SUPPORTED = ['es', 'en'];

const DICT = {
  es: {
    pageTitle: 'Code Formatter & Auto-Doc AI | JW Solutions',
    skip: 'Saltar al contenido', navServices: 'Servicios', navPortfolio: 'Portfolio', navPlans: 'Planes Pro', navContact: 'Contacto',
    tag: 'Herramienta', lead: 'Pega tu código, elige el lenguaje y obtén una versión formateada y documentada.',
    language: 'Lenguaje', auto: 'Auto-detectar', comments: 'Comentarios', docLang: 'Idioma de documentación', detail: 'Detalle',
    basic: 'Básico', extended: 'Ampliado', format: 'Formatear', formatting: 'Formateando…',
    code: 'Código', lineOne: '1 línea', lines: '{n} líneas',
    copy: 'Copiar', download: 'Descargar', copyMd: 'Copiar como Markdown', diff: 'Ver diferencias',
    historyTitle: 'Historial (últimos 5)', clear: 'Limpiar', emptyHistory: 'Sin fragmentos todavía.',
    ctaText: 'Documentación ampliada con IA y sesión protegida.', ctaLink: 'Conoce los planes',
    back: 'Volver al sitio', needJs: 'Se requiere JavaScript para usar el editor.',
    detected: 'Detectado: {lang}',
    pasteFirst: 'Pega código para formatear', noDetect: 'No se pudo detectar el lenguaje; elígelo manualmente',
    syntaxError: 'Error de sintaxis: {msg}', docsBlocks: '{n} bloque(s) de documentación', docsUnavailable: 'documentación no disponible para este lenguaje',
    noCode: 'No hay código para copiar', noCodeDl: 'No hay código para descargar', copied: 'Código copiado', copyFail: 'No se pudo copiar',
    mdCopied: 'Markdown copiado', downloaded: 'Descargado {name}',
    diffTitle: 'Diferencias: antes / después', before: 'Antes (original)', after: 'Después (resultado)',
    restore: 'Restaurar original', apply: 'Aplicar resultado', copyResult: 'Copiar resultado', closeDiff: 'Cerrar',
    restored: 'Original restaurado', applied: 'Resultado aplicado', noDiff: 'Formatea primero para comparar', sameCode: 'Sin cambios: el código ya estaba formateado',
    sessionRevoked: 'Tu sesión se cerró porque se inició sesión con tu cuenta en otro dispositivo.', understood: 'Entendido',
  },
  en: {
    pageTitle: 'Code Formatter & Auto-Doc AI | JW Solutions',
    skip: 'Skip to content', navServices: 'Services', navPortfolio: 'Portfolio', navPlans: 'Pro Plans', navContact: 'Contact',
    tag: 'Tool', lead: 'Paste your code, pick the language and get a formatted, documented version.',
    language: 'Language', auto: 'Auto-detect', comments: 'Comments', docLang: 'Documentation language', detail: 'Detail',
    basic: 'Basic', extended: 'Extended', format: 'Format', formatting: 'Formatting…',
    code: 'Code', lineOne: '1 line', lines: '{n} lines',
    copy: 'Copy', download: 'Download', copyMd: 'Copy as Markdown', diff: 'View changes',
    historyTitle: 'History (last 5)', clear: 'Clear', emptyHistory: 'No snippets yet.',
    ctaText: 'Extended AI documentation and protected session.', ctaLink: 'See the plans',
    back: 'Back to site', needJs: 'JavaScript is required to use the editor.',
    detected: 'Detected: {lang}',
    pasteFirst: 'Paste some code to format', noDetect: 'Could not detect the language; pick it manually',
    syntaxError: 'Syntax error: {msg}', docsBlocks: '{n} documentation block(s)', docsUnavailable: 'documentation not available for this language',
    noCode: 'There is no code to copy', noCodeDl: 'There is no code to download', copied: 'Code copied', copyFail: 'Could not copy',
    mdCopied: 'Markdown copied', downloaded: 'Downloaded {name}',
    diffTitle: 'Changes: before / after', before: 'Before (original)', after: 'After (result)',
    restore: 'Restore original', apply: 'Apply result', copyResult: 'Copy result', closeDiff: 'Close',
    restored: 'Original restored', applied: 'Result applied', noDiff: 'Format first to compare', sameCode: 'No changes: the code was already formatted',
    sessionRevoked: 'Your session was closed because your account signed in on another device.', understood: 'Got it',
  },
};

function resolveLang() {
  try {
    const q = (new URLSearchParams(location.search).get('lang') || '').toLowerCase();
    if (SUPPORTED.includes(q)) return q;
  } catch { /* sin URLSearchParams */ }
  try {
    const saved = localStorage.getItem('jw_lang');
    if (SUPPORTED.includes(saved)) return saved;
  } catch { /* almacenamiento bloqueado */ }
  return (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
}

export const lang = resolveLang();

export const t = (key, vars = {}) =>
  (DICT[lang][key] ?? DICT.es[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** Traduce [data-i18n] (texto), [data-i18n-aria] y propaga ?lang= a los enlaces [data-site-link]. */
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('a[data-site-link]').forEach((a) => {
    const [path, hash = ''] = a.getAttribute('href').split('#');
    a.setAttribute('href', `${path}?lang=${lang}${hash ? `#${hash}` : ''}`);
  });
}
