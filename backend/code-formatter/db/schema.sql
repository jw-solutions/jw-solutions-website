-- Code Formatter: control de sesión única por cuenta comercial (PostgreSQL 13+).
-- Invariante: una cuenta tiene como máximo UNA sesión 'active'. Se garantiza por dos vías:
--   1) account_session_state.active_session_id, protegido con SELECT ... FOR UPDATE al iniciar sesión.
--   2) índice único parcial ux_user_sessions_one_active (defensa en profundidad).

BEGIN;

CREATE TABLE IF NOT EXISTS account_session_state (
  account_id         UUID PRIMARY KEY,
  active_session_id  UUID NULL,
  session_generation BIGINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES account_session_state (account_id) ON DELETE CASCADE,
  token_hash         BYTEA NOT NULL UNIQUE,            -- SHA-256 del token; el token en claro nunca se guarda
  status             VARCHAR(20) NOT NULL CHECK (status IN ('active', 'revoked', 'expired', 'logged_out')),
  session_generation BIGINT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ NULL,
  revoked_reason     VARCHAR(40) NULL,                 -- 'replaced' | 'logout' | 'admin' ...
  user_agent         TEXT NULL
);

ALTER TABLE account_session_state
  DROP CONSTRAINT IF EXISTS account_session_state_active_fk;
ALTER TABLE account_session_state
  ADD CONSTRAINT account_session_state_active_fk
  FOREIGN KEY (active_session_id) REFERENCES user_sessions (session_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_one_active
  ON user_sessions (account_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_user_sessions_expires ON user_sessions (expires_at) WHERE status = 'active';

COMMIT;
