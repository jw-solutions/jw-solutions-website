// Diagnóstico sintáctico liviano (sin dependencias, sin DOM) y autocorrección por reglas.
// diagnose(code, lang) → { line, type, ch?, fixable } | null. Prioriza NO dar falsos positivos sobre detectarlo todo.
// autoFix(code, lang) → { code, count, types } | null (aplica correcciones deterministas hasta converger).

const PAIRS = { ')': '(', ']': '[', '}': '{' };
const OPEN = { '(': ')', '[': ']', '{': '}' };

/** Lenguajes con LÍNEA ÚNICA para cadenas ' y " (una comilla sin cerrar al final de línea es error). */
const SINGLE_LINE_STRINGS = new Set(['javascript', 'typescript', 'java', 'csharp', 'python']);
const BRACKET_LANGS = new Set(['javascript', 'typescript', 'java', 'csharp', 'php', 'python', 'sql', 'dax']);

const lineOf = (text, idx) => { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; };

/** Recorre el código ignorando cadenas y comentarios. Devuelve el primer problema de llaves/comillas. */
function scanBrackets(code, lang) {
  const stack = []; // { ch, idx } | { tpl: true }
  const n = code.length;
  const hashComment = lang === 'python' || lang === 'php';
  const slashComment = lang !== 'python' && lang !== 'sql';
  const dashComment = lang === 'sql' || lang === 'dax';
  const regexOk = lang === 'javascript' || lang === 'typescript';
  let prevSig = ''; // último carácter significativo (para distinguir regex de división)
  let i = 0;

  const skipQuoted = (q, verbatim) => { // devuelve índice tras la comilla de cierre o -1 si no cierra en la línea/archivo
    let j = i + 1;
    while (j < n) {
      const c = code[j];
      if (!verbatim && c === '\\') { j += 2; continue; }
      if (verbatim && c === q && code[j + 1] === q) { j += 2; continue; }
      if (c === q) return j + 1;
      if (c === '\n' && SINGLE_LINE_STRINGS.has(lang) && !verbatim) return -1;
      j++;
    }
    return -2; // sin cierre hasta el final del archivo
  };

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (hashComment && c === '#') { while (i < n && code[i] !== '\n') i++; continue; }
    if (slashComment && c === '/' && next === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (dashComment && c === '-' && next === '-') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*' && lang !== 'python') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) return { type: 'unclosed_comment', idx: i };
      i = end + 2; continue;
    }
    if (lang === 'python' && (c === '"' || c === "'") && code.startsWith(c.repeat(3), i)) { // triple comilla
      const end = code.indexOf(c.repeat(3), i + 3);
      if (end === -1) return { type: 'unclosed_string', idx: i };
      i = end + 3; prevSig = c; continue;
    }
    if (lang === 'java' || lang === 'csharp') {
      if (c === '"' && code.startsWith('"""', i)) { const end = code.indexOf('"""', i + 3); if (end === -1) return { type: 'unclosed_string', idx: i }; i = end + 3; prevSig = '"'; continue; }
    }
    if (c === '`' && (regexOk || lang === 'sql')) {
      if (lang === 'sql') { const end = code.indexOf('`', i + 1); if (end === -1) return { type: 'unclosed_string', idx: i }; i = end + 1; continue; }
      // plantilla JS: se interrumpe en ${ ... } con una marca en la pila
      let j = i + 1; let closed = false;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '`') { closed = true; break; }
        if (code[j] === '$' && code[j + 1] === '{') { stack.push({ tpl: true, idx: j }); i = j + 2; closed = null; break; }
        j++;
      }
      if (closed === null) { prevSig = '{'; continue; }
      if (!closed) return { type: 'unclosed_string', idx: i };
      i = j + 1; prevSig = '`'; continue;
    }
    if (c === '"' || c === "'") {
      if (lang === 'dax' && c === "'") { /* nombre de tabla entre comillas simples */ }
      const verbatim = lang === 'csharp' && code[i - 1] === '@';
      // En SQL/DAX/PHP las comillas pueden abarcar líneas: solo se reporta si no cierra en todo el archivo
      const end = skipQuoted(c, verbatim);
      if (end < 0) {
        if (end === -1 && SINGLE_LINE_STRINGS.has(lang)) return { type: 'unclosed_string', idx: i, eol: true };
        return { type: 'unclosed_string', idx: i };
      }
      i = end; prevSig = c; continue;
    }
    if (regexOk && c === '/' && (prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig))) { // literal regex
      let j = i + 1; let inClass = false;
      while (j < n && code[j] !== '\n') {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '[') inClass = true; else if (code[j] === ']') inClass = false;
        else if (code[j] === '/' && !inClass) break;
        j++;
      }
      if (code[j] === '/') { i = j + 1; prevSig = '/'; continue; }
    }
    if (OPEN[c] && !(lang === 'dax' && c === '{' && false)) { stack.push({ ch: c, idx: i }); prevSig = c; i++; continue; }
    if (PAIRS[c]) {
      const top = stack[stack.length - 1];
      if (c === '}' && top && top.tpl) { // fin de ${...}: se reanuda la plantilla
        stack.pop();
        let j = i + 1;
        while (j < n && code[j] !== '`') { if (code[j] === '\\') j++; if (code[j] === '$' && code[j + 1] === '{') break; j++; }
        if (code[j] === '$') { stack.push({ tpl: true, idx: j }); i = j + 2; prevSig = '{'; continue; }
        if (j >= n) return { type: 'unclosed_string', idx: top.idx };
        i = j + 1; prevSig = '`'; continue;
      }
      if (!top) return { type: 'unexpected_closer', idx: i, ch: c };
      if (top.ch !== PAIRS[c]) return { type: 'mismatched', idx: i, ch: c, expected: OPEN[top.ch] };
      stack.pop(); prevSig = c; i++; continue;
    }
    prevSig = c; i++;
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    return { type: 'unclosed_bracket', idx: top.idx, ch: top.ch || '{', closers: stack.slice().reverse().map((s) => OPEN[s.ch] || '}').join('') };
  }
  return null;
}

/** Pasada por líneas lógicas de Python (ignora continuaciones por llaves, triples comillas y '\'). */
function pythonLines(code) {
  const lines = code.split('\n');
  const info = []; // { no, indent, ws, text, endsColon, logical }
  let depth = 0; let triple = null; let continued = false;
  lines.forEach((raw, k) => {
    const line = raw.replace(/\r$/, '');
    const startedInTriple = triple !== null;
    const startedDepth = depth;
    const wasContinued = continued;
    let endsColon = false; let lastSig = '';
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (triple) { if (line.startsWith(triple, i)) { i += 2; triple = null; } continue; }
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '#') break;
      if (c === '"' || c === "'") { if (line.startsWith(c.repeat(3), i)) { triple = c.repeat(3); i += 2; } else q = c; lastSig = c; continue; }
      if (OPEN[c]) depth++; else if (PAIRS[c]) depth = Math.max(0, depth - 1);
      if (c !== ' ' && c !== '\t') lastSig = c;
    }
    continued = !triple && !q && /\\\s*$/.test(line.replace(/#.*$/, ''));
    endsColon = !triple && depth === 0 && lastSig === ':';
    const ws = (line.match(/^[ \t]*/) || [''])[0];
    const text = line.slice(ws.length);
    const blank = !text || text.startsWith('#');
    info.push({ no: k + 1, ws, text, endsColon, logical: !startedInTriple && startedDepth === 0 && !wasContinued && !blank });
  });
  return info;
}

const width = (ws) => ws.replace(/\t/g, '    ').length;

function diagnosePython(code) {
  const info = pythonLines(code).filter((l) => l.logical);
  const stack = [0];
  let prev = null;
  for (const l of info) {
    if (/\t/.test(l.ws) && / /.test(l.ws)) return { line: l.no, type: 'mixed_indent', fixable: true };
    const w = width(l.ws);
    if (prev && prev.endsColon) {
      if (w <= prev.w) return { line: l.no, type: 'expected_indent', fixable: true };
      stack.push(w);
    } else if (w > stack[stack.length - 1]) {
      return { line: l.no, type: 'unexpected_indent', fixable: true };
    } else if (w < stack[stack.length - 1]) {
      while (stack.length > 1 && stack[stack.length - 1] > w) stack.pop();
      if (stack[stack.length - 1] !== w) return { line: l.no, type: 'inconsistent_dedent', fixable: true };
    }
    prev = { ...l, w };
  }
  if (prev && prev.endsColon && !/^(else|elif|except|finally)\b/.test(prev.text) ) return { line: prev.no, type: 'expected_indent', fixable: false };
  return null;
}

function diagnoseYaml(code) {
  const lines = code.split('\n');
  const stack = [0];
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k].replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const ws = (line.match(/^[ \t]*/) || [''])[0];
    if (ws.includes('\t')) return { line: k + 1, type: 'tab_indent', fixable: true };
    const w = ws.length;
    if (/^\s*(\||>)/.test(line) || /^[ ]*-?\s*[|>][+-]?\s*$/.test(line)) continue;
    if (w > stack[stack.length - 1]) { stack.push(w); continue; }
    while (stack.length > 1 && stack[stack.length - 1] > w) stack.pop();
    if (stack[stack.length - 1] !== w) return { line: k + 1, type: 'inconsistent_dedent', fixable: true };
  }
  return null;
}

function diagnoseJson(code) {
  try { JSON.parse(code); return null; } catch (err) {
    const msg = String(err.message || '');
    const pos = msg.match(/position (\d+)/);
    const lc = msg.match(/line (\d+)/);
    const line = lc ? Number(lc[1]) : pos ? lineOf(code, Number(pos[1])) : 1;
    return { line, type: 'json_invalid', fixable: Boolean(repairJson(code)) };
  }
}

/** Reparación conservadora de JSON: comentarios, comas finales, comillas simples y claves sin comillas. */
function repairJson(code) {
  let out = ''; let i = 0; const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'") {
      let j = i + 1; let body = '';
      while (j < n && code[j] !== c) { if (code[j] === '\\') { body += code[j] + (code[j + 1] || ''); j += 2; } else { body += code[j] === '"' ? '\\"' : code[j]; j++; } }
      if (j >= n) return null;
      out += `"${c === "'" ? body.replace(/\\'/g, "'") : code.slice(i + 1, j)}"`; i = j + 1; continue;
    }
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); if (e === -1) return null; i = e + 2; continue; }
    if (c === ',') { const m = code.slice(i + 1).match(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*([}\]])/); if (m) { i++; continue; } }
    if (/[A-Za-z_$]/.test(c)) {
      const m = code.slice(i).match(/^[A-Za-z_$][\w$]*/)[0];
      const after = code.slice(i + m.length).match(/^\s*:/);
      if (after && /[{,]\s*$/.test(out)) { out += `"${m}"`; i += m.length; continue; }
      out += m; i += m.length; continue;
    }
    out += c; i++;
  }
  try { JSON.parse(out); return out; } catch { return null; }
}

/** Primer problema sintáctico encontrado o null. `lang` debe ser una clave de lenguaje conocida. */
export function diagnose(code, lang) {
  if (!code || !code.trim() || !lang) return null;
  if (lang === 'json') return diagnoseJson(code);
  if (lang === 'yaml') return diagnoseYaml(code);
  if (lang === 'python') {
    const py = diagnosePython(code);
    const br = scanBrackets(code, lang);
    if (br && (!py || br.type === 'unclosed_string' || br.type === 'unclosed_bracket')) {
      const line = lineOf(code, br.idx);
      if (!py || line <= py.line) return { line, type: br.type, ch: br.ch, fixable: true };
    }
    return py;
  }
  if (!BRACKET_LANGS.has(lang)) return null;
  const br = scanBrackets(code, lang);
  if (!br) return null;
  return { line: lineOf(code, br.idx), type: br.type, ch: br.type === 'mismatched' ? br.expected : br.ch, fixable: br.type !== 'unclosed_comment' };
}

function fixOnce(code, lang, d) {
  const lines = code.split('\n');
  const L = d.line - 1;
  const stripCr = (s) => s.replace(/\r$/, '');
  switch (d.type) {
    case 'tab_indent':
    case 'mixed_indent': {
      const unit = lang === 'yaml' ? '  ' : '    ';
      return lines.map((l) => l.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, unit))).join('\n');
    }
    case 'expected_indent': {
      const info = pythonLines(code).filter((l) => l.logical);
      const idx = info.findIndex((l) => l.no === d.line);
      const header = info.slice(0, Math.max(idx, 0)).reverse().find((l) => l.endsColon) || info[idx - 1];
      const target = (header ? width(header.ws) : 0) + 4;
      if (idx < 0 || d.line > lines.length) return null;
      lines[L] = ' '.repeat(target) + stripCr(lines[L]).trimStart();
      return lines.join('\n');
    }
    case 'unexpected_indent': {
      const info = pythonLines(code).filter((l) => l.logical);
      const idx = info.findIndex((l) => l.no === d.line);
      if (idx < 1) return null;
      lines[L] = info[idx - 1].ws + stripCr(lines[L]).trimStart();
      return lines.join('\n');
    }
    case 'inconsistent_dedent': {
      if (lang === 'yaml') {
        const w = lines[L].match(/^ */)[0].length;
        const lower = lines.slice(0, L).map((l) => (l.trim() && !l.trim().startsWith('#') ? l.match(/^ */)[0].length : null)).filter((x) => x !== null && x < w);
        lines[L] = ' '.repeat(lower.length ? Math.max(...lower) : 0) + lines[L].trimStart();
        return lines.join('\n');
      }
      const info = pythonLines(code).filter((l) => l.logical);
      const idx = info.findIndex((l) => l.no === d.line);
      const w = width(info[idx].ws);
      const outer = [...new Set(info.slice(0, idx).map((l) => width(l.ws)))].filter((x) => x < w);
      lines[L] = ' '.repeat(outer.length ? Math.max(...outer) : 0) + stripCr(lines[L]).trimStart();
      return lines.join('\n');
    }
    case 'unclosed_string': {
      const br = scanBrackets(code, lang);
      if (!br || br.type !== 'unclosed_string') return null;
      const q = code[br.idx];
      if (br.eol) {
        const nl = code.indexOf('\n', br.idx);
        const end = nl === -1 ? code.length : nl;
        const seg = code.slice(br.idx, end).replace(/\r$/, '');
        const tail = (seg.match(/[\s;,)\]}]*$/) || [''])[0];
        const cut = br.idx + seg.length - tail.length;
        return code.slice(0, cut) + q + code.slice(cut);
      }
      return `${code.replace(/\s*$/, '')}${q}\n`;
    }
    case 'unclosed_bracket': {
      const br = scanBrackets(code, lang);
      if (!br || br.type !== 'unclosed_bracket') return null;
      const body = code.replace(/\s*$/, '');
      return `${body}${lang === 'python' ? '' : '\n'}${br.closers}\n`;
    }
    case 'unexpected_closer': {
      const br = scanBrackets(code, lang);
      if (!br || br.type !== 'unexpected_closer') return null;
      return code.slice(0, br.idx) + code.slice(br.idx + 1);
    }
    case 'mismatched': {
      const br = scanBrackets(code, lang);
      if (!br || br.type !== 'mismatched') return null;
      return code.slice(0, br.idx) + br.expected + code.slice(br.idx + 1);
    }
    case 'json_invalid': return repairJson(code);
    default: return null;
  }
}

/** Corrige iterativamente (máx. 25 pasos). Devuelve null si no pudo mejorar nada. */
export function autoFix(code, lang) {
  let cur = code; const types = [];
  for (let step = 0; step < 25; step++) {
    const d = diagnose(cur, lang);
    if (!d) break;
    if (!d.fixable) break;
    const next = fixOnce(cur, lang, d);
    if (next == null || next === cur) break;
    cur = next; types.push(d.type);
    if (lang === 'json') break;
  }
  return cur !== code && types.length ? { code: cur, count: types.length, types, clean: !diagnose(cur, lang) } : null;
}
