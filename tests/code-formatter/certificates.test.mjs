import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildLinkedInCertUrl } from '../../assets/js/tools/code-formatter/cert-page.js';

const ROOT = process.cwd();
const LANGS = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

test('Paridad i18n de certificados escalonados en los 7 locales', async () => {
  const keys = [
    'certPreviewBtn',
    'certPreviewWatermark',
    'certPreviewUpgradeCta',
    'certIssueBtn',
    'certQuotaLabel',
    'certQuotaUnlimited',
    'certConfirmTitle',
    'certConfirmWarn',
    'certHolderLabel',
    'certConfirmBtn',
    'certCancelBtn',
    'certErrTrialOnly',
    'certErrQuota',
    'certErrPlanTier',
    'certErrLanguage',
    'certErrNameLocked',
    'certAddLinkedIn',
    'certPrintPdf',
    'certViewPortfolio',
    'certRevokedBanner',
  ];
  for (const lang of LANGS) {
    const mod = await import(`../../assets/js/tools/code-formatter/locales/${lang}.js`);
    for (const k of keys) {
      assert.ok(mod.default[k] && mod.default[k].length > 0, `falta ${k} en ${lang}`);
    }
  }
});

test('Seguridad XSS: cert-page.js y academy-ui.js tienen 0 usos de innerHTML', () => {
  const certJs = fs.readFileSync(path.join(ROOT, 'assets/js/tools/code-formatter/cert-page.js'), 'utf8');
  const acadJs = fs.readFileSync(path.join(ROOT, 'assets/js/tools/code-formatter/academy-ui.js'), 'utf8');
  assert.doesNotMatch(certJs, /\.innerHTML\s*=/);
  assert.doesNotMatch(certJs, /insertAdjacentHTML/);
  assert.doesNotMatch(acadJs, /\.innerHTML\s*=/);
  assert.doesNotMatch(acadJs, /insertAdjacentHTML/);
});

test('buildLinkedInCertUrl genera deep-link oficial de LinkedIn y cert/index.html soporta preview', () => {
  const url = buildLinkedInCertUrl({
    cert_code: 'JWS-CERT-12345ABCDE',
    target_slug: 'data-bi',
    issued_at: '2026-11-16T12:00:00Z',
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://www.linkedin.com');
  assert.equal(parsed.searchParams.get('startTask'), 'CERTIFICATION_NAME');
  assert.equal(parsed.searchParams.get('organizationName'), 'JW Solutions');
  assert.equal(parsed.searchParams.get('certId'), 'JWS-CERT-12345ABCDE');
  assert.equal(parsed.searchParams.get('issueYear'), '2026');
  assert.equal(parsed.searchParams.get('issueMonth'), '11');

  const certHtml = fs.readFileSync(path.join(ROOT, 'tools/code-formatter/cert/index.html'), 'utf8');
  assert.match(certHtml, /id="cf-cert-watermark"/);
  assert.match(certHtml, /id="cf-cert-revoked-banner"/);
  assert.match(certHtml, /id="cf-cert-print-btn"/);
  assert.match(certHtml, /id="cf-cert-linkedin-btn"/);
  assert.match(certHtml, /id="cf-cert-qr"/);
});
