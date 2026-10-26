import { readSessionToken, clearSessionCookie } from './cookies.js';
import { validateToken } from './sessions.js';

export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
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
