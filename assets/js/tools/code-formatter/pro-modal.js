// Modal PRO: ventajas, pago manual con Binance Pay y formulario de reporte de pago. Función pay (no va en dist-public).
import { t, applyProI18n } from './i18n.js';
import { loadProMessages } from './pro-messages.js';
import { toast, writeClipboard } from './actions.js';
import { postJson } from './services/api.js';

export const BINANCE_PAY_ID = '188552430';
const ASSETS = ['USDT', 'USDC', 'FDUSD', 'BNB', 'BTC', 'ETH'];
const TX_RE = /^[A-Za-z0-9_-]{6,128}$/;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,8})?$/;

const today = () => new Date().toISOString().slice(0, 10);

export async function initProModal() {
  await loadProMessages();
  const dialog = document.getElementById('cf-pro-modal');
  if (!dialog) return;
  applyProI18n(dialog);

  dialog.querySelector('#cf-pay-id').textContent = BINANCE_PAY_ID;
  const asset = dialog.querySelector('#cf-rp-asset');
  asset.replaceChildren(...ASSETS.map((a) => Object.assign(document.createElement('option'), { value: a, textContent: a })));
  const date = dialog.querySelector('#cf-rp-date');
  date.max = today();
  date.value = today();

  const open = (ev) => { ev?.preventDefault(); if (!dialog.open) dialog.showModal(); };
  document.querySelectorAll('[data-cf-open-pro], .cf-cta a[data-site-link], .cf-nav__link[data-cf-commercial]').forEach((a) => a.addEventListener('click', open));
  dialog.querySelector('[data-cf-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // clic en el fondo

  dialog.querySelector('#cf-pay-copy').addEventListener('click', async () => {
    try { await writeClipboard(BINANCE_PAY_ID); toast(t('payCopied')); } catch { toast(t('payCopyFail')); }
  });

  const form = dialog.querySelector('#cf-report-form');
  const status = dialog.querySelector('#cf-rp-status');
  const submit = dialog.querySelector('#cf-rp-submit');
  const say = (key, ok = false) => { status.textContent = t(key); status.dataset.state = ok ? 'ok' : 'error'; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const txid = form.elements.txid.value.trim();
    const amount = form.elements.amount.value.trim();
    const paidAt = form.elements.paid_at.value;
    if (!TX_RE.test(txid) || !AMOUNT_RE.test(amount) || Number(amount) <= 0 || !paidAt || paidAt > today()) return say('rpErrValid');

    submit.disabled = true;
    submit.textContent = t('rpSending');
    status.textContent = '';
    try {
      const res = await postJson('/api/payments/report', { txid, asset: form.elements.asset.value, amount, paid_at: paidAt });
      if (res.ok) { say('rpOk', true); form.reset(); date.value = today(); }
      else if (res.status === 401) { say('rpErrAuth'); document.dispatchEvent(new CustomEvent('cf:open-auth')); }
      else if (res.status === 409) say('rpErrDup');
      else if (res.status === 429) say('rpErrRate');
      else if (res.status === 400 || res.status === 422) say('rpErrValid');
      else say('rpErrGeneric');
    } catch {
      say('rpErrGeneric');
    } finally {
      submit.disabled = false;
      submit.textContent = t('rpSubmit');
    }
  });
}
