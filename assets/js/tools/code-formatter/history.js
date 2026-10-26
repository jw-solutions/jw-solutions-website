// Historial local enriquecido: últimos 5 fragmentos en localStorage.
// Registro: { id, ts, lang, code, bytes (UTF-8), lines, result } con result = código localizable (res_<result> en los locales).
const KEY = 'cf.history';
const MAX = 5;
export const RESULT_CODES = ['formatted_success', 'formatted_documented', 'validated_documented'];

export const utf8Length = (text) => new TextEncoder().encode(text).length;
export const countLines = (text) => (text === '' ? 0 : text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length);

const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/** Normaliza registros antiguos (sin bytes/lines/result/id) y descarta los inválidos. */
function normalize(entry) {
  if (!entry || typeof entry.code !== 'string' || typeof entry.lang !== 'string') return null;
  return {
    id: typeof entry.id === 'string' ? entry.id : newId(),
    ts: Number.isFinite(entry.ts) ? entry.ts : Date.now(),
    lang: entry.lang,
    code: entry.code,
    bytes: utf8Length(entry.code),
    lines: countLines(entry.code),
    result: RESULT_CODES.includes(entry.result) ? entry.result : 'formatted_success',
  };
}

const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* cuota o modo privado */ } return list; };

export function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data.map(normalize).filter(Boolean).slice(0, MAX) : [];
  } catch { return []; }
}

export function pushHistory(code, lang, result = 'formatted_success') {
  if (!code.trim()) return loadHistory();
  const list = loadHistory().filter((e) => e.code !== code);
  list.unshift(normalize({ id: newId(), ts: Date.now(), lang, code, result }));
  return save(list.slice(0, MAX));
}

export const removeHistoryItem = (id) => save(loadHistory().filter((e) => e.id !== id));

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch { /* ignorar */ }
  return [];
}
