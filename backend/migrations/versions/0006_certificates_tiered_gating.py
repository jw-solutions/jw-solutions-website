"""Certificados exclusivos por plan, cupos por ciclo, name-locking y portafolio público.

Revision ID: 0006
Revises: 0005
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS certificate_holder_name VARCHAR(140) NULL")
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS certificate_name_locked_at TIMESTAMPTZ NULL")
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS certificate_name_edited BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS portfolio_slug VARCHAR(64) NULL")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_portfolio_slug "
        "ON accounts(portfolio_slug) WHERE portfolio_slug IS NOT NULL"
    )

    op.execute(
        "ALTER TABLE academy_certificates "
        "ADD COLUMN IF NOT EXISTS subscription_id UUID NULL REFERENCES subscriptions(subscription_id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_academy_certificates_sub_id ON academy_certificates(subscription_id)")
    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS holder_full_name VARCHAR(140) NULL")
    op.execute("UPDATE academy_certificates SET holder_full_name = holder_name WHERE holder_full_name IS NULL")
    op.execute("ALTER TABLE academy_certificates ALTER COLUMN holder_full_name SET NOT NULL")

    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS cert_type VARCHAR(32) NOT NULL DEFAULT 'language'")
    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS target_slug VARCHAR(80) NULL")
    op.execute("UPDATE academy_certificates SET target_slug = path_id WHERE target_slug IS NULL")
    op.execute("ALTER TABLE academy_certificates ALTER COLUMN target_slug SET NOT NULL")

    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS language_code VARCHAR(16) NOT NULL DEFAULT 'es'")
    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'valid'")
    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL")
    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(255) NULL")
    op.execute("ALTER TABLE academy_certificates ADD COLUMN IF NOT EXISTS verified_views_count INTEGER NOT NULL DEFAULT 0")

    # Limpiar posibles duplicados antes de crear la restricción única
    op.execute("""
        DELETE FROM academy_certificates a
        USING academy_certificates b
        WHERE a.ctid < b.ctid
          AND a.account_id = b.account_id
          AND a.cert_type = b.cert_type
          AND a.target_slug = b.target_slug
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_academy_cert_account_type_target'
            ) THEN
                ALTER TABLE academy_certificates
                ADD CONSTRAINT uq_academy_cert_account_type_target UNIQUE (account_id, cert_type, target_slug);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE academy_certificates DROP CONSTRAINT IF EXISTS uq_academy_cert_account_type_target")
    op.execute("DROP INDEX IF EXISTS ix_academy_certificates_sub_id")
    for col in (
        "verified_views_count",
        "revoked_reason",
        "revoked_at",
        "status",
        "language_code",
        "target_slug",
        "cert_type",
        "holder_full_name",
        "subscription_id",
    ):
        op.execute(f"ALTER TABLE academy_certificates DROP COLUMN IF EXISTS {col}")

    op.execute("DROP INDEX IF EXISTS ux_accounts_portfolio_slug")
    for col in (
        "portfolio_slug",
        "certificate_name_edited",
        "certificate_name_locked_at",
        "certificate_holder_name",
    ):
        op.execute(f"ALTER TABLE accounts DROP COLUMN IF EXISTS {col}")
