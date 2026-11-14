"""Soporte multi-canal (main-website y code-formatter) para newsletter en 7 idiomas.

Revision ID: 0003
Revises: 0002
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE newsletter_subscribers
        ADD COLUMN IF NOT EXISTS channel VARCHAR(50) NOT NULL DEFAULT 'main-website'
    """)
    op.execute(
        "ALTER TABLE newsletter_subscribers DROP CONSTRAINT IF EXISTS newsletter_subscribers_email_key"
    )
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_newsletter_subscribers_email_channel'
            ) THEN
                ALTER TABLE newsletter_subscribers
                ADD CONSTRAINT uq_newsletter_subscribers_email_channel UNIQUE (email, channel);
            END IF;
        END $$;
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_channel_status "
        "ON newsletter_subscribers (channel, status)"
    )

    op.execute("""
        ALTER TABLE newsletter_deliveries
        ADD COLUMN IF NOT EXISTS channel VARCHAR(50) NOT NULL DEFAULT 'main-website'
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_newsletter_deliveries_channel "
        "ON newsletter_deliveries (channel)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_newsletter_deliveries_channel")
    op.execute("ALTER TABLE newsletter_deliveries DROP COLUMN IF EXISTS channel")
    op.execute("DROP INDEX IF EXISTS ix_newsletter_subscribers_channel_status")
    op.execute(
        "ALTER TABLE newsletter_subscribers DROP CONSTRAINT IF EXISTS uq_newsletter_subscribers_email_channel"
    )
    op.execute("ALTER TABLE newsletter_subscribers DROP COLUMN IF EXISTS channel")
    op.execute(
        "ALTER TABLE newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email)"
    )
