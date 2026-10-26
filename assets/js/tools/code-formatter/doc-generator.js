// Generador determinista de plantillas de documentación (docstring / JSDoc) en el idioma elegido.
// Soporta Python y JavaScript/TypeScript. Idempotente: no duplica documentación existente.
import { DOC_LANGUAGES, DEFAULT_DOC_LANGUAGE } from '../../../../config/documentation-languages.js';

const cleanParams = (raw) =>
  raw.split(',')
    .map((p) => p.trim().replace(/^\*{1,2}/, '').replace(/[:=].*$/, '').replace(/\?$/, '').trim())
    .filter((p) => p && !['self', 'cls'].includes(p));

function pythonDoc(indent, name, params, t, level) {
  const i = `${indent}    `;
  if (level === 'basic') return [`${i}"""${t.summary}."""`];
  const out = [`${i}"""${t.summary}.`, ''];
  if (params.length) {
    out.push(`${i}${t.params}:`);
    params.forEach((p) => out.push(`${i}    ${p}: ${t.param}.`));
    out.push('');
  }
  out.push(`${i}${t.returns}:`, `${i}    ${t.returnsText}.`, `${i}"""`);
  return out;
}

function jsDoc(indent, params, t, level) {
  if (level === 'basic') return [`${indent}/** ${t.summary}. */`];
  const out = [`${indent}/**`, `${indent} * ${t.summary}.`];
  params.forEach((p) => out.push(`${indent} * @param ${p} ${t.param}.`));
  out.push(`${indent} * @returns ${t.returnsText}.`, `${indent} */`);
  return out;
}

/** Devuelve { code, count }. Para lenguajes no soportados devuelve el código sin cambios. */
export function addDocs(code, lang, docLang = DEFAULT_DOC_LANGUAGE, level = 'basic') {
  const t = DOC_LANGUAGES[docLang] || DOC_LANGUAGES[DEFAULT_DOC_LANGUAGE];
  const lines = code.split('\n');
  const out = [];
  let count = 0;

  if (lang === 'python') {
    const re = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)[^:]*:\s*$/;
    for (let n = 0; n < lines.length; n++) {
      out.push(lines[n]);
      const m = lines[n].match(re);
      if (!m) continue;
      if (/^\s*[rRuU]?("""|''')/.test(lines[n + 1] || '')) continue; // ya documentada
      out.push(...pythonDoc(m[1], m[2], cleanParams(m[3]), t, level));
      count++;
    }
  } else if (lang === 'javascript' || lang === 'typescript') {
    const re = /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*(\w+)\s*\(([^)]*)\)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::[^=]+)?=>)/;
    for (let n = 0; n < lines.length; n++) {
      const m = lines[n].match(re);
      if (m && !/\*\/\s*$/.test(out[out.length - 1] || '')) {
        out.push(...jsDoc(m[1], cleanParams(m[3] ?? m[5] ?? ''), t, level));
        count++;
      }
      out.push(lines[n]);
    }
  } else {
    return { code, count: 0 };
  }
  return { code: out.join('\n'), count };
}

export const DOC_SUPPORTED = new Set(['python', 'javascript', 'typescript']);
