// Funciones exclusivas Pro de la Academia (tier: "pay", excluidas de dist-public/).
import { postJson, getJson } from './services/api.js';
import { t } from './i18n.js';

export async function fetchProLevel(tech, level, locale = 'es') {
  const qs = `?locale=${encodeURIComponent(locale || 'es')}`;
  const res = await getJson(`/api/academy/levels/${encodeURIComponent(tech)}/${Number(level)}${qs}`);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.data !== undefined ? res.data : (typeof res.json === 'function' ? await res.json() : null);
}

export async function requestSocraticHint({ challengeId, errorCode, astSignature, codeSnippet, locale }) {
  const res = await postJson('/api/academy/hint', {
    challenge_id: challengeId,
    error_code: errorCode,
    ast_signature: astSignature,
    code_snippet: String(codeSnippet || '').slice(0, 4000),
    locale: locale || 'es',
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.data !== undefined ? res.data : (typeof res.json === 'function' ? await res.json() : null);
}

/**
 * Crea el botón localizado de reto personalizado en el Modo Formateador (solo Pro).
 */
export function initCodeToChallengeButton({ getCode, getLanguage, onOpenChallenge, translate = t }) {
  const actionsBar = document.querySelector('#cf-editor-card .cf-actions');
  if (!actionsBar || document.getElementById('cf-convert-challenge')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'cf-convert-challenge';
  btn.className = 'cf-btn';
  btn.dataset.cfCommercial = '';
  btn.dataset.i18n = 'acadConvertCodeBtn';
  btn.textContent = translate('acadConvertCodeBtn');
  btn.addEventListener('click', () => {
    const code = getCode ? getCode() : '';
    const lang = getLanguage ? getLanguage() : 'python';
    if (!code.trim() || !onOpenChallenge) return;
    onOpenChallenge({
      id: `custom-${Date.now()}`,
      level: 1,
      tier: 'free',
      tech: lang,
      title: translate('acadCustomChallengeTitle', { lang: lang.toUpperCase() }),
      concept_capsule: translate('acadCustomChallengeCapsule'),
      starter_code: code,
      reference_solution: code,
      tests: [{ id: 'custom-len', name: translate('acadCustomChallengeTestName'), visible: true, type: 'pattern', expected: code.trim().slice(0, 4) }],
      style_rules: [],
    });
  });
  actionsBar.append(btn);
}
