import { COOKIE_NAME, SESSION_TTL_SECONDS } from './config.js';
import { sessionCookie, clearSessionCookie, readSessionToken } from './cookies.js';
import { createSession, endSession } from './sessions.js';
import { requireSession, sendJson } from './middleware.js';
import { sessionEvents } from './events.js';
import { createAuth, validateCredentials } from './auth.js';
import { validateReport, createPaymentReport } from './payments.js';
import { readJson, createRateLimiter, clientIp, applyCors, FREE_HOURLY_LIMIT } from './http-utils.js';

/**
 * Handler HTTP de la API (/api/auth/*, /api/session/*, /api/payments/*).
 *  - pool: pg.Pool (o compatible) · bus: createRevocationBus(...) · passwords: createPasswordService()
 *  - allowedOrigin: origen exacto del sitio (CORS con credenciales + comprobación CSRF en los POST)
 * Devuelve (req, res) => Promise<boolean>; false si la ruta no pertenece a la API.
 */
export function createApi({ pool, bus, passwords, allowedOrigin, limits = {} }) {
  const guard = requireSession(pool);
  const events = sessionEvents({ pool, bus });
  const auth = createAuth({ pool, passwords });
  const authLimiter = createRateLimiter({ windowMs: 60_000, max: limits.auth ?? 10 });
  // Rutas de cómputo (formateo remoto e IA): 20 solicitudes/hora por IP en el plan gratuito. Aún sin handlers: la limitación
  // ya está activa para que cualquier ruta futura bajo estos prefijos nazca protegida (readJson ya impone el tope de 16 KB).
  const heavyLimiter = createRateLimiter({ windowMs: 3_600_000, max: limits.heavy ?? FREE_HOURLY_LIMIT });
  const isHeavy = (p) => p === '/api/format' || p.startsWith('/api/format/') || p === '/api/ai' || p.startsWith('/api/ai/');
  const paymentLimiter = createRateLimiter({ windowMs: 3_600_000, max: limits.payments ?? 5 });

  async function startSession(req, res, accountId, status = 200) {
    const s = await createSession(pool, { accountId, userAgent: req.headers['user-agent'] || null });
    sendJson(res, status, { ok: true, replaced: Boolean(s.revokedSessionId), expiresAt: s.expiresAt }, { 'Set-Cookie': sessionCookie(s.token, SESSION_TTL_SECONDS) });
  }

  async function credentials(req, res, strict) {
    const parsed = await readJson(req);
    if (parsed.error) return sendJson(res, parsed.error === 'too_large' ? 413 : 400, { error: parsed.error }) || null;
    const { email, password } = parsed.body || {};
    if (!validateCredentials(email, password, { strict })) return sendJson(res, strict ? 422 : 401, { error: strict ? 'invalid_input' : 'invalid_credentials' }) || null;
    return { email, password };
  }

  return async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (!pathname.startsWith('/api/')) return false;
    if (applyCors(req, res, allowedOrigin)) return true;

    try {
      if (isHeavy(pathname) && !heavyLimiter.hit(`heavy:${clientIp(req)}`)) return sendJson(res, 429, { error: 'rate_limited' }, { 'Retry-After': '3600' }) || true;
      if (req.method === 'POST' && req.headers.origin !== allowedOrigin) return sendJson(res, 403, { error: 'bad_origin' }) || true;

      if (req.method === 'POST' && (pathname === '/api/auth/register' || pathname === '/api/auth/login')) {
        if (!authLimiter.hit(`${pathname}:${clientIp(req)}`)) return sendJson(res, 429, { error: 'rate_limited' }) || true;
        const isRegister = pathname.endsWith('/register');
        const cred = await credentials(req, res, isRegister);
        if (!cred) return true;
        if (isRegister) {
          const r = await auth.register(cred.email, cred.password);
          if (r.error) return sendJson(res, 409, { error: 'exists' }) || true;
          await startSession(req, res, r.accountId, 201);
        } else {
          const r = await auth.login(cred.email, cred.password);
          if (!r) return sendJson(res, 401, { error: 'invalid_credentials' }) || true;
          await startSession(req, res, r.accountId);
        }
        return true;
      }

      if (req.method === 'POST' && pathname === '/api/session/logout') {
        await endSession(pool, readSessionToken(req));
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
        return true;
      }

      if (req.method === 'POST' && pathname === '/api/payments/report') {
        await guard(req, res, async () => {
          if (!paymentLimiter.hit(req.session.account_id)) return sendJson(res, 429, { error: 'rate_limited' });
          const parsed = await readJson(req);
          if (parsed.error) return sendJson(res, parsed.error === 'too_large' ? 413 : 400, { error: parsed.error });
          const v = validateReport(parsed.body);
          if (!v.ok) return sendJson(res, 422, { error: 'invalid_input' });
          const r = await createPaymentReport(pool, req.session.account_id, v.value);
          if (r.error) return sendJson(res, 409, { error: 'duplicate' });
          return sendJson(res, 201, { ok: true, reportId: r.reportId });
        });
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
