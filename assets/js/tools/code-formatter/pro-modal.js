// Modal PRO: Bono Trial 7 días, Selector de Pases Acumulables y Checkout Global Multicanal.
// Función pay (etiquetada con data-cf-commercial, no va en dist-public).
import { t, applyI18n, applyProI18n } from './i18n.js';
import { loadProMessages } from './pro-messages.js';
import { toast, writeClipboard } from './actions.js';
import { apiUrl, postJson } from './services/api.js';
import { checkActiveSession } from './auth-modal.js';

export const BINANCE_PAY_ID = '188552430';
export const BINANCE_HOLDER = 'JW_Sol';
const TX_RE = /^[A-Za-z0-9_-]{6,80}$/;

const PLAN_PRICES = {
  pro_30d: '12.00',
  pro_90d: '30.00',
  pro_365d: '99.00',
};

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

  const trialBtn = dialog.querySelector('#cf-trial-btn');
  const trialStatus = dialog.querySelector('#cf-trial-status');
  const confirmedBox = dialog.querySelector('#cf-pro-confirmed');
  const checkoutBody = dialog.querySelector('#cf-checkout-body');
  const planBtns = [...dialog.querySelectorAll('[data-cf-plan]')];
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
  const paypalCodeEl = dialog.querySelector('#cf-paypal-code');
  const paypalLink = dialog.querySelector('#cf-paypal-open-link');
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

  function stopTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (ttlTimer) { clearInterval(ttlTimer); ttlTimer = null; }
  }

  function showConfirmedCelebration() {
    stopTimers();
    if (confirmedBox) confirmedBox.hidden = false;
    if (checkoutBody) checkoutBody.hidden = true;
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

  function renderOrder(order) {
    currentOrder = order;
    if (!order) return;
    if (orderMeta) orderMeta.hidden = false;
    if (orderCodeEl) orderCodeEl.textContent = order.order_code || '';
    if (paypalCodeEl) paypalCodeEl.textContent = order.order_code || '';
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
    if (paypalLink) {
      if (selectedChannel === 'paypal_imap' && order.checkout_url) {
        paypalLink.href = order.checkout_url;
        paypalLink.hidden = false;
      } else {
        paypalLink.hidden = true;
      }
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
      const paypalTab = dialog.querySelector('[data-cf-pay-tab="paypal_imap"]');
      if (cryptoTab && ch.crypto_gateway && !ch.crypto_gateway.enabled) cryptoTab.hidden = true;
      if (paypalTab && ch.paypal_imap && !ch.paypal_imap.enabled) paypalTab.hidden = true;
    } catch { /* fallback a Binance P2P */ }
  }

  async function ensureOrder() {
    stopTimers();
    if (cryptoStatus) cryptoStatus.textContent = '';
    if (rpStatus) rpStatus.textContent = '';
    if (payAmountEl) payAmountEl.textContent = `$${PLAN_PRICES[selectedPlan] || '12.00'} USDT`;

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
        return;
      }
      if (res.status === 503 && selectedChannel === 'crypto_gateway') {
        if (cryptoStatus) cryptoStatus.textContent = t('payCryptoNotConfigured');
        return;
      }
      if (res.ok && res.data) {
        renderOrder(res.data);
      }
    } catch { /* red no disponible */ }
  }

  function setPlan(planId) {
    selectedPlan = planId;
    planBtns.forEach((b) => {
      const active = b.dataset.cfPlan === planId;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
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
    if (panePaypal) panePaypal.hidden = channel !== 'paypal_imap';
    if (dialog.open) ensureOrder();
  }

  planBtns.forEach((b) => b.addEventListener('click', () => setPlan(b.dataset.cfPlan)));
  payTabs.forEach((b) => b.addEventListener('click', () => setPayChannel(b.dataset.cfPayTab)));

  const open = async (ev) => {
    ev?.preventDefault();
    if (confirmedBox) confirmedBox.hidden = true;
    if (checkoutBody) checkoutBody.hidden = false;
    if (!dialog.open) dialog.showModal();
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
  dialog.querySelector('#cf-paypal-copy')?.addEventListener('click', copyOrderCode);

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
}
