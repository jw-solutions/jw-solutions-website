// Cuentas: registro e inicio de sesión (Argon2id). No revela si un correo existe en el login.
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

export const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();

export function validateCredentials(email, password, { strict }) {
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email.trim())) return false;
  if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD) return false;
  if (strict && (password.length < MIN_PASSWORD || password.toLowerCase() === email.trim().toLowerCase())) return false;
  return true;
}

export function createAuth({ pool, passwords }) {
  let dummyHash; // para igualar el coste cuando el correo no existe (evita enumeración por tiempo)
  const dummy = async () => (dummyHash ||= await passwords.hash('cf-dummy-password-not-a-secret'));

  return {
    /** -> { accountId } | { error: 'exists' } */
    async register(email, password) {
      const hash = await passwords.hash(password);
      const { rows } = await pool.query(
        'INSERT INTO accounts (email, password_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING account_id',
        [normalizeEmail(email), hash],
      );
      return rows[0] ? { accountId: rows[0].account_id } : { error: 'exists' };
    },

    /** -> { accountId } | null */
    async login(email, password) {
      const { rows } = await pool.query(
        'SELECT account_id, password_hash, status FROM accounts WHERE lower(email) = $1',
        [normalizeEmail(email)],
      );
      const account = rows[0];
      if (!account) { await passwords.verify(await dummy(), password); return null; }
      const { valid, rehash } = await passwords.verify(account.password_hash, password);
      if (!valid || account.status !== 'active') return null;
      if (rehash) {
        await pool.query('UPDATE accounts SET password_hash = $2 WHERE account_id = $1', [account.account_id, await passwords.hash(password)]);
      }
      return { accountId: account.account_id };
    },
  };
}
