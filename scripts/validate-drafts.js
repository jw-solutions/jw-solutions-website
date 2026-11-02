#!/usr/bin/env node
/* Validación preventiva de borradores (content/drafts/*.json). Sin dependencias.

   Reutiliza validateDraft de content/publish.js: un solo contrato para validar y publicar.

   Uso:
     node scripts/validate-drafts.js                  valida todos los borradores
     node scripts/validate-drafts.js --require-ready  además falla si no hay ningún borrador "ready"

   Reglas:
     - Directorio inexistente → error crítico.
     - JSON ilegible, status distinto de draft/ready, slug inválido, bloques es/en incompletos → rechazado.
     - Los "draft" se validan solo en estructura mínima (son trabajo en curso); los "ready" con el esquema completo.
     - Slug ya publicado (articles.json, blog/ o manifiesto) → rechazado, no se duplica.
     - Con --require-ready: sin ningún "ready" → error (el ciclo semanal no puede cumplirse).
   Escribe en $GITHUB_OUTPUT: ready_count, draft_count, valid. */
'use strict';

const fs = require('fs');
const path = require('path');
const { validateDraft } = require('../content/publish');
const pubManifest = require('./publication-manifest');

const ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'content', 'drafts');
const STATUSES = ['draft', 'ready'];

const log = (level, msg) => console.log(`[${new Date().toISOString()}][BLOG][${level}] ${msg}`);
const setOutput = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

function run(requireReady) {
  const errors = [];
  if (!fs.existsSync(DRAFTS_DIR)) return { errors: [`Directorio de borradores inexistente: ${DRAFTS_DIR}`], ready: 0, drafts: 0 };

  const published = new Set([
    ...JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'articles.json'), 'utf8')).articles.map((a) => a.slug),
    ...pubManifest.load().articles.map((a) => a.slug)
  ]);
  const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json')).sort();
  let ready = 0;

  files.forEach((f) => {
    const slug = f.slice(0, -5);
    const fail = (m) => errors.push(`${f}: ${m}`);
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf8')); } catch (e) { fail(`JSON inválido (${e.message})`); return; }
    if (!STATUSES.includes(d.status)) { fail(`status debe ser ${STATUSES.join(' o ')} (recibido: ${JSON.stringify(d.status)})`); return; }
    if (published.has(slug) || fs.existsSync(path.join(ROOT, 'blog', slug))) fail(`el slug "${slug}" ya está publicado`);
    if (d.status === 'ready') {
      validateDraft(d, slug).forEach(fail);
      ready++;
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`slug inválido "${slug}"`);
    log('INFO', `${f}: ${d.status}`);
  });

  if (files.length === 0) log('WARN', 'No hay borradores en content/drafts/.');
  if (requireReady && ready === 0) errors.push('No hay ningún borrador "ready" para publicar.');
  return { errors, ready, drafts: files.length };
}

if (require.main === module) {
  const requireReady = process.argv.includes('--require-ready');
  const { errors, ready, drafts } = run(requireReady);
  errors.forEach((e) => log('ERROR', e));
  setOutput('ready_count', ready);
  setOutput('draft_count', drafts);
  setOutput('valid', errors.length === 0);
  log(errors.length ? 'FAILED' : 'SUCCESS', `${drafts} borrador(es), ${ready} listo(s), ${errors.length} error(es).`);
  process.exit(errors.length ? 1 : 0);
}

module.exports = { run };
