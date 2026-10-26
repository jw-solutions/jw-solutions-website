// Code Formatter — editor CodeMirror 6 (Bloque 1). Resuelve módulos vía import map de index.html.
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentOnInput, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { yaml } from '@codemirror/lang-yaml';
import { t } from './i18n.js';

const LANG_EXT = {
  python: () => python(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  sql: () => sql(),
  json: () => json(),
  java: () => java(),
  php: () => php(),
  yaml: () => yaml(),
  // Sin gramática oficial dedicada en CM6: C# usa la de Java (sintaxis cercana); DAX sin resaltado
  csharp: () => java(),
  dax: () => [],
};

const $ = (id) => document.getElementById(id);
const langCompartment = new Compartment();
const stats = $('cf-stats');

const updateStats = (state) => {
  const n = state.doc.lines;
  stats.textContent = n === 1 ? t('lineOne') : t('lines', { n });
};

const view = new EditorView({
  parent: $('cf-editor'),
  state: EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      oneDark,
      langCompartment.of([]),
      EditorView.updateListener.of((u) => { if (u.docChanged) updateStats(u.state); }),
    ],
  }),
});

/** Extensión de CodeMirror para un lenguaje (reutilizada por la vista de diferencias). */
updateStats(view.state);

export const languageExtension = (key) => (LANG_EXT[key] ? LANG_EXT[key]() : []);

export const setLanguage = (key) => {
  view.dispatch({ effects: langCompartment.reconfigure(languageExtension(key)) });
};

$('cf-language').addEventListener('change', (e) => {
  const v = e.target.value;
  $('cf-detected').hidden = true;
  if (v !== 'auto') setLanguage(v);
});

export { view };
