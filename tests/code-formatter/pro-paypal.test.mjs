import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const LOCALES = ['es', 'en', 'pt-BR', 'pt-PT', 'fr', 'de', 'it'];

function makeNode(tag) {
  const n = {
    tag,
    className: '',
    textContent: '',
    hidden: false,
    children: [],
    replaceChildren(...items) {
      this.children = items;
    },
  };
  return n;
}

test('pro-modal.js: renderPlanBenefits y renderPaypalBreakdown construyen DOM seguro sin innerHTML', async () => {
  const prevDoc = globalThis.document;
  const prevLoc = globalThis.location;
  globalThis.location = { href: 'https://jw-solutions.com/tools/code-formatter/', pathname: '/tools/code-formatter/', search: '' };
  globalThis.document = {
    baseURI: 'https://jw-solutions.com/tools/code-formatter/',
    documentElement: { lang: 'es', dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: (tag) => makeNode(tag),
    addEventListener: () => {},
  };
  try {
    const { featuresReady } = await import('../../assets/js/tools/code-formatter/ui-controller.js');
    await featuresReady;
    const { renderPlanBenefits, renderPaypalBreakdown } = await import('../../assets/js/tools/code-formatter/pro-modal.js');
    const es = (await import('../../assets/js/tools/code-formatter/locales/es.js')).default;
    const tr = (k) => es[k] || k;

    const benefitsEl = makeNode('ul');
    renderPlanBenefits(benefitsEl, 'pro_90d', tr);
    assert.equal(benefitsEl.children.length, 4);
    assert.ok(benefitsEl.children.some((li) => li.textContent.includes('LinkedIn')));

    const bdEl = makeNode('dl');
    renderPaypalBreakdown(
      bdEl,
      { base_amount: '12.00', fee_amount: '1.00', total_amount: '13.00', currency: 'USD', pass_fees_to_client: true },
      tr,
    );
    assert.equal(bdEl.hidden, false);
    assert.equal(bdEl.children.length, 6); // 3 pares dt/dd: base, fee, total
    assert.equal(bdEl.children[3].textContent, '$1.00 USD');
    assert.equal(bdEl.children[5].textContent, '$13.00 USD');

    // Con pass_fees_to_client=false: solo 2 pares (base y total)
    renderPaypalBreakdown(
      bdEl,
      { base_amount: '30.00', fee_amount: '0.00', total_amount: '30.00', currency: 'USD', pass_fees_to_client: false },
      tr,
    );
    assert.equal(bdEl.children.length, 4);
  } finally {
    globalThis.document = prevDoc;
    globalThis.location = prevLoc;
  }

  const proSrc = readFileSync(join(ROOT, 'assets/js/tools/code-formatter/pro-modal.js'), 'utf8');
  assert.doesNotMatch(proSrc, /\.innerHTML\s*=|insertAdjacentHTML/, 'pro-modal.js no debe usar innerHTML');
});

test('pro-modal.js: handlePaypalReturn captura orden y limpia URL con history.replaceState en retorno y cancelación', async () => {
  const { handlePaypalReturn } = await import('../../assets/js/tools/code-formatter/pro-modal.js');

  // 1. Retorno de aprobación
  const replaced = [];
  let confirmedData = null;
  const rOk = await handlePaypalReturn({
    href: 'https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=paypal_return&token=PAYPAL123456&PayerID=PAYER99',
    postJsonFn: async (path, body) => {
      assert.equal(path, '/api/payments/paypal/capture');
      assert.deepEqual(body, { paypal_order_id: 'PAYPAL123456' });
      return { ok: true, status: 200, data: { ok: true, order_code: 'JW-123456789', activated: true } };
    },
    onConfirmed: (d) => { confirmedData = d; },
    replaceStateFn: (u) => replaced.push(u),
  });
  assert.equal(rOk.handled, true);
  assert.equal(rOk.outcome, 'captured');
  assert.equal(confirmedData?.activated, true);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0], 'https://jw-solutions.com/tools/code-formatter/?mode=learn');

  // 2. Retorno de cancelación
  const replacedCancel = [];
  let canceled = false;
  const rCancel = await handlePaypalReturn({
    href: 'https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=cancel&token=PAYPAL123456',
    onCancel: () => { canceled = true; },
    replaceStateFn: (u) => replacedCancel.push(u),
  });
  assert.equal(rCancel.handled, true);
  assert.equal(rCancel.outcome, 'cancel');
  assert.equal(canceled, true);
  assert.equal(replacedCancel[0], 'https://jw-solutions.com/tools/code-formatter/?mode=learn');
});

test('Bloque 2: paridad i18n PayPal/PRO en 7 locales y aislamiento total en dist-public/', async () => {
  const keys = [
    'planRecommendedBadge',
    'planBenLevels',
    'planBenCert30d',
    'planBenStackable',
    'planBenCert90d',
    'planBenPathsLangs',
    'planBenLinkedIn',
    'planBenCert365d',
    'planBenBilingual',
    'planBenPortfolio',
    'payPaypalCheckoutLead',
    'payPaypalBaseLabel',
    'payPaypalFeeLabel',
    'payPaypalTotalLabel',
    'payPaypalRedirecting',
    'payPaypalNotConfigured',
    'payPaypalError',
    'payPaypalCaptured',
    'payPaypalCanceled',
    'payPaypalCaptureError',
  ];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of keys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave ${k} en ${loc}`);
    }
  }

  const distHtmlPath = join(ROOT, 'dist-public/tools/code-formatter/index.html');
  if (existsSync(distHtmlPath)) {
    const distHtml = readFileSync(distHtmlPath, 'utf8');
    assert.equal(distHtml.includes('data-cf-commercial'), false, 'dist-public no debe contener data-cf-commercial');
    assert.equal(distHtml.includes('cf-pro-modal'), false, 'dist-public no debe incluir #cf-pro-modal');
    assert.equal(existsSync(join(ROOT, 'dist-public/assets/js/tools/code-formatter/pro-modal.js')), false);
  }
});

test('Rediseño Planes PRO + fallback PayPal siempre visible + paridad 7 locales', async () => {
  const { getFallbackPaypalPricing } = await import('../../assets/js/tools/code-formatter/pro-modal.js');
  const p30 = getFallbackPaypalPricing('pro_30d');
  const p90 = getFallbackPaypalPricing('pro_90d');
  const p365 = getFallbackPaypalPricing('pro_365d');
  assert.equal(p30.total_amount, '12.00');
  assert.equal(p90.total_amount, '30.00');
  assert.equal(p365.total_amount, '99.00');
  assert.equal(p90.currency, 'USD');

  const html = readFileSync(join(ROOT, 'tools/code-formatter/index.html'), 'utf8');
  assert.match(html, /data-cf-plan="pro_30d"/);
  assert.match(html, /class="cf-plan-btn cf-plan-btn--recommended" data-cf-plan="pro_90d"/);
  assert.match(html, /class="cf-plan-btn cf-plan-btn--annual" data-cf-plan="pro_365d"/);
  assert.match(html, /class="cf-plan-benefits-card"/);
  assert.match(html, /id="cf-paypal-breakdown" class="cf-paypal-breakdown"/);
  assert.match(html, /id="cf-paypal-pay-btn" class="cf-btn cf-btn--primary cf-paypal-cta"/);

  const proKeys = [
    'planBestValueBadge',
    'plan30dDuration',
    'plan90dDuration',
    'plan365dDuration',
    'plan30dSub',
    'plan90dSub',
    'plan365dSub',
    'planBenefitsHeading',
    'planStackableNote',
    'payPaypalSecureBadge',
  ];
  for (const loc of LOCALES) {
    const dict = (await import(`../../assets/js/tools/code-formatter/locales/${loc}.js`)).default;
    for (const k of proKeys) {
      assert.ok(typeof dict[k] === 'string' && dict[k].trim().length > 0, `Falta clave PRO/PayPal ${k} en ${loc}`);
    }
  }
});
