// Worker del patrón Outbox: envía de forma asíncrona los eventos pendientes con reintentos exponenciales.
import { EVENT_PAYMENT_REPORTED } from './payments.js';

export const ADMIN_EMAIL = 'contact@jw-solutions.com';
const MAX_ATTEMPTS = 8;

// Evita inyección de cabeceras/líneas: los valores del usuario solo van en el cuerpo, sin saltos ni control.
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 200);

/** Construye el correo de alerta para el administrador. */
export function buildMail(event, to = ADMIN_EMAIL) {
  if (event.event_type !== EVENT_PAYMENT_REPORTED) throw new Error(`evento desconocido: ${event.event_type}`);
  const p = event.payload;
  return {
    to,
    subject: '[Code Formatter] Nuevo reporte de pago pendiente de verificación',
    text: [
      'Se registró un nuevo reporte de pago (Binance Pay).',
      '',
      `Reporte:  ${clean(p.report_id)}`,
      `Cuenta:   ${clean(p.account_email)}`,
      `ID tx:    ${clean(p.txid)}`,
      `Activo:   ${clean(p.asset)}`,
      `Importe:  ${clean(p.amount)}`,
      `Fecha:    ${clean(p.paid_at)}`,
      '',
      'Verifica la transferencia en Binance y activa el plan de la cuenta si es válida.',
    ].join('\n'),
  };
}

/** Procesa un lote. `send(mail)` debe lanzar si falla. Devuelve { sent, retried, failed }. */
export async function processOutbox(pool, { send, batch = 10, maxAttempts = MAX_ATTEMPTS, to = ADMIN_EMAIL }) {
  const client = await pool.connect();
  const out = { sent: 0, retried: 0, failed: 0 };
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, event_type, payload, attempts FROM notification_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batch],
    );
    for (const event of rows) {
      try {
        await send(buildMail(event, to));
        await client.query("UPDATE notification_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1", [event.id]);
        out.sent += 1;
      } catch (err) {
        const attempts = event.attempts + 1;
        const dead = attempts >= maxAttempts;
        await client.query(
          `UPDATE notification_outbox
              SET attempts = $2, status = $3, last_error = $4, next_attempt_at = now() + make_interval(secs => $5)
            WHERE id = $1`,
          [event.id, attempts, dead ? 'failed' : 'pending', String(err.message || err).slice(0, 500), Math.min(3600, 30 * 2 ** attempts)],
        );
        out[dead ? 'failed' : 'retried'] += 1;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return out;
}

/** Arranca el sondeo periódico. Devuelve stop(). */
export function startOutboxWorker(pool, opts, intervalMs = 15_000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await processOutbox(pool, opts); } catch (err) { console.error('[outbox]', err.message); } finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
