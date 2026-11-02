// Newsletter de tips de Code Formatter. Independiente del newsletter del sitio principal:
// otro endpoint (meta cf-newsletter-endpoint) y los envíos van etiquetados con source=code-formatter-tips.
import { t, lang } from './i18n.js';

export const NEWSLETTER_SOURCE = 'code-formatter-tips';
const SESSION_KEY = 'cf.newsletter.sent';
const TIMEOUT_MS = 15000;
// Misma regla práctica que type=email, más un TLD de 2+ letras; el servidor es la validación definitiva.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (v) => v.length <= 254 && EMAIL_RE.test(v);

function readSent() {
  try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')); } catch { return new Set(); }
}

function rememberSent(set) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set])); } catch { /* almacenamiento bloqueado: queda el Set en memoria */ }
}

/** El endpoint sin configurar (placeholder REPLACE) o ajeno a Formspree no se usa. */
export function getEndpoint() {
  const url = document.querySelector('meta[name="cf-newsletter-endpoint"]')?.content?.trim() || '';
  return /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(url) && !/REPLACE/i.test(url) ? url : '';
}

export function initNewsletter() {
  const form = document.getElementById('cf-newsletter-form');
  if (!form) return;
  const input = form.elements.email;
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('cf-newsletter-status');
  const sent = readSent(); // emails ya enviados en esta sesión (sin duplicados)
  let busy = false;

  const setStatus = (state, key) => {
    status.dataset.state = state;
    status.textContent = key ? t(key) : '';
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const email = input.value.trim().toLowerCase();
    if (!isValidEmail(email)) { setStatus('error', 'nlErrInvalid'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    input.removeAttribute('aria-invalid');
    if (sent.has(email)) { setStatus('error', 'nlErrDuplicate'); return; }
    const endpoint = getEndpoint();
    if (!endpoint) { setStatus('error', 'nlErrConfig'); return; }

    busy = true;
    button.disabled = true;
    button.textContent = t('nlSending');
    setStatus('sending', 'nlSending');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email,
          source: NEWSLETTER_SOURCE,
          form_type: 'code-formatter-newsletter',
          lang,
          _gotcha: form.elements._gotcha?.value || '' // honeypot: Formspree descarta el envío si trae valor
        }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sent.add(email);
      rememberSent(sent);
      form.reset();
      setStatus('ok', 'nlSuccess');
    } catch (err) {
      console.warn('[code-formatter] suscripción fallida:', err.message);
      setStatus('error', 'nlErrGeneric');
    } finally {
      clearTimeout(timer);
      busy = false;
      button.disabled = false;
      button.textContent = t('nlSubmit');
    }
  });
}
