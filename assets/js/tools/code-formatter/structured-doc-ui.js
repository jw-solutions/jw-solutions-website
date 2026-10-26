// Panel de documentación estructurada (JSON). Solo nodos DOM + textContent. Etiquetas en idioma de INTERFAZ;
// el contenido documental (descripciones) llega ya en el idioma de DOCUMENTACIÓN.
import { t, intlLocale } from './i18n.js';
import { MAX_PROPERTIES } from './json-documentation-adapter.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const formatBytes = (n) => (n < 1024 ? `${n} B` : `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(n / 1024)} KB`);

export function renderStructuredDoc(panel, analysis, doc) {
  const body = panel.querySelector('#cf-sd-body');
  body.replaceChildren();

  const stats = el('dl', 'cf-sd__stats');
  const add = (label, value) => {
    const box = el('div', 'cf-sd__stat');
    box.append(el('dt', '', label), el('dd', '', String(value)));
    stats.append(box);
  };
  add(t('statObjects'), analysis.stats.objects);
  add(t('statArrays'), analysis.stats.arrays);
  add(t('statProps'), analysis.stats.properties);
  add(t('statDepth'), analysis.stats.maxDepth);
  add(t('statBytes'), formatBytes(analysis.stats.bytes));

  const typeLine = Object.entries(analysis.stats.types).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(' · ');
  const meta = el('p', 'cf-muted', `${t('statTypes')}: ${typeLine}`);

  const table = el('table', 'cf-sd__table');
  const head = el('tr');
  ['colPath', 'colTypes', 'colCount', 'colDesc'].forEach((k) => head.append(el('th', '', t(k))));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const tbody = el('tbody');
  doc.properties.forEach((p) => {
    const row = el('tr');
    row.append(el('td', '', p.path), el('td', '', p.types.join(', ')), el('td', '', String(p.occurrences)), el('td', '', p.description));
    tbody.append(row);
  });
  table.append(tbody);
  const wrap = el('div', 'cf-sd__table-wrap');
  wrap.append(table);

  body.append(el('h3', 'cf-sd__h', t('jsonDocSummary')), stats, el('h3', 'cf-sd__h', t('jsonDocMeta')), meta, el('h3', 'cf-sd__h', t('jsonDocProps')), wrap);
  if (analysis.truncated) body.append(el('p', 'cf-muted', t('jsonTruncated', { n: MAX_PROPERTIES })));
  panel.hidden = false;
}
