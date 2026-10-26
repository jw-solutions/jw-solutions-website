// Auto-detección de lenguaje por expresiones regulares (puntaje por coincidencias).
const RULES = {
  json: [/^\s*[\[{][\s\S]*[\]}]\s*$/, /"[^"\n]+"\s*:\s*/],
  yaml: [/^[\w.-]+:\s*(\S.*)?$/m, /^\s*-\s+\w+/m, /^---\s*$/m],
  sql: [/\b(select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table)\b/i, /\bfrom\b[\s\S]*\bwhere\b/i, /\bjoin\b/i],
  dax: [/\bEVALUATE\b/, /\b(CALCULATE|SUMX|FILTER|RELATED|DISTINCTCOUNT|DIVIDE)\s*\(/, /^\s*\w[\w ]*\s*=\s*(CALCULATE|SUM|VAR)\b/m, /\bVAR\b[\s\S]*\bRETURN\b/],
  php: [/<\?php/, /\$\w+\s*=/, /\bfunction\s+\w+\s*\([^)]*\)\s*\{/, /->\w+\(/],
  csharp: [/\busing\s+System/, /\bnamespace\s+\w+/, /\b(public|private|internal)\s+(static\s+)?(void|string|int|bool|async\s+Task)\b/, /\bConsole\.Write(Line)?\(/],
  java: [/\bpublic\s+static\s+void\s+main\b/, /\bSystem\.out\.print/, /\bimport\s+java\./, /\bpublic\s+class\s+\w+/],
  typescript: [/:\s*(string|number|boolean|any|void)\b/, /\binterface\s+\w+\s*\{/, /\btype\s+\w+\s*=/, /\bas\s+(string|number|const)\b/, /<\w+>\(/],
  javascript: [/\b(const|let|var)\s+\w+\s*=/, /=>\s*[{(\w]/, /\bfunction\s*\w*\s*\(/, /\bconsole\.log\(/, /\brequire\(|\bimport\s+.*\bfrom\b/],
  python: [/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w\[\], .]+)?\s*:/m, /^\s*(import\s+\w+|from\s+\w+\s+import\s+)/m, /^\s*class\s+\w+(\(.*\))?\s*:/m, /\bprint\(/, /^\s*(if|elif|else|for|while)\b.*:\s*$/m, /\bself\b/],
};

/** Devuelve la clave del lenguaje más probable, o null si no hay señal suficiente. */
export function detectLanguage(code) {
  const text = (code || '').trim();
  if (!text) return null;
  if (/^\s*[\[{]/.test(text)) {
    try { JSON.parse(text); return 'json'; } catch { /* sigue puntuando */ }
  }
  let best = null;
  let bestScore = 0;
  const scores = {};
  for (const [lang, patterns] of Object.entries(RULES)) {
    if (lang === 'json') continue;
    const score = patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    scores[lang] = score;
    if (score > bestScore) { best = lang; bestScore = score; }
  }
  // TypeScript es superconjunto de JavaScript: con dos señales propias de TS gana sobre JS
  if (best === 'javascript' && scores.typescript >= 2) best = 'typescript';
  return bestScore >= 1 ? best : null;
}

export const LANG_LABELS = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', sql: 'SQL', dax: 'DAX',
  java: 'Java', csharp: 'C#', php: 'PHP', json: 'JSON', yaml: 'YAML',
};

export const LANG_EXT = {
  python: 'py', javascript: 'js', typescript: 'ts', sql: 'sql', dax: 'dax',
  java: 'java', csharp: 'cs', php: 'php', json: 'json', yaml: 'yaml',
};
