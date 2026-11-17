// Cuenta: "¿Nuevo o ya usuario?" (crear cuenta / iniciar sesión) + Cerrar Sesión.
// Disponible tanto en versión completa como en dist-public/ para el Gate del Reto Diario.
import { t, applyI18n } from './i18n.js';
import { toast } from './actions.js';
import { apiUrl, postJson } from './services/api.js';
import { isFeatureOn, refreshRuntimeFeatures } from './ui-controller.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SESSION_HINT_KEY = 'cf.session_hint';
export const PENDING_ACTION_KEY = 'cf_pending_action';

async function computeAuthFingerprint() {
  const parts = [
    navigator.userAgent || '',
    navigator.language || '',
    `${screen?.width || 0}x${screen?.height || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ].join('|');
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fallback */ }
  return parts.slice(0, 64);
}

async function tryStartSessionMonitor() {
  if (!isFeatureOn('single_session')) return;
  try {
    const mod = await import('./services/session-monitor.js');
    mod.startSessionMonitor();
  } catch {
    /* session-monitor.js no presente en dist-public */
  }
}

export function setAuthUiState({ authenticated, email = '', plan = 'free' } = {}) {
  const logoutBtn = document.getElementById('cf-btn-logout');
  const userBadge = document.getElementById('cf-user-badge');
  if (logoutBtn) logoutBtn.hidden = !authenticated;
  if (userBadge) {
    if (authenticated && email) {
      userBadge.textContent = plan === 'pro' ? `${email} · PRO` : email;
      userBadge.hidden = false;
    } else {
      userBadge.textContent = '';
      userBadge.hidden = true;
    }
  }
}

export async function checkActiveSession() {
  try {
    const res = await fetch(apiUrl('/api/me'), { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      setAuthUiState({ authenticated: false });
      return null;
    }
    const data = await res.json();
    try { localStorage.setItem(SESSION_HINT_KEY, '1'); } catch { /* ignorar */ }
    setAuthUiState({ authenticated: true, email: data.email || '', plan: data.pro_active ? 'pro' : (data.plan || 'free') });
    return data;
  } catch {
    return null;
  }
}

export async function initAuthModal() {
  const dialog = document.getElementById('cf-auth-modal');
  if (!dialog) return;
  applyI18n(document);

  const form = dialog.querySelector('#cf-auth-form');
  const status = dialog.querySelector('#cf-auth-status');
  const submit = dialog.querySelector('#cf-auth-submit');
  const banner = dialog.querySelector('#cf-auth-gate-banner');
  const tabs = [...dialog.querySelectorAll('[data-cf-auth-tab]')];
  let mode = 'register';

  const setMode = (m) => {
    mode = m === 'login' ? 'login' : 'register';
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cfAuthTab === mode)));
    form.elements.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    const hint = dialog.querySelector('#cf-auth-hint');
    if (hint) hint.hidden = mode !== 'register';
    submit.textContent = t(mode === 'register' ? 'authSubmitNew' : 'authSubmitLogin');
    status.textContent = '';
  };
  tabs.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.cfAuthTab)));
  setMode('register');

  const open = (ev) => {
    const detail = ev?.detail || {};
    if (detail.mode === 'login' || detail.mode === 'register') setMode(detail.mode);
    if (banner) {
      if (detail.bannerText) {
        banner.textContent = detail.bannerText;
        banner.hidden = false;
      } else {
        banner.textContent = '';
        banner.hidden = true;
      }
    }
    if (!dialog.open) dialog.showModal();
  };

  document.addEventListener('cf:open-auth', open);
  document.querySelectorAll('[data-cf-open-auth]').forEach((b) => b.addEventListener('click', () => open({})));
  dialog.querySelector('[data-cf-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  const say = (key, ok = false) => {
    status.textContent = t(key);
    status.dataset.state = ok ? 'ok' : 'error';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!EMAIL_RE.test(email) || (mode === 'register' && password.length < 10) || !password) return say('authErrWeak');

    submit.disabled = true;
    submit.textContent = t('authSending');
    try {
      const payload = mode === 'register'
        ? { email, password, device_fingerprint: await computeAuthFingerprint() }
        : { email, password };
      const res = await postJson(mode === 'register' ? '/api/auth/register' : '/api/auth/login', payload);
      if (res.ok) {
        form.reset();
        if (banner) { banner.textContent = ''; banner.hidden = true; }
        try { localStorage.setItem(SESSION_HINT_KEY, '1'); } catch { /* ignorar */ }
        await tryStartSessionMonitor();
        const isPro = res.data?.plan === 'pro' || Boolean(res.data?.trial_auto_activated);
        setAuthUiState({ authenticated: true, email, plan: isPro ? 'pro' : (res.data?.plan || 'free') });
        await refreshRuntimeFeatures();
        if (res.data?.trial_auto_activated) {
          toast(t('trialAutoWelcome'), 7000);
        } else {
          toast(t('authOk'));
        }
        dialog.close();
        document.dispatchEvent(new CustomEvent('cf:auth-success', {
          detail: {
            email,
            plan: isPro ? 'pro' : (res.data?.plan || 'free'),
            trial_auto_activated: Boolean(res.data?.trial_auto_activated),
            plan_id: res.data?.plan_id || 'free',
          },
        }));
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

  const logoutBtn = document.getElementById('cf-btn-logout');
  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      await postJson('/api/session/logout', {});
    } catch { /* limpiar estado local aunque la red falle */ }
    try { localStorage.removeItem(SESSION_HINT_KEY); } catch { /* ignorar */ }
    try { sessionStorage.removeItem(PENDING_ACTION_KEY); } catch { /* ignorar */ }
    setAuthUiState({ authenticated: false });
    logoutBtn.disabled = false;
    toast(t('authLogoutOk'));
    document.dispatchEvent(new CustomEvent('cf:auth-logout'));
  });

  document.addEventListener('cf:session-revoked', () => {
    setAuthUiState({ authenticated: false });
  });

  if (localStorage.getItem(SESSION_HINT_KEY) === '1') {
    await checkActiveSession();
  }
}
