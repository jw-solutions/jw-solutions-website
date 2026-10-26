// Monitor de sesión única: escucha SSE y expulsa la sesión local si la cuenta inicia sesión en otro equipo.
import { t } from '../i18n.js';

export const SESSION_HINT_KEY = 'cf.session_hint'; // marca no sensible que pone el flujo de login; evita conectar sin sesión

function lockAuthElements() {
  document.querySelectorAll('[data-cf-auth-required]').forEach((el) => {
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('inert', '');
    el.classList.add('cf-locked');
    el.querySelectorAll('button, input, select, textarea').forEach((c) => { c.disabled = true; });
    if ('disabled' in el) el.disabled = true;
  });
}

function showRevokedAlert() {
  if (document.getElementById('cf-session-alert')) return;
  const box = document.createElement('div');
  box.id = 'cf-session-alert';
  box.className = 'cf-alert';
  box.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = t('sessionRevoked');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cf-btn cf-btn--small';
  close.textContent = t('understood');
  close.addEventListener('click', () => box.remove());
  box.append(text, close);
  document.body.prepend(box);
}

/** Inicia el monitor. Devuelve { stop }. Si el servidor responde 401/404 la conexión se cierra sin reintentos. */
export function startSessionMonitor({ url = '/api/session/events' } = {}) {
  const es = new EventSource(url, { withCredentials: true });

  es.addEventListener('session_revoked', (ev) => {
    es.close();
    let detail = {};
    try { detail = JSON.parse(ev.data); } catch { /* sin detalle */ }
    try { localStorage.removeItem(SESSION_HINT_KEY); } catch { /* ignorar */ }
    lockAuthElements();
    showRevokedAlert();
    document.dispatchEvent(new CustomEvent('cf:session-revoked', { detail }));
  });

  es.addEventListener('error', () => {
    // CLOSED = el servidor rechazó la conexión (sin sesión); CONNECTING = el navegador reintenta solo.
    if (es.readyState === EventSource.CLOSED) es.close();
  });

  return { stop: () => es.close() };
}
