#!/usr/bin/env node
/* Notifica a IndexNow las 7 URLs localizadas de un tip recién desplegado y sitemap-code-formatter.xml.
   Uso: node scripts/code-formatter/ping-indexnow.js <slug> [--dry-run] */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const KEY = 'd4af37e920264b8c9a1d7f0e3b5c8a12';
const HOST = 'jw-solutions.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const CAT_MAP = {
  python: 'tips/python/',
  javascript: 'tips/javascript/',
  typescript: 'tips/javascript/',
  java: 'tips/java/',
  csharp: 'tips/csharp/',
  php: 'tips/php/',
  sql: 'tips/sql-dax/',
  dax: 'tips/sql-dax/',
  json: 'tips/json-yaml/',
  yaml: 'tips/json-yaml/'
};

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!slug) throw new Error('Uso: ping-indexnow.js <slug> [--dry-run]');

  const keyFile = path.join(ROOT, `${KEY}.txt`);
  if (!fs.existsSync(keyFile)) throw new Error(`Falta archivo IndexNow: ${KEY}.txt`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const entry = (manifest.tips || []).find((t) => t.slug === slug);
  if (!entry) throw new Error(`Slug no encontrado en el manifiesto: ${slug}`);

  const prog = entry.programming_language || entry.language || 'python';
  const cat = CAT_MAP[prog] || 'tips/python/';
  const langs = ['es', ...Object.keys(entry.translations || {})];
  const urlList = [
    ...langs.map((l) => `https://${HOST}/tools/code-formatter/${cat}${slug}/${l}/`),
    `https://${HOST}/sitemap-code-formatter.xml`
  ];

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList
  };

  if (dryRun) {
    console.log('DRY-RUN IndexNow:\n' + JSON.stringify(payload, null, 2));
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`IndexNow HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  entry.indexnow_pinged_at = new Date().toISOString();
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, MANIFEST);
  console.log(`INDEXNOW OK (HTTP ${res.status}) para ${urlList.length} URLs de ${slug}`);
}

main().catch((err) => {
  console.error(`INDEXNOW ERROR: ${err.message}`);
  process.exit(1);
});
