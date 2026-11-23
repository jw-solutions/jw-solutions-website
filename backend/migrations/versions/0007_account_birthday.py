"""Soporte opcional de cumpleaños y idioma preferido en accounts (NULL por defecto).

Revision ID: 0007
Revises: 0006
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS birth_month SMALLINT NULL")
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS birth_day SMALLINT NULL")
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS birthday_last_sent_year SMALLINT NULL")
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS preferred_lang VARCHAR(10) NULL")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_accounts_birthday "
        "ON accounts(birth_month, birth_day) "
        "WHERE birth_month IS NOT NULL AND birth_day IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_accounts_birthday")
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS preferred_lang")
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS birthday_last_sent_year")
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS birth_day")
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS birth_month")
