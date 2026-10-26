// Acceso a la API de backend (solo funciones pay). Base configurable con <meta name="cf-api-base" content="https://api.ejemplo.com">;
// vacía = mismo origen. Siempre con credenciales (cookie de sesión HttpOnly).
const base = () => (document.querySelector('meta[name="cf-api-base"]')?.content || '').replace(/\/+$/, '');

export const apiUrl = (path) => `${base()}${path}`;

/** POST JSON. Devuelve { status, ok, data } sin lanzar por códigos HTTP; lanza solo por fallo de red. */
export async function postJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }
  return { status: res.status, ok: res.ok, data };
}
