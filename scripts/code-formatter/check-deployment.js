#!/usr/bin/env node
/* Verifica que las 7 URLs localizadas de un tip publicado respondan HTTP 200
   y figuren en sitemap-code-formatter.xml; al confirmarlo marca DEPLOYED en el manifiesto.
   Uso: node scripts/code-formatter/check-deployment.js <slug> [--attempts=18] [--delay=10] [--no-mark] */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const SITE = 'https://jw-solutions.com';
const SITEMAP_URL = `${SITE}/sitemap-code-formatter.xml`;
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

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

function tipUrls(entry) {
  const prog = entry.programming_language || entry.language || 'python';
  const cat = CAT_MAP[prog] || 'tips/python/';
  const langs = ['es', ...Object.keys(entry.translations || {})];
  return langs.map((l) => `${SITE}/tools/code-formatter/${cat}${entry.slug}/${l}/`);
}

async function httpStatus(url) {
  try {
    return (await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })).status;
  } catch (e) {
    return `ERR:${e.message}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const opt = (name, def) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? parseInt(a.split('=')[1], 10) : def;
  };
  const attempts = opt('attempts', 18);
  const delay = opt('delay', 10);
  const noMark = args.includes('--no-mark');

  if (!slug) throw new Error('Uso: check-deployment.js <slug>');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const entry = (manifest.tips || []).find((t) => t.slug === slug);
  if (!entry) throw new Error(`Slug no registrado en el manifiesto: ${slug}`);

  const urls = tipUrls(entry);
  for (let i = 1; i <= attempts; i++) {
    const statuses = await Promise.all(urls.map(httpStatus));
    const all200 = statuses.every((s) => s === 200);
    let inSitemap = false;
    if (all200) {
      try {
        const xml = await (await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(15000) })).text();
        inSitemap = urls.every((u) => xml.includes(`<loc>${u}</loc>`));
      } catch { /* reintenta */ }
      if (inSitemap) {
        console.log(`OK ${urls.length} URLs localizadas responden HTTP 200 y están en ${SITEMAP_URL}`);
        if (!noMark) {
          entry.status = 'DEPLOYED';
          entry.deployed_at = new Date().toISOString();
          const tmp = `${MANIFEST}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
          fs.renameSync(tmp, MANIFEST);
        }
        return;
      }
    }
    console.log(`Intento ${i}/${attempts}: statuses=${JSON.stringify(statuses)}, sitemap=${inSitemap}`);
    if (i < attempts) await sleep(delay);
  }

  throw new Error(`Despliegue no verificado tras ${attempts} intentos para ${slug}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
