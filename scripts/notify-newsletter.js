#!/usr/bin/env node
/* Envía el evento article.published al webhook del newsletter (n8n/Make). Sin dependencias.
   Idempotente: solo notifica artículos DEPLOYED cuya notificación esté PENDING o FAILED;
   event_id determinista (cabecera X-Event-Id) para que el receptor descarte duplicados.

   Uso: node scripts/notify-newsletter.js <slug> [--dry-run]
   Env: NEWSLETTER_WEBHOOK_URL (obligatoria salvo --dry-run), NEWSLETTER_WEBHOOK_TOKEN (opcional) */
'use strict';

const fs = require('fs');
const path = require('path');
const pubManifest = require('./publication-manifest');

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

async function main() {
  if (!slug) throw new Error('Uso: notify-newsletter.js <slug> [--dry-run]');
  const entry = pubManifest.find(pubManifest.load(), slug);
  if (!entry) throw new Error(`Slug no registrado en el manifiesto: ${slug}`);
  const n = entry.notification;

  if (n.status === 'NOTIFIED' || n.status === 'SKIPPED') { console.log(`Sin acción: notificación ${n.status} (${n.event_id}).`); return; }
  if (entry.status !== 'DEPLOYED') throw new Error(`No se notifica: ${slug} está ${entry.status}, no DEPLOYED.`);

  const art = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'articles.json'), 'utf8')).articles.find((a) => a.slug === slug);
  const payload = {
    event: 'article.published',
    event_id: n.event_id,
    article: { title: art.es.title, slug, summary: art.es.excerpt, url: entry.url, published_at: entry.published_at, language: 'es' }
  };

  if (dryRun) { console.log('DRY-RUN payload:\n' + JSON.stringify(payload, null, 2)); return; }

  const url = process.env.NEWSLETTER_WEBHOOK_URL;
  if (!url) throw new Error('Falta NEWSLETTER_WEBHOOK_URL');
  const headers = { 'Content-Type': 'application/json', 'X-Event-Id': n.event_id };
  if (process.env.NEWSLETTER_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.NEWSLETTER_WEBHOOK_TOKEN}`;

  let ok = false, detail = '';
  for (let i = 1; i <= 3 && !ok; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      ok = res.ok; detail = `HTTP ${res.status}`;
    } catch (e) { detail = e.message; }
    if (!ok && i < 3) await new Promise((r) => setTimeout(r, 5000));
  }

  pubManifest.setNotification(slug, { status: ok ? 'NOTIFIED' : 'FAILED', attempts: n.attempts + 1, last_attempt: new Date().toISOString() });
  if (!ok) throw new Error(`Webhook falló (${detail}). El artículo sigue DEPLOYED; reintenta solo la notificación.`);
  console.log(`OK  ${n.event_id} aceptado (${detail})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
