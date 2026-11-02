#!/usr/bin/env node
/* Manifiesto editorial de idempotencia (content/publication-manifest.json). Sin dependencias.

   Estados por artículo: COMPILED → COMMITTED → DEPLOYED (→ notificación NOTIFIED) | FAILED.
   La notificación tiene su propio estado (PENDING | NOTIFIED | FAILED | SKIPPED) para poder
   reintentar solo el correo sin republicar.

   CLI:
     node scripts/publication-manifest.js show
     node scripts/publication-manifest.js set <slug> <ESTADO>
     node scripts/publication-manifest.js verify          falla si el manifiesto es incoherente */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'content', 'publication-manifest.json');
const STATES = ['COMPILED', 'COMMITTED', 'DEPLOYED', 'FAILED'];
const NOTIFY_STATES = ['PENDING', 'NOTIFIED', 'FAILED', 'SKIPPED'];

function load() {
  if (!fs.existsSync(FILE)) return { version: 1, articles: [] };
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

/* Escritura atómica: archivo temporal + rename. */
function save(m) {
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, FILE);
}

const eventId = (date, slug) => `jw-blog-${date.replace(/-/g, '')}-${slug}`;

function find(m, slug) {
  return m.articles.find((a) => a.slug === slug);
}

/* Registra un artículo recién compilado. Idempotente: si ya existe no lo reinicia. */
function registerCompiled(slug, date, site) {
  const m = load();
  if (find(m, slug)) return find(m, slug);
  const entry = {
    slug,
    status: 'COMPILED',
    published_at: `${date}T14:00:00Z`,
    url: `${site}/blog/${slug}/`,
    notification: { event_id: eventId(date, slug), status: 'PENDING', attempts: 0 }
  };
  m.articles.push(entry);
  save(m);
  return entry;
}

function setStatus(slug, status) {
  if (!STATES.includes(status)) throw new Error(`Estado inválido: ${status} (${STATES.join(', ')})`);
  const m = load();
  const e = find(m, slug);
  if (!e) throw new Error(`Slug no registrado en el manifiesto: ${slug}`);
  if (e.status === status) return false;
  e.status = status;
  save(m);
  return true;
}

function setNotification(slug, patch) {
  if (patch.status && !NOTIFY_STATES.includes(patch.status)) throw new Error(`Estado de notificación inválido: ${patch.status}`);
  const m = load();
  const e = find(m, slug);
  if (!e) throw new Error(`Slug no registrado en el manifiesto: ${slug}`);
  e.notification = { ...e.notification, ...patch };
  save(m);
  return e;
}

function verify() {
  const m = load();
  const problems = [];
  const seen = new Set();
  const ids = new Set();
  if (m.version !== 1) problems.push(`versión no soportada: ${m.version}`);
  m.articles.forEach((a) => {
    if (seen.has(a.slug)) problems.push(`slug duplicado: ${a.slug}`);
    seen.add(a.slug);
    if (!STATES.includes(a.status)) problems.push(`${a.slug}: estado inválido ${a.status}`);
    if (!a.notification || !NOTIFY_STATES.includes(a.notification.status)) problems.push(`${a.slug}: notificación inválida`);
    else {
      if (ids.has(a.notification.event_id)) problems.push(`${a.slug}: event_id duplicado`);
      ids.add(a.notification.event_id);
      if (a.notification.status === 'NOTIFIED' && a.status !== 'DEPLOYED') problems.push(`${a.slug}: NOTIFIED sin DEPLOYED`);
    }
  });
  return problems;
}

module.exports = { load, save, find, eventId, registerCompiled, setStatus, setNotification, verify, FILE };

if (require.main === module) {
  const [cmd, slug, status] = process.argv.slice(2);
  try {
    if (cmd === 'show') console.log(JSON.stringify(load(), null, 2));
    else if (cmd === 'set') console.log(setStatus(slug, status) ? `${slug} → ${status}` : `${slug} ya estaba en ${status}`);
    else if (cmd === 'verify') {
      const p = verify();
      p.forEach((x) => console.error(`ERROR  ${x}`));
      console.log(p.length ? `MANIFEST FALLÓ: ${p.length} problema(s)` : 'MANIFEST OK');
      process.exit(p.length ? 1 : 0);
    } else throw new Error('Uso: show | set <slug> <ESTADO> | verify');
  } catch (e) { console.error(e.message); process.exit(1); }
}
