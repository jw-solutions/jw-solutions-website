import { EventEmitter } from 'node:events';
import { REVOKE_CHANNEL, SSE_HEARTBEAT_MS, SSE_RECHECK_MS } from './config.js';
import { isSessionActive } from './sessions.js';

/**
 * Bus de revocaciones sobre LISTEN/NOTIFY de PostgreSQL (funciona entre varias instancias).
 * `listen(channel, cb)` debe devolver una promesa con una función de baja.
 */
export function createRevocationBus(listen) {
  const emitter = new EventEmitter().setMaxListeners(0);
  const ready = listen(REVOKE_CHANNEL, (payload) => {
    try { const msg = JSON.parse(payload); emitter.emit(msg.session_id, msg); } catch { /* payload ajeno */ }
  });
  return {
    ready,
    subscribe(sessionId, cb) { emitter.on(sessionId, cb); return () => emitter.off(sessionId, cb); },
  };
}

/** Implementación para pg: una conexión dedicada con LISTEN. */
export function pgListen(pool) {
  return async (channel, cb) => {
    const client = await pool.connect();
    client.on('notification', (m) => { if (m.channel === channel) cb(m.payload); });
    await client.query(`LISTEN ${channel}`);
    return () => { client.release(true); }; // true: destruye la conexión para no devolver un LISTEN activo al pool
  };
}

/** Handler SSE de GET /api/session/events. Requiere req.session (middleware previo). */
export const sessionEvents = ({ pool, bus }) => async (req, res) => {
  const { session_id: sessionId } = req.session;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\nevent: ready\ndata: {}\n\n');

  let closed = false;
  const timers = [];
  const cleanup = () => { closed = true; timers.forEach(clearInterval); unsubscribe(); };
  const revoke = (msg) => {
    if (closed) return;
    res.write(`event: session_revoked\ndata: ${JSON.stringify({ reason: msg.reason || 'replaced', at: new Date().toISOString() })}\n\n`);
    cleanup();
    res.end();
  };

  const unsubscribe = bus.subscribe(sessionId, revoke);
  timers.push(setInterval(() => !closed && res.write(': ping\n\n'), SSE_HEARTBEAT_MS));
  timers.push(setInterval(async () => {
    if (closed) return;
    if (!(await isSessionActive(pool, sessionId).catch(() => true))) revoke({ reason: 'replaced' });
  }, SSE_RECHECK_MS));
  req.on('close', cleanup);

  // Cierra la ventana de carrera entre la validación del middleware y la suscripción.
  if (!(await isSessionActive(pool, sessionId).catch(() => true))) revoke({ reason: 'replaced' });
};
