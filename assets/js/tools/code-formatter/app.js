// Orquestación de la UI del Code Formatter.
import { view, setLanguage } from './editor.js';
import { detectLanguage, LANG_LABELS } from './detect.js';
import { formatCode } from './formatters.js';
import { addDocs, DOC_SUPPORTED } from './doc-generator.js';
import { copyCode, downloadCode, copyMarkdown, toast, writeClipboard } from './actions.js';
import { loadHistory, pushHistory, clearHistory } from './history.js';
import { DOC_LANGUAGES, DEFAULT_DOC_LANGUAGE } from '../../../../config/documentation-languages.js';
import { featuresReady, isFeatureOn } from './ui-controller.js';
import { t, applyI18n } from './i18n.js';

applyI18n();
await featuresReady; // el inventario free/pay decide qué controles existen

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
    if (commentsToggle.checked) {
      if (DOC_SUPPORTED.has(lang)) {
        const docs = addDocs(out, lang, docLangSel.value, detailSel.value);
        out = docs.code;
        note += ` · ${t('docsBlocks', { n: docs.count })}`;
      } else {
        note += ` · ${t('docsUnavailable')}`;
      }
    }
    setCode(out);
    renderHistory(pushHistory(code, lang));
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
function renderHistory(items) {
  histList.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'cf-muted';
    li.textContent = t('emptyHistory');
    histList.append(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cf-history__item';
    const first = item.code.split('\n').find((l) => l.trim()) || '';
    btn.textContent = `${LANG_LABELS[item.lang] || item.lang} · ${first.trim().slice(0, 48)}`;
    btn.title = new Date(item.ts).toLocaleString();
    btn.addEventListener('click', () => {
      langSel.value = item.lang;
      detected.hidden = true;
      setLanguage(item.lang);
      setCode(item.code);
    });
    li.append(btn);
    histList.append(li);
  });
}
$('cf-history-clear').addEventListener('click', () => { clearHistory(); renderHistory([]); });
renderHistory(loadHistory());
