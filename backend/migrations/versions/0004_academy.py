"""Tablas de Code Formatter Academy (progreso, logros, niveles Pro privados, caché IA y atribución UTM).

Revision ID: 0004
Revises: 0003
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_learning_progress (
            account_id UUID PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
            completed JSONB NOT NULL DEFAULT '[]'::jsonb,
            remedial_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
            daily_streak INTEGER NOT NULL DEFAULT 0,
            last_daily_date DATE NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            id BIGSERIAL PRIMARY KEY,
            account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
            achievement_id VARCHAR(64) NOT NULL,
            unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_user_achievements_account_ach UNIQUE (account_id, achievement_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS remedial_attempts (
            id BIGSERIAL PRIMARY KEY,
            account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
            level_id VARCHAR(64) NOT NULL,
            error_type VARCHAR(32) NOT NULL,
            drill_id VARCHAR(64) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS academy_pro_levels (
            id BIGSERIAL PRIMARY KEY,
            tech VARCHAR(32) NOT NULL,
            level INTEGER NOT NULL,
            locale VARCHAR(16) NOT NULL DEFAULT 'es',
            title VARCHAR(200) NOT NULL,
            payload JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_academy_pro_levels_tech_lvl_loc UNIQUE (tech, level, locale)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS academy_hint_cache (
            cache_key CHAR(64) PRIMARY KEY,
            challenge_id VARCHAR(80) NOT NULL,
            error_code VARCHAR(64) NOT NULL,
            ast_signature VARCHAR(128) NOT NULL,
            locale VARCHAR(16) NOT NULL DEFAULT 'es',
            hint_text TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS academy_level_telemetry (
            id BIGSERIAL PRIMARY KEY,
            account_id UUID NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
            level_id VARCHAR(64) NOT NULL,
            passed BOOLEAN NOT NULL,
            error_type VARCHAR(32) NULL,
            duration_ms INTEGER NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        ALTER TABLE payment_reports
        ADD COLUMN IF NOT EXISTS attribution_utm JSONB NULL
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS academy_certificates (
            cert_id VARCHAR(32) PRIMARY KEY,
            account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
            path_id VARCHAR(64) NOT NULL,
            holder_name VARCHAR(120) NOT NULL,
            signature CHAR(64) NOT NULL,
            issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS academy_certificates")
    op.execute("ALTER TABLE payment_reports DROP COLUMN IF EXISTS attribution_utm")
    op.execute("DROP TABLE IF EXISTS academy_level_telemetry")
    op.execute("DROP TABLE IF EXISTS academy_hint_cache")
    op.execute("DROP TABLE IF EXISTS academy_pro_levels")
    op.execute("DROP TABLE IF EXISTS remedial_attempts")
    op.execute("DROP TABLE IF EXISTS user_achievements")
    op.execute("DROP TABLE IF EXISTS user_learning_progress")
