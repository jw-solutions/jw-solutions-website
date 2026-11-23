// Interfaz del Modo Academia (Switch Dual, Rutas Profesionales, Skill Tree y Workspace).
// Seguridad: renderizado 100% vía document.createElement + textContent (cero innerHTML).
import { t, lang as uiLang } from './i18n.js';
const getUiLang = () => (typeof uiLang === 'function' ? uiLang() : (uiLang || 'es'));
import { isFeatureOn } from './ui-controller.js';
import { toast } from './actions.js';
import { evaluateChallenge, evaluateStyleRules, STYLE_RULE_SPECS } from './academy-sandbox.js';
import {
  isLevelUnlocked,
  findFirstPendingLevel,
  recordAttempt,
  completeRemedialDrill,
  recordDailyCompletion,
  evaluateAchievements,
} from './academy-engine.js';
import { loadAcademyState, saveAcademyState, captureUtmParams, syncAcademyState } from './academy-progress.js';
import { apiUrl, postJson } from './services/api.js';
import { showAcademyLoader, hideAcademyLoader } from './loaders.js';

const TECHS = ['python', 'javascript', 'typescript', 'sql', 'dax', 'java', 'csharp', 'php', 'json', 'yaml'];
const TIP_CATEGORY_BY_TECH = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'javascript',
  java: 'java',
  csharp: 'csharp',
  php: 'php',
  sql: 'sql-dax',
  dax: 'sql-dax',
  json: 'json-yaml',
  yaml: 'json-yaml',
};
const ACADEMY_BASE = new URL('../../../../content/code-formatter-academy/', import.meta.url);

/** Resuelve la ruta relativa de un tip relacionado incluyendo su subcarpeta de categoría (evita 404). */
export function resolveTipHref(tech, slug, locale = 'es') {
  const cleanSlug = String(slug || '').replace(/^\/+|\/+$/g, '');
  if (!cleanSlug) return `tips/${TIP_CATEGORY_BY_TECH[tech] || 'python'}/`;
  const loc = encodeURIComponent(String(locale || 'es'));
  if (cleanSlug.includes('/')) {
    const parts = cleanSlug.split('/').map((s) => encodeURIComponent(s)).join('/');
    return `tips/${parts}/${loc}/`;
  }
  const cat = TIP_CATEGORY_BY_TECH[String(tech || '').toLowerCase()] || 'python';
  return `tips/${cat}/${encodeURIComponent(cleanSlug)}/${loc}/`;
}
// Vistas exclusivas del flujo secuencial (una sola visible a la vez).
export const ACADEMY_VIEWS = ['paths', 'tree', 'editor', 'results'];
export const ASSIST_PREF_KEY = 'cf_academy_assist_v1';
export const IDLE_NUDGE_MS = 20000;
const PENDING_ACTION_KEY = 'cf_pending_action';
const PENDING_ACTION_TTL_MS = 900000;

function normCode(code) {
  return String(code || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** Cuenta niveles completados para una tecnología exacta evitando colisión de prefijo (ej. java vs javascript). */
export function countCompletedForTech(completed = [], tech = '') {
  const cleanTech = String(tech || '').trim().toLowerCase();
  if (!cleanTech || !Array.isArray(completed)) return 0;
  const prefix = `${cleanTech}-`;
  return completed.filter((id) => {
    const s = String(id || '').toLowerCase();
    return s === cleanTech || s.startsWith(prefix);
  }).length;
}

/** Reglas por defecto para evaluar código propio según lenguaje. */
const OWN_CODE_STYLE_RULES = {
  sql: ['uppercase_keywords', 'multiline_select', 'header_comment'],
  python: ['pep8_indent_4', 'type_hints', 'docstring_pep257'],
  dax: ['var_return', 'header_comment'],
  json: ['rfc8259_valid', 'double_quotes', 'no_trailing_comma'],
  javascript: ['jsdoc', 'semicolons'],
  typescript: ['no_explicit_any', 'tsdoc', 'return_type'],
  java: ['javadoc', 'indent_4'],
  csharp: ['xml_docs', 'allman_braces'],
  php: ['strict_types', 'psr12_braces'],
  yaml: ['no_tabs', 'consistent_indent'],
};

/** Atajos de intención rápida en la vista de rutas (TTV < 10s). */
export const QUICK_INTENTS = [
  { id: 'intent-sql', titleKey: 'acadIntentSqlTitle', descKey: 'acadIntentSqlDesc', kind: 'topic', tech: 'sql', pathId: 'data-bi' },
  { id: 'intent-python', titleKey: 'acadIntentPythonTitle', descKey: 'acadIntentPythonDesc', kind: 'topic', tech: 'python', pathId: 'data-bi' },
  { id: 'intent-dax', titleKey: 'acadIntentDaxTitle', descKey: 'acadIntentDaxDesc', kind: 'topic', tech: 'dax', pathId: 'data-bi' },
  { id: 'intent-own', titleKey: 'acadIntentOwnTitle', descKey: 'acadIntentOwnDesc', kind: 'own_code' },
];

/**
 * Construye las 4 pestañas pedagógicas (Concepto, Palabras clave, Estilo, Ejemplo análogo)
 * SIN revelar jamás `firstTest.expected` ni `reference_solution`.
 */
export function buildTutorialTabs(level, standard = '', translate = t) {
  if (!level) return [];
  const visibleTests = (level.tests || []).filter((tst) => tst.visible !== false);
  const criteria = visibleTests.map((tst) => tst.description || tst.name).filter(Boolean).slice(0, 2).join(' · ');

  const glossary = Array.isArray(level.keywords_glossary) ? level.keywords_glossary : [];
  const mechanics = level.formatting_mechanics && typeof level.formatting_mechanics === 'object' ? level.formatting_mechanics : null;
  const rawEx = level.analogous_example && typeof level.analogous_example === 'object' ? level.analogous_example : null;
  // Blindaje anti-spoiler: jamás mostrar un ejemplo idéntico a reference_solution
  const safeExample = rawEx && rawEx.code && normCode(rawEx.code) !== normCode(level.reference_solution)
    ? rawEx
    : null;

  const localizedRuleNotes = (level.style_rules || [])
    .map((r) => STYLE_RULE_SPECS[r]?.key)
    .filter(Boolean)
    .map((k) => translate(k))
    .filter(Boolean);

  return [
    {
      id: 'concept',
      labelKey: 'acadTutTabConcept',
      summary: translate('acadTutStep1', {
        standard: standard || 'Clean Code',
        goal: String(level.concept_capsule || level.title || '').slice(0, 200),
      }),
      criteria,
    },
    {
      id: 'keywords',
      labelKey: 'acadTutTabKeywords',
      summary: glossary.length
        ? translate('acadTutKeywordsIntro')
        : translate('acadTutStep2', { criteria: criteria || localizedRuleNotes.slice(0, 2).join(' · ') || level.title || '' }),
      glossary,
    },
    {
      id: 'style',
      labelKey: 'acadTutTabStyle',
      summary: mechanics
        ? translate('acadTutStyleIntro', { standard: standard || 'Clean Code' })
        : (localizedRuleNotes.length ? localizedRuleNotes.join(' · ') : translate('acadTutStyleFallback')),
      mechanics,
      ruleNotes: localizedRuleNotes,
    },
    {
      id: 'example',
      labelKey: 'acadTutTabExample',
      summary: safeExample
        ? `${safeExample.title} — ${safeExample.why_it_works}`
        : translate('acadTutExampleFallback'),
      example: safeExample,
    },
  ];
}

/** Devuelve los textos resumen de cada pestaña/paso del tutorial (sin spoilers de solución). */
export function buildTutorialSteps(level, standard = '', translate = t) {
  return buildTutorialTabs(level, standard, translate).map((tab) => tab.summary);
}

export const BUILTIN_FALLBACK_DAILY_CHALLENGE = {
  id: 'daily-python-clean-sum',
  tech: 'python',
  tier: 'free',
  starter_code: 'def total(items):\n s=0\n for x in items:\n  s+=x\n return s',
  reference_solution: 'def total(items: list[float]) -> float:\n    """Return the arithmetic sum of numeric items."""\n    if not items:\n        return 0.0\n    return float(sum(items))\n',
  style_rules: ['pep8_indent_4', 'type_hints', 'docstring'],
  tests: [
    { id: 't1', name: 'Basic sum', visible: true, type: 'pattern', expected: 'def total(', description: 'Defines total function' },
    { id: 't2', name: 'Docstring & typing', visible: true, type: 'pattern', expected: '"""', description: 'Includes PEP 257 docstring' },
    { id: 't3', name: 'Empty list guard', visible: false, type: 'pattern', expected: 'if not items', description: 'Handles empty collection edge case' },
  ],
  i18n: {
    es: { title: 'Clean & Document: Suma segura en Python', prompt: 'Formatea con 4 espacios, añade type hints, docstring y protege el caso de lista vacía.', hint: 'Usa list[float] -> float y verifica `if not items:`.' },
    en: { title: 'Clean & Document: Safe Python Sum', prompt: 'Format with 4 spaces, add type hints, a docstring, and guard against empty lists.', hint: 'Use list[float] -> float and check `if not items:`.' },
    'pt-BR': { title: 'Clean & Document: Soma segura em Python', prompt: 'Formate com 4 espaços, adicione type hints, docstring e proteja contra lista vazia.', hint: 'Use list[float] -> float e verifique `if not items:`.' },
    'pt-PT': { title: 'Clean & Document: Soma segura em Python', prompt: 'Formate com 4 espaços, adicione type hints, docstring e proteja contra lista vazia.', hint: 'Use list[float] -> float e verifique `if not items:`.' },
    fr: { title: 'Clean & Document : Somme sûre en Python', prompt: 'Formatez avec 4 espaces, ajoutez des annotations de type, une docstring et gérez la liste vide.', hint: 'Utilisez list[float] -> float et testez `if not items:`.' },
    de: { title: 'Clean & Document: Sichere Summe in Python', prompt: 'Mit 4 Leerzeichen formatieren, Type Hints, Docstring und Schutz für leere Listen ergänzen.', hint: 'Nutze list[float] -> float und prüfe `if not items:`.' },
    it: { title: 'Clean & Document: Somma sicura in Python', prompt: 'Formatta con 4 spazi, aggiungi type hint, docstring e gestisci la lista vuota.', hint: 'Usa list[float] -> float e controlla `if not items:`.' },
  },
};

function utcDayOfYear(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((current - start) / 86400000);
}

export function resolveDailyChallenge(data, lang = 'en', now = new Date()) {
  const rawList = Array.isArray(data) ? data : (Array.isArray(data?.challenges) ? data.challenges : []);
  const list = rawList.length ? rawList : [BUILTIN_FALLBACK_DAILY_CHALLENGE];
  const dayIdx = utcDayOfYear(now) % list.length;
  const ch = list[dayIdx] || BUILTIN_FALLBACK_DAILY_CHALLENGE;
  const fbCopy = BUILTIN_FALLBACK_DAILY_CHALLENGE.i18n[lang] || BUILTIN_FALLBACK_DAILY_CHALLENGE.i18n.en;
  const copy = ch.i18n?.[lang] || ch.i18n?.en || ch.i18n?.es || fbCopy;
  return {
    id: ch.id || BUILTIN_FALLBACK_DAILY_CHALLENGE.id,
    tech: ch.tech || BUILTIN_FALLBACK_DAILY_CHALLENGE.tech,
    tier: ch.tier || 'free',
    starter_code: ch.starter_code || BUILTIN_FALLBACK_DAILY_CHALLENGE.starter_code,
    reference_solution: ch.reference_solution || BUILTIN_FALLBACK_DAILY_CHALLENGE.reference_solution,
    tests: Array.isArray(ch.tests) && ch.tests.length ? ch.tests : BUILTIN_FALLBACK_DAILY_CHALLENGE.tests,
    style_rules: Array.isArray(ch.style_rules) ? ch.style_rules : BUILTIN_FALLBACK_DAILY_CHALLENGE.style_rules,
    copy: {
      title: copy.title || fbCopy.title,
      prompt: copy.prompt || fbCopy.prompt,
      hint: copy.hint || fbCopy.hint,
    },
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function readLocalState() {
  return loadAcademyState();
}

function getAcademyParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    mode: p.get('mode') === 'learn' ? 'learn' : 'format',
    path: p.get('path') || '',
    topic: p.get('topic') || '',
    level: Number(p.get('level') || 0) || 1,
    daily: p.get('daily') === '1',
    step: ACADEMY_VIEWS.includes(p.get('step')) ? p.get('step') : '',
    challenge: p.get('challenge') || '',
    openPlans: p.get('open_plans') === '1',
  };
}

function ensureNoindexForDynamicParams() {
  const p = new URLSearchParams(window.location.search);
  if ((p.has('challenge') || p.has('snippet')) && !document.querySelector('meta[name="robots"]')) {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    document.head.append(meta);
  }
}

function injectAcademyJsonLd(pathsData, locale) {
  if (document.getElementById('cf-academy-jsonld')) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'cf-academy-jsonld';
  const items = (pathsData.paths || []).map((p) => {
    const c = p.i18n?.[locale] || p.i18n?.es || {};
    return {
      '@type': 'Course',
      name: c.title,
      description: c.tagline,
      provider: { '@type': 'Organization', name: 'JW Solutions', url: 'https://jw-solutions.com' },
    };
  });
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: 'Code Formatter & Auto-Doc AI Academy',
    inLanguage: locale,
    hasPart: items,
  });
  document.head.append(script);
}

function syncUrlParams(next) {
  const url = new URL(window.location.href);
  if (next.mode === 'learn') {
    url.searchParams.set('mode', 'learn');
    if (next.path) url.searchParams.set('path', next.path); else url.searchParams.delete('path');
    if (next.topic) url.searchParams.set('topic', next.topic); else url.searchParams.delete('topic');
    if (next.level) url.searchParams.set('level', String(next.level)); else url.searchParams.delete('level');
    if (next.daily) url.searchParams.set('daily', '1'); else url.searchParams.delete('daily');
    if (next.step && next.step !== 'paths') url.searchParams.set('step', next.step); else url.searchParams.delete('step');
  } else {
    url.searchParams.delete('step');
    url.searchParams.delete('mode');
    url.searchParams.delete('path');
    url.searchParams.delete('topic');
    url.searchParams.delete('level');
    url.searchParams.delete('daily');
  }
  window.history.replaceState({}, '', url);
}

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, ACADEMY_BASE), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function initAcademyUI({ getCode, setCode, setLanguage, openDiffWith, getEditorView, formatOwnCode, closeDiffPanel, loadProLevel, idleNudgeMs = IDLE_NUDGE_MS } = {}) {
  const shell = document.getElementById('cf-academy-shell');
  const headCard = document.getElementById('cf-academy-head');
  const diffSlot = document.getElementById('cf-academy-diff-slot');
  const btnFormat = document.getElementById('cf-mode-formatter');
  const btnAcademy = document.getElementById('cf-mode-academy');
  const toolbar = document.getElementById('cf-formatter-toolbar');
  const editorHome = document.getElementById('cf-editor-slot-home');
  const editorCard = document.getElementById('cf-editor-card');
  const academyEditorSlot = document.getElementById('cf-academy-editor-slot');
  const pathsContainer = document.getElementById('cf-academy-paths');
  const workspace = document.getElementById('cf-academy-workspace');
  const backBtn = document.getElementById('cf-academy-back');
  const dailyBtn = document.getElementById('cf-academy-daily-btn');
  const ownCodeBtn = document.getElementById('cf-academy-own-code-btn');
  const ownBarEl = document.getElementById('cf-academy-own-bar');
  const ownLangSel = document.getElementById('cf-academy-own-lang');
  const ownSnapshotBtn = document.getElementById('cf-academy-own-snapshot');
  const ownCompareBtn = document.getElementById('cf-academy-own-compare');
  const skillTreeEl = document.getElementById('cf-academy-skill-tree');
  const missionEl = document.getElementById('cf-academy-mission-card');
  const checklistEl = document.getElementById('cf-academy-checklist');
  const liveEl = document.getElementById('cf-academy-live');
  const validateBtn = document.getElementById('cf-academy-validate');
  const diffBtn = document.getElementById('cf-academy-diff');
  const progressBarEl = document.getElementById('cf-academy-progress-bar');
  const pathTechsEl = document.getElementById('cf-academy-path-techs');
  const editorPane = document.getElementById('cf-academy-editor-pane');
  const editorHintBtn = document.getElementById('cf-academy-editor-hint');
  const editorHintBox = document.getElementById('cf-academy-editor-hint-box');
  const miniBriefEl = document.getElementById('cf-academy-mini-brief');
  const miniBriefTitleEl = document.getElementById('cf-academy-mini-brief-title');
  const miniBriefBodyEl = document.getElementById('cf-academy-mini-brief-body');
  const tutorialEl = document.getElementById('cf-academy-tutorial');
  const assistToggleBtn = document.getElementById('cf-academy-assist-toggle');
  const assistStatusEl = document.getElementById('cf-academy-assist-status');
  const tutorialBodyEl = document.getElementById('cf-academy-tutorial-body');
  const tutTabsEl = document.getElementById('cf-academy-tut-tabs');
  const tutRichEl = document.getElementById('cf-academy-tut-rich');
  const tutStepBadgeEl = document.getElementById('cf-academy-tut-step-badge');
  const tutTextEl = document.getElementById('cf-academy-tut-text');
  const tutPrevBtn = document.getElementById('cf-academy-tut-prev');
  const tutNextBtn = document.getElementById('cf-academy-tut-next');
  const idleNudgeEl = document.getElementById('cf-academy-idle-nudge');
  const idleEnableBtn = document.getElementById('cf-academy-idle-enable');

  if (!shell || !btnFormat || !btnAcademy) return null;

  captureUtmParams();
  let academyState = readLocalState();
  let achievementsCache = null;

  let currentMode = 'format';
  let currentPath = '';
  let currentTopic = '';
  let currentLevelNum = 1;
  let currentCurriculum = null;
  let activeLevel = null;
  let pathsCache = null;
  let dailyCache = null;
  let hintStep = 0;
  let preloadedNextLevel = null;
  let isRemedialActive = false;
  let mainLevelSnapshot = null;
  let activeDrill = null;
  let mainCodeSnapshot = null;
  let academyView = 'paths';
  let resultsReady = false;
  let primaryFocus = null;
  let lastEvaluation = null;
  let tutorialTabs = [];
  let tutorialSteps = [];
  let tutorialIndex = 0;
  let isOwnCodeActive = false;
  let ownCodeBefore = null;
  let formatterCodeSnapshot = null;
  let formatterLangSnapshot = null;
  let assistEnabled = (() => {
    try { return localStorage.getItem(ASSIST_PREF_KEY) !== '0'; } catch { return true; }
  })();
  let idleTimer = null;

  function captureFormatterBuffer() {
    if (formatterCodeSnapshot !== null) return;
    formatterCodeSnapshot = typeof getCode === 'function' ? getCode() : '';
    const langSelEl = typeof document !== 'undefined' ? document.getElementById('cf-language') : null;
    formatterLangSnapshot = langSelEl && typeof langSelEl.value === 'string' ? langSelEl.value : '';
  }

  function restoreFormatterBuffer() {
    if (formatterCodeSnapshot === null) return;
    const savedCode = formatterCodeSnapshot;
    const savedLang = formatterLangSnapshot;
    formatterCodeSnapshot = null;
    formatterLangSnapshot = null;
    if (savedLang && typeof setLanguage === 'function') {
      setLanguage(savedLang);
    }
    if (typeof setCode === 'function') {
      setCode(savedCode);
    }
  }

  function renderTutorialRich(tab) {
    if (!tutRichEl) return;
    tutRichEl.replaceChildren();
    if (!tab) {
      tutRichEl.hidden = true;
      return;
    }

    if (tab.id === 'concept' && tab.criteria) {
      const p = el('p', 'cf-academy-tut-note');
      p.append(el('strong', null, `${t('acadTutCriteriaLabel')}: `), document.createTextNode(tab.criteria));
      tutRichEl.append(p);
      tutRichEl.hidden = false;
      return;
    }

    if (tab.id === 'keywords' && Array.isArray(tab.glossary) && tab.glossary.length) {
      const dl = el('dl', 'cf-academy-tut-glossary');
      for (const item of tab.glossary) {
        const row = el('div', 'cf-academy-tut-glossary__item');
        const dt = el('dt', 'cf-academy-tut-glossary__term');
        dt.append(el('code', null, item.term));
        const dd = el('dd', 'cf-academy-tut-glossary__role', item.role);
        if (item.example_inline) {
          const exLine = el('code', 'cf-academy-tut-glossary__inline', item.example_inline);
          dd.append(document.createTextNode(' '), exLine);
        }
        row.append(dt, dd);
        dl.append(row);
      }
      tutRichEl.append(dl);
      tutRichEl.hidden = false;
      return;
    }

    if (tab.id === 'style' && tab.mechanics) {
      const list = el('ul', 'cf-academy-tut-mechanics');
      const entries = [
        ['acadMechIndent', tab.mechanics.indentation],
        ['acadMechBreaks', tab.mechanics.line_breaks],
        ['acadMechPunct', tab.mechanics.punctuation],
        ['acadMechDoc', tab.mechanics.documentation_standard],
      ];
      for (const [labelKey, val] of entries) {
        if (!val) continue;
        const li = el('li', 'cf-academy-tut-mechanics__item');
        li.append(el('strong', null, `${t(labelKey)}: `), document.createTextNode(val));
        list.append(li);
      }
      tutRichEl.append(list);
      tutRichEl.hidden = false;
      return;
    }

    if (tab.id === 'example' && tab.example) {
      const wrap = el('div', 'cf-academy-tut-example');
      const pre = el('pre', 'cf-academy-tut-code');
      pre.append(el('code', null, tab.example.code));
      wrap.append(pre);
      tutRichEl.append(wrap);
      tutRichEl.hidden = false;
      return;
    }

    tutRichEl.hidden = true;
  }

  function clearIdleNudge() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (idleNudgeEl) idleNudgeEl.hidden = true;
  }

  function scheduleIdleNudge() {
    clearIdleNudge();
    if (currentMode !== 'learn' || academyView !== 'editor' || assistEnabled || !activeLevel) return;
    idleTimer = setTimeout(() => {
      if (currentMode === 'learn' && academyView === 'editor' && !assistEnabled && idleNudgeEl) {
        idleNudgeEl.hidden = false;
      }
    }, Math.max(50, Number(idleNudgeMs) || IDLE_NUDGE_MS));
  }

  function renderTutorialStep() {
    if (!tutorialEl) return;
    const total = tutorialSteps.length;
    if (!total) {
      tutorialEl.hidden = true;
      return;
    }
    tutorialEl.hidden = false;
    if (assistToggleBtn) {
      assistToggleBtn.setAttribute('aria-pressed', String(assistEnabled));
      assistToggleBtn.textContent = t(assistEnabled ? 'acadAssistOn' : 'acadAssistOff');
    }
    if (tutorialBodyEl) tutorialBodyEl.hidden = !assistEnabled;
    const safeIdx = Math.max(0, Math.min(total - 1, tutorialIndex));
    tutorialIndex = safeIdx;
    if (tutStepBadgeEl) tutStepBadgeEl.textContent = `${safeIdx + 1} / ${total}`;
    if (tutTextEl) tutTextEl.textContent = tutorialSteps[safeIdx] || '';
    if (tutTabsEl && typeof tutTabsEl.querySelectorAll === 'function') {
      tutTabsEl.querySelectorAll('[data-tut-tab]').forEach((btn) => {
        const idx = Number(btn.dataset.tutTab);
        const on = idx === safeIdx;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', String(on));
      });
    }
    renderTutorialRich(tutorialTabs[safeIdx] || null);
    if (tutPrevBtn) tutPrevBtn.disabled = safeIdx <= 0;
    if (tutNextBtn) tutNextBtn.disabled = safeIdx >= total - 1;
  }

  function setAssistEnabled(next, { announce = true } = {}) {
    assistEnabled = Boolean(next);
    try { localStorage.setItem(ASSIST_PREF_KEY, assistEnabled ? '1' : '0'); } catch { /* opcional */ }
    if (assistEnabled) {
      clearIdleNudge();
    } else {
      scheduleIdleNudge();
    }
    renderTutorialStep();
    if (announce && assistStatusEl) {
      assistStatusEl.textContent = t(assistEnabled ? 'acadAssistAnnounceOn' : 'acadAssistAnnounceOff');
    }
  }

  function refreshTutorialForLevel(lvl, standard) {
    tutorialTabs = buildTutorialTabs(lvl, standard, t);
    tutorialSteps = tutorialTabs.map((tab) => tab.summary);
    tutorialIndex = 0;
    renderTutorialStep();
  }

  const PANE_BY_VIEW = { tree: 'mission', editor: 'editor', results: 'results' };
  const nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));

  function setFormatterActionsHidden(hidden) {
    const actionsEl = editorCard?.querySelector?.('.cf-actions')
      || (Array.isArray(editorCard?.children) ? editorCard.children.find((c) => String(c?.className || '').includes('cf-actions')) : null);
    if (actionsEl) actionsEl.hidden = Boolean(hidden);
  }

  function mountEditorInAcademy() {
    setFormatterActionsHidden(true);
    if (editorCard && academyEditorSlot && editorCard.parentElement !== academyEditorSlot) {
      academyEditorSlot.append(editorCard);
    }
  }

  function restoreDiffPanelHome() {
    if (typeof closeDiffPanel === 'function') closeDiffPanel();
    if (diffSlot) diffSlot.hidden = true;
    const diffPanel = document.getElementById('cf-diff-panel');
    if (diffPanel) {
      diffPanel.hidden = true;
      if (editorHome && diffPanel.parentElement !== editorHome) {
        editorHome.insertBefore(diffPanel, editorCard ? editorCard.nextSibling : null);
      }
    }
  }

  function syncOwnCodeControls() {
    if (ownBarEl) ownBarEl.hidden = !isOwnCodeActive;
    if (editorHintBtn) editorHintBtn.hidden = isOwnCodeActive;
    if (diffBtn) diffBtn.hidden = isOwnCodeActive;
    if (validateBtn) validateBtn.hidden = isOwnCodeActive;
  }

  function exitOwnCodeMode() {
    isOwnCodeActive = false;
    ownCodeBefore = null;
    syncOwnCodeControls();
    if (typeof closeDiffPanel === 'function') closeDiffPanel();
    const diffPanel = document.getElementById('cf-diff-panel');
    if (diffPanel) diffPanel.hidden = true;
  }

  function backLabelKey() {
    if (academyView === 'results') return 'acadBackToEditor';
    if (academyView === 'editor') return 'acadBackToMission';
    return currentCurriculum?.isDaily ? 'acadBackToPaths' : 'acadBackPaths';
  }

  function updateStepper() {
    document.querySelectorAll('.cf-academy-mobile-tab').forEach((btn) => {
      const step = btn.dataset.acadPane;
      const active = PANE_BY_VIEW[academyView] === step;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
      if (active) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      btn.disabled = (step === 'results' && !resultsReady) || (step !== 'mission' && !activeLevel);
    });
  }

  /** Única vía para cambiar de paso: solo la vista activa queda visible en el DOM. */
  function setAcademyView(next, { scroll = true, focus = true } = {}) {
    let view = ACADEMY_VIEWS.includes(next) ? next : 'paths';
    if (view !== 'paths' && !activeLevel) view = 'paths';
    academyView = view;
    const isPaths = view === 'paths';

    if (headCard) headCard.hidden = !isPaths;
    pathsContainer.hidden = !isPaths;
    workspace.hidden = isPaths;
    document.querySelectorAll('[data-acad-pane-body]').forEach((pane) => {
      const on = pane.dataset.acadPaneBody === PANE_BY_VIEW[view];
      pane.hidden = !on;
      pane.classList.toggle('is-active', on);
    });
    if (backBtn) {
      backBtn.hidden = isPaths;
      if (!isPaths) backBtn.textContent = t(backLabelKey());
    }
    updateStepper();

    syncUrlParams(isPaths
      ? { mode: 'learn' }
      : { mode: 'learn', path: currentPath, topic: currentTopic, level: currentLevelNum, daily: Boolean(currentCurriculum?.isDaily), step: view });

    if (view === 'editor') {
      mountEditorInAcademy();
      syncOwnCodeControls();
      renderTutorialStep();
      scheduleIdleNudge();
      // CM6 mide gutters y líneas al ser visible: se recalcula tras el primer frame.
      nextFrame(() => {
        const ev = typeof getEditorView === 'function' ? getEditorView() : null;
        if (ev && typeof ev.requestMeasure === 'function') ev.requestMeasure();
        if (focus && ev && typeof ev.focus === 'function') ev.focus();
      });
    } else {
      clearIdleNudge();
      if (typeof closeDiffPanel === 'function') closeDiffPanel();
      if (diffSlot) diffSlot.hidden = true;
      if (view === 'paths' && isOwnCodeActive) exitOwnCodeMode();
    }
    if (!isPaths && scroll && typeof workspace.scrollIntoView === 'function') {
      const reduce = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      workspace.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
    if (focus) {
      if (view === 'tree') document.getElementById('cf-academy-go-editor')?.focus?.();
      if (view === 'results') primaryFocus?.focus?.();
    }
  }

  document.querySelectorAll('.cf-academy-mobile-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const step = btn.dataset.acadPane;
      setAcademyView(step === 'mission' ? 'tree' : step);
    });
  });

  function openProOrExplain() {
    if (isFeatureOn('pro_billing')) {
      const dialog = document.getElementById('cf-pro-modal');
      if (dialog && !dialog.open) {
        dialog.showModal();
        return;
      }
    }
    if (liveEl) liveEl.textContent = t('acadProPreviewMsg');
    toast(t('acadProPreviewMsg'));
  }

  /**
   * Gate de usuario: sin cuentas habilitadas permite invitado; con cuentas exige sesión válida y,
   * si falta, guarda la acción pendiente y abre #cf-auth-modal con el banner explicativo.
   */
  async function requireAcademyAuth(pendingAction, bannerKey = 'acadAuthGateBanner') {
    if (!isFeatureOn('accounts_auth')) return true;
    let mod;
    try {
      mod = await import('./auth-modal.js');
    } catch {
      return true;
    }
    const res = await mod.ensureAuthenticated({ mode: 'register', bannerText: t(bannerKey), pendingAction });
    if (!res.authenticated) return false;
    const isPro = Boolean(res.user?.pro_active || res.user?.plan === 'pro');
    academyState = saveAcademyState({ ...readLocalState(), isPro });
    if (currentCurriculum) renderSkillTree(currentCurriculum);
    return true;
  }

  async function gatedOpenTopic(tech, level, pathId) {
    const ok = await requireAcademyAuth({ action: 'open_topic', tech, level, pathId });
    if (!ok) return;
    await openTopic(tech, level, pathId);
  }

  function renderPathsView(pathsData) {
    pathsContainer.replaceChildren();
    exitOwnCodeMode();

    const loc = getUiLang();
    const hIntent = el('h3', 'cf-academy-section-title', t('acadQuickIntentsTitle'));
    const intentGrid = el('div', 'cf-academy-intents-grid');
    intentGrid.id = 'cf-academy-quick-intents';
    for (const intent of QUICK_INTENTS) {
      const btn = el('button', 'cf-academy-intent-card');
      btn.type = 'button';
      btn.id = `cf-academy-${intent.id}`;
      btn.append(
        el('span', 'cf-academy-intent-card__title', t(intent.titleKey)),
        el('span', 'cf-academy-intent-card__desc', t(intent.descKey)),
      );
      btn.addEventListener('click', () => {
        if (intent.kind === 'own_code') {
          openOwnCodePractice();
        } else {
          gatedOpenTopic(intent.tech, null, intent.pathId || '');
        }
      });
      intentGrid.append(btn);
    }

    const hPaths = el('h3', 'cf-academy-section-title', t('acadByPath'));
    const grid = el('div', 'cf-academy-paths-grid');

    for (const p of pathsData.paths || []) {
      const copy = p.i18n?.[loc] || p.i18n?.es || {};
      const card = el('article', 'cf-academy-path-card');

      const head = el('div', 'cf-academy-path-card__head');
      head.append(el('span', 'cf-badge', p.badge), el('span', 'cf-muted', t('acadHours', { h: p.estimatedHours })));
      card.append(head);
      card.append(el('h4', 'cf-academy-path-card__title', copy.title));
      card.append(el('p', 'cf-muted', copy.tagline));

      const useWrap = el('p', 'cf-academy-path-card__meta');
      useWrap.append(el('span', 'cf-academy-path-card__label', `${t('acadIndustryUse')}: `), document.createTextNode(copy.industryUse || ''));
      card.append(useWrap);

      const probWrap = el('p', 'cf-academy-path-card__meta');
      probWrap.append(el('span', 'cf-academy-path-card__label', `${t('acadProblemsSolved')}: `), document.createTextNode(copy.problemsSolved || ''));
      card.append(probWrap);

      const rolesWrap = el('p', 'cf-academy-path-card__meta');
      rolesWrap.append(el('span', 'cf-academy-path-card__label', `${t('acadTargetRoles')}: `), document.createTextNode((copy.targetRoles || []).join(' · ')));
      card.append(rolesWrap);

      const pills = el('div', 'cf-academy-tech-pills');
      for (const tech of p.technologies || []) {
        pills.append(el('span', 'cf-lang-badge', tech.toUpperCase()));
      }
      card.append(pills);

      const startBtn = el('button', 'cf-btn cf-btn--primary', t('acadStartPath'));
      startBtn.type = 'button';
      startBtn.addEventListener('click', () => {
        const st = readLocalState();
        const completed = new Set(st.completed || []);
        const targetTech = (p.technologies || []).find((tech) => {
          const doneCount = countCompletedForTech([...completed], tech);
          return doneCount < 5;
        }) || p.technologies[0];
        gatedOpenTopic(targetTech, null, p.id);
      });
      card.append(startBtn);

      grid.append(card);
    }

    const hTech = el('h3', 'cf-academy-section-title', t('acadByTech'));
    const techPills = el('div', 'cf-academy-tech-pills');
    for (const tech of TECHS) {
      const btn = el('button', 'cf-academy-tech-btn', tech.toUpperCase());
      btn.type = 'button';
      btn.addEventListener('click', () => { gatedOpenTopic(tech, null, ''); });
      techPills.append(btn);
    }

    pathsContainer.append(hIntent, intentGrid, hPaths, grid, hTech, techPills);
    injectAcademyJsonLd(pathsData, loc);
    setAcademyView('paths', { scroll: false });
  }

  function renderPathTechSwitcher() {
    if (!pathTechsEl) return;
    pathTechsEl.replaceChildren();
    const pathObj = currentPath && pathsCache?.paths?.find((p) => p.id === currentPath);
    if (!pathObj || !Array.isArray(pathObj.technologies) || pathObj.technologies.length <= 1 || currentCurriculum?.isDaily) {
      pathTechsEl.hidden = true;
      return;
    }
    pathTechsEl.setAttribute('role', 'group');
    pathTechsEl.setAttribute('aria-label', t('acadPathTechSwitchAria'));
    for (const tech of pathObj.technologies) {
      const btn = el('button', `cf-academy-tech-btn cf-academy-tech-btn--compact${tech === currentTopic ? ' is-active' : ''}`, tech.toUpperCase());
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(tech === currentTopic));
      btn.addEventListener('click', () => {
        if (tech !== currentTopic) openTopic(tech, null, currentPath, 'tree');
      });
      pathTechsEl.append(btn);
    }
    pathTechsEl.hidden = false;
  }

  function resolveNodeState(lvl, idx, levels, state) {
    const completedSet = new Set(state.completed || []);
    const remedialSet = new Set(state.remedial || []);
    if (completedSet.has(lvl.id)) return 'completed';
    if (!isLevelUnlocked(lvl, idx, levels, state)) return 'locked';
    if (remedialSet.has(lvl.id)) return 'remedial';
    return 'active';
  }

  function renderSkillTree(curriculum) {
    skillTreeEl.replaceChildren();
    skillTreeEl.append(el('h3', 'cf-academy-pane__title', `${t('acadSkillTreeTitle')} · ${curriculum.tech.toUpperCase()}`));
    const list = el('div', 'cf-skill-tree');
    list.setAttribute('role', 'list');
    const state = readLocalState();
    let firstActiveFound = false;

    (curriculum.levels || []).forEach((lvl, idx) => {
      const nodeState = resolveNodeState(lvl, idx, curriculum.levels, state);
      const isSelected = activeLevel && activeLevel.id === lvl.id;
      const isFirstPending = !firstActiveFound && (nodeState === 'active' || nodeState === 'remedial');
      if (isFirstPending) firstActiveFound = true;
      const itemWrap = el('div', 'cf-skill-tree__item');
      itemWrap.setAttribute('role', 'listitem');
      const node = el('div', `cf-skill-node cf-skill-node--${nodeState}${isSelected ? ' is-selected' : ''}${isFirstPending ? ' cf-skill-node--pulse' : ''}`);
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `${lvl.title} (${lvl.tier === 'pay' && !state.isPro ? 'Pro' : t(`acadState${nodeState.charAt(0).toUpperCase() + nodeState.slice(1)}`)})`);

      const left = el('span', null, lvl.title);
      const stateLabel =
        lvl.tier === 'pay' && !state.isPro
          ? 'PRO'
          : nodeState === 'completed'
            ? `✓ ${t('acadStateCompleted')}`
            : nodeState === 'remedial'
              ? `! ${t('acadStateRemedial')}`
              : nodeState === 'locked'
                ? `🔒 ${t('acadStateLocked')}`
                : t('acadStateActive');
      const right = el('span', 'cf-skill-node__state', stateLabel);
      node.append(left, right);

      const activate = () => {
        const latestState = readLocalState();
        const completedSet = new Set(latestState.completed || []);
        const prevLvl = idx > 0 ? curriculum.levels[idx - 1] : null;
        const prevCompleted = !prevLvl || completedSet.has(prevLvl.id);
        if (!prevCompleted) {
          const prevTitle = prevLvl?.title || t('acadLevelFallback', { n: idx });
          toast(t('acadLockedPrevMsg', { prev: prevTitle }));
          const activeIdx = curriculum.levels.findIndex((l, i) => resolveNodeState(l, i, curriculum.levels, latestState) === 'active');
          if (activeIdx >= 0) selectLevel(curriculum, curriculum.levels[activeIdx].level, { view: 'tree' });
          return;
        }
        if (lvl.tier === 'pay' && !latestState.isPro) {
          openProOrExplain();
          return;
        }
        selectLevel(curriculum, lvl.level, { view: 'editor' });
      };
      node.addEventListener('click', activate);
      node.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate();
        }
      });
      itemWrap.append(node);
      list.append(itemWrap);
    });
    skillTreeEl.append(list);
  }

  function syncHintControls(lvl) {
    const missionHintBtn = document.getElementById('cf-academy-hint-btn');
    const missionHintBox = document.getElementById('cf-academy-hint-box');
    const nextStep = Math.min(2, hintStep + 1);
    const done = hintStep >= 2;

    let text = '';
    if (hintStep === 1) {
      const rulesText = (lvl?.style_rules || []).join(', ') || lvl?.concept_capsule || activeDrill?.solution_hint || '';
      text = t('acadHintConcept', { text: rulesText });
    } else if (hintStep >= 2) {
      const firstTest = (lvl?.tests || [])[0];
      const syntax = activeDrill?.expected_pattern
        || (firstTest?.expected ? String(firstTest.expected) : String(lvl?.reference_solution || '').split('\n')[0]);
      text = t('acadHintSyntax', { text: syntax });
    }

    if (missionHintBtn) {
      missionHintBtn.textContent = t('acadHintBtn', { step: nextStep });
      missionHintBtn.disabled = done;
    }
    if (missionHintBox) {
      missionHintBox.textContent = text;
      missionHintBox.hidden = hintStep === 0;
    }
    if (editorHintBtn) {
      editorHintBtn.textContent = `💡 ${t('acadHintBtn', { step: nextStep })}`;
      editorHintBtn.disabled = done;
    }
    if (editorHintBox) {
      editorHintBox.textContent = text;
      editorHintBox.hidden = hintStep === 0;
    }
  }

  function revealNextHint() {
    if (!activeLevel || hintStep >= 2) return;
    hintStep = Math.min(2, hintStep + 1);
    syncHintControls(activeLevel);
  }

  function updateMiniBrief(title, body) {
    if (miniBriefEl && miniBriefTitleEl && miniBriefBodyEl) {
      miniBriefTitleEl.textContent = `${t('acadStickyBriefLabel')}: ${title}`;
      miniBriefBodyEl.textContent = String(body || '').slice(0, 180);
      miniBriefEl.hidden = false;
      const isNarrow = typeof window !== 'undefined' && Number(window.innerWidth || 0) > 0 && Number(window.innerWidth) <= 640;
      if (isNarrow) {
        miniBriefEl.open = false;
        miniBriefEl.removeAttribute?.('open');
      } else {
        miniBriefEl.open = true;
        miniBriefEl.setAttribute?.('open', '');
      }
    }
  }

  function renderMission(lvl, standard) {
    missionEl.replaceChildren();
    checklistEl.replaceChildren();
    hintStep = 0;

    if (progressBarEl) {
      const total = currentCurriculum?.levels?.length || 1;
      progressBarEl.textContent = t('acadProgressBar', {
        path: currentPath ? currentPath.toUpperCase() : standard,
        tech: (currentCurriculum?.tech || currentTopic || 'python').toUpperCase(),
        level: lvl.level || 1,
        total,
      });
    }
    renderPathTechSwitcher();
    updateMiniBrief(lvl.title, lvl.concept_capsule || '');
    refreshTutorialForLevel(lvl, standard);

    missionEl.append(el('h3', 'cf-academy-pane__title', t('acadMissionTitle')));
    missionEl.append(el('p', 'cf-muted', `${standard} · ${lvl.title}`));

    const cap = el('div', 'cf-academy-capsule');
    cap.append(el('strong', null, `${t('acadCapsuleTitle')}: `), document.createTextNode(lvl.concept_capsule || ''));
    missionEl.append(cap);

    const navBar = el('div', 'cf-tip-modal__actions');
    const goEditorBtn = el('button', 'cf-btn cf-btn--primary', t('acadStartChallengeBtn'));
    goEditorBtn.type = 'button';
    goEditorBtn.id = 'cf-academy-go-editor';
    goEditorBtn.addEventListener('click', () => setAcademyView('editor'));

    const hintBtn = el('button', 'cf-btn cf-btn--small', t('acadHintBtn', { step: 1 }));
    hintBtn.type = 'button';
    hintBtn.id = 'cf-academy-hint-btn';
    const hintBox = el('p', 'cf-muted');
    hintBox.id = 'cf-academy-hint-box';
    hintBox.hidden = true;
    hintBtn.addEventListener('click', () => revealNextHint());
    navBar.append(goEditorBtn, hintBtn);
    missionEl.append(navBar, hintBox);
    syncHintControls(lvl);

    renderChecklist(lvl);
  }

  /** Checklist de pruebas; con `evaluation` marca cada prueba como aprobada/fallida. */
  function renderChecklist(lvl, evaluation = null) {
    checklistEl.replaceChildren();
    checklistEl.append(el('h4', 'cf-academy-pane__title', t('acadChecklistTitle')));
    const byId = new Map((evaluation?.results || []).map((r) => [r.id, r.ok]));
    const ul = el('ul', 'cf-academy-checklist-list');
    for (const test of lvl.tests || []) {
      const label = test.visible ? `${test.name}: ${test.description}` : t('acadHiddenEdgeCase', { name: test.name });
      let mark = '';
      let cls = 'cf-academy-check-item';
      if (byId.has(test.id)) {
        const ok = byId.get(test.id);
        mark = ok ? '✓ ' : '✗ ';
        cls += ok ? ' cf-academy-check-item--ok' : ' cf-academy-check-item--fail';
      }
      ul.append(el('li', cls, `${mark}${label}`));
    }
    checklistEl.append(ul);
  }

  async function resolveProLoader() {
    if (typeof loadProLevel === 'function') return loadProLevel;
    if (!isFeatureOn('academy_pro')) return null;
    try {
      const mod = await import('./academy-pro.js');
      return typeof mod.fetchProLevel === 'function' ? mod.fetchProLevel : null;
    } catch {
      return null;
    }
  }

  function applyResolvedLevel(curriculum, lvl, { view = 'tree' } = {}) {
    const levels = curriculum?.levels || [];
    exitOwnCodeMode();
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    mainCodeSnapshot = null;
    resultsReady = false;
    primaryFocus = null;
    lastEvaluation = null;
    preloadedNextLevel = levels.find((l) => l.level === (lvl.level + 1)) || null;
    activeLevel = lvl;
    currentLevelNum = lvl.level;
    renderSkillTree(curriculum);
    renderMission(lvl, curriculum.standard);
    captureFormatterBuffer();
    if (setLanguage) setLanguage(curriculum.tech);
    if (setCode && lvl.starter_code) setCode(lvl.starter_code);
    if (liveEl) liveEl.textContent = t('acadConsoleEmpty');
    setAcademyView(view);
  }

  async function hydrateAndApplyProLevel(curriculum, resolvedIdx, { view = 'tree' } = {}) {
    const stub = curriculum.levels[resolvedIdx];
    const loader = await resolveProLoader();
    if (!loader) {
      openProOrExplain();
      return false;
    }
    showAcademyLoader(workspace);
    try {
      const proPayload = await loader(curriculum.tech, stub.level, getUiLang());
      if (!proPayload || typeof proPayload !== 'object') {
        toast(t('acadLoadError'));
        return false;
      }
      const merged = { ...stub, ...proPayload, tier: 'pay', level: stub.level };
      curriculum.levels[resolvedIdx] = merged;
      applyResolvedLevel(curriculum, merged, { view });
      return true;
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        academyState = saveAcademyState({ ...readLocalState(), isPro: false });
        renderSkillTree(curriculum);
        openProOrExplain();
      } else {
        toast(t('acadLoadError'));
      }
      return false;
    } finally {
      hideAcademyLoader(workspace);
    }
  }

  function selectLevel(curriculum, levelNum, { view = 'tree' } = {}) {
    const levels = curriculum?.levels || [];
    const idx = levels.findIndex((l) => l.level === levelNum);
    const resolvedIdx = idx >= 0 ? idx : 0;
    const lvl = levels[resolvedIdx];
    const state = readLocalState();
    if (!lvl) return false;
    if (lvl.tier === 'pay' && !state.isPro) {
      openProOrExplain();
      return false;
    }
    if (!isLevelUnlocked(lvl, resolvedIdx, levels, state)) {
      const prevTitle = levels[resolvedIdx - 1]?.title || t('acadLevelFallback', { n: resolvedIdx });
      toast(t('acadLockedPrevMsg', { prev: prevTitle }));
      if (!activeLevel) {
        const fallback = findFirstPendingLevel(levels, state);
        if (fallback && fallback.level !== lvl.level) {
          return selectLevel(curriculum, fallback.level, { view: 'tree' });
        }
      }
      return false;
    }
    if (lvl.tier === 'pay' && (!lvl.starter_code || !Array.isArray(lvl.tests) || lvl.tests.length === 0)) {
      hydrateAndApplyProLevel(curriculum, resolvedIdx, { view });
      return true;
    }
    applyResolvedLevel(curriculum, lvl, { view });
    return true;
  }

  async function openTopic(tech, levelNum = null, pathId = '', view = 'tree') {
    showAcademyLoader(workspace);
    try {
      const loc = getUiLang();
      const curriculum = await fetchJson(`curriculum/${loc}/${tech}.json`);
      currentMode = 'learn';
      currentPath = pathId;
      currentTopic = tech;
      currentCurriculum = curriculum;
      mountEditorInAcademy();
      const targetLevel = (levelNum !== null && levelNum !== undefined && Number(levelNum) > 0)
        ? Number(levelNum)
        : (findFirstPendingLevel(curriculum.levels, readLocalState())?.level || 1);
      selectLevel(curriculum, targetLevel, { view });
    } catch {
      if (liveEl) liveEl.textContent = t('acadLoadError');
      toast(t('acadLoadError'));
    } finally {
      hideAcademyLoader(workspace);
    }
  }

  async function loadDailyChallengesData() {
    try {
      return await fetchJson('daily-challenges.json');
    } catch {
      try {
        const res = await fetch('/content/code-formatter-academy/daily-challenges.json', { cache: 'no-cache' });
        if (res.ok) return await res.json();
      } catch { /* usa respaldo embebido */ }
      return { challenges: [BUILTIN_FALLBACK_DAILY_CHALLENGE] };
    }
  }

  function buildDailyCurriculum(ch) {
    const { copy } = ch;
    return {
      tech: ch.tech,
      isDaily: true,
      standard: t('acadDailyBadge'),
      levels: [
        {
          id: ch.id,
          level: 1,
          tier: 'free',
          title: copy.title,
          concept_capsule: `${copy.prompt} (${copy.hint})`,
          starter_code: ch.starter_code,
          reference_solution: ch.reference_solution,
          tests: ch.tests,
          style_rules: ch.style_rules,
        },
      ],
    };
  }

  async function openDailyChallenge(view = 'editor') {
    dailyCache ||= await loadDailyChallengesData();
    const ch = resolveDailyChallenge(dailyCache, getUiLang());
    currentMode = 'learn';
    currentPath = '';
    currentTopic = ch.tech;
    currentLevelNum = 1;
    if (toolbar) toolbar.hidden = true;
    if (editorHome) editorHome.hidden = true;
    shell.hidden = false;
    btnFormat.classList.remove('is-active');
    btnFormat.setAttribute('aria-selected', 'false');
    btnAcademy.classList.add('is-active');
    btnAcademy.setAttribute('aria-selected', 'true');
    mountEditorInAcademy();
    const pseudoCurriculum = buildDailyCurriculum(ch);
    currentCurriculum = pseudoCurriculum;
    activeLevel = pseudoCurriculum.levels[0];
    preloadedNextLevel = null;
    exitOwnCodeMode();
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    resultsReady = false;
    primaryFocus = null;
    lastEvaluation = null;
    renderSkillTree(pseudoCurriculum);
    renderMission(activeLevel, pseudoCurriculum.standard);
    captureFormatterBuffer();
    if (setLanguage) setLanguage(ch.tech);
    if (setCode) setCode(ch.starter_code);
    if (liveEl) liveEl.textContent = t('acadConsoleEmpty');
    setAcademyView(view);
  }

  async function handleDailyChallengeClick() {
    if (dailyBtn) {
      dailyBtn.disabled = true;
      dailyBtn.setAttribute('aria-busy', 'true');
    }
    try {
      const ok = await requireAcademyAuth({ action: 'daily_challenge' }, 'acadDailyAuthGate');
      if (!ok) return;
      await openDailyChallenge();
    } catch {
      toast(t('acadLoadError'));
    } finally {
      if (dailyBtn) {
        dailyBtn.disabled = false;
        dailyBtn.removeAttribute('aria-busy');
      }
    }
  }

  /** Parámetros guardados en sessionStorage: se validan antes de usarlos. */
  function sanitizePendingParams(p) {
    if (!p || typeof p !== 'object') return null;
    const level = Math.floor(Number(p.level));
    return {
      mode: 'learn',
      path: typeof p.path === 'string' ? p.path.slice(0, 60) : '',
      topic: TECHS.includes(p.topic) ? p.topic : '',
      level: level > 0 && level < 100 ? level : 1,
      daily: p.daily === true,
      step: ACADEMY_VIEWS.includes(p.step) ? p.step : '',
      challenge: '',
      openPlans: false,
    };
  }

  const PENDING_ACTIONS = ['daily_challenge', 'open_topic', 'open_academy'];

  async function resumePendingAction() {
    try {
      const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || !PENDING_ACTIONS.includes(pending.action)) return;
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      if (typeof pending.ts !== 'number' || (Date.now() - pending.ts) >= PENDING_ACTION_TTL_MS) return;

      if (pending.action === 'open_academy') {
        await setWorkMode('learn', { skipGate: true, params: sanitizePendingParams(pending.params) });
        return;
      }
      if (currentMode !== 'learn') {
        await setWorkMode('learn', { skipGate: true, params: sanitizePendingParams({}) });
      }
      if (pending.action === 'daily_challenge') {
        await openDailyChallenge('editor');
      } else if (TECHS.includes(pending.tech)) {
        const rawLevel = pending.level !== null && pending.level !== undefined ? Math.floor(Number(pending.level)) : null;
        const level = rawLevel && rawLevel > 0 && rawLevel < 100 ? rawLevel : null;
        await openTopic(pending.tech, level, typeof pending.pathId === 'string' ? pending.pathId.slice(0, 60) : '', 'tree');
      }
    } catch { /* ignorar */ }
  }

  async function setWorkMode(mode, { skipGate = false, params: paramsOverride = null } = {}) {
    if (mode === 'learn' && !skipGate) {
      const ok = await requireAcademyAuth({ action: 'open_academy', params: paramsOverride || getAcademyParams() });
      if (!ok) return;
    }
    currentMode = mode === 'learn' ? 'learn' : 'format';
    const isLearn = currentMode === 'learn';
    btnFormat.classList.toggle('is-active', !isLearn);
    btnFormat.setAttribute('aria-selected', String(!isLearn));
    btnAcademy.classList.toggle('is-active', isLearn);
    btnAcademy.setAttribute('aria-selected', String(isLearn));

    if (toolbar) toolbar.hidden = isLearn;
    if (editorHome) editorHome.hidden = isLearn;
    shell.hidden = !isLearn;

    if (!isLearn) {
      clearIdleNudge();
      exitOwnCodeMode();
      setFormatterActionsHidden(false);
      if (editorCard && editorHome && editorCard.parentElement !== editorHome) {
        editorHome.prepend(editorCard);
      }
      restoreDiffPanelHome();
      restoreFormatterBuffer();
      syncUrlParams({ mode: 'format' });
      return;
    }

    const params = paramsOverride || getAcademyParams();
    // 'results' no se puede restaurar tras recargar (no hay evaluación en memoria): se entra por el editor.
    const startView = params.step === 'editor' || params.step === 'results' ? 'editor' : 'tree';
    try {
      pathsCache ||= await fetchJson('paths.json');
      if (params.step === 'paths') {
        renderPathsView(pathsCache);
      } else if (params.daily) {
        await openDailyChallenge(params.step === 'tree' ? 'tree' : 'editor');
      } else if (params.topic && TECHS.includes(params.topic)) {
        await openTopic(params.topic, params.level || null, params.path || '', startView);
      } else {
        renderPathsView(pathsCache);
      }
    } catch {
      toast(t('acadLoadError'));
    }
  }

  function buildOwnCodeCurriculum(tech) {
    const cleanTech = TECHS.includes(tech) ? tech : 'sql';
    const rules = OWN_CODE_STYLE_RULES[cleanTech] || [];
    return {
      tech: cleanTech,
      isOwnCode: true,
      standard: `${cleanTech.toUpperCase()} · ${t('acadOwnCodeBadge')}`,
      levels: [{
        id: `own-${cleanTech}`,
        level: 1,
        tier: 'free',
        title: t('acadOwnBarTitle'),
        concept_capsule: t('acadOwnBarHint'),
        style_rules: rules,
        tests: [],
      }],
    };
  }

  function openOwnCodePractice(tech = '') {
    const chosen = TECHS.includes(tech) ? tech : (ownLangSel?.value && TECHS.includes(ownLangSel.value) ? ownLangSel.value : 'sql');
    currentMode = 'learn';
    currentPath = '';
    currentTopic = chosen;
    currentLevelNum = 1;
    if (toolbar) toolbar.hidden = true;
    if (editorHome) editorHome.hidden = true;
    shell.hidden = false;
    btnFormat.classList.remove('is-active');
    btnFormat.setAttribute('aria-selected', 'false');
    btnAcademy.classList.add('is-active');
    btnAcademy.setAttribute('aria-selected', 'true');
    mountEditorInAcademy();
    isOwnCodeActive = true;
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    resultsReady = false;
    primaryFocus = null;
    lastEvaluation = null;
    if (ownLangSel) ownLangSel.value = chosen;
    const pseudo = buildOwnCodeCurriculum(chosen);
    currentCurriculum = pseudo;
    activeLevel = pseudo.levels[0];
    preloadedNextLevel = null;
    renderSkillTree(pseudo);
    renderMission(activeLevel, pseudo.standard);
    if (setLanguage) setLanguage(chosen);
    const existing = getCode ? getCode() : '';
    ownCodeBefore = existing.trim() ? existing : null;
    if (liveEl) liveEl.textContent = t('acadOwnBarHint');
    syncOwnCodeControls();
    setAcademyView('editor');
  }

  function handleOwnCodeSnapshot() {
    const current = getCode ? getCode() : '';
    if (!current.trim()) {
      toast(t('acadOwnEmptyWarn'));
      return;
    }
    ownCodeBefore = current;
    toast(t('acadOwnSnapshotSaved'));
  }

  async function handleOwnCodeCompare() {
    if (!isOwnCodeActive) return;
    const tech = ownLangSel?.value && TECHS.includes(ownLangSel.value) ? ownLangSel.value : (currentTopic || 'sql');
    const current = getCode ? getCode() : '';
    if (!current.trim()) {
      toast(t('acadOwnEmptyWarn'));
      return;
    }
    const before = ownCodeBefore !== null ? ownCodeBefore : current;
    if (ownCodeBefore === null) ownCodeBefore = before;
    if (ownCompareBtn) {
      ownCompareBtn.disabled = true;
      ownCompareBtn.setAttribute('aria-busy', 'true');
    }
    try {
      let after = current;
      if (typeof formatOwnCode === 'function') {
        const res = await formatOwnCode(current, tech);
        if (res && typeof res.code === 'string') after = res.code;
      }
      if (setCode) setCode(after);
      const rules = OWN_CODE_STYLE_RULES[tech] || [];
      const styleRes = evaluateStyleRules(tech, after, rules, t);
      if (liveEl) {
        liveEl.textContent = styleRes.ok
          ? t('acadOwnCompareOk')
          : `${t('acadOwnCompareTips')}: ${styleRes.violations.join(' · ')}`;
      }
      const diffPanel = document.getElementById('cf-diff-panel');
      if (diffSlot) diffSlot.hidden = false;
      if (diffPanel) {
        if (diffSlot && diffPanel.parentElement !== diffSlot) diffSlot.append(diffPanel);
        diffPanel.hidden = false;
      }
      if (typeof openDiffWith === 'function') {
        openDiffWith({ original: before, result: after, lang: tech });
      }
      nextFrame(() => {
        const ev = typeof getEditorView === 'function' ? getEditorView() : null;
        if (ev && typeof ev.requestMeasure === 'function') ev.requestMeasure();
      });
      toast(styleRes.ok ? t('acadOwnCompareOk') : t('acadOwnCompareReady'));
    } catch {
      toast(t('acadOwnFormatError'));
    } finally {
      if (ownCompareBtn) {
        ownCompareBtn.disabled = false;
        ownCompareBtn.removeAttribute('aria-busy');
      }
    }
  }

  btnFormat.addEventListener('click', () => setWorkMode('format'));
  btnAcademy.addEventListener('click', () => setWorkMode('learn'));
  editorHintBtn?.addEventListener('click', () => { clearIdleNudge(); revealNextHint(); });
  assistToggleBtn?.addEventListener('click', () => setAssistEnabled(!assistEnabled));
  tutPrevBtn?.addEventListener('click', () => { tutorialIndex = Math.max(0, tutorialIndex - 1); renderTutorialStep(); });
  tutNextBtn?.addEventListener('click', () => { tutorialIndex = Math.min(tutorialSteps.length - 1, tutorialIndex + 1); renderTutorialStep(); });
  tutTabsEl?.querySelectorAll?.('[data-tut-tab]')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.tutTab);
      if (!Number.isNaN(idx)) {
        tutorialIndex = idx;
        renderTutorialStep();
      }
    });
  });
  ownCodeBtn?.addEventListener('click', () => openOwnCodePractice());
  ownLangSel?.addEventListener('change', () => {
    if (!isOwnCodeActive) return;
    const chosen = ownLangSel.value;
    if (TECHS.includes(chosen)) {
      currentTopic = chosen;
      const pseudo = buildOwnCodeCurriculum(chosen);
      currentCurriculum = pseudo;
      activeLevel = pseudo.levels[0];
      if (setLanguage) setLanguage(chosen);
      refreshTutorialForLevel(activeLevel, pseudo.standard);
    }
  });
  ownSnapshotBtn?.addEventListener('click', handleOwnCodeSnapshot);
  ownCompareBtn?.addEventListener('click', () => { handleOwnCodeCompare(); });
  idleEnableBtn?.addEventListener('click', () => setAssistEnabled(true));
  const onEditorActivity = () => {
    if (currentMode === 'learn' && academyView === 'editor' && !assistEnabled) {
      scheduleIdleNudge();
    }
  };
  editorPane?.addEventListener?.('input', onEditorActivity);
  editorPane?.addEventListener?.('pointerdown', onEditorActivity);
  const onEditorShortcut = (ev) => {
    if (currentMode !== 'learn' || academyView !== 'editor') return;
    if (!assistEnabled) scheduleIdleNudge();
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && validateBtn && !validateBtn.disabled) {
      ev.preventDefault();
      validateBtn.click();
    }
  };
  editorPane?.addEventListener?.('keydown', onEditorShortcut);
  document.addEventListener('keydown', onEditorShortcut);
  backBtn?.addEventListener('click', async () => {
    if (academyView === 'results') { setAcademyView('editor'); return; }
    if (academyView === 'editor') { setAcademyView('tree'); return; }
    try {
      pathsCache ||= await fetchJson('paths.json');
      renderPathsView(pathsCache);
    } catch {
      toast(t('acadLoadError'));
    }
  });
  dailyBtn?.addEventListener('click', () => { handleDailyChallengeClick(); });
  document.addEventListener('cf:auth-success', async (ev) => {
    const isPro = Boolean(ev?.detail?.plan === 'pro' || ev?.detail?.pro_active || ev?.detail?.trial_auto_activated);
    academyState = saveAcademyState({ ...readLocalState(), isPro });
    if (currentCurriculum) renderSkillTree(currentCurriculum);
    if (ev?.detail?.trial_auto_activated) {
      const proDialog = document.getElementById('cf-pro-modal');
      if (proDialog && proDialog.open && typeof proDialog.close === 'function') proDialog.close();
    }
    await resumePendingAction();
    if (currentMode === 'learn' && academyView === 'paths' && pathsContainer && !pathsContainer.hidden) {
      const firstStart = pathsContainer.querySelector('.cf-academy-path-card .cf-btn--primary');
      if (firstStart && typeof firstStart.focus === 'function') firstStart.focus();
    }
  });
  // Cierre de sesión: se retira el flag Pro y se protege el workspace saliendo de Academia.
  document.addEventListener('cf:auth-logout', () => {
    academyState = saveAcademyState({ ...readLocalState(), isPro: false });
    if (currentCurriculum) renderSkillTree(currentCurriculum);
    if (currentMode === 'learn') setWorkMode('format');
  });
  document.addEventListener('cf:pro-activated', () => {
    academyState = saveAcademyState({ ...readLocalState(), isPro: true });
    if (currentCurriculum) renderSkillTree(currentCurriculum);
  });

  diffBtn?.addEventListener('click', () => {
    if (!openDiffWith) return;
    // En refuerzo remedial: usar solución del drill si existe, o mostrar su pista sin comparar contra el nivel principal.
    if (isRemedialActive && activeDrill) {
      if (!activeDrill.reference_solution) {
        const hintMsg = activeDrill.solution_hint || activeDrill.prompt || t('acadConsoleEmpty');
        if (editorHintBox) {
          editorHintBox.textContent = hintMsg;
          editorHintBox.hidden = false;
        }
        toast(hintMsg);
        return;
      }
    }
    const targetSolution = (isRemedialActive && activeDrill?.reference_solution)
      ? activeDrill.reference_solution
      : activeLevel?.reference_solution;
    if (!targetSolution) return;
    // El panel de diff vive en el slot del Formateador (oculto en Academia): se reubica y muestra ANTES de montar MergeView.
    const diffPanel = document.getElementById('cf-diff-panel');
    if (diffSlot) diffSlot.hidden = false;
    if (diffPanel) {
      if (diffSlot && diffPanel.parentElement !== diffSlot) diffSlot.append(diffPanel);
      diffPanel.hidden = false;
    }
    openDiffWith({
      original: getCode ? getCode() : '',
      result: targetSolution,
      lang: currentCurriculum?.tech || 'python',
    });
  });

  async function renderCertificateAction(tech) {
    const existingBox = document.getElementById('cf-academy-cert-box');
    if (existingBox) existingBox.remove();
    const box = el('div', 'cf-academy-capsule');
    box.id = 'cf-academy-cert-box';

    let quota = null;
    try {
      const res = await fetch(apiUrl('/api/academy/certificates/quota'), { credentials: 'include', cache: 'no-store' });
      if (res.ok) quota = await res.json();
    } catch { /* modo invitado o sin conexión */ }

    if (!quota || !quota.has_active_subscription || quota.is_trial) {
      const previewLink = el('a', 'cf-btn cf-btn--secondary cf-btn--small', t('certPreviewBtn'));
      previewLink.href = `cert/?preview=1&tech=${encodeURIComponent(tech)}`;
      previewLink.target = '_blank';
      previewLink.rel = 'noopener noreferrer';
      box.append(previewLink);
      if (quota?.is_trial) {
        box.append(el('p', 'cf-muted', t('certErrTrialOnly')));
      }
      if (isFeatureOn('pro_billing')) {
        const upg = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('certPreviewUpgradeCta'));
        upg.type = 'button';
        upg.addEventListener('click', openProOrExplain);
        box.append(upg);
      }
      checklistEl.append(box);
      return;
    }

    const quotaText = quota.limit === null
      ? t('certQuotaUnlimited')
      : t('certQuotaLabel', { used: quota.used, limit: quota.limit });
    box.append(el('p', 'cf-muted', quotaText));

    const issueBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('certIssueBtn'));
    issueBtn.type = 'button';
    const statusP = el('p', 'cf-form__status');
    statusP.setAttribute('role', 'status');

    const doIssue = async (holderFullName) => {
      issueBtn.disabled = true;
      try {
        const res = await postJson('/api/academy/certificates/issue', {
          cert_type: currentPath ? 'path' : 'language',
          target_slug: currentPath || tech,
          language_code: getUiLang(),
          ui_locale: getUiLang(),
          ...(holderFullName ? { holder_full_name: holderFullName } : {}),
        });
        if (res.ok && res.data?.cert_code) {
          const link = el('a', 'cf-btn cf-btn--primary cf-btn--small', `${res.data.cert_code} →`);
          link.href = `cert/?id=${encodeURIComponent(res.data.cert_code)}`;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          box.append(link);
          statusP.textContent = '';
        } else {
          const code = res.data?.detail?.code || res.data?.detail || '';
          const map = {
            TRIAL_PREVIEW_ONLY: 'certErrTrialOnly',
            QUOTA_EXCEEDED: 'certErrQuota',
            PLAN_TIER_REQUIRED: 'certErrPlanTier',
            PLAN_LANGUAGE_RESTRICTED: 'certErrLanguage',
            NAME_LOCKED: 'certErrNameLocked',
          };
          statusP.textContent = t(map[code] || 'acadProPreviewMsg');
        }
      } catch {
        statusP.textContent = t('acadProPreviewMsg');
      } finally {
        issueBtn.disabled = false;
      }
    };

    issueBtn.addEventListener('click', () => {
      if (quota.holder_full_name) {
        doIssue(quota.holder_full_name);
        return;
      }
      const dlg = document.createElement('dialog');
      dlg.className = 'cf-dialog';
      const title = el('h3', 'cf-dialog__title', t('certConfirmTitle'));
      const warn = el('p', 'cf-muted', t('certConfirmWarn'));
      const label = el('label', 'cf-field');
      label.append(el('span', 'cf-field__label', t('certHolderLabel')));
      const input = document.createElement('input');
      input.className = 'cf-input';
      input.type = 'text';
      input.required = true;
      input.minLength = 3;
      input.maxLength = 140;
      label.append(input);
      const actions = el('div', 'cf-tip-modal__actions');
      const okBtn = el('button', 'cf-btn cf-btn--primary', t('certConfirmBtn'));
      okBtn.type = 'button';
      const cancelBtn = el('button', 'cf-btn', t('certCancelBtn'));
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', () => { dlg.close(); dlg.remove(); });
      okBtn.addEventListener('click', async () => {
        if (input.value.trim().length < 3) return;
        dlg.close();
        dlg.remove();
        await doIssue(input.value.trim());
      });
      actions.append(okBtn, cancelBtn);
      dlg.append(title, warn, label, actions);
      document.body.append(dlg);
      dlg.showModal();
    });

    box.append(issueBtn, statusP);
    checklistEl.append(box);
  }

  /** Nivel sintético con las pruebas propias del micro-ejercicio remedial. */
  function buildDrillLevel(drill) {
    return {
      id: drill.id,
      level: 0,
      title: drill.title,
      style_rules: [],
      tests: [{
        id: `${drill.id}-expected`,
        name: drill.title,
        visible: true,
        type: 'pattern',
        expected: String(drill.expected_pattern || ''),
        description: drill.prompt || '',
      }],
    };
  }

  /** Restaura el reto principal (nivel + código previo del usuario) y vuelve al editor. */
  function returnToMainChallenge(completedDrillTitle = '') {
    const snap = mainLevelSnapshot;
    const keptCode = mainCodeSnapshot;
    exitOwnCodeMode();
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    mainCodeSnapshot = null;
    if (!snap) return;
    selectLevel(currentCurriculum, snap.level, { view: 'editor' });
    if (keptCode !== null && setCode) setCode(keptCode);
    if (completedDrillTitle) toast(t('acadRemedialPassedMsg', { title: completedDrillTitle }));
  }

  function renderRemedialResults(drill, drillLevel, evaluation) {
    const passedCount = evaluation.results.filter((r) => r.ok).length;
    const totalCount = evaluation.results.length;
    primaryFocus = null;
    renderChecklist(drillLevel, evaluation);

    if (evaluation.passed) {
      liveEl.textContent = t('acadRemedialPassedMsg', { title: drill.title });
      const card = el('div', 'cf-academy-achievement-card');
      const returnBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadRemedialMastered'));
      returnBtn.type = 'button';
      returnBtn.id = 'cf-academy-remedial-return-btn';
      returnBtn.addEventListener('click', () => returnToMainChallenge(drill.title));
      card.append(returnBtn);
      checklistEl.append(card);
      primaryFocus = returnBtn;
    } else {
      const translatedStyle = evaluation.styleViolationKeys?.[0]?.key
        ? t(evaluation.styleViolationKeys[0].key)
        : evaluation.styleViolations?.[0];
      const firstIssue = evaluation.runtimeError || translatedStyle || evaluation.errorType || 'failed';
      liveEl.textContent = `${passedCount}/${totalCount} · ${firstIssue}`;
      const fixBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadFixInEditorBtn'));
      fixBtn.type = 'button';
      fixBtn.id = 'cf-academy-fix-editor-btn';
      fixBtn.addEventListener('click', () => setAcademyView('editor'));
      checklistEl.append(fixBtn);
      if (!assistEnabled) {
        const assistFixBtn = el('button', 'cf-btn cf-btn--secondary cf-btn--small', t('acadFixWithAssistBtn'));
        assistFixBtn.type = 'button';
        assistFixBtn.id = 'cf-academy-fix-with-assist-btn';
        assistFixBtn.addEventListener('click', () => {
          setAssistEnabled(true);
          setAcademyView('editor');
        });
        checklistEl.append(assistFixBtn);
      }
      primaryFocus = fixBtn;
    }
  }

  async function validateRemedial(tech, code) {
    const drill = activeDrill;
    const drillLevel = buildDrillLevel(drill);
    const evaluation = await evaluateChallenge(tech, code, drillLevel, { translate: t });
    resultsReady = true;
    lastEvaluation = { kind: 'remedial', drill, drillLevel, evaluation };
    if (evaluation.passed) {
      academyState = saveAcademyState(completeRemedialDrill(academyState, mainLevelSnapshot.id, drill.id));
    }
    renderRemedialResults(drill, drillLevel, evaluation);
    setAcademyView('results');
  }

  function renderMainResults(tech, lvl, evaluation, attempt, { emitToasts = false, achRes = null } = {}) {
    const passedCount = evaluation.results.filter((r) => r.ok).length;
    const totalCount = evaluation.results.length;
    primaryFocus = null;
    renderChecklist(lvl, evaluation);

    if (evaluation.passed) {
      liveEl.textContent = `OK ${passedCount}/${totalCount} · ${lvl.title}`;
      renderSkillTree(currentCurriculum);

      const feedbackCard = el('div', 'cf-academy-achievement-card');
      {
        const remaining = Math.max(0, (currentCurriculum?.levels?.length || 1) - countCompletedForTech(academyState.completed || [], tech));
        feedbackCard.append(el('p', 'cf-muted', t('acadNextBadgeProgress', { remaining })));
        if (preloadedNextLevel && (preloadedNextLevel.tier !== 'pay' || readLocalState().isPro)) {
          const nextBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadNextLevelBtn', { n: preloadedNextLevel.level }));
          nextBtn.type = 'button';
          nextBtn.id = 'cf-academy-next-level-btn';
          nextBtn.addEventListener('click', () => {
            selectLevel(currentCurriculum, preloadedNextLevel.level, { view: 'editor' });
          });
          feedbackCard.append(nextBtn);
          primaryFocus = nextBtn;
        }
      }
      checklistEl.append(feedbackCard);

      if (lvl.related_tip_slug) {
        const tipLink = el('a', 'cf-btn cf-btn--secondary cf-btn--small', t('tipsOpenFullPage'));
        tipLink.href = resolveTipHref(tech, lvl.related_tip_slug, getUiLang());
        checklistEl.append(tipLink);
      }
      renderCertificateAction(tech);
      if (emitToasts && achRes?.newlyUnlocked) {
        for (const ach of achRes.newlyUnlocked) {
          const copy = ach.i18n?.[getUiLang()] || ach.i18n?.es || {};
          toast(`${ach.icon} ${copy.title || ach.id}`);
        }
      }
    } else {
      const translatedStyle = evaluation.styleViolationKeys?.[0]?.key
        ? t(evaluation.styleViolationKeys[0].key)
        : evaluation.styleViolations?.[0];
      const firstIssue = evaluation.runtimeError || translatedStyle || evaluation.errorType || 'failed';
      liveEl.textContent = `${passedCount}/${totalCount} · ${firstIssue}`;

      const fixBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadFixInEditorBtn'));
      fixBtn.type = 'button';
      fixBtn.id = 'cf-academy-fix-editor-btn';
      fixBtn.addEventListener('click', () => setAcademyView('editor'));
      checklistEl.append(fixBtn);
      if (!assistEnabled) {
        const assistFixBtn = el('button', 'cf-btn cf-btn--secondary cf-btn--small', t('acadFixWithAssistBtn'));
        assistFixBtn.type = 'button';
        assistFixBtn.id = 'cf-academy-fix-with-assist-btn';
        assistFixBtn.addEventListener('click', () => {
          setAssistEnabled(true);
          setAcademyView('editor');
        });
        checklistEl.append(assistFixBtn);
      }
      primaryFocus = fixBtn;

      if (attempt.triggerRemedial && attempt.recommendedDrill) {
        const drill = attempt.recommendedDrill;
        const box = el('div', 'cf-academy-capsule');
        box.id = 'cf-academy-remedial-box';
        box.append(el('strong', null, `${drill.title}: `));
        box.append(document.createTextNode(drill.prompt));
        const practiceBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadRemedialPracticeBtn'));
        practiceBtn.type = 'button';
        practiceBtn.id = 'cf-academy-remedial-practice-btn';
        practiceBtn.addEventListener('click', () => {
          isRemedialActive = true;
          mainLevelSnapshot = activeLevel;
          mainCodeSnapshot = getCode ? getCode() : null;
          activeDrill = drill;
          hintStep = 0;
          updateMiniBrief(drill.title, drill.prompt);
          syncHintControls(buildDrillLevel(drill));
          if (setCode) setCode(drill.starter_code);
          setAcademyView('editor');
        });
        box.append(practiceBtn);
        primaryFocus = practiceBtn;

        if (isFeatureOn('pro_billing')) {
          const teaser = el('p', 'cf-muted', t('acadProTutorTeaser', { issue: firstIssue }));
          const proBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadProOpenPlans'));
          proBtn.type = 'button';
          proBtn.addEventListener('click', openProOrExplain);
          box.append(teaser, proBtn);
        }
        checklistEl.append(box);
      }
    }
  }

  validateBtn?.addEventListener('click', async () => {
    if (!activeLevel) return;
    clearIdleNudge();
    validateBtn.disabled = true;
    validateBtn.setAttribute('aria-busy', 'true');
    showAcademyLoader(workspace);
    try {
      const tech = currentCurriculum?.tech || 'python';
      const code = getCode ? getCode() : '';

      // Micro-ejercicio remedial: se evalúa contra SUS criterios, sin tocar contadores del nivel principal.
      if (isRemedialActive && mainLevelSnapshot && activeDrill) {
        await validateRemedial(tech, code);
        return;
      }

      const evaluation = await evaluateChallenge(tech, code, activeLevel, { translate: t });
      resultsReady = true;

      const attempt = recordAttempt(academyState, activeLevel, evaluation);
      academyState = attempt.state;
      if (evaluation.passed && currentCurriculum?.isDaily) {
        academyState = recordDailyCompletion(academyState);
      }

      if (!achievementsCache) {
        try {
          achievementsCache = (await fetchJson('achievements.json')).achievements || [];
        } catch {
          achievementsCache = [];
        }
      }
      const achRes = evaluateAchievements(academyState, achievementsCache);
      academyState = saveAcademyState(achRes.state);
      if (isFeatureOn('accounts_auth') && (localStorage.getItem('cf.session_hint') === '1' || localStorage.getItem('cf_session_hint') === '1')) {
        syncAcademyState(academyState).then((merged) => { academyState = merged; });
      }

      lastEvaluation = { kind: 'main', tech, evaluation, attempt };
      renderMainResults(tech, activeLevel, evaluation, attempt, { emitToasts: true, achRes });
      updateStepper();
      setAcademyView('results');
    } finally {
      hideAcademyLoader(workspace);
      validateBtn.disabled = false;
      validateBtn.removeAttribute('aria-busy');
    }
  });

  // Cambio de idioma: reconstruye la vista exacta (ruta, tema, nivel y paso, incluyendo results) sin tocar el código del editor.
  async function rebuildForLang() {
    if (currentMode !== 'learn') return;
    try {
      if (academyView === 'paths' || !currentCurriculum || !activeLevel) {
        pathsCache ||= await fetchJson('paths.json');
        renderPathsView(pathsCache);
        return;
      }
      const view = academyView;
      const keepLive = liveEl ? liveEl.textContent : '';
      const prevLevel = activeLevel;
      if (currentCurriculum.isOwnCode) {
        currentCurriculum = buildOwnCodeCurriculum(currentTopic);
      } else if (currentCurriculum.isDaily) {
        dailyCache ||= await loadDailyChallengesData();
        currentCurriculum = buildDailyCurriculum(resolveDailyChallenge(dailyCache, getUiLang()));
      } else {
        currentCurriculum = await fetchJson(`curriculum/${getUiLang()}/${currentTopic}.json`);
      }
      const levels = currentCurriculum.levels || [];
      const idx = levels.findIndex((l) => l.level === currentLevelNum);
      const resolvedIdx = idx >= 0 ? idx : 0;
      let candidate = levels[resolvedIdx] || levels[0];
      if (candidate && candidate.tier === 'pay' && (!candidate.starter_code || !Array.isArray(candidate.tests) || candidate.tests.length === 0)) {
        const loader = readLocalState().isPro ? await resolveProLoader() : null;
        if (loader) {
          try {
            const proPayload = await loader(currentCurriculum.tech, candidate.level, getUiLang());
            if (proPayload && typeof proPayload === 'object') {
              candidate = { ...candidate, ...proPayload, tier: 'pay', level: candidate.level };
              levels[resolvedIdx] = candidate;
            }
          } catch { /* fallback a nivel previamente hidratado */ }
        }
        if ((!Array.isArray(candidate.tests) || candidate.tests.length === 0) && prevLevel && prevLevel.level === candidate.level) {
          candidate = { ...prevLevel, ...candidate, title: candidate.title || prevLevel.title };
          levels[resolvedIdx] = candidate;
        }
      }
      activeLevel = candidate;
      preloadedNextLevel = levels.find((l) => l.level === (activeLevel.level + 1)) || null;
      renderSkillTree(currentCurriculum);
      renderMission(activeLevel, currentCurriculum.standard);
      if (isRemedialActive && activeDrill) {
        updateMiniBrief(activeDrill.title, activeDrill.prompt);
      }
      if (view === 'results' && lastEvaluation) {
        if (lastEvaluation.kind === 'remedial') {
          renderRemedialResults(lastEvaluation.drill, lastEvaluation.drillLevel, lastEvaluation.evaluation);
        } else {
          renderMainResults(lastEvaluation.tech, activeLevel, lastEvaluation.evaluation, lastEvaluation.attempt);
        }
      } else if (liveEl && view !== 'tree') {
        liveEl.textContent = keepLive;
      }
      setAcademyView(view, { scroll: false, focus: false });
    } catch {
      toast(t('acadLoadError'));
    }
  }
  document.addEventListener('cf:lang', () => { rebuildForLang(); });

  ensureNoindexForDynamicParams();
  const initial = getAcademyParams();
  if (initial.mode === 'learn') {
    setWorkMode('learn').then(() => {
      if (initial.openPlans && isFeatureOn('pro_billing')) {
        openProOrExplain();
      }
    });
  }

  return {
    setWorkMode,
    openTopic,
    openOwnCodePractice,
    selectLevel: (levelNum, opts) => (currentCurriculum ? selectLevel(currentCurriculum, levelNum, opts) : false),
    setAssistEnabled,
    destroy: () => {
      clearIdleNudge();
      exitOwnCodeMode();
      document.removeEventListener?.('keydown', onEditorShortcut);
    },
  };
}
