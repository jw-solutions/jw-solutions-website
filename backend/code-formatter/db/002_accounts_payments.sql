-- Cuentas, reportes de pago y patrón Outbox (ejecutar después de schema.sql).
-- Outbox: el reporte de pago y el evento de notificación se insertan en la MISMA transacción;
-- un worker asíncrono envía el correo a contact@jw-solutions.com con reintentos.

BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  account_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,                       -- Argon2id (formato PHC), nunca la contraseña
  plan          VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_email ON accounts (lower(email));

ALTER TABLE account_session_state DROP CONSTRAINT IF EXISTS account_session_state_account_fk;
ALTER TABLE account_session_state
  ADD CONSTRAINT account_session_state_account_fk
  FOREIGN KEY (account_id) REFERENCES accounts (account_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS payment_reports (
  report_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
  txid        VARCHAR(128) NOT NULL,
  asset       VARCHAR(10) NOT NULL,
  amount      NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  paid_at     DATE NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_reports_txid ON payment_reports (lower(txid));
CREATE INDEX IF NOT EXISTS ix_payment_reports_account ON payment_reports (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type      VARCHAR(50) NOT NULL,
  payload         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_outbox_due ON notification_outbox (next_attempt_at) WHERE status = 'pending';

COMMIT;
