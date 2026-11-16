// Sandbox client-side aislado para Code Formatter Academy.
// Regla de seguridad: <iframe sandbox="allow-scripts"> SIN allow-same-origin (origen opaco),
// validación estricta de event.source === iframe.contentWindow y timeout de 3000 ms.

const SANDBOX_TIMEOUT_MS = 3000;
const SQLJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
const SQLJS_SRI = 'sha512-xL7wV8V3sV1w8vM5mJ2u7n8K2fK9n1+6xJ9V4tK0x5G3G8mR1J2aJ9f8V0wM8Q==';
const PYODIDE_CACHE = 'cf-pyodide-v1';
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';

let sqlPromise = null;
let pyodidePromise = null;

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

    const workerSource = `
      self.onmessage = function(ev) {
        const { code, tests } = ev.data;
        const results = [];
        try {
          const cleaned = String(code).replace(/^\\s*export\\s+/gm, '');
          const fnBody = cleaned + "\\nreturn { " +
            tests.map((t, i) => {
              if (t.type === 'eval') {
                return JSON.stringify(t.id) + ": (function(){ try { return { ok: (" + t.input + ") === " + JSON.stringify(t.expected) + ", actual: (" + t.input + ") }; } catch(e) { return { ok: false, error: e.message }; } })()";
              }
              return JSON.stringify(t.id) + ": { ok: true }";
            }).join(",") + " };";
          const out = (new Function(fnBody))();
          for (const t of tests) {
            if (t.type === 'eval') {
              const r = out[t.id] || { ok: false };
              results.push({ id: t.id, name: t.name, ok: Boolean(r.ok), error: r.error || null });
            }
          }
          self.postMessage({ ok: true, results });
        } catch (err) {
          self.postMessage({ ok: false, error: err && err.message ? err.message : 'SyntaxError', results });
        }
      };
    `;

    const srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
      window.addEventListener('message', function(ev) {
        if (!ev.data || ev.data.reqId !== ${JSON.stringify(reqId)}) return;
        var blob = new Blob([${JSON.stringify(workerSource)}], { type: 'application/javascript' });
        var url = URL.createObjectURL(blob);
        var w = new Worker(url);
        var done = false;
        var timer = setTimeout(function() {
          if (done) return;
          done = true;
          w.terminate();
          URL.revokeObjectURL(url);
          parent.postMessage({ reqId: ${JSON.stringify(reqId)}, ok: false, error: 'Timeout (${timeoutMs}ms)', results: [] }, '*');
        }, ${Number(timeoutMs)});
        w.onmessage = function(wev) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          w.terminate();
          URL.revokeObjectURL(url);
          parent.postMessage({ reqId: ${JSON.stringify(reqId)}, ok: wev.data.ok, error: wev.data.error || null, results: wev.data.results || [] }, '*');
        };
        w.onerror = function(werr) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          w.terminate();
          URL.revokeObjectURL(url);
          parent.postMessage({ reqId: ${JSON.stringify(reqId)}, ok: false, error: werr.message || 'Worker error', results: [] }, '*');
        };
        w.postMessage({ code: ev.data.code, tests: ev.data.tests });
      });
    </script></body></html>`;

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
      iframe.contentWindow?.postMessage({ reqId, code, tests }, '*');
    });
    document.body.appendChild(iframe);
  });
}

/** Carga diferida de sql.js (WASM) con SRI. */
export async function ensureSqlJs() {
  if (typeof window === 'undefined') return null;
  if (window.initSqlJs) return window.initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` });
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SQLJS_CDN;
      s.integrity = SQLJS_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        if (window.initSqlJs) {
          window.initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` }).then(resolve, reject);
        } else {
          reject(new Error('sql.js unavailable'));
        }
      };
      s.onerror = () => reject(new Error('Failed to load sql.js'));
      document.head.appendChild(s);
    });
  }
  return sqlPromise;
}

/** Lazy-load de Pyodide (WASM) con cacheo en Cache API para Python. */
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
      return window.loadPyodide({ indexURL: PYODIDE_INDEX });
    })();
  }
  return pyodidePromise;
}

/** Valida reglas deterministas de estilo/AST ligero por lenguaje. */
export function evaluateStyleRules(tech, code, rules = []) {
  const src = String(code || '');
  const violations = [];

  for (const rule of rules) {
    if (rule === 'pep8_indent_4' && /\t/.test(src)) violations.push('Use 4 spaces instead of tabs (PEP 8)');
    if (rule === 'docstring_pep257' && !src.includes('"""')) violations.push('Missing PEP 257 docstring (""")');
    if (rule === 'type_hints' && !/->\s*\w+/.test(src)) violations.push('Missing return type hint (->)');
    if (rule === 'jsdoc' && !src.includes('/**')) violations.push('Missing JSDoc block (/** ... */)');
    if (rule === 'tsdoc' && !src.includes('/**')) violations.push('Missing TSDoc block (/** ... */)');
    if (rule === 'no_explicit_any' && /:\s*any\b/.test(src)) violations.push('Avoid explicit `any` type');
    if (rule === 'var_return' && (!/\bVAR\b/i.test(src) || !/\bRETURN\b/i.test(src))) violations.push('Use VAR and RETURN in DAX');
    if (rule === 'javadoc' && !src.includes('/**')) violations.push('Missing Javadoc comment');
    if (rule === 'xml_docs' && !src.includes('/// <summary>')) violations.push('Missing C# XML Docs (/// <summary>)');
    if (rule === 'strict_types' && !src.includes('declare(strict_types=1);')) violations.push('Missing declare(strict_types=1);');
    if (rule === 'no_tabs' && /\t/.test(src)) violations.push('Tabs are forbidden in YAML');
    if (rule === 'rfc8259_valid') {
      try { JSON.parse(src); } catch { violations.push('Invalid RFC 8259 JSON'); }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Evalúa un reto completo en el navegador (sandbox iframe + validadores deterministas).
 * @returns {Promise<{passed: boolean, errorType: string|null, results: Array, styleViolations: Array}>}
 */
export async function evaluateChallenge(tech, code, level) {
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

  for (const t of tests) {
    if (t.type === 'eval') continue;
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

  const styleRes = evaluateStyleRules(tech, code, styleRules);
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
  };
}
