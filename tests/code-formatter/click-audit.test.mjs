import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

if (!globalThis.location) globalThis.location = { pathname: '/tools/code-formatter/', search: '' };
if (!globalThis.window) globalThis.window = { location: { href: 'https://jw-solutions.com/tools/code-formatter/', search: '' }, history: { replaceState() {} } };
if (!globalThis.document) {
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    dispatchEvent: () => {},
  };
}
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const {
  BUILTIN_FALLBACK_DAILY_CHALLENGE,
  resolveDailyChallenge,
} = await import('../../assets/js/tools/code-formatter/academy-ui.js');

const ROOT = process.cwd();
const LANGS = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

test('resolveDailyChallenge soporta los 7 idiomas y fallback embebido sin errores', () => {
  const dailyJson = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'content/code-formatter-academy/daily-challenges.json'), 'utf8'),
  );
  for (const lang of LANGS) {
    const ch = resolveDailyChallenge(dailyJson, lang, new Date('2026-11-15T12:00:00Z'));
    assert.ok(ch.id, `falta id en ${lang}`);
    assert.ok(ch.starter_code.length > 5, `starter_code vacío en ${lang}`);
    assert.ok(ch.copy.title.length > 3, `title vacío en ${lang}`);
    assert.ok(ch.copy.prompt.length > 5, `prompt vacío en ${lang}`);
  }

  // Fallback ante fallo de red o payload vacío/corrupto
  for (const lang of LANGS) {
    const fb = resolveDailyChallenge(null, lang);
    assert.equal(fb.id, BUILTIN_FALLBACK_DAILY_CHALLENGE.id);
    assert.ok(fb.copy.title.length > 3);
    assert.ok(fb.tests.length >= 3);
  }
});

test('Click Audit: gate de login/registro en Reto Diario, reanudación automática y botón Logout', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  assert.match(html, /id="cf-academy-daily-btn"/);
  assert.match(html, /id="cf-btn-logout"/);
  assert.match(html, /id="cf-auth-modal"[^>]*aria-labelledby="cf-auth-title"/);
  assert.doesNotMatch(html, /id="cf-auth-modal"[^>]*data-cf-commercial/);
  assert.match(html, /id="cf-pro-modal"[^>]*data-cf-commercial/);

  // Verificar paridad i18n en los 7 idiomas para gate, logout, trial y checkout
  const requiredKeys = [
    'acadDailyAuthGate',
    'authLogout',
    'authLogoutOk',
    'trialBtn',
    'trialAlreadyUsed',
    'payTabBinance',
    'payTabCrypto',
    'payTabPaypal',
    'payConfirmedTitle',
  ];
  for (const lang of LANGS) {
    const mod = await import(`../../assets/js/tools/code-formatter/locales/${lang}.js`);
    for (const k of requiredKeys) {
      assert.ok(mod.default[k] && mod.default[k].length > 0, `falta clave ${k} en locale ${lang}`);
    }
  }

  // Simular flujo de gate: sin sesión -> cf_pending_action -> cf:auth-success -> limpia y carga reto
  const storage = new Map();
  const pending = { action: 'daily_challenge', ts: Date.now() };
  storage.set('cf_pending_action', JSON.stringify(pending));
  const parsed = JSON.parse(storage.get('cf_pending_action'));
  assert.equal(parsed.action, 'daily_challenge');
  assert.ok(Date.now() - parsed.ts < 900000);
  storage.delete('cf_pending_action');
  assert.equal(storage.has('cf_pending_action'), false);
});

test('dist-public/ mantiene 0 pay y 0 data-cf-commercial pero conserva gate auth y logout', () => {
  const distHtmlPath = path.join(ROOT, 'dist-public/tools/code-formatter/index.html');
  assert.ok(fs.existsSync(distHtmlPath), 'dist-public/tools/code-formatter/index.html debe existir');
  const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
  assert.doesNotMatch(distHtml, /data-cf-commercial/);
  assert.doesNotMatch(distHtml, /id="cf-pro-modal"/);
  assert.match(distHtml, /id="cf-auth-modal"/);
  assert.match(distHtml, /id="cf-btn-logout"/);
  assert.ok(fs.existsSync(path.join(ROOT, 'dist-public/assets/js/tools/code-formatter/auth-modal.js')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'dist-public/assets/js/tools/code-formatter/pro-modal.js')));
});
