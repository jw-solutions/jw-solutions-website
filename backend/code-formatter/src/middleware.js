import { readSessionToken, clearSessionCookie } from './cookies.js';
import { validateToken } from './sessions.js';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

/** Exige una sesión activa, no expirada y no revocada (comprobada en BD). Deja la sesión en req.session. */
export const requireSession = (pool) => async (req, res, next) => {
  const session = await validateToken(pool, readSessionToken(req)).catch(() => undefined);
  if (session === undefined) return sendJson(res, 503, { error: 'unavailable' });
  if (!session) return sendJson(res, 401, { error: 'unauthorized' }, { 'Set-Cookie': clearSessionCookie() });
  req.session = session;
  return next();
};
