#!/usr/bin/env node
/* Envía el evento code_formatter.tip.published al endpoint de newsletter (canal code-formatter).
   Idempotente: solo notifica tips en estado DEPLOYED.
   Uso: node scripts/code-formatter/notify-newsletter.js <slug> [--dry-run] */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const SITE = 'https://jw-solutions.com';
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
  if (!slug) throw new Error('Uso: notify-newsletter.js <slug> [--dry-run]');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const entry = (manifest.tips || []).find((t) => t.slug === slug);
  if (!entry) throw new Error(`Slug no encontrado en el manifiesto: ${slug}`);

  if (entry.status === 'NOTIFIED') {
    console.log(`Sin acción: ${slug} ya está NOTIFIED (${entry.notified_at}).`);
    return;
  }
  if (entry.status !== 'DEPLOYED' && !dryRun) {
    throw new Error(`No se notifica: ${slug} está en estado ${entry.status}, no DEPLOYED.`);
  }

  const prog = entry.programming_language || entry.language || 'python';
  const cat = CAT_MAP[prog] || 'tips/python/';
  const locales = {
    es: {
      title: entry.title,
      summary: entry.summary || entry.meta_description || entry.title,
      url: `${SITE}/tools/code-formatter/${cat}${slug}/es/`
    }
  };
  for (const [loc, tr] of Object.entries(entry.translations || {})) {
    locales[loc] = {
      title: tr.title,
      summary: tr.summary || tr.meta_description || tr.title,
      url: `${SITE}/tools/code-formatter/${cat}${slug}/${loc}/`
    };
  }

  const eventId = `cf-tip-${slug}`;
  const payload = {
    event: 'code_formatter.tip.published',
    event_id: eventId,
    channel: 'code-formatter',
    slug,
    programming_language: prog,
    interactive_snippet: entry.interactive_snippet || null,
    published_at: entry.published_at,
    locales
  };

  if (dryRun) {
    console.log('DRY-RUN payload:\n' + JSON.stringify(payload, null, 2));
    return;
  }

  const url = process.env.NEWSLETTER_WEBHOOK_URL;
  if (!url) throw new Error('Falta NEWSLETTER_WEBHOOK_URL');
  const headers = { 'Content-Type': 'application/json', 'X-Event-Id': eventId };
  if (process.env.NEWSLETTER_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.NEWSLETTER_WEBHOOK_TOKEN}`;
  }

  let ok = false;
  let detail = '';
  for (let i = 1; i <= 3 && !ok; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      ok = res.ok;
      detail = `HTTP ${res.status}`;
    } catch (e) {
      detail = e.message;
    }
    if (!ok && i < 3) await new Promise((r) => setTimeout(r, 5000));
  }

  if (!ok) {
    throw new Error(`Webhook falló (${detail}). El tip ${slug} sigue DEPLOYED.`);
  }

  entry.status = 'NOTIFIED';
  entry.notified_at = new Date().toISOString();
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, MANIFEST);
  console.log(`OK ${eventId} notificado (${detail})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
