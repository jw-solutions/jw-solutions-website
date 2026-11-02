// Embeber: (1) modal "Embeber en tu Web / GitHub" de la herramienta y (2) lógica del widget iframe (tools/code-formatter/embed/).
// Los dos fragmentos generados incluyen un enlace normal (sin rel="nofollow") a la herramienta con el ancla "Clean Code Formatter AI".
import { t, lang, applyI18n, MAX_CODE_BYTES } from './i18n.js';
import { toast, writeClipboard } from './actions.js';
import { detectLanguage, LANG_LABELS } from './detect.js';

const SITE = 'https://jw-solutions.com';
const TOOL = `${SITE}/tools/code-formatter/`;
export const ANCHOR = 'Clean Code Formatter AI';

/** Opción A: badge Markdown para README (el texto alternativo de la imagen es el ancla del enlace). */
export const badgeMarkdown = () => `[![Formatted with ${ANCHOR}](${SITE}/assets/images/badges/formatted-with-jw.svg)](${TOOL})`;

/** Opción B: iframe + enlace de texto debajo (el backlink que cuenta es el que vive en la página que incrusta). */
export const widgetHtml = (uiLang) => [
  `<iframe src="${TOOL}embed/?lang=${uiLang}" width="100%" height="400" style="border:0" loading="lazy" title="${ANCHOR}"></iframe>`,
  `<p><a href="${TOOL}">${ANCHOR}</a></p>`,
].join('\n');

export function initEmbedModal() {
  const dialog = document.getElementById('cf-embed-modal');
  if (!dialog) return;
  dialog.querySelector('[data-cf-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-cf-embed-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const box = document.getElementById(btn.dataset.cfEmbedCopy);
      try { await writeClipboard(box.value); toast(t('embedCopied')); } catch { box.select(); toast(t('copyFail')); }
    });
  });
  document.getElementById('cf-embed-open').addEventListener('click', () => {
    document.getElementById('cf-embed-badge').value = badgeMarkdown();
    document.getElementById('cf-embed-widget').value = widgetHtml(lang);
    dialog.showModal();
  });
}

/** Widget iframe: mini-formateador (textarea + motores existentes) con enlace de atribución. */
async function initWidget() {
  applyI18n();
  const $ = (id) => document.getElementById(id);
  const sel = $('w-lang');
  sel.append(Object.assign(document.createElement('option'), { value: 'auto', textContent: t('auto') }));
  Object.entries(LANG_LABELS).forEach(([k, label]) => sel.append(Object.assign(document.createElement('option'), { value: k, textContent: label })));
  const code = $('w-code');
  code.placeholder = t('embedPlaceholder');
  const brand = $('w-brand');
  brand.href = `${TOOL}?lang=${lang}`;
  $('w-open').href = `${TOOL}?lang=${lang}`;
  $('w-open').textContent = t('embedOpen');

  const bytes = (s) => new TextEncoder().encode(s).length;
  $('w-format').addEventListener('click', async () => {
    const src = code.value;
    if (!src.trim()) return toast(t('pasteFirst'));
    if (bytes(src) > MAX_CODE_BYTES) return toast(t('tooBig', { kb: MAX_CODE_BYTES / 1024 }));
    const l = sel.value === 'auto' ? detectLanguage(src) : sel.value;
    if (!l) return toast(t('noDetect'));
    const btn = $('w-format');
    btn.disabled = true;
    try {
      const { formatCode } = await import('./formatters.js');
      code.value = (await formatCode(src, l)).code;
      toast(t('res_formatted_success'));
    } catch (err) {
      toast(t('syntaxError', { msg: String(err.message || err).split('\n')[0].slice(0, 90) }));
    } finally { btn.disabled = false; }
  });
  $('w-copy').addEventListener('click', async () => {
    if (!code.value.trim()) return toast(t('noCode'));
    try { await writeClipboard(code.value); toast(t('copied')); } catch { toast(t('copyFail')); }
  });
}

if (document.body.hasAttribute('data-cf-widget')) initWidget();
