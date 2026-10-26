import { COOKIE_NAME, SESSION_TTL_SECONDS } from './config.js';
import { sessionCookie, clearSessionCookie, readSessionToken } from './cookies.js';
import { createSession, endSession } from './sessions.js';
import { requireSession, sendJson } from './middleware.js';
import { sessionEvents } from './events.js';

/**
 * Crea el handler HTTP de la API de sesión.
 *  - pool: pg.Pool (o compatible)
 *  - bus: createRevocationBus(...)
 *  - authenticate(req): verifica credenciales y devuelve el account_id (UUID) o null. Lo aporta quien despliega.
 *  - allowedOrigin: origen exacto del sitio (defensa CSRF adicional a SameSite=Lax en peticiones POST).
 * Devuelve (req, res) => Promise<boolean>; false si la ruta no es de /api/session.
 */
export function createSessionApi({ pool, bus, authenticate, allowedOrigin }) {
  const guard = requireSession(pool);
  const events = sessionEvents({ pool, bus });

  return async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (!pathname.startsWith('/api/session/')) return false;

    try {
      if (req.method === 'POST' && (pathname === '/api/session/login' || pathname === '/api/session/logout')) {
        if (req.headers.origin !== allowedOrigin) return sendJson(res, 403, { error: 'bad_origin' }) || true;
      }

      if (req.method === 'POST' && pathname === '/api/session/login') {
        const accountId = await authenticate(req);
        if (!accountId) return sendJson(res, 401, { error: 'invalid_credentials' }) || true;
        const s = await createSession(pool, { accountId, userAgent: req.headers['user-agent'] || null });
        sendJson(res, 200, { ok: true, replaced: Boolean(s.revokedSessionId), expiresAt: s.expiresAt }, {
          'Set-Cookie': sessionCookie(s.token, SESSION_TTL_SECONDS),
        });
        return true;
      }

      if (req.method === 'POST' && pathname === '/api/session/logout') {
        await endSession(pool, readSessionToken(req));
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
        return true;
      }

      if (req.method === 'GET' && (pathname === '/api/session/me' || pathname === '/api/session/events')) {
        const handler = pathname.endsWith('/me')
          ? (rq, rs) => sendJson(rs, 200, { ok: true, generation: Number(rq.session.session_generation) })
          : events;
        await guard(req, res, () => handler(req, res));
        return true;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      console.error(`[${COOKIE_NAME}]`, err);
      if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
    }
    return true;
  };
}
