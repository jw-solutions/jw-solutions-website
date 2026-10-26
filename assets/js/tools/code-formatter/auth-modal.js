// Cuenta: "¿Nuevo o ya usuario?" (crear cuenta / iniciar sesión). Función pay (no va en dist-public).
import { t, applyProI18n } from './i18n.js';
import { loadProMessages } from './pro-messages.js';
import { toast } from './actions.js';
import { postJson } from './services/api.js';
import { startSessionMonitor, SESSION_HINT_KEY } from './services/session-monitor.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function initAuthModal() {
  await loadProMessages();
  const dialog = document.getElementById('cf-auth-modal');
  if (!dialog) return;
  applyProI18n(dialog);

  const form = dialog.querySelector('#cf-auth-form');
  const status = dialog.querySelector('#cf-auth-status');
  const submit = dialog.querySelector('#cf-auth-submit');
  const tabs = [...dialog.querySelectorAll('[data-cf-auth-tab]')];
  let mode = 'register';

  const setMode = (m) => {
    mode = m;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cfAuthTab === m)));
    form.elements.password.autocomplete = m === 'register' ? 'new-password' : 'current-password';
    dialog.querySelector('#cf-auth-hint').hidden = m !== 'register';
    submit.textContent = t(m === 'register' ? 'authSubmitNew' : 'authSubmitLogin');
    status.textContent = '';
  };
  tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.cfAuthTab)));
  setMode('register');

  const open = () => { if (!dialog.open) dialog.showModal(); };
  document.addEventListener('cf:open-auth', open);
  document.querySelectorAll('[data-cf-open-auth]').forEach((b) => b.addEventListener('click', open));
  dialog.querySelector('[data-cf-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  const say = (key, ok = false) => { status.textContent = t(key); status.dataset.state = ok ? 'ok' : 'error'; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!EMAIL_RE.test(email) || (mode === 'register' && password.length < 10) || !password) return say('authErrWeak');

    submit.disabled = true;
    submit.textContent = t('authSending');
    try {
      const res = await postJson(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { email, password });
      if (res.ok) {
        form.reset();
        try { localStorage.setItem(SESSION_HINT_KEY, '1'); } catch { /* ignorar */ }
        startSessionMonitor();
        toast(t('authOk'));
        dialog.close();
      } else if (res.status === 401) say('authErrInvalid');
      else if (res.status === 409) say('authErrExists');
      else if (res.status === 400 || res.status === 422) say('authErrWeak');
      else if (res.status === 429) say('authErrRate');
      else say('authErrGeneric');
    } catch {
      say('authErrGeneric');
    } finally {
      submit.disabled = false;
      submit.textContent = t(mode === 'register' ? 'authSubmitNew' : 'authSubmitLogin');
    }
  });
}
