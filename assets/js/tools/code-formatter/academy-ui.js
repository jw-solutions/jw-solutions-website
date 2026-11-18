// Interfaz del Modo Academia (Switch Dual, Rutas Profesionales, Skill Tree y Workspace).
// Seguridad: renderizado 100% vía document.createElement + textContent (cero innerHTML).
import { t, lang as uiLang } from './i18n.js';
const getUiLang = () => (typeof uiLang === 'function' ? uiLang() : (uiLang || 'es'));
import { isFeatureOn } from './ui-controller.js';
import { toast } from './actions.js';
import { evaluateChallenge } from './academy-sandbox.js';
import {
  isLevelUnlocked,
  recordAttempt,
  completeRemedialDrill,
  recordDailyCompletion,
  evaluateAchievements,
} from './academy-engine.js';
import { loadAcademyState, saveAcademyState, captureUtmParams, syncAcademyState } from './academy-progress.js';
import { apiUrl, postJson } from './services/api.js';

const TECHS = ['python', 'javascript', 'typescript', 'sql', 'dax', 'java', 'csharp', 'php', 'json', 'yaml'];
const ACADEMY_BASE = new URL('../../../../content/code-formatter-academy/', import.meta.url);
// Vistas exclusivas del flujo secuencial (una sola visible a la vez).
export const ACADEMY_VIEWS = ['paths', 'tree', 'editor', 'results'];
const PENDING_ACTION_KEY = 'cf_pending_action';
const PENDING_ACTION_TTL_MS = 900000;

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

export function initAcademyUI({ getCode, setCode, setLanguage, openDiffWith, getEditorView } = {}) {
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
  const skillTreeEl = document.getElementById('cf-academy-skill-tree');
  const missionEl = document.getElementById('cf-academy-mission-card');
  const checklistEl = document.getElementById('cf-academy-checklist');
  const liveEl = document.getElementById('cf-academy-live');
  const validateBtn = document.getElementById('cf-academy-validate');
  const diffBtn = document.getElementById('cf-academy-diff');
  const progressBarEl = document.getElementById('cf-academy-progress-bar');
  const miniBriefEl = document.getElementById('cf-academy-mini-brief');
  const miniBriefTitleEl = document.getElementById('cf-academy-mini-brief-title');
  const miniBriefBodyEl = document.getElementById('cf-academy-mini-brief-body');

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

  const PANE_BY_VIEW = { tree: 'mission', editor: 'editor', results: 'results' };
  const nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));

  function mountEditorInAcademy() {
    if (editorCard && academyEditorSlot && editorCard.parentElement !== academyEditorSlot) {
      academyEditorSlot.append(editorCard);
    }
  }

  function restoreDiffPanelHome() {
    const diffPanel = document.getElementById('cf-diff-panel');
    if (diffPanel && editorHome && diffPanel.parentElement !== editorHome) {
      editorHome.insertBefore(diffPanel, editorCard ? editorCard.nextSibling : null);
    }
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
      // CM6 mide gutters y líneas al ser visible: se recalcula tras el primer frame.
      nextFrame(() => {
        const ev = typeof getEditorView === 'function' ? getEditorView() : null;
        if (ev && typeof ev.requestMeasure === 'function') ev.requestMeasure();
        if (focus && ev && typeof ev.focus === 'function') ev.focus();
      });
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

    const loc = getUiLang();
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
      startBtn.addEventListener('click', () => { gatedOpenTopic(p.technologies[0], 1, p.id); });
      card.append(startBtn);

      grid.append(card);
    }

    const hTech = el('h3', 'cf-academy-section-title', t('acadByTech'));
    const techPills = el('div', 'cf-academy-tech-pills');
    for (const tech of TECHS) {
      const btn = el('button', 'cf-academy-tech-btn', tech.toUpperCase());
      btn.type = 'button';
      btn.addEventListener('click', () => { gatedOpenTopic(tech, 1, ''); });
      techPills.append(btn);
    }

    pathsContainer.append(hPaths, grid, hTech, techPills);
    injectAcademyJsonLd(pathsData, loc);
    setAcademyView('paths', { scroll: false });
  }

  function resolveNodeState(lvl, idx, levels, state) {
    const completedSet = new Set(state.completed || []);
    const remedialSet = new Set(state.remedial || []);
    if (completedSet.has(lvl.id)) return 'completed';
    if (lvl.tier === 'pay' && !state.isPro) return 'locked';
    if (remedialSet.has(lvl.id)) return 'remedial';
    return isLevelUnlocked(lvl, idx, levels, state) ? 'active' : 'locked';
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
        if (lvl.tier === 'pay' && !readLocalState().isPro) {
          openProOrExplain();
          return;
        }
        if (nodeState === 'locked') {
          const prevTitle = curriculum.levels[idx - 1]?.title || `Nivel ${idx}`;
          toast(t('acadLockedPrevMsg', { prev: prevTitle }));
          const activeIdx = curriculum.levels.findIndex((l, i) => resolveNodeState(l, i, curriculum.levels, readLocalState()) === 'active');
          if (activeIdx >= 0) selectLevel(curriculum, curriculum.levels[activeIdx].level);
          return;
        }
        selectLevel(curriculum, lvl.level);
      };
      node.addEventListener('click', activate);
      node.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate();
        }
      });
      list.append(node);
    });
    skillTreeEl.append(list);
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
    if (miniBriefEl && miniBriefTitleEl && miniBriefBodyEl) {
      miniBriefTitleEl.textContent = `${t('acadStickyBriefLabel')}: ${lvl.title}`;
      miniBriefBodyEl.textContent = String(lvl.concept_capsule || '').slice(0, 140);
      miniBriefEl.hidden = false;
    }

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
    hintBtn.addEventListener('click', () => {
      hintStep = Math.min(2, hintStep + 1);
      if (hintStep === 1) {
        const rulesText = (lvl.style_rules || []).join(', ') || lvl.concept_capsule || '';
        hintBox.textContent = t('acadHintConcept', { text: rulesText });
        hintBtn.textContent = t('acadHintBtn', { step: 2 });
      } else {
        const firstTest = (lvl.tests || [])[0];
        const syntax = firstTest?.expected ? String(firstTest.expected) : String(lvl.reference_solution || '').split('\n')[0];
        hintBox.textContent = t('acadHintSyntax', { text: syntax });
        hintBtn.disabled = true;
      }
      hintBox.hidden = false;
    });
    navBar.append(goEditorBtn, hintBtn);
    missionEl.append(navBar, hintBox);

    renderChecklist(lvl);
  }

  /** Checklist de pruebas; con `evaluation` marca cada prueba como aprobada/fallida. */
  function renderChecklist(lvl, evaluation = null) {
    checklistEl.replaceChildren();
    checklistEl.append(el('h4', 'cf-academy-pane__title', t('acadChecklistTitle')));
    const byId = new Map((evaluation?.results || []).map((r) => [r.id, r.ok]));
    const ul = el('ul', 'cf-academy-checklist-list');
    for (const test of lvl.tests || []) {
      const label = test.visible ? `${test.name}: ${test.description}` : `${test.name} (Hidden edge case)`;
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

  function selectLevel(curriculum, levelNum, { view = 'tree' } = {}) {
    const lvl = (curriculum.levels || []).find((l) => l.level === levelNum) || curriculum.levels[0];
    if (!lvl || (lvl.tier === 'pay' && !readLocalState().isPro)) {
      openProOrExplain();
      return;
    }
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    mainCodeSnapshot = null;
    resultsReady = false;
    primaryFocus = null;
    preloadedNextLevel = (curriculum.levels || []).find((l) => l.level === (lvl.level + 1)) || null;
    activeLevel = lvl;
    currentLevelNum = lvl.level;
    renderSkillTree(curriculum);
    renderMission(lvl, curriculum.standard);
    if (setLanguage) setLanguage(curriculum.tech);
    if (setCode && lvl.starter_code) setCode(lvl.starter_code);
    if (liveEl) liveEl.textContent = t('acadConsoleEmpty');
    setAcademyView(view);
  }

  async function openTopic(tech, levelNum = 1, pathId = '', view = 'tree') {
    try {
      const loc = getUiLang();
      const curriculum = await fetchJson(`curriculum/${loc}/${tech}.json`);
      currentPath = pathId;
      currentTopic = tech;
      currentCurriculum = curriculum;
      mountEditorInAcademy();
      selectLevel(curriculum, levelNum, { view });
    } catch {
      if (liveEl) liveEl.textContent = t('acadLoadError');
      toast(t('acadLoadError'));
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

  async function openDailyChallenge(view = 'tree') {
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
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    resultsReady = false;
    primaryFocus = null;
    renderSkillTree(pseudoCurriculum);
    renderMission(activeLevel, pseudoCurriculum.standard);
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
        await openDailyChallenge('tree');
      } else if (TECHS.includes(pending.tech)) {
        const level = Math.floor(Number(pending.level));
        await openTopic(pending.tech, level > 0 && level < 100 ? level : 1, typeof pending.pathId === 'string' ? pending.pathId.slice(0, 60) : '', 'tree');
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
      if (editorCard && editorHome && editorCard.parentElement !== editorHome) {
        editorHome.prepend(editorCard);
      }
      restoreDiffPanelHome();
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
        await openDailyChallenge(startView);
      } else if (params.topic && TECHS.includes(params.topic)) {
        await openTopic(params.topic, params.level || 1, params.path || '', startView);
      } else {
        renderPathsView(pathsCache);
      }
    } catch {
      toast(t('acadLoadError'));
    }
  }

  btnFormat.addEventListener('click', () => setWorkMode('format'));
  btnAcademy.addEventListener('click', () => setWorkMode('learn'));
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
    const isPro = Boolean(ev?.detail?.plan === 'pro' || ev?.detail?.trial_auto_activated);
    if (isPro) {
      academyState = saveAcademyState({ ...readLocalState(), isPro: true });
      if (currentCurriculum) renderSkillTree(currentCurriculum);
    }
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
    if (!activeLevel?.reference_solution || !openDiffWith) return;
    // El panel de diff vive en el slot del Formateador (oculto en Academia): se reubica en el workspace visible.
    const diffPanel = document.getElementById('cf-diff-panel');
    if (diffPanel && diffSlot && diffPanel.parentElement !== diffSlot) diffSlot.append(diffPanel);
    openDiffWith({
      original: getCode ? getCode() : '',
      result: activeLevel.reference_solution,
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
  function returnToMainChallenge() {
    const snap = mainLevelSnapshot;
    const keptCode = mainCodeSnapshot;
    isRemedialActive = false;
    mainLevelSnapshot = null;
    activeDrill = null;
    mainCodeSnapshot = null;
    if (!snap) return;
    selectLevel(currentCurriculum, snap.level, { view: 'editor' });
    if (keptCode !== null && setCode) setCode(keptCode);
  }

  async function validateRemedial(tech, code) {
    const drill = activeDrill;
    const drillLevel = buildDrillLevel(drill);
    const evaluation = await evaluateChallenge(tech, code, drillLevel);
    const passedCount = evaluation.results.filter((r) => r.ok).length;
    const totalCount = evaluation.results.length;
    resultsReady = true;
    primaryFocus = null;
    renderChecklist(drillLevel, evaluation);

    if (evaluation.passed) {
      academyState = saveAcademyState(completeRemedialDrill(academyState, mainLevelSnapshot.id, drill.id));
      liveEl.textContent = t('acadRemedialPassedMsg', { title: drill.title });
      const card = el('div', 'cf-academy-achievement-card');
      const returnBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadRemedialMastered'));
      returnBtn.type = 'button';
      returnBtn.id = 'cf-academy-remedial-return-btn';
      returnBtn.addEventListener('click', returnToMainChallenge);
      card.append(returnBtn);
      checklistEl.append(card);
      primaryFocus = returnBtn;
    } else {
      const firstIssue = evaluation.runtimeError || evaluation.styleViolations[0] || evaluation.errorType || 'failed';
      liveEl.textContent = `${passedCount}/${totalCount} · ${firstIssue}`;
      const fixBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadFixInEditorBtn'));
      fixBtn.type = 'button';
      fixBtn.id = 'cf-academy-fix-editor-btn';
      fixBtn.addEventListener('click', () => setAcademyView('editor'));
      checklistEl.append(fixBtn);
      primaryFocus = fixBtn;
    }
    setAcademyView('results');
  }

  validateBtn?.addEventListener('click', async () => {
    if (!activeLevel) return;
    validateBtn.disabled = true;
    validateBtn.setAttribute('aria-busy', 'true');
    try {
      const tech = currentCurriculum?.tech || 'python';
      const code = getCode ? getCode() : '';

      // Micro-ejercicio remedial: se evalúa contra SUS criterios, sin tocar contadores del nivel principal.
      if (isRemedialActive && mainLevelSnapshot && activeDrill) {
        await validateRemedial(tech, code);
        return;
      }

      const evaluation = await evaluateChallenge(tech, code, activeLevel);

      const passedCount = evaluation.results.filter((r) => r.ok).length;
      const totalCount = evaluation.results.length;
      resultsReady = true;
      primaryFocus = null;
      renderChecklist(activeLevel, evaluation);

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

      if (evaluation.passed) {
        liveEl.textContent = `OK ${passedCount}/${totalCount} · ${activeLevel.title}`;
        renderSkillTree(currentCurriculum);

        const feedbackCard = el('div', 'cf-academy-achievement-card');
        {
          const remaining = Math.max(0, (currentCurriculum?.levels?.length || 1) - (academyState.completed || []).filter((id) => id.startsWith(tech)).length);
          feedbackCard.append(el('p', 'cf-muted', t('acadNextBadgeProgress', { remaining })));
          if (preloadedNextLevel && (preloadedNextLevel.tier !== 'pay' || readLocalState().isPro)) {
            const nextBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadNextLevelBtn', { n: preloadedNextLevel.level }));
            nextBtn.type = 'button';
            nextBtn.id = 'cf-academy-next-level-btn';
            nextBtn.addEventListener('click', () => {
              selectLevel(currentCurriculum, preloadedNextLevel.level);
            });
            feedbackCard.append(nextBtn);
            primaryFocus = nextBtn;
          }
        }
        checklistEl.append(feedbackCard);

        if (activeLevel.related_tip_slug) {
          const tipLink = el('a', 'cf-btn cf-btn--secondary cf-btn--small', t('tipsOpenFullPage'));
          tipLink.href = `tips/${activeLevel.related_tip_slug}/${getUiLang()}/`;
          checklistEl.append(tipLink);
        }
        renderCertificateAction(tech);
        for (const ach of achRes.newlyUnlocked) {
          const copy = ach.i18n?.[getUiLang()] || ach.i18n?.es || {};
          toast(`${ach.icon} ${copy.title || ach.id}`);
        }
      } else {
        const firstIssue = evaluation.runtimeError || evaluation.styleViolations[0] || evaluation.errorType || 'failed';
        liveEl.textContent = `${passedCount}/${totalCount} · ${firstIssue}`;

        const fixBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadFixInEditorBtn'));
        fixBtn.type = 'button';
        fixBtn.id = 'cf-academy-fix-editor-btn';
        fixBtn.addEventListener('click', () => setAcademyView('editor'));
        checklistEl.append(fixBtn);
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
            if (setCode) setCode(drill.starter_code);
            setAcademyView('editor');
          });
          box.append(practiceBtn);
          primaryFocus = practiceBtn;

          if (isFeatureOn('pro_billing')) {
            const teaser = el('p', 'cf-muted', `${firstIssue} — Desbloquea el diagnóstico completo con Tutor IA Pro.`);
            const proBtn = el('button', 'cf-btn cf-btn--primary cf-btn--small', t('acadProOpenPlans'));
            proBtn.type = 'button';
            proBtn.addEventListener('click', openProOrExplain);
            box.append(teaser, proBtn);
          }
          checklistEl.append(box);
        }
      }
      updateStepper();
      setAcademyView('results');
    } finally {
      validateBtn.disabled = false;
      validateBtn.removeAttribute('aria-busy');
    }
  });

  // Cambio de idioma: reconstruye la vista exacta (ruta, tema, nivel y paso) sin tocar el código del editor.
  async function rebuildForLang() {
    if (currentMode !== 'learn') return;
    try {
      pathsCache ||= await fetchJson('paths.json');
      if (academyView === 'paths' || !currentCurriculum || !activeLevel) {
        renderPathsView(pathsCache);
        return;
      }
      const view = academyView;
      const keepLive = liveEl ? liveEl.textContent : '';
      const keepResults = view === 'results' ? Array.from(checklistEl.children || []) : null;
      if (currentCurriculum.isDaily) {
        dailyCache ||= await loadDailyChallengesData();
        currentCurriculum = buildDailyCurriculum(resolveDailyChallenge(dailyCache, getUiLang()));
      } else {
        currentCurriculum = await fetchJson(`curriculum/${getUiLang()}/${currentTopic}.json`);
      }
      activeLevel = (currentCurriculum.levels || []).find((l) => l.level === currentLevelNum) || currentCurriculum.levels[0];
      preloadedNextLevel = (currentCurriculum.levels || []).find((l) => l.level === (activeLevel.level + 1)) || null;
      renderSkillTree(currentCurriculum);
      renderMission(activeLevel, currentCurriculum.standard);
      if (keepResults) checklistEl.replaceChildren(...keepResults);
      if (liveEl && view !== 'tree') liveEl.textContent = keepLive;
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

  return { setWorkMode, openTopic };
}
