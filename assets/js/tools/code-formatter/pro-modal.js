// Modal PRO: Bono Trial 7 días, Selector de Pases Acumulables y Checkout Global Multicanal (PayPal Orders v2, Binance Pay, Cripto).
// Función pay (etiquetada con data-cf-commercial, no va en dist-public).
// Seguridad: cero innerHTML; toda la autoridad de precios/captura reside en el backend.
import { t, applyI18n, applyProI18n } from './i18n.js';
import { loadProMessages } from './pro-messages.js';
import { toast, writeClipboard } from './actions.js';
import { apiUrl, postJson } from './services/api.js';
import { checkActiveSession } from './auth-modal.js';

export const BINANCE_PAY_ID = '188552430';
export const BINANCE_HOLDER = 'JW_Sol';
const TX_RE = /^[A-Za-z0-9_-]{6,80}$/;
const PAYPAL_TOKEN_RE = /^[A-Za-z0-9_-]{6,64}$/;

const PLAN_PRICES = {
  pro_30d: '12.00',
  pro_90d: '30.00',
  pro_365d: '99.00',
};

export const PLAN_BENEFIT_KEYS = {
  pro_30d: ['planBenLevels', 'planBenCert30d', 'planBenStackable'],
  pro_90d: ['planBenLevels', 'planBenCert90d', 'planBenPathsLangs', 'planBenLinkedIn'],
  pro_365d: ['planBenLevels', 'planBenCert365d', 'planBenBilingual', 'planBenPortfolio'],
};

/** Renderiza los beneficios diferenciados del plan seleccionado usando createElement + textContent. */
export function renderPlanBenefits(container, planId, translate = t) {
  if (!container) return;
  const keys = PLAN_BENEFIT_KEYS[planId] || PLAN_BENEFIT_KEYS.pro_30d;
  const items = keys.map((k) => {
    const li = document.createElement('li');
    li.textContent = translate(k);
    return li;
  });
  container.replaceChildren(...items);
}

/** Renderiza el desglose transparente de PayPal (base, comisión si aplica, total) sin innerHTML. */
export function renderPaypalBreakdown(container, pricing, translate = t) {
  if (!container) return;
  if (!pricing || !pricing.total_amount) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }
  const currency = String(pricing.currency || 'USD').toUpperCase();
  const rows = [
    { label: translate('payPaypalBaseLabel'), value: `$${pricing.base_amount} ${currency}`, total: false },
  ];
  if (pricing.pass_fees_to_client && Number(pricing.fee_amount || 0) > 0) {
    rows.push({
      label: translate('payPaypalFeeLabel'),
      value: `$${pricing.fee_amount} ${currency}`,
      total: false,
    });
  }
  rows.push({
    label: translate('payPaypalTotalLabel'),
    value: `$${pricing.total_amount} ${currency}`,
    total: true,
  });

  const nodes = [];
  for (const row of rows) {
    const dt = document.createElement('dt');
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    dd.textContent = row.value;
    if (row.total) {
      dt.className = 'cf-paypal-breakdown__total';
      dd.className = 'cf-paypal-breakdown__total';
    }
    nodes.push(dt, dd);
  }
  container.replaceChildren(...nodes);
  container.hidden = false;
}

/** Limpia parámetros de retorno/cancelación de PayPal usando history.replaceState. */
export function cleanPaypalUrlParams(href = window.location.href, replaceStateFn = (u) => window.history.replaceState({}, '', u)) {
  const url = new URL(href);
  let changed = false;
  for (const key of ['token', 'PayerID', 'payment', 'paypal']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed && typeof replaceStateFn === 'function') {
    replaceStateFn(url.toString());
  }
  return url.toString();
}

/** Maneja retorno de aprobación (capture) o cancelación desde PayPal al cargar la página. */
export async function handlePaypalReturn({
  href = typeof window !== 'undefined' ? window.location.href : '',
  postJsonFn = postJson,
  onConfirmed = () => {},
  onCancel = () => {},
  onError = () => {},
  replaceStateFn = typeof window !== 'undefined' ? (u) => window.history.replaceState({}, '', u) : () => {},
} = {}) {
  if (!href) return { handled: false };
  const url = new URL(href);
  const payment = (url.searchParams.get('payment') || '').toLowerCase();
  const paypalFlag = (url.searchParams.get('paypal') || '').toLowerCase();
  const token = (url.searchParams.get('token') || '').trim();
  const payerId = (url.searchParams.get('PayerID') || '').trim();

  if (payment === 'cancel' || paypalFlag === 'cancel') {
    cleanPaypalUrlParams(href, replaceStateFn);
    onCancel();
    return { handled: true, outcome: 'cancel' };
  }

  const isReturn = (payment === 'paypal_return' || payment === 'success' || Boolean(payerId)) && PAYPAL_TOKEN_RE.test(token);
  if (!isReturn) return { handled: false };

  cleanPaypalUrlParams(href, replaceStateFn);
  try {
    const res = await postJsonFn('/api/payments/paypal/capture', { paypal_order_id: token });
    if (res.ok && res.data?.ok) {
      onConfirmed(res.data);
      return { handled: true, outcome: 'captured', data: res.data };
    }
    onError(res.status || 500, res.data);
    return { handled: true, outcome: 'error', status: res.status };
  } catch {
    onError(0, null);
    return { handled: true, outcome: 'error', status: 0 };
  }
}

async function computeDeviceFingerprint() {
  const parts = [
    navigator.userAgent || '',
    navigator.language || '',
    `${screen?.width || 0}x${screen?.height || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    String(navigator.hardwareConcurrency || ''),
  ].join('|');
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fallback simple */ }
  return btoa(unescape(encodeURIComponent(parts))).slice(0, 64);
}

function formatTtl(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export async function initProModal() {
  try { await loadProMessages(); } catch { /* opcional */ }
  const dialog = document.getElementById('cf-pro-modal');
  if (!dialog) return;
  applyI18n(dialog);
  applyProI18n(document);

  const trialBanner = dialog.querySelector('#cf-trial-banner');
  const trialBtn = dialog.querySelector('#cf-trial-btn');
  const trialStatus = dialog.querySelector('#cf-trial-status');
  const confirmedBox = dialog.querySelector('#cf-pro-confirmed');
  const checkoutBody = dialog.querySelector('#cf-checkout-body');
  const planBtns = [...dialog.querySelectorAll('[data-cf-plan]')];
  const planBenefitsEl = dialog.querySelector('#cf-plan-benefits');
  const payTabs = [...dialog.querySelectorAll('[data-cf-pay-tab]')];
  const orderMeta = dialog.querySelector('#cf-order-meta');
  const orderCodeEl = dialog.querySelector('#cf-order-code');
  const orderTtlEl = dialog.querySelector('#cf-order-ttl');
  const orderPollingEl = dialog.querySelector('#cf-order-polling');
  const paneBinance = dialog.querySelector('#cf-pay-pane-binance');
  const paneCrypto = dialog.querySelector('#cf-pay-pane-crypto');
  const panePaypal = dialog.querySelector('#cf-pay-pane-paypal');
  const payIdEl = dialog.querySelector('#cf-pay-id');
  const payHolderEl = dialog.querySelector('#cf-pay-holder');
  const payAmountEl = dialog.querySelector('#cf-pay-amount');
  const cryptoLink = dialog.querySelector('#cf-crypto-open-link');
  const cryptoStatus = dialog.querySelector('#cf-crypto-status');
  const paypalBreakdownEl = dialog.querySelector('#cf-paypal-breakdown');
  const paypalPayBtn = dialog.querySelector('#cf-paypal-pay-btn');
  const paypalStatusEl = dialog.querySelector('#cf-paypal-status');
  const form = dialog.querySelector('#cf-report-form');
  const rpStatus = dialog.querySelector('#cf-rp-status');
  const rpSubmit = dialog.querySelector('#cf-rp-submit');

  if (payIdEl) payIdEl.textContent = BINANCE_PAY_ID;
  if (payHolderEl) payHolderEl.textContent = BINANCE_HOLDER;

  let selectedPlan = 'pro_30d';
  let selectedChannel = 'binance_p2p';
  let currentOrder = null;
  let channelsConfig = null;
  let pollTimer = null;
  let ttlTimer = null;
  let remainingSeconds = 0;
  let paypalRedirecting = false;

  renderPlanBenefits(planBenefitsEl, selectedPlan);

  function stopTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (ttlTimer) { clearInterval(ttlTimer); ttlTimer = null; }
  }

  function syncTrialBannerVisibility(user) {
    if (!trialBanner) return;
    const hideTrial = Boolean(user?.pro_active || user?.plan === 'pro' || user?.trial_used);
    trialBanner.hidden = hideTrial;
  }

  function showConfirmedCelebration() {
    stopTimers();
    if (confirmedBox) confirmedBox.hidden = false;
    if (checkoutBody) checkoutBody.hidden = true;
    if (trialBanner) trialBanner.hidden = true;
    checkActiveSession();
    document.dispatchEvent(new CustomEvent('cf:pro-activated'));
  }

  function updateTtlDisplay() {
    if (!orderTtlEl) return;
    if (remainingSeconds <= 0) {
      orderTtlEl.textContent = t('payOrderExpired');
      stopTimers();
      return;
    }
    orderTtlEl.textContent = formatTtl(remainingSeconds);
  }

  function startTtlCountdown(seconds) {
    if (ttlTimer) clearInterval(ttlTimer);
    remainingSeconds = Math.max(0, Number(seconds) || 0);
    updateTtlDisplay();
    ttlTimer = setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      updateTtlDisplay();
    }, 1000);
  }

  function refreshPaypalBreakdown() {
    const chPricing = channelsConfig?.channels?.paypal_checkout?.plans?.[selectedPlan] || null;
    const orderPricing = currentOrder?.channel === 'paypal_checkout' && currentOrder?.plan_id === selectedPlan
      ? currentOrder.pricing
      : null;
    renderPaypalBreakdown(paypalBreakdownEl, orderPricing || chPricing);
  }

  function renderOrder(order) {
    currentOrder = order;
    if (!order) return;
    if (orderMeta) orderMeta.hidden = false;
    if (orderCodeEl) orderCodeEl.textContent = order.order_code || '';
    if (payAmountEl) payAmountEl.textContent = `$${order.amount_usd || PLAN_PRICES[selectedPlan]} USDT`;
    if (payIdEl && order.binance_uid) payIdEl.textContent = order.binance_uid;
    if (payHolderEl && order.holder_name) payHolderEl.textContent = order.holder_name;

    if (cryptoLink) {
      if (selectedChannel === 'crypto_gateway' && order.checkout_url) {
        cryptoLink.href = order.checkout_url;
        cryptoLink.hidden = false;
      } else {
        cryptoLink.hidden = true;
      }
    }
    if (selectedChannel === 'paypal_checkout') {
      refreshPaypalBreakdown();
    }

    startTtlCountdown(order.ttl_seconds_remaining);
    if (order.status === 'PAID') {
      showConfirmedCelebration();
    } else {
      startPolling(order.order_code);
    }
  }

  async function pollOrderStatus(orderCode) {
    if (!dialog.open || !orderCode) return stopTimers();
    try {
      const res = await fetch(apiUrl(`/api/payments/orders/${encodeURIComponent(orderCode)}`), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'PAID') {
        showConfirmedCelebration();
        toast(t('payConfirmedTitle'));
      } else if (data.status === 'EXPIRED') {
        remainingSeconds = 0;
        updateTtlDisplay();
      }
    } catch { /* reintentar en el siguiente tick */ }
  }

  function startPolling(orderCode) {
    if (pollTimer) clearInterval(pollTimer);
    if (orderPollingEl) orderPollingEl.hidden = false;
    pollTimer = setInterval(() => { pollOrderStatus(orderCode); }, 10000);
  }

  async function loadChannels() {
    try {
      const res = await fetch(apiUrl('/api/payments/channels'), { cache: 'no-store' });
      if (!res.ok) return;
      channelsConfig = await res.json();
      const ch = channelsConfig.channels || {};
      const cryptoTab = dialog.querySelector('[data-cf-pay-tab="crypto_gateway"]');
      const paypalTab = dialog.querySelector('[data-cf-pay-tab="paypal_checkout"]');
      if (cryptoTab && ch.crypto_gateway && !ch.crypto_gateway.enabled) cryptoTab.hidden = true;
      if (paypalTab) paypalTab.hidden = !Boolean(ch.paypal_checkout?.enabled);
      refreshPaypalBreakdown();
    } catch { /* fallback a Binance P2P */ }
  }

  async function ensureOrder() {
    stopTimers();
    if (cryptoStatus) cryptoStatus.textContent = '';
    if (paypalStatusEl) paypalStatusEl.textContent = '';
    if (rpStatus) rpStatus.textContent = '';
    if (payAmountEl) payAmountEl.textContent = `$${PLAN_PRICES[selectedPlan] || '12.00'} USDT`;

    // Para PayPal Checkout la orden remota se crea al hacer clic en "Pagar con PayPal" para evitar órdenes huérfanas.
    if (selectedChannel === 'paypal_checkout') {
      if (orderMeta) orderMeta.hidden = true;
      refreshPaypalBreakdown();
      return null;
    }

    let attribution_utm = null;
    try {
      const rawUtm = sessionStorage.getItem('cf_academy_utm_v1');
      if (rawUtm) attribution_utm = JSON.parse(rawUtm);
    } catch { /* opcional */ }

    try {
      const res = await postJson('/api/payments/orders', {
        plan_id: selectedPlan,
        channel: selectedChannel,
        ...(attribution_utm ? { attribution_utm } : {}),
      });
      if (res.status === 401) {
        if (orderMeta) orderMeta.hidden = true;
        return null;
      }
      if (res.status === 503 && selectedChannel === 'crypto_gateway') {
        if (cryptoStatus) cryptoStatus.textContent = t('payCryptoNotConfigured');
        return null;
      }
      if (res.ok && res.data) {
        renderOrder(res.data);
        return res.data;
      }
    } catch { /* red no disponible */ }
    return null;
  }

  function setPlan(planId) {
    selectedPlan = planId;
    planBtns.forEach((b) => {
      const active = b.dataset.cfPlan === planId;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    renderPlanBenefits(planBenefitsEl, selectedPlan);
    refreshPaypalBreakdown();
    if (dialog.open) ensureOrder();
  }

  function setPayChannel(channel) {
    selectedChannel = channel;
    payTabs.forEach((b) => {
      const active = b.dataset.cfPayTab === channel;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    if (paneBinance) paneBinance.hidden = channel !== 'binance_p2p';
    if (paneCrypto) paneCrypto.hidden = channel !== 'crypto_gateway';
    if (panePaypal) panePaypal.hidden = channel !== 'paypal_checkout';
    if (dialog.open) ensureOrder();
  }

  planBtns.forEach((b) => b.addEventListener('click', () => setPlan(b.dataset.cfPlan)));
  payTabs.forEach((b) => b.addEventListener('click', () => setPayChannel(b.dataset.cfPayTab)));

  paypalPayBtn?.addEventListener('click', async () => {
    if (paypalRedirecting) return;
    paypalRedirecting = true;
    paypalPayBtn.disabled = true;
    paypalPayBtn.setAttribute('aria-busy', 'true');
    if (paypalStatusEl) {
      paypalStatusEl.textContent = t('payPaypalRedirecting');
      paypalStatusEl.dataset.state = '';
    }

    let attribution_utm = null;
    try {
      const rawUtm = sessionStorage.getItem('cf_academy_utm_v1');
      if (rawUtm) attribution_utm = JSON.parse(rawUtm);
    } catch { /* opcional */ }

    try {
      const res = await postJson('/api/payments/orders', {
        plan_id: selectedPlan,
        channel: 'paypal_checkout',
        ...(attribution_utm ? { attribution_utm } : {}),
      });
      if (res.status === 401) {
        if (paypalStatusEl) { paypalStatusEl.textContent = t('rpErrAuth'); paypalStatusEl.dataset.state = 'error'; }
        document.dispatchEvent(new CustomEvent('cf:open-auth', { detail: { mode: 'login' } }));
        return;
      }
      if (res.status === 503) {
        if (paypalStatusEl) { paypalStatusEl.textContent = t('payPaypalNotConfigured'); paypalStatusEl.dataset.state = 'error'; }
        return;
      }
      const approveUrl = res.data?.checkout_url || '';
      if (res.ok && approveUrl.startsWith('https://')) {
        if (res.data?.pricing) renderPaypalBreakdown(paypalBreakdownEl, res.data.pricing);
        window.location.assign(approveUrl);
        return;
      }
      if (paypalStatusEl) { paypalStatusEl.textContent = t('payPaypalError'); paypalStatusEl.dataset.state = 'error'; }
    } catch {
      if (paypalStatusEl) { paypalStatusEl.textContent = t('payPaypalError'); paypalStatusEl.dataset.state = 'error'; }
    } finally {
      paypalRedirecting = false;
      paypalPayBtn.disabled = false;
      paypalPayBtn.removeAttribute('aria-busy');
    }
  });

  const open = async (ev) => {
    ev?.preventDefault();
    if (confirmedBox) confirmedBox.hidden = true;
    if (checkoutBody) checkoutBody.hidden = false;
    if (!dialog.open) dialog.showModal();
    try {
      const session = await checkActiveSession();
      syncTrialBannerVisibility(session?.user || session);
    } catch { /* sin sesión activa */ }
    renderPlanBenefits(planBenefitsEl, selectedPlan);
    await loadChannels();
    await ensureOrder();
  };

  document.querySelectorAll('[data-cf-open-pro], .cf-cta a[data-site-link], .cf-nav__link[data-cf-commercial]').forEach((a) => {
    a.addEventListener('click', open);
  });
  dialog.querySelector('[data-cf-close]')?.addEventListener('click', () => { stopTimers(); dialog.close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) { stopTimers(); dialog.close(); } });
  dialog.addEventListener('close', stopTimers);

  dialog.querySelector('#cf-pay-copy')?.addEventListener('click', async () => {
    try { await writeClipboard(payIdEl?.textContent || BINANCE_PAY_ID); toast(t('payCopied')); } catch { toast(t('payCopyFail')); }
  });
  const copyOrderCode = async () => {
    if (!currentOrder?.order_code) return;
    try { await writeClipboard(currentOrder.order_code); toast(t('payCodeCopied')); } catch { toast(t('payCopyFail')); }
  };
  dialog.querySelector('#cf-order-copy-code')?.addEventListener('click', copyOrderCode);

  trialBtn?.addEventListener('click', async () => {
    trialBtn.disabled = true;
    trialBtn.setAttribute('aria-busy', 'true');
    const orig = trialBtn.textContent;
    trialBtn.textContent = t('trialActivating');
    if (trialStatus) trialStatus.textContent = '';
    try {
      const fp = await computeDeviceFingerprint();
      const res = await postJson('/api/subscriptions/trial', { device_fingerprint: fp });
      if (res.ok) {
        if (trialStatus) { trialStatus.textContent = t('trialSuccess'); trialStatus.dataset.state = 'ok'; }
        showConfirmedCelebration();
        toast(t('trialSuccess'));
      } else if (res.status === 401) {
        if (trialStatus) { trialStatus.textContent = t('trialAuthRequired'); trialStatus.dataset.state = 'error'; }
        document.dispatchEvent(new CustomEvent('cf:open-auth', {
          detail: { mode: 'register', bannerText: t('trialAuthRequired') },
        }));
      } else if (res.status === 409) {
        if (trialStatus) { trialStatus.textContent = t('trialAlreadyUsed'); trialStatus.dataset.state = 'error'; }
        if (trialBanner) trialBanner.hidden = true;
      } else {
        if (trialStatus) { trialStatus.textContent = t('rpErrGeneric'); trialStatus.dataset.state = 'error'; }
      }
    } catch {
      if (trialStatus) { trialStatus.textContent = t('rpErrGeneric'); trialStatus.dataset.state = 'error'; }
    } finally {
      trialBtn.disabled = false;
      trialBtn.removeAttribute('aria-busy');
      trialBtn.textContent = orig;
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const txid = form.elements.txid.value.trim();
    if (!TX_RE.test(txid)) {
      if (rpStatus) { rpStatus.textContent = t('rpErrValid'); rpStatus.dataset.state = 'error'; }
      return;
    }
    if (!currentOrder?.order_code) {
      await ensureOrder();
      if (!currentOrder?.order_code) {
        document.dispatchEvent(new CustomEvent('cf:open-auth', { detail: { mode: 'login' } }));
        return;
      }
    }

    rpSubmit.disabled = true;
    rpSubmit.setAttribute('aria-busy', 'true');
    rpSubmit.textContent = t('rpSending');
    if (rpStatus) rpStatus.textContent = '';
    try {
      const res = await postJson(`/api/payments/orders/${encodeURIComponent(currentOrder.order_code)}/report`, { txid });
      if (res.ok) {
        form.reset();
        if (res.data?.activated) {
          showConfirmedCelebration();
        } else if (rpStatus) {
          rpStatus.textContent = t('rpOk');
          rpStatus.dataset.state = 'ok';
        }
      } else if (res.status === 401) {
        if (rpStatus) { rpStatus.textContent = t('rpErrAuth'); rpStatus.dataset.state = 'error'; }
        document.dispatchEvent(new CustomEvent('cf:open-auth'));
      } else if (res.status === 409) {
        if (rpStatus) { rpStatus.textContent = t('rpErrDup'); rpStatus.dataset.state = 'error'; }
      } else if (res.status === 429) {
        if (rpStatus) { rpStatus.textContent = t('rpErrRate'); rpStatus.dataset.state = 'error'; }
      } else {
        if (rpStatus) { rpStatus.textContent = t('rpErrValid'); rpStatus.dataset.state = 'error'; }
      }
    } catch {
      if (rpStatus) { rpStatus.textContent = t('rpErrGeneric'); rpStatus.dataset.state = 'error'; }
    } finally {
      rpSubmit.disabled = false;
      rpSubmit.removeAttribute('aria-busy');
      rpSubmit.textContent = t('rpSubmit');
    }
  });

  document.addEventListener('cf:lang', () => {
    renderPlanBenefits(planBenefitsEl, selectedPlan);
    refreshPaypalBreakdown();
  });

  // Retorno automático desde PayPal (captura o cancelación)
  await handlePaypalReturn({
    onConfirmed: () => {
      if (!dialog.open) dialog.showModal();
      showConfirmedCelebration();
      toast(t('payPaypalCaptured'));
    },
    onCancel: () => {
      toast(t('payPaypalCanceled'));
    },
    onError: () => {
      toast(t('payPaypalCaptureError'));
    },
  });
}
