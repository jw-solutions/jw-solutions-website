"""Pruebas de integración con PostgreSQL real (pgserver: binarios de PostgreSQL embebidos, sin Docker).

Se omiten si `pgserver` no está instalado. Aplican schema.sql + 002 (backend Node) y luego `alembic upgrade head`,
igual que en staging. Alternativa: exportar TEST_DATABASE_URL apuntando a una base DESECHABLE (se trunca).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
BASE_SQL = [BACKEND / "code-formatter/db/schema.sql", BACKEND / "code-formatter/db/002_accounts_payments.sql"]


@pytest.fixture(scope="session")
def database_url(tmp_path_factory):
    external = os.environ.get("TEST_DATABASE_URL")
    if external:
        yield external
        return
    pgserver = pytest.importorskip("pgserver")
    server = pgserver.get_server(tmp_path_factory.mktemp("pgdata"), cleanup_mode="stop")
    uri = server.get_uri()
    yield uri.replace("postgresql://", "postgresql+psycopg://", 1)
    server.cleanup()


@pytest.fixture(scope="session", autouse=True)
def migrated_db(database_url):
    import psycopg
    from alembic import command
    from alembic.config import Config

    os.environ["DATABASE_URL"] = database_url
    from app.core import database
    from app.core.config import get_settings

    for fn in (get_settings, database.get_engine, database.get_session_factory):
        fn.cache_clear()

    plain = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(plain, autocommit=True) as conn:
        for sql_file in BASE_SQL:
            conn.execute(sql_file.read_text(encoding="utf-8"))
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    command.upgrade(cfg, "head")
    yield cfg


@pytest.fixture(autouse=True)
def clean_db(migrated_db):
    from sqlalchemy import text

    from app.core.database import get_engine

    with get_engine().begin() as conn:
        conn.execute(
            text("TRUNCATE accounts, notification_outbox, imap_mailbox_state, payment_evidence RESTART IDENTITY CASCADE")
        )
    yield


@pytest.fixture
def make_account():
    from app.core.database import session_scope
    from app.models.account import Account

    def _make(email: str | None = None) -> uuid.UUID:
        with session_scope() as s:
            acc = Account(email=email or f"{uuid.uuid4().hex[:8]}@example.test", password_hash="x")
            s.add(acc)
            s.flush()
            return acc.account_id

    return _make


@pytest.fixture
def make_report():
    from app.core.database import session_scope
    from app.models.payment import PaymentReport

    def _make(account_id, txid="TX123456789", amount="1012.50", asset="USDT", when=None) -> uuid.UUID:
        when = when or datetime(2026, 10, 27, 14, 30, tzinfo=timezone.utc)
        with session_scope() as s:
            rep = PaymentReport(
                account_id=account_id, txid=txid, asset=asset, amount=Decimal(amount), paid_at=when.date(), transaction_date=when
            )
            s.add(rep)
            s.flush()
            return rep.report_id

    return _make
