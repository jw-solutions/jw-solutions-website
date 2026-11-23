from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.database import Base, get_db
from app.models.account import Account
from app.models.outbox import NotificationOutbox  # noqa: F401
from app.models.payment import PaymentReport  # noqa: F401
from app.models.payment_evidence import PaymentEvidence
from app.models.payment_order import (
    ORDER_STATUS_PAID,
    ORDER_STATUS_PENDING,
    PaymentOrder,
    TrialUsage,  # noqa: F401
    WebhookEvent,  # noqa: F401
)
from app.models.subscription import Subscription
from app.services.binance_parser import parse_payment_text, parse_paypal_text
from app.services.order_service import activate_paid_order, create_or_reuse_order
from app.services.payment_matching import reconcile_evidence
from app.services.subscription_service import (
    TrialAlreadyUsedError,
    activate_trial_7d,
    grant_subscription_days,
    normalize_email,
)
from app.workers.imap_reconciliation import analyze_message, store_evidence


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _sqlite_setup(dbapi_conn, _record):
        dbapi_conn.create_function("gen_random_uuid", 0, lambda: str(uuid.uuid4()))
        dbapi_conn.create_function("now", 0, lambda: datetime.now(timezone.utc).isoformat())

    # Crear tablas necesarias en SQLite (sin JSONB cast de postgres en notification_outbox)
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE accounts (
                account_id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                plan TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                certificate_holder_name TEXT,
                certificate_name_locked_at TEXT,
                certificate_name_edited INTEGER NOT NULL DEFAULT 0,
                portfolio_slug TEXT UNIQUE,
                birth_month INTEGER,
                birth_day INTEGER,
                birthday_last_sent_year INTEGER,
                preferred_lang TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE payment_reports (
                report_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                txid TEXT NOT NULL,
                asset TEXT NOT NULL,
                amount NUMERIC NOT NULL,
                paid_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TEXT,
                provider TEXT NOT NULL DEFAULT 'BINANCE_PAY',
                transaction_date TEXT,
                review_notes TEXT,
                reviewed_by TEXT,
                attribution_utm TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE payment_orders (
                id TEXT PRIMARY KEY,
                order_code TEXT NOT NULL UNIQUE,
                account_id TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                days_to_grant INTEGER NOT NULL,
                channel TEXT NOT NULL,
                amount_usd NUMERIC NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                provider_invoice_id TEXT,
                provider_checkout_url TEXT,
                reported_txid TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING',
                expires_at TEXT NOT NULL,
                paid_at TEXT,
                attribution_utm TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE subscriptions (
                subscription_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                starts_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                payment_report_id TEXT UNIQUE,
                payment_order_id TEXT UNIQUE,
                approved_by TEXT NOT NULL,
                approved_at TEXT DEFAULT CURRENT_TIMESTAMP,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE trial_usage (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL UNIQUE,
                normalized_email TEXT NOT NULL UNIQUE,
                ip_hash TEXT NOT NULL,
                device_fingerprint_hash TEXT NOT NULL,
                granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE webhook_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel TEXT NOT NULL,
                webhook_event_id TEXT NOT NULL UNIQUE,
                external_txid TEXT NOT NULL,
                order_code TEXT,
                processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(channel, external_txid)
            )
        """))
        conn.execute(text("""
            CREATE TABLE payment_evidence (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL DEFAULT 'BINANCE_PAY',
                mailbox TEXT NOT NULL,
                mailbox_uidvalidity INTEGER NOT NULL,
                mailbox_uid INTEGER NOT NULL,
                message_id TEXT,
                raw_message_sha256 TEXT NOT NULL,
                sender_address TEXT NOT NULL,
                sender_auth_status TEXT NOT NULL,
                transaction_id TEXT,
                amount NUMERIC,
                asset TEXT,
                recipient_id TEXT,
                reference_code TEXT,
                matched_order_id TEXT,
                transferred_at TEXT,
                received_at TEXT NOT NULL,
                parse_status TEXT NOT NULL,
                match_status TEXT NOT NULL DEFAULT 'UNMATCHED',
                matched_report_id TEXT,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE notification_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP,
                locked_until TEXT,
                last_error TEXT,
                idempotency_key TEXT UNIQUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                sent_at TEXT
            )
        """))

    # Parchear enqueue para SQLite (en producción usa CAST(:payload AS JSONB))
    import app.services.notification_service as ns
    orig_enqueue = ns.enqueue

    def _sqlite_enqueue(session, event_type, payload, idempotency_key=None):
        row = session.execute(
            text(
                "INSERT INTO notification_outbox (event_type, payload, status, idempotency_key) "
                "VALUES (:event_type, :payload, 'queued', :key) "
                "ON CONFLICT (idempotency_key) DO NOTHING RETURNING id"
            ),
            {"event_type": event_type, "payload": json.dumps(payload, default=str), "key": idempotency_key},
        ).first()
        return row[0] if row else None

    ns.enqueue = _sqlite_enqueue
    import app.services.subscription_service as ss
    import app.services.order_service as os_mod
    import app.services.payment_matching as pm
    import app.workers.imap_reconciliation as ir
    ss.enqueue = _sqlite_enqueue
    os_mod.enqueue = _sqlite_enqueue
    pm.enqueue = _sqlite_enqueue
    ir.enqueue = _sqlite_enqueue

    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        ns.enqueue = orig_enqueue
        session.close()
        engine.dispose()


def _test_settings() -> Settings:
    return Settings(
        database_url="sqlite:///:memory:",
        session_secret="s" * 40,
        binance_notification_senders="do-not-reply@ses.binance.com,notify@binance.com",
        paypal_notification_senders="service@paypal.com",
        trusted_forwarders="chirinos0511@gmail.com",
        trusted_authserv_id="mx.google.com",
        imap_username="eme.designs.store@gmail.com",
        nowpayments_ipn_secret="test_ipn_secret_1234567890",
        auto_activate_verified_p2p=True,
    )


def _create_account(db: Session, email: str) -> Account:
    acc = Account(account_id=uuid.uuid4(), email=email, password_hash="hash", plan="free", status="active")
    db.add(acc)
    db.flush()
    return acc


def test_order_creation_code_format_ttl_and_idempotency(db_session: Session):
    settings = _test_settings()
    acc = _create_account(db_session, "buyer@example.com")
    now = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)

    o1 = create_or_reuse_order(db_session, settings, account=acc, plan_id="pro_30d", channel="binance_p2p", now=now)
    assert o1.order_code.startswith("JW-")
    assert len(o1.order_code) == 12
    assert not any(c in o1.order_code[3:] for c in "0O1I")
    assert o1.status == ORDER_STATUS_PENDING
    assert o1.amount_usd == Decimal("12.00")
    exp = o1.expires_at if o1.expires_at.tzinfo else o1.expires_at.replace(tzinfo=timezone.utc)
    assert int((exp - now).total_seconds()) == 86400

    # Doble solicitud reutiliza la misma orden PENDING vigente
    o2 = create_or_reuse_order(db_session, settings, account=acc, plan_id="pro_30d", channel="binance_p2p", now=now)
    assert o2.id == o1.id


def test_cumulative_subscription_days_and_trial_anti_abuse(db_session: Session):
    settings = _test_settings()
    now = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)

    assert normalize_email("J.Doe+promo1@gmail.com") == "jdoe@gmail.com"
    assert normalize_email("j.d.o.e@googlemail.com") == "jdoe@gmail.com"

    acc1 = _create_account(db_session, "j.doe+1@gmail.com")
    sub_trial = activate_trial_7d(
        db_session, settings, account=acc1, client_ip_addr="190.10.20.30", device_fingerprint="fp-abc-123", now=now
    )
    assert sub_trial.expires_at == now + timedelta(days=7)

    # Mismo email normalizado con distinta cuenta debe fallar con TrialAlreadyUsedError
    acc2 = _create_account(db_session, "jdoe@gmail.com")
    with pytest.raises(TrialAlreadyUsedError):
        activate_trial_7d(
            db_session, settings, account=acc2, client_ip_addr="190.10.20.99", device_fingerprint="fp-other", now=now
        )

    # Misma IP en menos de 90 días debe fallar
    acc3 = _create_account(db_session, "other@outlook.com")
    with pytest.raises(TrialAlreadyUsedError):
        activate_trial_7d(
            db_session, settings, account=acc3, client_ip_addr="190.10.20.30", device_fingerprint="fp-other-2", now=now
        )

    # Mismo fingerprint debe fallar
    with pytest.raises(TrialAlreadyUsedError):
        activate_trial_7d(
            db_session, settings, account=acc3, client_ip_addr="190.10.20.88", device_fingerprint="fp-abc-123", now=now
        )

    # Suma acumulativa de días: 30 + 90 = 120 días sobre expires_at activo
    acc_paid = _create_account(db_session, "prouser@example.com")
    s1 = grant_subscription_days(db_session, acc_paid.account_id, 30, plan_id="pro_30d", now=now)
    s2 = grant_subscription_days(db_session, acc_paid.account_id, 90, plan_id="pro_90d", now=now)
    assert s2.starts_at == s1.expires_at
    assert s2.expires_at == now + timedelta(days=120)


def test_imap_dual_binance_forwarded_paypal_and_dkim_rejection(db_session: Session):
    settings = _test_settings()
    now = datetime.now(timezone.utc)
    acc = _create_account(db_session, "global@example.com")

    # 1) Orden PayPal con código JW-XXXXXXXXX
    order_pp = create_or_reuse_order(
        db_session,
        Settings(**{**settings.model_dump(), "paypal_me_url": "https://paypal.me/jwsol"}),
        account=acc,
        plan_id="pro_30d",
        channel="paypal_imap",
        now=now,
    )
    raw_paypal = (
        f"From: service@paypal.com\r\n"
        f"Message-ID: <pp-msg-1@paypal.com>\r\n"
        f"Authentication-Results: mx.google.com; dkim=pass header.d=paypal.com; spf=pass; dmarc=pass\r\n"
        f"Date: Sun, 15 Nov 2026 12:05:00 +0000\r\n"
        f"Subject: Receipt for your payment\r\n\r\n"
        f"You received $12.00 USD\nTransaction ID: 9AB12345CD678901E\nBuyer note: {order_pp.order_code}\n"
    ).encode("utf-8")

    ev, analysis = store_evidence(db_session, raw=raw_paypal, mailbox="eme.designs.store@gmail.com", uidvalidity=1, uid=10, settings=settings)
    assert ev is not None
    assert analysis.parse_status == "PARSED"
    status = reconcile_evidence(db_session, ev.id, settings)
    assert status == "VERIFIED"
    db_session.refresh(order_pp)
    assert order_pp.status == ORDER_STATUS_PAID

    # Message-ID duplicado debe ignorarse
    ev_dup, _ = store_evidence(db_session, raw=raw_paypal, mailbox="eme.designs.store@gmail.com", uidvalidity=1, uid=11, settings=settings)
    assert ev_dup is None

    # 2) Correo sin dkim=pass debe ir a QUARANTINED
    raw_spoof = (
        "From: service@paypal.com\r\n"
        "Message-ID: <spoof-1@evil.test>\r\n"
        "Authentication-Results: mx.google.com; dkim=fail\r\n"
        "Date: Sun, 15 Nov 2026 12:10:00 +0000\r\n\r\n"
        f"You received $12.00 USD\nTransaction ID: 9AB99999CD678901E\n{order_pp.order_code}\n"
    ).encode("utf-8")
    analysis_spoof = analyze_message(raw_spoof, settings, now=now)
    assert analysis_spoof.parse_status == "QUARANTINED"
    assert analysis_spoof.alert is True

    # 3) Binance reenviado desde chirinos0511@gmail.com con dkim=pass
    raw_fwd = (
        "From: chirinos0511@gmail.com\r\n"
        "Message-ID: <fwd-bin-1@gmail.com>\r\n"
        "Authentication-Results: mx.google.com; dkim=pass header.d=gmail.com; spf=pass; dmarc=pass\r\n"
        "Date: Sun, 15 Nov 2026 12:15:00 +0000\r\n\r\n"
        "---------- Forwarded message ---------\n"
        "From: Binance <do-not-reply@ses.binance.com>\n\n"
        "Amount: 30.00 USDT\n"
        "Transaction ID: 1234567890123456\n"
        "Transaction Time: 2026-11-15T12:14:00Z\n"
        "Receiver ID: 188552430\n"
    ).encode("utf-8")
    analysis_fwd = analyze_message(raw_fwd, settings, now=now)
    assert analysis_fwd.parse_status == "PARSED"
    assert analysis_fwd.parsed is not None
    assert analysis_fwd.parsed.amount == Decimal("30.00")


def _run_sync(coro):
    try:
        coro.send(None)
    except StopIteration as exc:
        return exc.value
    raise AssertionError("Corrutina suspendida inesperadamente")


def test_crypto_webhook_hmac_validation_tolerance_and_idempotency(db_session: Session):
    from fastapi import HTTPException
    import app.api.payments as payments_api

    settings = _test_settings()
    acc = _create_account(db_session, "crypto@example.com")
    now = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
    order = create_or_reuse_order(db_session, settings, account=acc, plan_id="pro_30d", channel="binance_p2p", now=now)

    orig_get_settings = payments_api.get_settings
    payments_api.get_settings = lambda: settings

    class _FakeRequest:
        def __init__(self, body_bytes: bytes, sig: str):
            self._body = body_bytes
            self.headers = {"x-nowpayments-sig": sig, "content-type": "application/json"}

        async def body(self) -> bytes:
            return self._body

    try:
        payload = {
            "payment_id": "np_pay_998877",
            "payment_status": "finished",
            "order_id": order.order_code,
            "price_amount": "11.88",  # 1% de tolerancia por network fee sobre $12.00
        }
        raw_body = json.dumps(payload).encode("utf-8")
        canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        valid_sig = hmac.new(b"test_ipn_secret_1234567890", canonical.encode("utf-8"), hashlib.sha512).hexdigest()

        # Firma inválida -> 401
        with pytest.raises(HTTPException) as exc:
            _run_sync(payments_api.crypto_webhook(_FakeRequest(raw_body, "deadbeef"), db=db_session))
        assert exc.value.status_code == 401

        # Firma válida -> 200 y activa la orden
        ok = _run_sync(payments_api.crypto_webhook(_FakeRequest(raw_body, valid_sig), db=db_session))
        assert ok["activated"] is True

        # Reintento idempotente -> no acredita dos veces
        dup = _run_sync(payments_api.crypto_webhook(_FakeRequest(raw_body, valid_sig), db=db_session))
        assert dup["activated"] is False
    finally:
        payments_api.get_settings = orig_get_settings
