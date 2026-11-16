"""Órdenes de pago multicanal, Bono Trial 7 días anti-abuso e idempotencia triple.

Revision ID: 0005
Revises: 0004
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS payment_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_code VARCHAR(16) NOT NULL UNIQUE,
            account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
            plan_id VARCHAR(32) NOT NULL,
            days_to_grant INTEGER NOT NULL,
            channel VARCHAR(32) NOT NULL,
            amount_usd NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            provider_invoice_id VARCHAR(128) NULL,
            provider_checkout_url TEXT NULL,
            reported_txid VARCHAR(128) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
            paid_at TIMESTAMPTZ NULL,
            attribution_utm JSONB NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_orders_account_status ON payment_orders(account_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_orders_provider_invoice ON payment_orders(provider_invoice_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_orders_reported_txid ON payment_orders(lower(reported_txid)) WHERE reported_txid IS NOT NULL")

    op.execute("""
        CREATE TABLE IF NOT EXISTS trial_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL UNIQUE REFERENCES accounts(account_id) ON DELETE CASCADE,
            normalized_email VARCHAR(255) NOT NULL UNIQUE,
            ip_hash VARCHAR(64) NOT NULL,
            device_fingerprint_hash VARCHAR(64) NOT NULL,
            granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_trial_usage_ip_hash ON trial_usage(ip_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_trial_usage_fp_hash ON trial_usage(device_fingerprint_hash)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS webhook_events (
            id BIGSERIAL PRIMARY KEY,
            channel VARCHAR(32) NOT NULL,
            webhook_event_id VARCHAR(128) NOT NULL UNIQUE,
            external_txid VARCHAR(128) NOT NULL,
            order_code VARCHAR(16) NULL,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_webhook_channel_txid UNIQUE (channel, external_txid)
        )
    """)

    op.execute("ALTER TABLE subscriptions ALTER COLUMN payment_report_id DROP NOT NULL")
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_order_id UUID NULL REFERENCES payment_orders(id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_payment_order_id "
        "ON subscriptions(payment_order_id) WHERE payment_order_id IS NOT NULL"
    )

    op.execute("ALTER TABLE payment_evidence ADD COLUMN IF NOT EXISTS reference_code VARCHAR(16) NULL")
    op.execute("ALTER TABLE payment_evidence ADD COLUMN IF NOT EXISTS matched_order_id UUID NULL REFERENCES payment_orders(id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_evidence_imap_msg_id "
        "ON payment_evidence(message_id) WHERE message_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_evidence_provider_tx "
        "ON payment_evidence(provider, transaction_id) WHERE transaction_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_payment_evidence_provider_tx")
    op.execute("DROP INDEX IF EXISTS ux_payment_evidence_imap_msg_id")
    op.execute("ALTER TABLE payment_evidence DROP COLUMN IF EXISTS matched_order_id")
    op.execute("ALTER TABLE payment_evidence DROP COLUMN IF EXISTS reference_code")
    op.execute("DROP INDEX IF EXISTS ux_subscriptions_payment_order_id")
    op.execute("ALTER TABLE subscriptions DROP COLUMN IF EXISTS payment_order_id")
    op.execute("DROP TABLE IF EXISTS webhook_events")
    op.execute("DROP TABLE IF EXISTS trial_usage")
    op.execute("DROP TABLE IF EXISTS payment_orders")
