// Adaptador de documentación para JSON. RFC 8259 no admite comentarios, así que la documentación
// se produce como salida externa (objeto estructurado, Markdown o JSON) sin tocar el texto original.
import { DOC_LANGUAGES, DEFAULT_DOC_LANGUAGE } from '../../../../config/documentation-languages.js';

export const MAX_PROPERTIES = 200;
const MAX_EXAMPLE = 60;

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v);
export const utf8Bytes = (text) => new TextEncoder().encode(text).length;

/** Valida con JSON.parse y recorre los nodos. Devuelve { valid:false, error } o { valid:true, root, stats, properties, truncated }. */
export function analyzeJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (err) { return { valid: false, error: String(err.message || err) }; }

  const stats = { objects: 0, arrays: 0, properties: 0, maxDepth: 0, bytes: utf8Bytes(text), types: { string: 0, number: 0, boolean: 0, null: 0, object: 0, array: 0 } };
  const props = new Map(); // ruta -> { types:Set, count, example }

  const note = (path, value) => {
    const type = typeOf(value);
    let p = props.get(path);
    if (!p) { p = { path, types: new Set(), count: 0, example: undefined }; props.set(path, p); }
    p.types.add(type);
    p.count += 1;
    if (p.example === undefined && type !== 'object' && type !== 'array') p.example = type === 'string' && value.length > MAX_EXAMPLE ? `${value.slice(0, MAX_EXAMPLE)}…` : value;
  };

  const walk = (value, path, depth) => {
    const type = typeOf(value);
    stats.types[type] += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    if (type === 'object') {
      stats.objects += 1;
      for (const [key, child] of Object.entries(value)) {
        stats.properties += 1;
        const childPath = path ? `${path}.${key}` : key;
        note(childPath, child);
        walk(child, childPath, depth + 1);
      }
    } else if (type === 'array') {
      stats.arrays += 1;
      const itemPath = `${path}[]`;
      value.forEach((child) => { if (path) note(itemPath, child); walk(child, itemPath, depth + 1); });
    }
  };
  walk(data, '', 0);

  const all = [...props.values()].map((p) => ({ path: p.path, types: [...p.types].sort(), count: p.count, example: p.example }));
  return { valid: true, root: typeOf(data), stats, properties: all.slice(0, MAX_PROPERTIES), truncated: all.length > MAX_PROPERTIES, totalProperties: all.length };
}

/** Documento estructurado exportable, en el idioma de la DOCUMENTACIÓN (no el de la interfaz). */
export function buildDocumentation(analysis, docLang = DEFAULT_DOC_LANGUAGE, level = 'basic') {
  const L = DOC_LANGUAGES[docLang] || DOC_LANGUAGES[DEFAULT_DOC_LANGUAGE];
  const extended = level === 'extended';
  return {
    title: L.docTitle,
    language: docLang,
    level,
    note: L.docNote,
    summary: {
      [L.docRootType]: analysis.root,
      [L.docObjects]: analysis.stats.objects,
      [L.docArrays]: analysis.stats.arrays,
      [L.docPropsCount]: analysis.stats.properties,
    },
    metadata: {
      [L.docDepth]: analysis.stats.maxDepth,
      [L.docBytes]: analysis.stats.bytes,
      [L.docDetectedTypes]: Object.fromEntries(Object.entries(analysis.stats.types).filter(([, n]) => n > 0)),
    },
    properties: analysis.properties.map((p) => ({
      path: p.path,
      types: p.types,
      occurrences: p.count,
      description: `${L.property}.`,
      ...(extended && p.example !== undefined ? { example: p.example } : {}),
    })),
  };
}

const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Markdown del documento estructurado. */
export function toMarkdownDoc(doc, docLang = DEFAULT_DOC_LANGUAGE) {
  const L = DOC_LANGUAGES[docLang] || DOC_LANGUAGES[DEFAULT_DOC_LANGUAGE];
  const kv = (obj) => Object.entries(obj).map(([k, v]) => `- **${k}:** ${typeof v === 'object' ? `\`${JSON.stringify(v)}\`` : v}`).join('\n');
  const showExample = doc.properties.some((p) => 'example' in p);
  const head = `| ${L.docPath} | ${L.docTypes} | ${L.docCount} | ${L.docDescription} |${showExample ? ` ${L.docExample} |` : ''}`;
  const sep = `| --- | --- | --- | --- |${showExample ? ' --- |' : ''}`;
  const rows = doc.properties.map((p) => `| \`${cell(p.path)}\` | ${p.types.join(', ')} | ${p.occurrences} | ${cell(p.description)} |${showExample ? ` ${'example' in p ? `\`${cell(JSON.stringify(p.example))}\`` : ''} |` : ''}`);
  return [`# ${doc.title}`, '', `> ${doc.note}`, '', `## ${L.docSummary}`, '', kv(doc.summary), '', `## ${L.docMetadata}`, '', kv(doc.metadata), '', `## ${L.docProperties}`, '', head, sep, ...rows, ''].join('\n');
}
