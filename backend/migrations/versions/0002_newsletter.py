"""Tablas nativas de newsletter: suscriptores y registro idempotente de envíos.

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
          id                BIGSERIAL PRIMARY KEY,
          email             TEXT NOT NULL UNIQUE,
          lang              VARCHAR(10) NOT NULL DEFAULT 'es',
          status            VARCHAR(20) NOT NULL DEFAULT 'active',
          unsubscribe_token VARCHAR(64) NOT NULL UNIQUE,
          source            VARCHAR(50) NOT NULL DEFAULT 'website',
          subscribed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          unsubscribed_at   TIMESTAMPTZ NULL,
          CONSTRAINT ck_newsletter_subscribers_status CHECK (status IN ('active', 'unsubscribed'))
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_status ON newsletter_subscribers (status)"
    )

    op.execute("""
        CREATE TABLE IF NOT EXISTS newsletter_deliveries (
          id             BIGSERIAL PRIMARY KEY,
          event_id       VARCHAR(128) NOT NULL,
          article_slug   VARCHAR(255) NOT NULL,
          subscriber_id  BIGINT NOT NULL REFERENCES newsletter_subscribers (id) ON DELETE CASCADE,
          status         VARCHAR(20) NOT NULL,
          error_message  TEXT NULL,
          sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_newsletter_deliveries_event_sub UNIQUE (event_id, subscriber_id),
          CONSTRAINT ck_newsletter_deliveries_status CHECK (status IN ('sent', 'failed'))
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_newsletter_deliveries_event ON newsletter_deliveries (event_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS newsletter_deliveries")
    op.execute("DROP TABLE IF EXISTS newsletter_subscribers")
