// Vista comparativa Antes/Después con @codemirror/merge (carga bajo demanda).
import { languageExtension } from './editor.js';

let current = null;

/** Muestra el diff en `container`. Devuelve true si hay diferencias, false si el texto es idéntico. */
export async function showDiff(container, { original, result, lang }) {
  closeDiff();
  if (original === result) return false;

  const [{ MergeView }, { EditorView, lineNumbers }, { EditorState }, { oneDark }] = await Promise.all([
    import('@codemirror/merge'),
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('@codemirror/theme-one-dark'),
  ]);
  const extensions = [
    lineNumbers(), oneDark, languageExtension(lang),
    EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false),
  ];
  current = new MergeView({
    parent: container,
    a: { doc: original, extensions },
    b: { doc: result, extensions },
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 3, minSize: 6 },
  });
  return true;
}

export function closeDiff() {
  if (current) { current.destroy(); current = null; }
}
