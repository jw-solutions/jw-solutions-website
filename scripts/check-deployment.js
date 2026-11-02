#!/usr/bin/env node
/* Verifica que un artículo publicado sea accesible (HTTP 200) y figure en el sitemap público;
   al confirmarlo marca DEPLOYED en el manifiesto editorial. Sin dependencias (Node >= 18).

   Uso: node scripts/check-deployment.js <slug> [--attempts=18] [--delay=10] [--no-mark] */
'use strict';

const pubManifest = require('./publication-manifest');

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? parseInt(a.split('=')[1], 10) : def; };
const attempts = opt('attempts', 18);
const delay = opt('delay', 10);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function status(url) {
  try { return (await fetch(url, { redirect: 'follow' })).status; } catch (e) { return `ERR ${e.message}`; }
}

async function main() {
  if (!slug) throw new Error('Uso: check-deployment.js <slug>');
  const entry = pubManifest.find(pubManifest.load(), slug);
  if (!entry) throw new Error(`Slug no registrado en el manifiesto: ${slug}`);
  const sitemapUrl = new URL('/sitemap.xml', entry.url).href;

  for (let i = 1; i <= attempts; i++) {
    const code = await status(entry.url);
    let inSitemap = false;
    if (code === 200) {
      try { inSitemap = (await (await fetch(sitemapUrl)).text()).includes(`<loc>${entry.url}</loc>`); } catch (e) { /* reintenta */ }
      if (inSitemap) {
        console.log(`OK  ${entry.url} accesible (200) y presente en el sitemap`);
        if (!args.includes('--no-mark')) pubManifest.setStatus(slug, 'DEPLOYED');
        return;
      }
    }
    console.log(`Intento ${i}/${attempts}: HTTP ${code}, sitemap=${inSitemap}`);
    if (i < attempts) await sleep(delay);
  }
  if (!args.includes('--no-mark')) pubManifest.setStatus(slug, 'FAILED');
  throw new Error(`Despliegue no verificado: ${entry.url}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
