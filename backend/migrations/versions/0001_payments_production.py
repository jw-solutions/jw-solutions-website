"""Evidencia de pagos, suscripciones, recordatorios y ampliación del outbox.

Requisito previo: backend/code-formatter/db/schema.sql y 002_accounts_payments.sql ya aplicados
(accounts, payment_reports, notification_outbox). Esta migración falla sin tocar nada si faltan.

Revision ID: 0001
Revises:
"""
from alembic import op
from sqlalchemy import text

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_REQUIRED = ("accounts", "payment_reports", "notification_outbox")


def upgrade() -> None:
    conn = op.get_bind()
    for table in _REQUIRED:
        if conn.execute(text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar() is None:
            raise RuntimeError(f"Falta la tabla base '{table}': aplica primero backend/code-formatter/db/*.sql")

    # --- payment_reports: columnas del anexo. 'pending' == PENDING_REVIEW, 'verified' == APPROVED. ---
    op.execute("""
        ALTER TABLE payment_reports
          ADD COLUMN IF NOT EXISTS provider         VARCHAR(30)  NOT NULL DEFAULT 'BINANCE_PAY',
          ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMPTZ  NULL,
          ADD COLUMN IF NOT EXISTS review_notes     TEXT         NULL,
          ADD COLUMN IF NOT EXISTS reviewed_by      VARCHAR(254) NULL
    """)
    # ux_payment_reports_txid (lower(txid)) ya garantiza unicidad de transacción; se conserva.
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_reports_pending ON payment_reports (created_at) WHERE status = 'pending'")

    # --- subscriptions ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
          subscription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          account_id        UUID NOT NULL REFERENCES accounts (account_id) ON DELETE CASCADE,
          plan_id           VARCHAR(60) NOT NULL,
          status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          starts_at         TIMESTAMPTZ NOT NULL,
          expires_at        TIMESTAMPTZ NOT NULL,
          payment_report_id UUID NOT NULL REFERENCES payment_reports (report_id) ON DELETE RESTRICT,
          approved_by       VARCHAR(254) NOT NULL,
          approved_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_subscriptions_payment_report UNIQUE (payment_report_id),
          CONSTRAINT ck_subscriptions_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED')),
          CONSTRAINT ck_subscriptions_period CHECK (expires_at > starts_at)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_subscriptions_expiration ON subscriptions (status, expires_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_account ON subscriptions (account_id, status)")

    # --- payment_evidence ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS payment_evidence (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider            VARCHAR(30)  NOT NULL DEFAULT 'BINANCE_PAY',
          mailbox             VARCHAR(254) NOT NULL,
          mailbox_uidvalidity BIGINT       NOT NULL,
          mailbox_uid         BIGINT       NOT NULL,
          message_id          VARCHAR(500),
          raw_message_sha256  VARCHAR(64)  NOT NULL,
          sender_address      VARCHAR(254) NOT NULL,
          sender_auth_status  VARCHAR(30)  NOT NULL,
          transaction_id      VARCHAR(128),
          amount              NUMERIC(24, 10),
          asset               VARCHAR(20),
          recipient_id        VARCHAR(64),
          transferred_at      TIMESTAMPTZ,
          received_at         TIMESTAMPTZ  NOT NULL,
          parse_status        VARCHAR(30)  NOT NULL,
          match_status        VARCHAR(30)  NOT NULL DEFAULT 'UNMATCHED',
          matched_report_id   UUID NULL REFERENCES payment_reports (report_id) ON DELETE SET NULL,
          notes               TEXT NULL,
          created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
          CONSTRAINT unique_imap_message UNIQUE (mailbox, mailbox_uidvalidity, mailbox_uid),
          CONSTRAINT unique_imap_message_hash UNIQUE (mailbox, raw_message_sha256),
          CONSTRAINT valid_parse_status CHECK (parse_status IN ('PARSED', 'PARTIAL', 'INVALID', 'QUARANTINED')),
          CONSTRAINT valid_match_status CHECK (match_status IN
            ('UNMATCHED', 'CANDIDATE', 'AMBIGUOUS', 'MANUAL_REVIEW', 'VERIFIED', 'REJECTED'))
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_evidence_transaction
          ON payment_evidence (provider, transaction_id, amount, asset, transferred_at)
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_evidence_transaction
          ON payment_evidence (provider, transaction_id) WHERE transaction_id IS NOT NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_evidence_report ON payment_evidence (matched_report_id)")

    # --- estado persistente del buzón IMAP ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS imap_mailbox_state (
          mailbox     VARCHAR(254) NOT NULL,
          folder      VARCHAR(100) NOT NULL,
          uidvalidity BIGINT       NOT NULL,
          last_uid    BIGINT       NOT NULL DEFAULT 0,
          updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
          PRIMARY KEY (mailbox, folder)
        )
    """)

    # --- notification_outbox: lease, idempotencia y estados del worker Python ---
    op.execute("""
        ALTER TABLE notification_outbox
          ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMPTZ  NULL,
          ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200) NULL
    """)
    op.execute("ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_status_check")
    op.execute("""
        ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check
          CHECK (status IN ('pending', 'sent', 'failed', 'queued', 'processing'))
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_idempotency
          ON notification_outbox (idempotency_key) WHERE idempotency_key IS NOT NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_outbox_queued
          ON notification_outbox (next_attempt_at) WHERE status = 'queued'
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_outbox_processing
          ON notification_outbox (locked_until) WHERE status = 'processing'
    """)

    # --- subscription_reminders (después del outbox: referencia su id BIGINT) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscription_reminders (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          subscription_id      UUID NOT NULL REFERENCES subscriptions (subscription_id) ON DELETE CASCADE,
          reminder_days        INTEGER NOT NULL,
          scheduled_expiration TIMESTAMPTZ NOT NULL,
          status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          outbox_event_id      BIGINT NULL REFERENCES notification_outbox (id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          sent_at              TIMESTAMPTZ NULL,
          CONSTRAINT valid_reminder_days CHECK (reminder_days IN (3, 1, 0)),
          CONSTRAINT valid_reminder_status CHECK (status IN ('PENDING', 'SENT', 'CANCELLED')),
          CONSTRAINT unique_subscription_reminder UNIQUE (subscription_id, scheduled_expiration, reminder_days)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS subscription_reminders")
    op.execute("DROP INDEX IF EXISTS ix_outbox_processing")
    op.execute("DROP INDEX IF EXISTS ix_outbox_queued")
    op.execute("DROP INDEX IF EXISTS ux_outbox_idempotency")
    op.execute("DELETE FROM notification_outbox WHERE status IN ('queued', 'processing')")
    op.execute("ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_status_check")
    op.execute("""
        ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check
          CHECK (status IN ('pending', 'sent', 'failed'))
    """)
    op.execute("ALTER TABLE notification_outbox DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS locked_until")
    op.execute("DROP TABLE IF EXISTS imap_mailbox_state")
    op.execute("DROP TABLE IF EXISTS payment_evidence")
    op.execute("DROP TABLE IF EXISTS subscriptions")
    op.execute("DROP INDEX IF EXISTS ix_payment_reports_pending")
    op.execute("""
        ALTER TABLE payment_reports
          DROP COLUMN IF EXISTS reviewed_by,
          DROP COLUMN IF EXISTS review_notes,
          DROP COLUMN IF EXISTS transaction_date,
          DROP COLUMN IF EXISTS provider
    """)
