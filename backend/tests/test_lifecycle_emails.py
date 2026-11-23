from __future__ import annotations

import types
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.newsletter import SubscribeBody, subscribe
from app.core.config import Settings
from app.services.notification_service import enqueue, render_email
from app.services.payment_channels.catalog import available_channels
from app.workers.expiration_worker import enqueue_birthday_greetings


def _settings(**overrides) -> Settings:
    base = dict(
        database_url="postgresql+psycopg://test:test@localhost:5432/test",
        session_secret="s" * 40,
        business_timezone="America/New_York",
        paypal_mode="live",
        paypal_client_id="live-client-id",
        paypal_client_secret="live-client-secret",
        paypal_webhook_id="WH-LIVE-123",
        paypal_currency="USD",
        paypal_pass_fees_to_client=True,
        paypal_fee_percent=Decimal("0.054"),
        paypal_fee_fixed=Decimal("0.30"),
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture()
def sqlite_db() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE accounts (
                account_id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                plan TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                birth_month INTEGER NULL,
                birth_day INTEGER NULL,
                birthday_last_sent_year INTEGER NULL,
                preferred_lang TEXT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE newsletter_subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                channel TEXT NOT NULL,
                lang TEXT NOT NULL,
                status TEXT NOT NULL,
                unsubscribe_token TEXT NOT NULL,
                source TEXT NOT NULL,
                subscribed_at TEXT,
                unsubscribed_at TEXT,
                created_at TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE notification_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                idempotency_key TEXT UNIQUE,
                status TEXT NOT NULL DEFAULT 'queued',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_error TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                sent_at TEXT
            )
        """))
    LocalSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = LocalSession()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


def test_newsletter_welcome_enqueued_idempotently_and_renders_dark_glass_gold(sqlite_db: Session):
    req = types.SimpleNamespace(
        url=types.SimpleNamespace(path="/api/newsletter/subscribe"),
        headers={"user-agent": "Mozilla/5.0"},
        client=types.SimpleNamespace(host="198.51.100.44"),
    )
    res = subscribe(
        SubscribeBody(email="dev@example.com", lang="es", channel="code-formatter", source="code-formatter-tips"),
        req,
        sqlite_db,
    )
    sqlite_db.commit()
    assert res == {"ok": True, "status": "subscribed"}

    rows = sqlite_db.execute(text("SELECT event_type, payload, idempotency_key FROM notification_outbox")).all()
    assert len(rows) == 1
    assert rows[0][0] == "newsletter_welcome"
    assert rows[0][2] == "newsletter_welcome:code-formatter:dev@example.com"

    # Re-suscripción activa no duplica correo
    res2 = subscribe(
        SubscribeBody(email="dev@example.com", lang="es", channel="code-formatter"),
        req,
        sqlite_db,
    )
    assert res2 == {"ok": True, "status": "already_subscribed"}
    assert sqlite_db.execute(text("SELECT COUNT(*) FROM notification_outbox")).scalar_one() == 1

    # Renderizado Dark Glass Gold con enlace de baja en 1 clic
    to, subject, txt, html = render_email(
        "newsletter_welcome",
        {"to": "dev@example.com", "channel": "code-formatter", "lang": "es", "unsubscribe_token": "tok_abc123"},
        _settings(),
    )
    assert to == "dev@example.com"
    assert "Code Formatter" in subject
    assert "/api/newsletter/unsubscribe?token=tok_abc123" in txt
    assert html is not None
    assert "#0B0E12" in html and "#171B22" in html and "#FBB200" in html
    assert "/api/newsletter/unsubscribe?token=tok_abc123" in html


def test_purchase_welcome_render_and_outbox_idempotency(sqlite_db: Session):
    settings = _settings()
    first = enqueue(
        sqlite_db,
        "order_paid",
        {
            "to": "buyer@example.com",
            "order_code": "JW-ABC123456",
            "channel": "paypal_checkout",
            "plan_id": "pro_90d",
            "days": 90,
            "expires_at": "2027-02-20T00:00:00+00:00",
            "lang": "en",
        },
        idempotency_key="order_paid:test-uuid-1",
    )
    dup = enqueue(
        sqlite_db,
        "order_paid",
        {"to": "buyer@example.com", "order_code": "JW-ABC123456"},
        idempotency_key="order_paid:test-uuid-1",
    )
    assert first is not None
    assert dup is None

    to, subject, txt, html = render_email(
        "order_paid",
        {
            "to": "buyer@example.com",
            "order_code": "JW-ABC123456",
            "channel": "paypal_checkout",
            "plan_id": "pro_90d",
            "days": 90,
            "expires_at": "2027-02-20T00:00:00+00:00",
            "lang": "en",
        },
        settings,
    )
    assert to == "buyer@example.com"
    assert "JW-ABC123456" in subject
    assert "pro_90d" in txt
    assert html is not None and "#FBB200" in html and "#0B0E12" in html


def test_birthday_greeting_optional_null_skipped_and_annual_dedup(sqlite_db: Session):
    settings = _settings()
    aid_null = str(uuid.uuid4())
    aid_bday = str(uuid.uuid4())
    sqlite_db.execute(
        text(
            "INSERT INTO accounts (account_id, email, password_hash, status, birth_month, birth_day, birthday_last_sent_year, preferred_lang) "
            "VALUES (:id1, 'nobday@example.com', 'h', 'active', NULL, NULL, NULL, 'es'), "
            "(:id2, 'bday@example.com', 'h', 'active', 11, 23, NULL, 'es')"
        ),
        {"id1": aid_null, "id2": aid_bday},
    )
    sqlite_db.commit()

    # Día coincidente (2026-11-23 en America/New_York): solo 1 cuenta con fecha recibe saludo
    day_2026 = datetime(2026, 11, 23, 15, 0, tzinfo=timezone.utc)
    count_1 = enqueue_birthday_greetings(sqlite_db, settings, now=day_2026)
    sqlite_db.commit()
    assert count_1 == 1

    # Re-ejecución el mismo año -> 0 duplicados
    count_dup = enqueue_birthday_greetings(sqlite_db, settings, now=day_2026)
    sqlite_db.commit()
    assert count_dup == 0

    # Año siguiente (2027-11-23) -> 1 nuevo envío anual
    day_2027 = datetime(2027, 11, 23, 15, 0, tzinfo=timezone.utc)
    count_next_year = enqueue_birthday_greetings(sqlite_db, settings, now=day_2027)
    sqlite_db.commit()
    assert count_next_year == 1

    # Renderizado Dark Glass Gold sin fechas ni PII
    to, subject, txt, html = render_email("birthday_greeting", {"to": "bday@example.com", "lang": "es", "year": 2026}, settings)
    assert to == "bday@example.com"
    assert "cumpleaños" in subject.lower()
    assert html is not None and "#0B0E12" in html and "#171B22" in html and "#FBB200" in html


def test_paypal_channel_enabled_in_catalog():
    ch = available_channels(_settings())
    assert ch["paypal_checkout"]["enabled"] is True
    assert ch["paypal_checkout"]["mode"] == "live"
    assert ch["paypal_checkout"]["plans"]["pro_30d"]["total_amount"] == "13.00"
