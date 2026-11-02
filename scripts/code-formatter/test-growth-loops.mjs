// Pruebas de los módulos puros: diagnostics.js (diagnóstico + autocorrección) y share.js (codificación de snippets).
// Uso: node scripts/code-formatter/test-growth-loops.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const JS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'js', 'tools', 'code-formatter');
const { diagnose, autoFix } = await import(pathToFileURL(join(JS, 'diagnostics.js')).href);

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

// --- Código válido: cero falsos positivos ---
const VALID = {
  javascript: ['const re = /[(]\\)/g; const s = `a ${b({c: 1})} d`; // ( comentario\nfunction f(x) { return x / 2; }\n', "const s = 'it\\'s'; const o = { a: [1, 2, 3] };\n"],
  typescript: ['interface A { x: number }\nconst f = (a: A): string => `${a.x}`;\n'],
  python: ['def f(x):\n    """doc ( con paréntesis"""\n    if x:\n        return [1,\n  2]\n    return {"a": (1, 2)}\n\n\nclass A:\n    pass\n', 'x = (1 +\n     2)\nif x:\n    y = 1\nelse:\n    y = 2\n'],
  java: ['public class A {\n  void f() { String s = "a(b"; char c = \'{\'; }\n}\n'],
  csharp: ['class A { string s = @"a ""( b"; void F() { var t = $"{x}"; } }\n'],
  php: ['<?php\nfunction f($a) { return "a\nb(" . $a; }\n'],
  sql: ["SELECT a, 'it''s (x' FROM t -- ( comentario\nWHERE (a > 1 AND (b < 2));\n"],
  dax: ['Total = CALCULATE ( SUM ( Sales[Amount] ), FILTER ( ALL ( Dates ), Dates[Year] = 2024 ) ) // (\n'],
  json: ['{"a": [1, 2, {"b": null}], "c": "x"}'],
  yaml: ['a:\n  b: 1\n  c:\n    - x\n    - y\nd: |\n  texto\n    indentado\n'],
};
Object.entries(VALID).forEach(([lang, samples]) => samples.forEach((s, i) => ok(`válido ${lang}#${i}`, () => assert.equal(diagnose(s, lang), null, JSON.stringify(diagnose(s, lang))))));

// --- Errores: tipo, línea y autocorrección convergente ---
const BAD = [
  ['python', 'def f():\nreturn 1\n', 'expected_indent', 2],
  ['python', 'x = 1\n    y = 2\n', 'unexpected_indent', 2],
  ['python', 'if x:\n        a = 1\n    b = 2\n', 'inconsistent_dedent', 3],
  ['python', 'if x:\n\t    a = 1\n', 'mixed_indent', 2],
  ['python', 'print("hola)\n', 'unclosed_string', 1],
  ['javascript', 'function f() {\n  if (a) {\n    x();\n}\n', 'unclosed_bracket', 1],
  ['javascript', 'const a = (1 + 2));\n', 'unexpected_closer', 1],
  ['javascript', 'const a = [1, 2);\n', 'mismatched', 1],
  ['javascript', 'console.log("hola);\n', 'unclosed_string', 1],
  ['java', 'class A { void f() { int x = 1; }\n', 'unclosed_bracket', 1],
  ['sql', 'SELECT * FROM t WHERE (a = 1 AND (b = 2)\n', 'unclosed_bracket', 1],
  ['dax', 'X = CALCULATE ( SUM ( T[a] ), T[b] = 1\n', 'unclosed_bracket', 1],
  ['json', '{"a": 1, "b": [1, 2,],}', 'json_invalid', 1],
  ['yaml', 'a:\n\tb: 1\n', 'tab_indent', 2],
  ['yaml', 'a:\n    b: 1\n  c: 2\n', 'inconsistent_dedent', 3],
];
BAD.forEach(([lang, code, type, line]) => ok(`${lang}: ${type}`, () => {
  const d = diagnose(code, lang);
  assert.ok(d, 'no detectó el error');
  assert.equal(d.type, type);
  assert.equal(d.line, line);
  const fixed = autoFix(code, lang);
  assert.ok(fixed, 'sin autocorrección');
  assert.equal(diagnose(fixed.code, lang), null, `quedó error tras corregir:\n${fixed.code}`);
}));

ok('JSON reparado es JSON válido y conserva datos', () => {
  const r = autoFix("{'a': 1, b: [1,2,], // c\n}", 'json');
  assert.deepEqual(JSON.parse(r.code), { a: 1, b: [1, 2] });
});
ok('Python corregido mantiene el cuerpo de la función', () => {
  assert.equal(autoFix('def f():\nreturn 1\n', 'python').code, 'def f():\n    return 1\n');
});

// --- share.js (se sustituye el import de i18n.js, que necesita DOM) ---
const dir = mkdtempSync(join(tmpdir(), 'cf-share-'));
writeFileSync(join(dir, 'share.mjs'), readFileSync(join(JS, 'share.js'), 'utf8').replace(/import \{ MAX_CODE_BYTES \} from '\.\/i18n\.js';/, 'const MAX_CODE_BYTES = 16 * 1024;'));
const { encodeSnippet, decodeSnippet, buildShareUrl, MAX_SHARE_URL } = await import(pathToFileURL(join(dir, 'share.mjs')).href);

const SAMPLE = 'def añadir(x):\n    return x + 1  # ñandú 🚀\n'.repeat(20);
await (async () => {
  const p = await encodeSnippet(SAMPLE, 'python');
  assert.match(p, /^z[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeSnippet(p), { lang: 'python', code: SAMPLE }); passed++; console.log('  ok  roundtrip deflate UTF-8/emoji');
  assert.ok(p.length < SAMPLE.length, 'no comprimió'); passed++; console.log(`  ok  compresión ${SAMPLE.length} → ${p.length}`);
  assert.equal(await decodeSnippet('zAAAA'), null); passed++; console.log('  ok  payload corrupto → null');
  assert.equal(await decodeSnippet('<script>'), null); passed++; console.log('  ok  payload con caracteres inválidos → null');
  const bomb = await encodeSnippet('a'.repeat(5_000_000), 'x').catch(() => null);
  assert.equal(bomb && await decodeSnippet(bomb), bomb ? null : bomb); passed++; console.log('  ok  zip-bomb rechazada');
  const url = await buildShareUrl(SAMPLE, 'python', 'es', 'https://jw-solutions.com/tools/code-formatter/?x=1#h');
  assert.match(url, /^https:\/\/jw-solutions\.com\/tools\/code-formatter\/\?lang=es&snippet=z/);
  assert.ok(url.length <= MAX_SHARE_URL); passed++; console.log('  ok  URL compartible limpia');
  let noise = ''; let s = 1; for (let i = 0; i < 16000; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; noise += String.fromCharCode(33 + (s % 90)); }
  assert.equal(await buildShareUrl(noise, 'x', 'es', 'https://a.b/'), null); passed++; console.log('  ok  fragmento incompresible > tope → null');
})();

console.log(`\n${passed} pruebas superadas`);
