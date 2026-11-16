// Funciones exclusivas Pro de la Academia (tier: "pay", excluidas de dist-public/).
import { postJson, getJson } from './services/api.js';

export async function fetchProLevel(tech, level) {
  const res = await getJson(`/api/academy/levels/${encodeURIComponent(tech)}/${Number(level)}`);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
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
  return res.json();
}

/**
 * Crea un botón "Convertir mi código en reto" en el Modo Formateador (solo Pro).
 */
export function initCodeToChallengeButton({ getCode, getLanguage, onOpenChallenge }) {
  const actionsBar = document.querySelector('#cf-editor-card .cf-actions');
  if (!actionsBar || document.getElementById('cf-convert-challenge')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'cf-convert-challenge';
  btn.className = 'cf-btn';
  btn.dataset.cfCommercial = '';
  btn.textContent = 'Convertir mi código en reto';
  btn.addEventListener('click', () => {
    const code = getCode ? getCode() : '';
    const lang = getLanguage ? getLanguage() : 'python';
    if (!code.trim() || !onOpenChallenge) return;
    onOpenChallenge({
      id: `custom-${Date.now()}`,
      level: 1,
      tier: 'free',
      tech: lang,
      title: `Custom Challenge (${lang.toUpperCase()})`,
      concept_capsule: 'Refactoriza y documenta tu propio fragmento aplicando las reglas del lenguaje.',
      starter_code: code,
      reference_solution: code,
      tests: [{ id: 'custom-len', name: 'Non-empty code', visible: true, type: 'pattern', expected: code.trim().slice(0, 4) }],
      style_rules: [],
    });
  });
  actionsBar.append(btn);
}
