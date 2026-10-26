// Historial local: últimos 5 fragmentos en localStorage.
const KEY = 'cf.history';
const MAX = 5;

export function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data.slice(0, MAX) : [];
  } catch { return []; }
}

export function pushHistory(code, lang) {
  if (!code.trim()) return loadHistory();
  const list = loadHistory().filter((e) => e.code !== code);
  list.unshift({ ts: Date.now(), lang, code });
  const next = list.slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* cuota o modo privado */ }
  return next;
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch { /* ignorar */ }
}
