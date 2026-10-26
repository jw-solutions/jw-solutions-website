import { newToken, hashToken } from './tokens.js';
import { REVOKE_CHANNEL, SESSION_TTL_SECONDS } from './config.js';

// `pool` es un pg.Pool (o compatible): connect() -> client con query()/release(); query().

async function inTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inicio de sesión atómico. Bloquea la fila de estado de la cuenta (FOR UPDATE), así dos logins
 * simultáneos se serializan: el segundo revoca al primero. Devuelve el token en claro (una sola vez).
 */
export async function createSession(pool, { accountId, userAgent = null, ttlSeconds = SESSION_TTL_SECONDS }) {
  const token = newToken();
  return inTransaction(pool, async (db) => {
    await db.query('INSERT INTO account_session_state (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING', [accountId]);
    const { rows: [state] } = await db.query(
      'SELECT active_session_id, session_generation FROM account_session_state WHERE account_id = $1 FOR UPDATE',
      [accountId],
    );

    const revokedSessionId = state.active_session_id;
    if (revokedSessionId) {
      await db.query(
        "UPDATE user_sessions SET status = 'revoked', revoked_at = now(), revoked_reason = 'replaced' WHERE session_id = $1 AND status = 'active'",
        [revokedSessionId],
      );
    }

    const generation = Number(state.session_generation) + 1;
    const { rows: [created] } = await db.query(
      `INSERT INTO user_sessions (account_id, token_hash, status, session_generation, expires_at, user_agent)
       VALUES ($1, $2, 'active', $3, now() + make_interval(secs => $4), $5)
       RETURNING session_id, expires_at`,
      [accountId, hashToken(token), generation, ttlSeconds, userAgent],
    );
    await db.query(
      'UPDATE account_session_state SET active_session_id = $2, session_generation = $3, updated_at = now() WHERE account_id = $1',
      [accountId, created.session_id, generation],
    );

    if (revokedSessionId) {
      await db.query('SELECT pg_notify($1, $2)', [
        REVOKE_CHANNEL,
        JSON.stringify({ session_id: revokedSessionId, account_id: accountId, reason: 'replaced', generation }),
      ]);
    }
    return { token, sessionId: created.session_id, generation, expiresAt: created.expires_at, revokedSessionId };
  });
}

const ACTIVE_SESSION_SQL = `
  SELECT s.session_id, s.account_id, s.session_generation, s.expires_at
    FROM user_sessions s
    JOIN account_session_state a
      ON a.account_id = s.account_id
     AND a.active_session_id = s.session_id
     AND a.session_generation = s.session_generation
   WHERE s.status = 'active' AND s.expires_at > now()`;

/** Valida el token contra la BD en cada petición (revocación en tiempo real). Devuelve la sesión o null. */
export async function validateToken(pool, token) {
  if (!token) return null;
  const { rows } = await pool.query(`${ACTIVE_SESSION_SQL} AND s.token_hash = $1`, [hashToken(token)]);
  return rows[0] || null;
}

export async function isSessionActive(pool, sessionId) {
  const { rows } = await pool.query(`${ACTIVE_SESSION_SQL} AND s.session_id = $1`, [sessionId]);
  return rows.length > 0;
}

/** Cierre de sesión voluntario. */
export async function endSession(pool, token) {
  const session = await validateToken(pool, token);
  if (!session) return false;
  await inTransaction(pool, async (db) => {
    await db.query('SELECT 1 FROM account_session_state WHERE account_id = $1 FOR UPDATE', [session.account_id]);
    await db.query(
      "UPDATE user_sessions SET status = 'logged_out', revoked_at = now(), revoked_reason = 'logout' WHERE session_id = $1 AND status = 'active'",
      [session.session_id],
    );
    await db.query(
      'UPDATE account_session_state SET active_session_id = NULL, updated_at = now() WHERE account_id = $1 AND active_session_id = $2',
      [session.account_id, session.session_id],
    );
  });
  return true;
}
