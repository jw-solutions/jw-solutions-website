// Motores de formato deterministas. Prettier y sql-formatter se cargan bajo demanda (versiones fijadas).
const PRETTIER = 'https://esm.sh/prettier@3.3.3';
const SQL_FORMATTER = 'https://esm.sh/sql-formatter@15.4.2';

const PARSERS = { javascript: 'babel', typescript: 'typescript', json: 'json', yaml: 'yaml' };

let prettierPromise;
const loadPrettier = () => (prettierPromise ||= Promise.all([
  import(`${PRETTIER}/standalone`),
  import(`${PRETTIER}/plugins/babel`),
  import(`${PRETTIER}/plugins/estree`),
  import(`${PRETTIER}/plugins/typescript`),
  import(`${PRETTIER}/plugins/yaml`),
]).then(([std, ...plugins]) => ({ format: std.format, plugins: plugins.map((p) => p.default || p) })));

/** Normalización básica para lenguajes sin motor en navegador: tabs, espacios finales, saltos de línea. */
function normalize(code, { tabs = '    ' } = {}) {
  const lines = code.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '').replace(/^\t+/, (t) => tabs.repeat(t.length)));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
}

/** Formatea `code`. Devuelve { code, engine }. Lanza Error si la sintaxis no es válida. */
export async function formatCode(code, lang) {
  if (lang === 'json') {
    // Validación estricta (el parser json de Prettier tolera comas finales y comentarios)
    return { code: `${JSON.stringify(JSON.parse(code), null, 2)}\n`, engine: 'JSON (estricto)' };
  }
  if (PARSERS[lang]) {
    const { format, plugins } = await loadPrettier();
    const out = await format(code, { parser: PARSERS[lang], plugins, tabWidth: 2, singleQuote: true });
    return { code: out, engine: 'Prettier' };
  }
  if (lang === 'sql') {
    const { format } = await import(SQL_FORMATTER);
    return { code: format(code, { language: 'sql', keywordCase: 'upper', tabWidth: 2 }) + '\n', engine: 'sql-formatter' };
  }
  return { code: normalize(code), engine: 'Normalización básica' };
}
