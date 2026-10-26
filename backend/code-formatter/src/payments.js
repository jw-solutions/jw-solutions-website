// Reportes de pago manual (Binance Pay). El reporte y su evento outbox se guardan en UNA transacción.
export const ASSETS = ['USDT', 'USDC', 'FDUSD', 'BNB', 'BTC', 'ETH'];
const TX_RE = /^[A-Za-z0-9_-]{6,128}$/;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,8})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** -> { ok:true, value } | { ok:false } */
export function validateReport(body, now = Date.now()) {
  if (!body || typeof body !== 'object') return { ok: false };
  const { txid, asset, amount, paid_at: paidAt } = body;
  if (typeof txid !== 'string' || !TX_RE.test(txid)) return { ok: false };
  if (!ASSETS.includes(asset)) return { ok: false };
  if (typeof amount !== 'string' || !AMOUNT_RE.test(amount) || Number(amount) <= 0) return { ok: false };
  if (typeof paidAt !== 'string' || !DATE_RE.test(paidAt)) return { ok: false };
  const t = Date.parse(`${paidAt}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== paidAt) return { ok: false };
  if (t > now + DAY_MS || t < now - 90 * DAY_MS) return { ok: false }; // no futuro (con 1 día de margen horario) ni > 90 días
  return { ok: true, value: { txid, asset, amount, paidAt } };
}

export const EVENT_PAYMENT_REPORTED = 'payment_report_created';

/** -> { reportId } | { error: 'duplicate' } */
export async function createPaymentReport(pool, accountId, { txid, asset, amount, paidAt }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let report;
    try {
      const { rows } = await client.query(
        `INSERT INTO payment_reports (account_id, txid, asset, amount, paid_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING report_id, created_at`,
        [accountId, txid, asset, amount, paidAt],
      );
      report = rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return { error: 'duplicate' };
      throw err;
    }
    const { rows: [account] } = await client.query('SELECT email FROM accounts WHERE account_id = $1', [accountId]);
    await client.query(
      'INSERT INTO notification_outbox (event_type, payload) VALUES ($1, $2)',
      [EVENT_PAYMENT_REPORTED, JSON.stringify({ report_id: report.report_id, account_email: account.email, txid, asset, amount, paid_at: paidAt })],
    );
    await client.query('COMMIT');
    return { reportId: report.report_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
