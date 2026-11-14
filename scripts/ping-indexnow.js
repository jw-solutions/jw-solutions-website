#!/usr/bin/env node
/* Notifica a IndexNow la URL de un artículo recién publicado y el sitemap.xml.
   Uso: node scripts/ping-indexnow.js <slug> [--dry-run] */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KEY = 'd4af37e920264b8c9a1d7f0e3b5c8a12';
const HOST = 'jw-solutions.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!slug) throw new Error('Uso: node scripts/ping-indexnow.js <slug> [--dry-run]');

  const keyFile = path.join(ROOT, `${KEY}.txt`);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Falta archivo de verificación IndexNow: ${KEY}.txt`);
  }

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: [
      `https://${HOST}/blog/${slug}/`,
      `https://${HOST}/`,
      `https://${HOST}/sitemap.xml`
    ]
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

  console.log(`INDEXNOW OK (HTTP ${res.status}) para /blog/${slug}/`);
}

main().catch((err) => {
  console.error(`INDEXNOW ERROR: ${err.message}`);
  process.exit(1);
});
