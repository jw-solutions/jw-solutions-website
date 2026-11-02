// Acceso a la API de backend (solo funciones pay). Base configurable con <meta name="cf-api-base" content="https://api.ejemplo.com">;
// vacía = mismo origen. Siempre con credenciales (cookie de sesión HttpOnly).
const base = () => (document.querySelector('meta[name="cf-api-base"]')?.content || '').replace(/\/+$/, '');

export const apiUrl = (path) => `${base()}${path}`;

// Token CSRF: solo en memoria (nunca en localStorage). Lo entregan register/login y GET /api/csrf.
let csrfToken = null;

async function fetchCsrf() {
  try {
    const res = await fetch(apiUrl('/api/csrf'), { credentials: 'include' });
    csrfToken = res.ok ? ((await res.json()).csrf_token || null) : null;
  } catch { csrfToken = null; }
  return csrfToken;
}

async function send(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-CSRF-Token'] = token;
  return fetch(apiUrl(path), { method: 'POST', credentials: 'include', headers, body: JSON.stringify(body) });
}

/** POST JSON. Devuelve { status, ok, data } sin lanzar por códigos HTTP; lanza solo por fallo de red. */
export async function postJson(path, body) {
  const isAuth = path.startsWith('/api/auth/') && !path.endsWith('/logout');
  let res = await send(path, body, isAuth ? null : (csrfToken || await fetchCsrf()));
  if (res.status === 403 && !isAuth) { // token caducado (sesión reemplazada o página recargada): reintento único
    csrfToken = null;
    res = await send(path, body, await fetchCsrf());
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }
  if (isAuth) csrfToken = res.ok ? (data?.csrf_token || null) : null;
  return { status: res.status, ok: res.ok, data };
}
