#!/usr/bin/env node
/**
 * Sindicación gratuita por navegador persistente (Playwright) para:
 *  1) Hashnode RSS Import (https://hashnode.com/dashboards/6af930e812bf3e37eb4473f2/import)
 *  2) daily.dev Squad (https://dly.to/nmdN9vQObOU)
 *
 * Uso:
 *   node scripts/code-formatter/browser-syndicate.mjs
 *   node scripts/code-formatter/browser-syndicate.mjs --only=hashnode
 *   node scripts/code-formatter/browser-syndicate.mjs --only=dailydev --limit=3
 *   node scripts/code-formatter/browser-syndicate.mjs --dry-run
 *
 * El perfil persistente (.pw-profile/) está excluido en .gitignore para proteger sesiones/cookies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'code-formatter-manifest.json');
const DIST_DIR = path.join(ROOT_DIR, 'content', 'code-formatter-tips', 'distribution');
const DEFAULT_PROFILE_DIR = path.join(ROOT_DIR, '.pw-profile');
const BRAVE_USER_DATA = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data')
  : DEFAULT_PROFILE_DIR;
const BRAVE_PATHS = [
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
];
const EDGE_USER_DATA = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data')
  : DEFAULT_PROFILE_DIR;
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const BASE_URL = 'https://jw-solutions.com';
const HASHNODE_IMPORT_URL = 'https://hashnode.com/dashboards/6af930e812bf3e37eb4473f2/import';
const HASHNODE_RSS_FEED = 'https://jw-solutions.com/tools/code-formatter/tips/feed.en.xml';
const DAILYDEV_SQUAD_URL = 'https://dly.to/nmdN9vQObOU';

const CATEGORY_PATH = {
  python: 'tips/python/',
  javascript: 'tips/javascript/',
  typescript: 'tips/javascript/',
  sql: 'tips/sql-dax/',
  dax: 'tips/sql-dax/',
  java: 'tips/java/',
  csharp: 'tips/csharp/',
  php: 'tips/php/',
  json: 'tips/config/',
  yaml: 'tips/config/',
};

function parseArgs(argv) {
  const opts = { only: null, limit: Infinity, dryRun: false, profileDir: DEFAULT_PROFILE_DIR, browser: 'brave' };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      opts.only = arg.slice('--only='.length).trim().toLowerCase();
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) opts.limit = n;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg.startsWith('--profile=')) {
      opts.profileDir = path.resolve(arg.slice('--profile='.length));
    } else if (arg.startsWith('--browser=')) {
      opts.browser = arg.slice('--browser='.length).trim().toLowerCase();
    }
  }
  return opts;
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`No existe manifiesto en ${MANIFEST_PATH}`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  const tmpPath = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, MANIFEST_PATH);
}

function getDailyDevPayload(entry) {
  const progLang = String(entry.programming_language || entry.language || 'python').toLowerCase();
  const catPath = CATEGORY_PATH[progLang] || 'tips/python/';
  const utmUrl = `${BASE_URL}/tools/code-formatter/${catPath}${entry.slug}/en/?utm_source=dailydev&utm_medium=squad&utm_campaign=${encodeURIComponent(entry.slug)}`;

  const kitPath = path.join(DIST_DIR, `${entry.slug}.json`);
  let comment = (entry.translations && entry.translations.en && entry.translations.en.title) || entry.title;
  if (fs.existsSync(kitPath)) {
    try {
      const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
      const sq = kit.daily_dev_squad && kit.daily_dev_squad.en;
      if (sq && sq.post_markdown) {
        comment = sq.post_markdown;
      }
    } catch (_) {
      // fallback al título
    }
  }
  return { utmUrl, comment };
}

function findFirstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function launchBrowserContext(profileDir, preferredBrowser = 'brave') {
  const candidates =
    preferredBrowser === 'edge'
      ? [
          { name: 'EDGE', exe: findFirstExisting(EDGE_PATHS), userData: EDGE_USER_DATA },
          { name: 'BRAVE', exe: findFirstExisting(BRAVE_PATHS), userData: BRAVE_USER_DATA },
        ]
      : [
          { name: 'BRAVE', exe: findFirstExisting(BRAVE_PATHS), userData: BRAVE_USER_DATA },
          { name: 'EDGE', exe: findFirstExisting(EDGE_PATHS), userData: EDGE_USER_DATA },
        ];

  const available = candidates.filter((c) => Boolean(c.exe));
  if (available.length === 0) {
    throw new Error('No se encontró Brave (brave.exe) ni Microsoft Edge (msedge.exe) en Program Files.');
  }

  // 1. Intentar conectar si el navegador ya tiene remote-debugging-port=9222 activo
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 2000 });
    const ctx = browser.contexts()[0];
    if (ctx) {
      console.log('[BROWSER] Conectado a la sesión activa vía CDP 9222.');
      return { context: ctx, close: async () => {} };
    }
  } catch (_) {
    // No hay CDP en 9222; continuar con lanzamiento directo
  }

  const chosen = available[0];
  const baseOpts = {
    executablePath: chosen.exe,
    headless: false,
    viewport: { width: 1360, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  };

  // 2. Intentar abrir con el perfil real del usuario (donde ya están las sesiones)
  if (fs.existsSync(chosen.userData) && profileDir === DEFAULT_PROFILE_DIR) {
    try {
      const ctx = await chromium.launchPersistentContext(chosen.userData, {
        ...baseOpts,
        args: [...baseOpts.args, '--profile-directory=Default'],
      });
      console.log(`[${chosen.name}] Iniciado con tu perfil Default.`);
      return { context: ctx, close: () => ctx.close() };
    } catch (err) {
      console.log(`[${chosen.name}] Perfil Default ocupado por una ventana abierta (${err.message.split('\n')[0]}).`);
    }
  }

  // 3. Fallback: abrir el navegador elegido con perfil persistente local (.pw-profile)
  fs.mkdirSync(profileDir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profileDir, baseOpts);
  console.log(`[${chosen.name}] Iniciado con perfil persistente en ${profileDir}.`);
  return { context: ctx, close: () => ctx.close() };
}

async function waitForLoginIfNeeded(page, checkLoggedInFn, message, timeoutMs = 300000) {
  const alreadyIn = await checkLoggedInFn();
  if (alreadyIn) return;
  console.log(`\n[AUTH] ${message}`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(2000);
    if (await checkLoggedInFn()) {
      console.log('[AUTH] Sesión detectada, continuando automáticamente...\n');
      return;
    }
  }
  throw new Error(`Tiempo de espera agotado (${timeoutMs / 1000}s) esperando inicio de sesión.`);
}

async function runHashnodeRssImport(context, manifest, limit) {
  const pending = (manifest.tips || []).filter(
    (t) =>
      (!t.status || ['DEPLOYED', 'NOTIFIED'].includes(t.status)) &&
      (!t.syndication || !t.syndication.hashnode || !['published', 'imported_rss'].includes(t.syndication.hashnode.status))
  );
  if (pending.length === 0) {
    console.log('[HASHNODE] Todos los artículos ya están importados o publicados.');
    return 0;
  }

  const page = await context.newPage();
  try {
    console.log(`[HASHNODE] Abriendo ${HASHNODE_IMPORT_URL} (${pending.length} artículos pendientes)...`);
    await page.goto(HASHNODE_IMPORT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await waitForLoginIfNeeded(
      page,
      async () => {
        const url = page.url();
        if (url.includes('/login') || url.includes('/onboard') || url.includes('accounts.hashnode')) return false;
        const hasImportHeading = await page.locator('text=/RSS|Import/i').first().isVisible().catch(() => false);
        const hasSignInBtn = await page.locator('a:has-text("Sign in"), button:has-text("Sign in")').first().isVisible().catch(() => false);
        return url.includes('/import') && hasImportHeading && !hasSignInBtn;
      },
      'Por favor inicia sesión en Hashnode en la ventana del navegador...'
    );

    // Seleccionar opción RSS Feed si existe selector/pestaña
    const rssTab = page.locator('button:has-text("RSS"), label:has-text("RSS"), div[role="button"]:has-text("RSS"), a:has-text("RSS")').first();
    if (await rssTab.isVisible().catch(() => false)) {
      await rssTab.click();
      await page.waitForTimeout(800);
    }

    const feedInput = page
      .locator('input[type="url"], input[placeholder*="RSS" i], input[placeholder*="feed" i], input[placeholder*="http" i], input[name*="rss" i]')
      .first();
    await feedInput.waitFor({ state: 'visible', timeout: 30000 });
    await feedInput.fill(HASHNODE_RSS_FEED);

    const importBtn = page
      .locator('button:has-text("Import"), button:has-text("Fetch"), button:has-text("Submit"), button[type="submit"]')
      .first();
    await importBtn.click();

    // Esperar respuesta o lista de artículos detectados del feed
    await page.waitForTimeout(5000);
    const confirmAllBtn = page.locator('button:has-text("Import All"), button:has-text("Import selected"), button:has-text("Confirm")').first();
    if (await confirmAllBtn.isVisible().catch(() => false)) {
      await confirmAllBtn.click();
      await page.waitForTimeout(5000);
    }

    const nowIso = new Date().toISOString();
    let count = 0;
    for (const entry of pending.slice(0, limit)) {
      entry.syndication = entry.syndication || {};
      entry.syndication.hashnode = {
        status: 'imported_rss',
        feedUrl: HASHNODE_RSS_FEED,
        importedAt: nowIso,
      };
      count += 1;
    }
    saveManifest(manifest);
    console.log(`[HASHNODE] Importación RSS registrada para ${count} artículo(s).`);
    return count;
  } finally {
    await page.close().catch(() => {});
  }
}

async function runDailyDevSquad(context, manifest, limit) {
  const pending = (manifest.tips || []).filter(
    (t) =>
      (!t.status || ['DEPLOYED', 'NOTIFIED'].includes(t.status)) &&
      (!t.syndication || !t.syndication.dailydev || t.syndication.dailydev.status !== 'published')
  );
  if (pending.length === 0) {
    console.log('[DAILY.DEV] Todos los artículos ya están publicados en el Squad.');
    return 0;
  }

  const page = await context.newPage();
  try {
    console.log(`[DAILY.DEV] Abriendo Squad ${DAILYDEV_SQUAD_URL} (${pending.length} artículos pendientes)...`);
    await page.goto(DAILYDEV_SQUAD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await waitForLoginIfNeeded(
      page,
      async () => {
        const url = page.url();
        if (url.includes('/login') || url.includes('/signup') || url.includes('/onboarding')) return false;
        const loginBtn = await page
          .locator('button:has-text("Log in"), button:has-text("Sign in"), a:has-text("Log in")')
          .first()
          .isVisible()
          .catch(() => false);
        if (loginBtn) return false;
        const postBtn = await page
          .locator('button:has-text("New post"), button:has-text("Share a link"), button:has-text("Post"), a:has-text("New post")')
          .first()
          .isVisible()
          .catch(() => false);
        return postBtn || url.includes('app.daily.dev');
      },
      'Por favor inicia sesión en daily.dev en la ventana del navegador...'
    );

    let publishedCount = 0;
    for (const entry of pending.slice(0, limit)) {
      const { utmUrl, comment } = getDailyDevPayload(entry);
      console.log(`[DAILY.DEV] Publicando ${entry.slug} -> ${utmUrl}`);

      const newPostBtn = page
        .locator('button:has-text("New post"), button:has-text("Share a link"), button:has-text("Create post"), a:has-text("New post")')
        .first();
      await newPostBtn.waitFor({ state: 'visible', timeout: 20000 });
      await newPostBtn.click();
      await page.waitForTimeout(1000);

      const urlInput = page
        .locator('input[type="url"], input[placeholder*="http" i], input[placeholder*="link" i], input[placeholder*="URL" i], input[name*="url" i]')
        .first();
      await urlInput.waitFor({ state: 'visible', timeout: 15000 });
      await urlInput.fill(utmUrl);
      await page.waitForTimeout(1500);

      const commentBox = page
        .locator('textarea, div[contenteditable="true"], [role="textbox"]')
        .first();
      if (await commentBox.isVisible().catch(() => false)) {
        await commentBox.click();
        await commentBox.fill(comment.slice(0, 1500));
      }

      const submitBtn = page
        .locator('button[type="submit"]:has-text("Post"), button:has-text("Publish"), button:has-text("Share"), button:has-text("Post")')
        .last();
      await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
      await submitBtn.click();

      await page.waitForTimeout(5000);
      entry.syndication = entry.syndication || {};
      entry.syndication.dailydev = {
        status: 'published',
        squadUrl: DAILYDEV_SQUAD_URL,
        utmUrl,
        publishedAt: new Date().toISOString(),
      };
      saveManifest(manifest);
      publishedCount += 1;
      console.log(`[DAILY.DEV] Publicado ${entry.slug} (${publishedCount}/${Math.min(pending.length, limit)}).`);
    }

    return publishedCount;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = readManifest();

  if (opts.dryRun) {
    const hnPending = (manifest.tips || []).filter((t) => !t.syndication?.hashnode || !['published', 'imported_rss'].includes(t.syndication.hashnode.status));
    const ddPending = (manifest.tips || []).filter((t) => t.syndication?.dailydev?.status !== 'published');
    console.log(`[DRY-RUN] Hashnode pendientes: ${hnPending.length}, daily.dev pendientes: ${ddPending.length}, perfil: ${opts.profileDir}`);
    return;
  }

  const { context, close } = await launchBrowserContext(opts.profileDir, opts.browser);
  try {
    if (!opts.only || opts.only === 'hashnode') {
      await runHashnodeRssImport(context, manifest, opts.limit);
    }
    if (!opts.only || opts.only === 'dailydev') {
      await runDailyDevSquad(context, manifest, opts.limit);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err && err.message ? err.message : err);
  process.exit(1);
});
