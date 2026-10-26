// Orquestación de la UI del Code Formatter.
import { view, setLanguage } from './editor.js';
import { detectLanguage, LANG_LABELS } from './detect.js';
import { formatCode } from './formatters.js';
import { addDocs, DOC_SUPPORTED } from './doc-generator.js';
import { copyCode, downloadCode, copyMarkdown, toast, writeClipboard, downloadText } from './actions.js';
import { loadHistory, pushHistory, clearHistory, removeHistoryItem } from './history.js';
import { DOC_LANGUAGES, DEFAULT_DOC_LANGUAGE } from '../../../../config/documentation-languages.js';
import { featuresReady, isFeatureOn } from './ui-controller.js';
import { t, applyI18n, setupLangSelector, intlLocale } from './i18n.js';

applyI18n();
await setupLangSelector(document.getElementById('cf-ui-lang'));
await featuresReady; // el inventario free/pay decide qué controles existen

// Módulos de funciones opcionales: se importan solo si la función está activa (en dist-public pueden no existir).
const jsonDocs = isFeatureOn('json_docs')
  ? { ...(await import('./json-documentation-adapter.js')), ...(await import('./structured-doc-ui.js')) }
  : null;
if (isFeatureOn('pro_billing')) {
  try { (await import('./pro-modal.js')).initProModal(); } catch (err) { console.warn('[code-formatter] modal PRO no iniciado:', err.message); }
}
if (isFeatureOn('accounts_auth')) {
  try { (await import('./auth-modal.js')).initAuthModal(); } catch (err) { console.warn('[code-formatter] autenticación no iniciada:', err.message); }
}

// Sesión única (solo funciones pay): el módulo no existe en dist-public, por eso se importa bajo demanda.
if (isFeatureOn('single_session')) {
  try {
    const { startSessionMonitor, SESSION_HINT_KEY } = await import('./services/session-monitor.js');
    if (localStorage.getItem(SESSION_HINT_KEY) === '1') startSessionMonitor();
  } catch (err) {
    console.warn('[code-formatter] monitor de sesión no iniciado:', err.message);
  }
}

const $ = (id) => document.getElementById(id);
const getCode = () => view.state.doc.toString();
const setCode = (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });

const langSel = $('cf-language');
const detected = $('cf-detected');
const docLangSel = $('cf-doc-lang');
const detailSel = $('cf-detail');
const commentsToggle = $('cf-comments');
const formatBtn = $('cf-format');

// Selectores poblados desde la configuración
docLangSel.innerHTML = Object.entries(DOC_LANGUAGES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
docLangSel.value = DEFAULT_DOC_LANGUAGE;
detailSel.innerHTML = ['basic', 'extended']
  .filter((k) => k !== 'extended' || isFeatureOn('extended_detail'))
  .map((k) => `<option value="${k}">${t(k)}</option>`).join('');

const syncCommentControls = () => {
  const on = commentsToggle.checked;
  docLangSel.disabled = !on;
  detailSel.disabled = !on;
};
commentsToggle.addEventListener('change', syncCommentControls);
syncCommentControls();

/** Lenguaje efectivo: el elegido, o el detectado cuando está en "auto". */
function resolveLanguage(code) {
  if (langSel.value !== 'auto') return langSel.value;
  const lang = detectLanguage(code);
  if (lang) {
    detected.textContent = t('detected', { lang: LANG_LABELS[lang] });
    detected.hidden = false;
    setLanguage(lang);
  } else {
    detected.hidden = true;
  }
  return lang;
}

let detectTimer;
view.dom.addEventListener('paste', () => {
  if (langSel.value !== 'auto') return;
  clearTimeout(detectTimer);
  detectTimer = setTimeout(() => resolveLanguage(getCode()), 50);
});

// Documentación estructurada (función free "json_docs")
const structuredPanel = $('cf-structured-doc');
let structuredDoc = null; // { doc, docLang }
if (structuredPanel && jsonDocs) {
  $('cf-sd-md').addEventListener('click', () => {
    if (!structuredDoc) return;
    downloadText(jsonDocs.toMarkdownDoc(structuredDoc.doc, structuredDoc.docLang), 'documentation.md', 'text/markdown');
    toast(t('exported', { name: 'documentation.md' }));
  });
  $('cf-sd-json').addEventListener('click', () => {
    if (!structuredDoc) return;
    downloadText(`${JSON.stringify(structuredDoc.doc, null, 2)}\n`, 'documentation.json', 'application/json');
    toast(t('exported', { name: 'documentation.json' }));
  });
}

// Vista de diferencias (función free "diff_view"; los nodos no existen si está desactivada)
const diffBtn = $('cf-diff');
const diffPanel = $('cf-diff-panel');
let diffState = null; // { original, result, lang }
let diffMod = null;

async function openDiff() {
  if (!diffState) return toast(t('noDiff'));
  diffMod ||= await import('./diff-view.js');
  const hasChanges = await diffMod.showDiff($('cf-diff-body'), diffState);
  if (!hasChanges) { diffPanel.hidden = true; return toast(t('sameCode')); }
  diffPanel.hidden = false;
  diffPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function closeDiffPanel() {
  diffMod?.closeDiff();
  if (diffPanel) diffPanel.hidden = true;
}
if (diffBtn && diffPanel) {
  diffBtn.addEventListener('click', () => openDiff().catch(() => toast(t('copyFail'))));
  $('cf-diff-close').addEventListener('click', closeDiffPanel);
  $('cf-diff-restore').addEventListener('click', () => { setCode(diffState.original); closeDiffPanel(); toast(t('restored')); });
  $('cf-diff-apply').addEventListener('click', () => { setCode(diffState.result); closeDiffPanel(); toast(t('applied')); });
  $('cf-diff-copy').addEventListener('click', async () => {
    try { await writeClipboard(diffState.result); toast(t('copied')); } catch { toast(t('copyFail')); }
  });
}

formatBtn.addEventListener('click', async () => {
  const code = getCode();
  if (!code.trim()) return toast(t('pasteFirst'));
  const lang = resolveLanguage(code);
  if (!lang) return toast(t('noDetect'));

  formatBtn.disabled = true;
  formatBtn.textContent = t('formatting');
  try {
    const res = await formatCode(code, lang);
    let out = res.code;
    let note = res.engine;
    let result = 'formatted_success';
    if (structuredPanel) structuredPanel.hidden = true;
    if (commentsToggle.checked) {
      if (lang === 'json' && jsonDocs) {
        // JSON no admite comentarios: documentación externa estructurada (idioma de documentación aparte)
        const analysis = jsonDocs.analyzeJson(out);
        if (!analysis.valid) throw new Error(t('jsonInvalid', { msg: analysis.error }));
        structuredDoc = { doc: jsonDocs.buildDocumentation(analysis, docLangSel.value, detailSel.value), docLang: docLangSel.value };
        jsonDocs.renderStructuredDoc(structuredPanel, analysis, structuredDoc.doc);
        note += ` · ${t('jsonDocTitle')}`;
        result = 'validated_documented';
      } else if (DOC_SUPPORTED.has(lang)) {
        const docs = addDocs(out, lang, docLangSel.value, detailSel.value);
        out = docs.code;
        note += ` · ${t('docsBlocks', { n: docs.count })}`;
        if (docs.count > 0) result = 'formatted_documented';
      } else {
        note += ` · ${t('docsUnavailable')}`;
      }
    }
    setCode(out);
    renderHistory(pushHistory(code, lang, result));
    if (diffBtn) {
      diffState = { original: code, result: out, lang };
      diffBtn.disabled = false;
      if (!diffPanel.hidden) openDiff().catch(() => {}); // refresca el diff abierto
    }
    toast(note);
  } catch (err) {
    toast(t('syntaxError', { msg: String(err.message || err).split('\n')[0].slice(0, 90) }));
  } finally {
    formatBtn.disabled = false;
    formatBtn.textContent = t('format');
  }
});

const currentLang = () => (langSel.value !== 'auto' ? langSel.value : detectLanguage(getCode()));
$('cf-copy').addEventListener('click', () => copyCode(getCode()));
$('cf-download').addEventListener('click', () => downloadCode(getCode(), currentLang()));
$('cf-copy-md').addEventListener('click', () => copyMarkdown(getCode(), currentLang()));

// Historial
const histList = $('cf-history-list');
const dateFmt = new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' });
const sizeFmt = (n) => (n < 1024 ? `${n} B` : `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(n / 1024)} KB`);
const node = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};
const actionBtn = (label, onClick) => {
  const b = node('button', 'cf-btn cf-btn--small', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

/** Renderizado exclusivamente con nodos DOM y textContent (el código guardado nunca se interpreta como HTML). */
function renderHistory(items) {
  histList.replaceChildren();
  if (!items.length) {
    histList.append(node('li', 'cf-muted', t('emptyHistory')));
    return;
  }
  items.forEach((item) => {
    const first = item.code.split('\n').find((l) => l.trim()) || '';
    const main = node('div', 'cf-history__main');
    const title = node('div', 'cf-history__title');
    title.append(
      node('span', 'cf-history__lang', LANG_LABELS[item.lang] || item.lang),
      node('span', '', t(`res_${item.result}`)),
      node('span', 'cf-history__meta', dateFmt.format(item.ts)),
    );
    const lines = item.lines === 1 ? t('lineOne') : t('lines', { n: item.lines });
    main.append(title, node('div', 'cf-history__meta', `${sizeFmt(item.bytes)} · ${lines}`), node('p', 'cf-history__preview', first.trim().slice(0, 80)));

    const btns = node('div', 'cf-history__btns');
    btns.append(
      actionBtn(t('historyRestore'), () => {
        langSel.value = item.lang;
        detected.hidden = true;
        setLanguage(item.lang);
        setCode(item.code);
        toast(t('historyRestored'));
      }),
      actionBtn(t('historyDelete'), () => { renderHistory(removeHistoryItem(item.id)); toast(t('historyDeleted')); }),
    );
    const li = node('li', 'cf-history__row');
    li.append(main, btns);
    histList.append(li);
  });
}
$('cf-history-clear').addEventListener('click', () => { renderHistory(clearHistory()); toast(t('historyCleared')); });
renderHistory(loadHistory());
