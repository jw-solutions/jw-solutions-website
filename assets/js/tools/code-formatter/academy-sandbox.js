// Sandbox client-side aislado para Code Formatter Academy.
// Regla de seguridad: <iframe sandbox="allow-scripts"> SIN allow-same-origin (origen opaco),
// validación estricta de event.source === iframe.contentWindow y timeout de 3000 ms.

export const SANDBOX_TIMEOUT_MS = 3000;
export const WASM_LOAD_TIMEOUT_MS = 20000;
export const SANDBOX_SCRIPT_HASH = 'sha256-Z1aBCwyXShlE5F7N38UURJVHkraCKwMxuIWYw8u+/mI=';
export const SQLJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
export const SQLJS_SRI = 'sha512-+6Q7hv5pGUBXOuHWw8OdQx3ac7DzM3oJhYqz7SHDku0yl9EBdMqegoPed4GsHRoNF/VQYK2LTYewAIEBrEf/3w==';
const SQLJS_CACHE = 'cf-sqljs-v1';
const PYODIDE_CACHE = 'cf-pyodide-v1';
export const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';

let sqlPromise = null;
let pyodidePromise = null;

export function resetWasmLoaders() {
  sqlPromise = null;
  pyodidePromise = null;
}

/**
 * Script puente 100% estático para <iframe sandbox="allow-scripts"> (hash SHA-256 fijo en CSP).
 * Recibe { reqId, workerCode, timeoutMs } vía postMessage sin interpolación inline ni eval/new Function.
 */
export const SANDBOX_IFRAME_SCRIPT = [
  "window.addEventListener('message', function(ev) {",
  "  var d = ev && ev.data;",
  "  if (!d || typeof d.reqId !== 'string' || typeof d.workerCode !== 'string') return;",
  "  var reqId = d.reqId;",
  "  var ms = Number(d.timeoutMs) > 0 ? Number(d.timeoutMs) : 3000;",
  "  var blob = new Blob([d.workerCode], { type: 'application/javascript' });",
  "  var url = URL.createObjectURL(blob);",
  "  var w = new Worker(url);",
  "  var done = false;",
  "  var timer = setTimeout(function() {",
  "    if (done) return;",
  "    done = true;",
  "    w.terminate();",
  "    URL.revokeObjectURL(url);",
  "    parent.postMessage({ reqId: reqId, ok: false, error: 'Timeout (' + ms + 'ms)', results: [] }, '*');",
  "  }, ms);",
  "  w.onmessage = function(wev) {",
  "    if (done) return;",
  "    done = true;",
  "    clearTimeout(timer);",
  "    w.terminate();",
  "    URL.revokeObjectURL(url);",
  "    var out = wev && wev.data ? wev.data : {};",
  "    parent.postMessage({ reqId: reqId, ok: Boolean(out.ok), error: out.error || null, results: out.results || [] }, '*');",
  "  };",
  "  w.onerror = function(werr) {",
  "    if (done) return;",
  "    done = true;",
  "    clearTimeout(timer);",
  "    w.terminate();",
  "    URL.revokeObjectURL(url);",
  "    parent.postMessage({ reqId: reqId, ok: false, error: (werr && werr.message) || 'Worker error', results: [] }, '*');",
  "  };",
  "});",
].join('\n');

/**
 * Genera el código fuente del Web Worker aislado de forma directa (compatible con CSP worker-src blob:).
 */
export function buildIsolatedWorkerSource(code, tests = []) {
  const cleaned = String(code || '').replace(/^\s*export\s+/gm, '');
  const safeTests = Array.isArray(tests) ? tests : [];
  const entries = safeTests.map((t) => {
    const idLit = JSON.stringify(String(t?.id ?? ''));
    const nameLit = JSON.stringify(String(t?.name ?? ''));
    if (t?.type === 'eval') {
      const expr = String(t.input || 'undefined');
      const expLit = JSON.stringify(t.expected);
      return `{ id: ${idLit}, name: ${nameLit}, run: function() { const actual = (${expr}); return { ok: actual === ${expLit}, actual: actual }; } }`;
    }
    return `{ id: ${idLit}, name: ${nameLit}, run: function() { return { ok: true }; } }`;
  }).join(',\n');

  return `'use strict';
(function() {
  const results = [];
  try {
${cleaned}
    const __specs = [${entries}];
    for (let i = 0; i < __specs.length; i += 1) {
      const sp = __specs[i];
      try {
        const r = sp.run();
        results.push({ id: sp.id, name: sp.name, ok: Boolean(r && r.ok), error: null });
      } catch (e) {
        results.push({ id: sp.id, name: sp.name, ok: false, error: e && e.message ? e.message : 'Error' });
      }
    }
    self.postMessage({ ok: true, results: results });
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : 'SyntaxError', results: results });
  }
})();`;
}

/**
 * Ejecuta código JS en un <iframe sandbox="allow-scripts"> (sin allow-same-origin) + Web Worker interno.
 */
export function runInIsolatedIframe(code, tests = [], timeoutMs = SANDBOX_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ ok: false, error: 'DOM unavailable', results: [] });
      return;
    }

    const reqId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.display = 'none';

    const workerCode = buildIsolatedWorkerSource(code, tests);
    const srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${SANDBOX_IFRAME_SCRIPT}</script></body></html>`;

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(outerTimer);
      iframe.remove();
    };

    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || event.data.reqId !== reqId) return;
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        ok: Boolean(event.data.ok),
        error: event.data.error || null,
        results: Array.isArray(event.data.results) ? event.data.results : [],
      });
    };

    const outerTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: false, error: `Timeout (${timeoutMs}ms)`, results: [] });
    }, timeoutMs + 150);

    window.addEventListener('message', onMessage);
    iframe.srcdoc = srcdoc;
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ reqId, workerCode, timeoutMs: Number(timeoutMs) || SANDBOX_TIMEOUT_MS }, '*');
    });
    document.body.appendChild(iframe);
  });
}

/** Carga diferida de sql.js (WASM) con SRI verificado, caché en navegador y limpieza ante fallo (0 RAM VPS). */
export async function ensureSqlJs() {
  if (typeof window === 'undefined') return null;
  const wasmBase = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  if (window.initSqlJs) return window.initSqlJs({ locateFile: (f) => `${wasmBase}${f}` });
  if (!sqlPromise) {
    sqlPromise = (async () => {
      if ('caches' in window) {
        try {
          const cache = await caches.open(SQLJS_CACHE);
          const cached = await cache.match(SQLJS_CDN);
          if (!cached) await cache.add(SQLJS_CDN).catch(() => {});
        } catch { /* Cache API opcional */ }
      }
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SQLJS_CDN;
        s.integrity = SQLJS_SRI;
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load sql.js'));
        document.head.appendChild(s);
      });
      if (!window.initSqlJs) throw new Error('sql.js unavailable');
      return window.initSqlJs({ locateFile: (f) => `${wasmBase}${f}` });
    })().catch((err) => {
      sqlPromise = null;
      throw err;
    });
  }
  return sqlPromise;
}

/** Lazy-load de Pyodide (WASM) con cacheo en Cache API y limpieza ante fallo de red. */
export async function ensurePyodide() {
  if (typeof window === 'undefined') return null;
  if (window.loadPyodide) return window.loadPyodide({ indexURL: PYODIDE_INDEX });
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const scriptUrl = `${PYODIDE_INDEX}pyodide.js`;
      if ('caches' in window) {
        try {
          const cache = await caches.open(PYODIDE_CACHE);
          const cached = await cache.match(scriptUrl);
          if (!cached) {
            await cache.add(scriptUrl).catch(() => {});
          }
        } catch { /* Cache API opcional */ }
      }
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = scriptUrl;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load Pyodide'));
        document.head.appendChild(s);
      });
      if (!window.loadPyodide) throw new Error('Pyodide unavailable');
      return window.loadPyodide({ indexURL: PYODIDE_INDEX });
    })().catch((err) => {
      pyodidePromise = null;
      throw err;
    });
  }
  return pyodidePromise;
}

/** Mapa determinista de reglas de estilo → clave i18n y mensaje de respaldo. */
export const STYLE_RULE_SPECS = {
  pep8_indent_4: {
    key: 'acadStyleIndent4',
    fallback: 'Use 4 spaces instead of tabs (PEP 8).',
    check: (src) => !/\t/.test(src),
  },
  indent_4: {
    key: 'acadStyleIndent4',
    fallback: 'Use 4-space indentation without tabs.',
    check: (src) => !/\t/.test(src),
  },
  indent_2: {
    key: 'acadStyleIndent2',
    fallback: 'Use consistent 2-space indentation without tabs.',
    check: (src) => !/\t/.test(src) && src.split('\n').some((l) => /^ {2}\S/.test(l)),
  },
  consistent_indent: {
    key: 'acadStyleConsistentIndent',
    fallback: 'Keep indentation consistent using spaces (no tabs).',
    check: (src) => !/\t/.test(src),
  },
  no_tabs: {
    key: 'acadStyleNoTabs',
    fallback: 'Tabs are forbidden; use spaces instead.',
    check: (src) => !/\t/.test(src),
  },
  docstring_pep257: {
    key: 'acadStyleDocstringPep257',
    fallback: 'Add a PEP 257 docstring ("""...""").',
    check: (src) => src.includes('"""') || src.includes("'''"),
  },
  docstring: {
    key: 'acadStyleDocstringPep257',
    fallback: 'Add a PEP 257 docstring ("""...""").',
    check: (src) => src.includes('"""') || src.includes("'''"),
  },
  type_hints: {
    key: 'acadStyleTypeHints',
    fallback: 'Add explicit return type annotation (->).',
    check: (src) => /->\s*[\w[\]|.,\s]+:/.test(src),
  },
  empty_guard: {
    key: 'acadStyleEmptyGuard',
    fallback: 'Guard against empty collections before processing.',
    check: (src) => /\bif\s+not\s+\w+/.test(src) || /len\s*\([^)]+\)\s*==\s*0/.test(src),
  },
  uppercase_keywords: {
    key: 'acadStyleSqlUppercase',
    fallback: 'Write SQL keywords (SELECT, FROM, WHERE) in uppercase.',
    check: (src) => /\bSELECT\b/.test(src) && /\bFROM\b/.test(src) && !/^\s*(select|from|where)\b/m.test(src),
  },
  multiline_select: {
    key: 'acadStyleMultilineSelect',
    fallback: 'Format SELECT clauses across multiple readable lines.',
    check: (src) => /\bSELECT\b/.test(src) && src.trim().split('\n').length >= 3,
  },
  header_comment: {
    key: 'acadStyleHeaderComment',
    fallback: 'Start with a descriptive header comment.',
    check: (src, tech) => {
      if (tech === 'yaml') return /^\s*#\s*\S+/m.test(src);
      if (tech === 'sql' || tech === 'dax') return /^\s*(--|\/\/|\/\*)\s*\S+/m.test(src);
      return /^\s*(#|\/\/|\/\*|--)\s*\S+/m.test(src);
    },
  },
  explicit_alias_as: {
    key: 'acadStyleExplicitAliasAs',
    fallback: 'Use explicit AS aliases for aggregated columns or tables.',
    check: (src) => /\bAS\s+[A-Za-z_]\w*/.test(src),
  },
  var_return: {
    key: 'acadStyleVarReturn',
    fallback: 'Structure the DAX measure with VAR and RETURN.',
    check: (src) => /\bVAR\b/i.test(src) && /\bRETURN\b/i.test(src),
  },
  coalesce_blank: {
    key: 'acadStyleCoalesceBlank',
    fallback: 'Handle BLANK values using COALESCE or ISBLANK.',
    check: (src) => /\b(COALESCE|ISBLANK)\s*\(/i.test(src),
  },
  safe_divide: {
    key: 'acadStyleSafeDivide',
    fallback: 'Use DIVIDE(..., 0) instead of raw `/` division.',
    check: (src) => /\bDIVIDE\s*\(/i.test(src),
  },
  rfc8259_valid: {
    key: 'acadStyleJsonValid',
    fallback: 'Output must be valid RFC 8259 JSON.',
    check: (src) => {
      try { JSON.parse(src); return true; } catch { return false; }
    },
  },
  double_quotes: {
    key: 'acadStyleDoubleQuotes',
    fallback: 'Use double quotes (") for all JSON keys and strings.',
    check: (src) => src.includes('"') && !/'[^']*'\s*:/.test(src),
  },
  no_trailing_comma: {
    key: 'acadStyleNoTrailingComma',
    fallback: 'Remove trailing commas before `}` or `]`.',
    check: (src) => !/,\s*[}\]]/.test(src),
  },
  jsdoc: {
    key: 'acadStyleJsdoc',
    fallback: 'Include a JSDoc comment block (/** ... */).',
    check: (src) => src.includes('/**'),
  },
  tsdoc: {
    key: 'acadStyleTsdoc',
    fallback: 'Include a TSDoc comment block (/** ... */).',
    check: (src) => src.includes('/**'),
  },
  semicolons: {
    key: 'acadStyleSemicolons',
    fallback: 'Terminate statements with semicolons (;).',
    check: (src) => /;/.test(src),
  },
  optional_chaining: {
    key: 'acadStyleOptionalChaining',
    fallback: 'Use optional chaining (?.) for nullable property access.',
    check: (src) => src.includes('?.'),
  },
  nullish_coalescing: {
    key: 'acadStyleNullishCoalescing',
    fallback: 'Use nullish coalescing (??) for fallback values.',
    check: (src) => src.includes('??'),
  },
  no_explicit_any: {
    key: 'acadStyleNoExplicitAny',
    fallback: 'Avoid explicit `any`; prefer strict types or `unknown`.',
    check: (src) => !/:\s*any\b/.test(src),
  },
  return_type: {
    key: 'acadStyleReturnType',
    fallback: 'Declare an explicit function return type.',
    check: (src) => /\)\s*:\s*[\w<>[\]| ]+/.test(src),
  },
  type_guard: {
    key: 'acadStyleTypeGuard',
    fallback: 'Use a TypeScript type predicate (`param is Type`).',
    check: (src) => /\bis\s+[A-Z]\w*/.test(src),
  },
  javadoc: {
    key: 'acadStyleJavadoc',
    fallback: 'Include a Javadoc comment block (/** ... */).',
    check: (src) => src.includes('/**'),
  },
  overflow_safe: {
    key: 'acadStyleOverflowSafe',
    fallback: 'Guard against integer overflow (e.g. Math.addExact).',
    check: (src) => /Math\.(addExact|multiplyExact|subtractExact)|\blong\b/.test(src),
  },
  java_record: {
    key: 'acadStyleJavaRecord',
    fallback: 'Use a Java `record` for immutable data carriers.',
    check: (src) => /\brecord\s+[A-Z]\w*\s*\(/.test(src),
  },
  null_guard: {
    key: 'acadStyleNullGuard',
    fallback: 'Add explicit null/empty input validation.',
    check: (src) => /Objects\.requireNonNull|ArgumentNullException|ThrowIfNull|IsNullOrWhiteSpace|IsNullOrEmpty|!=\s*null|==\s*null|\?\?/.test(src),
  },
  xml_docs: {
    key: 'acadStyleXmlDocs',
    fallback: 'Include C# XML Docs (/// <summary>).',
    check: (src) => src.includes('/// <summary>'),
  },
  allman_braces: {
    key: 'acadStyleAllmanBraces',
    fallback: 'Place opening braces on a new line (Allman style).',
    check: (src) => /\n\s*\{/.test(src),
  },
  primary_constructor: {
    key: 'acadStylePrimaryConstructor',
    fallback: 'Use C# 12 primary constructor syntax.',
    check: (src) => /\bclass\s+[A-Z]\w*\s*\([^)]+\)/.test(src),
  },
  strict_types: {
    key: 'acadStyleStrictTypes',
    fallback: 'Declare `declare(strict_types=1);` at the top.',
    check: (src) => src.includes('declare(strict_types=1);'),
  },
  psr12_braces: {
    key: 'acadStylePsr12Braces',
    fallback: 'Place class/function opening braces on a new line (PSR-12).',
    check: (src) => /\n\s*\{/.test(src),
  },
  type_declarations: {
    key: 'acadStyleTypeDeclarations',
    fallback: 'Add explicit parameter and return type declarations.',
    check: (src) => /function\s+\w+\s*\([^)]*:\s*|\)\s*:\s*\??\w+/.test(src),
  },
  php83_enum: {
    key: 'acadStylePhp83Enum',
    fallback: 'Use a PHP 8.1+ backed `enum` instead of magic strings.',
    check: (src) => /\benum\s+[A-Z]\w*\s*:\s*(string|int)/.test(src),
  },
  readonly_property: {
    key: 'acadStyleReadonlyProperty',
    fallback: 'Mark immutable promoted properties as `readonly`.',
    check: (src) => /\breadonly\b/.test(src),
  },
  list_dashes: {
    key: 'acadStyleListDashes',
    fallback: 'Format YAML sequence items using block dashes (`- item`).',
    check: (src) => /^\s*-\s+\S+/m.test(src),
  },
};

function resolveStyleMessage(spec, translate) {
  if (typeof translate === 'function') {
    const translated = translate(spec.key);
    if (translated && translated !== spec.key) return translated;
  }
  return spec.fallback;
}

/** Valida reglas deterministas de estilo/AST ligero por lenguaje con mensajes localizables. */
export function evaluateStyleRules(tech, code, rules = [], translate = null) {
  const src = String(code || '');
  const violations = [];
  const violationKeys = [];

  for (const rule of rules) {
    const spec = STYLE_RULE_SPECS[rule];
    if (!spec) continue;
    if (!spec.check(src, tech)) {
      violationKeys.push({ rule, key: spec.key });
      violations.push(resolveStyleMessage(spec, translate));
    }
  }

  return { ok: violations.length === 0, violations, violationKeys };
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms)`)), timeoutMs);
    Promise.resolve(promise).then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Ejecuta pruebas `sql_eval` en cliente con sql.js (WASM) bajo demanda y timeouts separados (carga WASM vs ejecución). */
export async function runSqlEvalTests(code, tests = [], timeoutMs = SANDBOX_TIMEOUT_MS, loader = ensureSqlJs, loadTimeoutMs = WASM_LOAD_TIMEOUT_MS) {
  const results = [];
  let runtimeError = null;
  try {
    const SQL = await withTimeout(loader(), loadTimeoutMs);
    if (!SQL || typeof SQL.Database !== 'function') {
      return { ok: false, error: 'sql.js unavailable', results };
    }
    for (const t of tests) {
      const db = new SQL.Database();
      try {
        if (t.setup_sql) db.run(String(t.setup_sql));
        const res = await withTimeout(Promise.resolve().then(() => db.exec(String(code || ''))), timeoutMs);
        const rows = res?.[0]?.values || [];
        const ok = Array.isArray(t.expected)
          ? JSON.stringify(rows) === JSON.stringify(t.expected)
          : rows.length >= Number(t.expected || 1);
        results.push({ id: t.id, name: t.name, visible: t.visible, ok });
      } catch (err) {
        runtimeError = err?.message || 'SQL execution error';
        results.push({ id: t.id, name: t.name, visible: t.visible, ok: false, error: runtimeError });
      } finally {
        db.close();
      }
    }
  } catch (err) {
    runtimeError = err?.message || 'sql.js load error';
  }
  return { ok: !runtimeError && results.every((r) => r.ok), error: runtimeError, results };
}

/** Ejecuta pruebas `py_eval` en cliente con Pyodide (WASM) bajo demanda y timeouts separados (carga WASM vs ejecución). */
export async function runPythonEvalTests(code, tests = [], timeoutMs = SANDBOX_TIMEOUT_MS, loader = ensurePyodide, loadTimeoutMs = WASM_LOAD_TIMEOUT_MS) {
  const results = [];
  let runtimeError = null;
  try {
    const pyodide = await withTimeout(loader(), loadTimeoutMs);
    if (!pyodide || typeof pyodide.runPythonAsync !== 'function') {
      return { ok: false, error: 'Pyodide unavailable', results };
    }
    const globals = typeof pyodide.toPy === 'function' ? pyodide.toPy({}) : undefined;
    try {
      await withTimeout(pyodide.runPythonAsync(String(code || ''), globals ? { globals } : undefined), timeoutMs);
      for (const t of tests) {
        try {
          const raw = await withTimeout(pyodide.runPythonAsync(String(t.input || ''), globals ? { globals } : undefined), timeoutMs);
          const actual = raw && typeof raw.toJs === 'function' ? raw.toJs() : raw;
          const ok = JSON.stringify(actual) === JSON.stringify(t.expected);
          results.push({ id: t.id, name: t.name, visible: t.visible, ok });
        } catch (err) {
          runtimeError = err?.message || 'Python test error';
          results.push({ id: t.id, name: t.name, visible: t.visible, ok: false, error: runtimeError });
        }
      }
    } finally {
      if (globals && typeof globals.destroy === 'function') globals.destroy();
    }
  } catch (err) {
    runtimeError = err?.message || 'Pyodide load error';
  }
  return { ok: !runtimeError && results.every((r) => r.ok), error: runtimeError, results };
}

/**
 * Evalúa un reto completo en el navegador (sandbox iframe + WASM bajo demanda + validadores deterministas).
 * @returns {Promise<{passed: boolean, errorType: string|null, results: Array, styleViolations: Array, styleViolationKeys: Array}>}
 */
export async function evaluateChallenge(tech, code, level, { translate = null, sqlLoader = ensureSqlJs, pyLoader = ensurePyodide } = {}) {
  const tests = level?.tests || [];
  const styleRules = level?.style_rules || [];
  const results = [];
  let runtimeError = null;

  const evalTests = tests.filter((t) => t.type === 'eval');
  if (evalTests.length > 0 && (tech === 'javascript' || tech === 'typescript')) {
    const sbRes = await runInIsolatedIframe(code, evalTests, SANDBOX_TIMEOUT_MS);
    if (!sbRes.ok && sbRes.error) runtimeError = sbRes.error;
    for (const r of sbRes.results) results.push(r);
  }

  const sqlEvalTests = tests.filter((t) => t.type === 'sql_eval');
  if (sqlEvalTests.length > 0 && tech === 'sql') {
    const sqlRes = await runSqlEvalTests(code, sqlEvalTests, SANDBOX_TIMEOUT_MS, sqlLoader);
    if (!sqlRes.ok && sqlRes.error) runtimeError = sqlRes.error;
    for (const r of sqlRes.results) results.push(r);
  }

  const pyEvalTests = tests.filter((t) => t.type === 'py_eval');
  if (pyEvalTests.length > 0 && tech === 'python') {
    const pyRes = await runPythonEvalTests(code, pyEvalTests, SANDBOX_TIMEOUT_MS, pyLoader);
    if (!pyRes.ok && pyRes.error) runtimeError = pyRes.error;
    for (const r of pyRes.results) results.push(r);
  }

  for (const t of tests) {
    if (t.type === 'eval' || t.type === 'sql_eval' || t.type === 'py_eval') continue;
    if (t.type === 'pattern') {
      results.push({ id: t.id, name: t.name, visible: t.visible, ok: code.includes(t.expected) });
    } else if (t.type === 'pattern_absent') {
      results.push({ id: t.id, name: t.name, visible: t.visible, ok: !code.includes(t.expected) });
    } else if (t.type === 'json_valid') {
      let valid = false;
      try { JSON.parse(code); valid = true; } catch { valid = false; }
      results.push({ id: t.id, name: t.name, visible: t.visible, ok: valid });
    }
  }

  const styleRes = evaluateStyleRules(tech, code, styleRules, translate);
  const allTestsOk = !runtimeError && results.length > 0 && results.every((r) => r.ok);
  const passed = allTestsOk && styleRes.ok;

  let errorType = null;
  if (!passed) {
    if (runtimeError || (tech === 'json' && !styleRes.ok)) {
      errorType = 'syntax';
    } else if (!allTestsOk) {
      errorType = 'edge_case';
    } else {
      errorType = 'style_doc';
    }
  }

  return {
    passed,
    errorType,
    runtimeError,
    results,
    styleViolations: styleRes.violations,
    styleViolationKeys: styleRes.violationKeys,
  };
}
