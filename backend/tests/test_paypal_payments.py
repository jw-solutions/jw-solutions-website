from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.database import get_db
from app.models.academy import AcademyCertificate
from app.models.account import Account
from app.models.payment_order import ORDER_STATUS_PAID, ORDER_STATUS_PENDING, PaymentOrder
from app.models.subscription import Subscription
from app.security.csrf import require_csrf
from app.security.sessions import SessionInfo
from app.services.order_service import create_or_reuse_order
from app.services.payment_channels.paypal import calculate_paypal_pricing


def _make_settings(**overrides) -> Settings:
    base = dict(
        database_url="postgresql+psycopg://test:test@localhost:5432/test",
        session_secret="s" * 40,
        paypal_mode="sandbox",
        paypal_client_id="sb-client-id",
        paypal_client_secret="sb-client-secret",
        paypal_webhook_id="WH-TEST-123456",
        paypal_currency="USD",
        paypal_pass_fees_to_client=True,
        paypal_fee_percent=Decimal("0.054"),
        paypal_fee_fixed=Decimal("0.30"),
        paypal_return_url="https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=paypal_return",
        paypal_cancel_url="https://jw-solutions.com/tools/code-formatter/?mode=learn&payment=cancel",
    )
    base.update(overrides)
    return Settings(**base)


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
                portfolio_slug TEXT UNIQUE
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
                reminded_3d_at TEXT,
                reminded_1d_at TEXT,
                expired_notified_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
            CREATE TABLE notification_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_error TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                sent_at TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE academy_certificates (
                cert_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                subscription_id TEXT,
                path_id TEXT NOT NULL,
                holder_name TEXT NOT NULL,
                holder_full_name TEXT NOT NULL,
                cert_type TEXT NOT NULL DEFAULT 'language',
                target_slug TEXT NOT NULL,
                language_code TEXT NOT NULL DEFAULT 'es',
                status TEXT NOT NULL DEFAULT 'valid',
                revoked_at TEXT,
                revoked_reason TEXT,
                verified_views_count INTEGER NOT NULL DEFAULT 0,
                signature TEXT NOT NULL,
                issued_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """))

    LocalSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = LocalSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _create_account(db: Session, email: str = "buyer@example.com") -> Account:
    acc = Account(account_id=uuid.uuid4(), email=email, password_hash="argon2$fake", plan="free", status="active")
    db.add(acc)
    db.flush()
    return acc


def test_paypal_pricing_pass_fees_true_and_false():
    s_on = _make_settings(paypal_pass_fees_to_client=True, paypal_fee_percent=Decimal("0.054"), paypal_fee_fixed=Decimal("0.30"), paypal_currency="USD")
    p30 = calculate_paypal_pricing(Decimal("12.00"), s_on)
    # (12.00 + 0.30) / (1 - 0.054) = 12.30 / 0.946 = 13.002114... -> 13.00
    assert p30["base_amount"] == Decimal("12.00")
    assert p30["total_amount"] == Decimal("13.00")
    assert p30["fee_amount"] == Decimal("1.00")
    assert p30["currency"] == "USD"
    assert p30["pass_fees_to_client"] is True

    # También soporta porcentaje expresado como 5.4 sin doble conversión
    s_pct = _make_settings(paypal_pass_fees_to_client=True, paypal_fee_percent=Decimal("5.4"), paypal_fee_fixed=Decimal("0.30"))
    assert calculate_paypal_pricing(Decimal("12.00"), s_pct)["total_amount"] == Decimal("13.00")

    s_off = _make_settings(paypal_pass_fees_to_client=False)
    p_off = calculate_paypal_pricing(Decimal("30.00"), s_off)
    assert p_off["base_amount"] == Decimal("30.00")
    assert p_off["fee_amount"] == Decimal("0.00")
    assert p_off["total_amount"] == Decimal("30.00")
    assert p_off["pass_fees_to_client"] is False

    assert s_on.paypal_api_base == "https://api-m.sandbox.paypal.com"
    assert _make_settings(paypal_mode="live").paypal_api_base == "https://api-m.paypal.com"


def _run_sync(coro):
    try:
        coro.send(None)
    except StopIteration as exc:
        return exc.value
    raise AssertionError("Corrutina suspendida inesperadamente")


class _FakeRequest:
    def __init__(self, body: bytes, headers: dict[str, str] | None = None):
        self._body = body
        self.headers = headers or {}

    async def body(self) -> bytes:
        return self._body


def test_paypal_order_creation_capture_idempotent_and_tamper_blocking(db_session: Session, monkeypatch):
    from fastapi import HTTPException
    import app.api.payments as payments_api

    settings = _make_settings(paypal_pass_fees_to_client=True)
    account = _create_account(db_session)
    db_session.commit()

    monkeypatch.setattr(payments_api, "get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.order_service.create_paypal_order",
        lambda s, *, order_code, plan_id, total_amount, currency: (
            "PAYPAL-ORDER-001",
            "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-001",
        ),
    )
    session_info = SessionInfo(
        session_id=uuid.uuid4(),
        account_id=account.account_id,
        generation=1,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )

    # 1. Crear orden PayPal
    data = payments_api.create_order(
        payments_api.CreateOrderBody(plan_id="pro_30d", channel="paypal_checkout"),
        session=session_info,
        db=db_session,
    )
    db_session.commit()
    assert data["channel"] == "paypal_checkout"
    assert data["amount_usd"] == "13.00"
    assert data["pricing"]["base_amount"] == "12.00"
    assert data["pricing"]["fee_amount"] == "1.00"
    assert data["pricing"]["total_amount"] == "13.00"
    assert data["invoice_id"] == "PAYPAL-ORDER-001"
    order_code = data["order_code"]

    # 2. Bloquear moneda alterada en captura
    monkeypatch.setattr(
        payments_api,
        "capture_paypal_order",
        lambda s, *, paypal_order_id: {
            "order_status": "COMPLETED",
            "capture_status": "COMPLETED",
            "paypal_order_id": paypal_order_id,
            "capture_id": "CAP-BAD-CURR",
            "custom_id": order_code,
            "amount": Decimal("13.00"),
            "currency": "EUR",
        },
    )
    with pytest.raises(HTTPException) as exc_curr:
        payments_api.capture_paypal(
            payments_api.PayPalCaptureBody(paypal_order_id="PAYPAL-ORDER-001"),
            session=session_info,
            db=db_session,
        )
    assert exc_curr.value.status_code == 422

    # 3. Bloquear monto alterado (< esperado)
    monkeypatch.setattr(
        payments_api,
        "capture_paypal_order",
        lambda s, *, paypal_order_id: {
            "order_status": "COMPLETED",
            "capture_status": "COMPLETED",
            "paypal_order_id": paypal_order_id,
            "capture_id": "CAP-BAD-AMT",
            "custom_id": order_code,
            "amount": Decimal("11.00"),
            "currency": "USD",
        },
    )
    with pytest.raises(HTTPException) as exc_amt:
        payments_api.capture_paypal(
            payments_api.PayPalCaptureBody(paypal_order_id="PAYPAL-ORDER-001"),
            session=session_info,
            db=db_session,
        )
    assert exc_amt.value.status_code == 422

    # 4. Captura válida -> activa suscripción
    monkeypatch.setattr(
        payments_api,
        "capture_paypal_order",
        lambda s, *, paypal_order_id: {
            "order_status": "COMPLETED",
            "capture_status": "COMPLETED",
            "paypal_order_id": paypal_order_id,
            "capture_id": "CAP-OK-001",
            "custom_id": order_code,
            "amount": Decimal("13.00"),
            "currency": "USD",
        },
    )
    ok_cap = payments_api.capture_paypal(
        payments_api.PayPalCaptureBody(paypal_order_id="PAYPAL-ORDER-001"),
        session=session_info,
        db=db_session,
    )
    db_session.commit()
    assert ok_cap["ok"] is True
    assert ok_cap["activated"] is True

    # 5. Segunda captura -> idempotente (no duplica días)
    dup_cap = payments_api.capture_paypal(
        payments_api.PayPalCaptureBody(paypal_order_id="PAYPAL-ORDER-001"),
        session=session_info,
        db=db_session,
    )
    assert dup_cap["activated"] is False
    assert dup_cap["already_paid"] is True
    subs = db_session.execute(select(Subscription).where(Subscription.account_id == account.account_id)).scalars().all()
    assert len(subs) == 1


def test_paypal_webhook_signature_idempotency_and_refund_revocation(db_session: Session, monkeypatch):
    from fastapi import HTTPException
    import app.api.payments as payments_api

    settings = _make_settings(paypal_pass_fees_to_client=False)
    account = _create_account(db_session, "webhook@example.com")
    monkeypatch.setattr(
        "app.services.order_service.create_paypal_order",
        lambda s, *, order_code, plan_id, total_amount, currency: (
            "PAYPAL-ORD-WH",
            "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORD-WH",
        ),
    )
    order = create_or_reuse_order(db_session, settings, account=account, plan_id="pro_90d", channel="paypal_checkout")
    db_session.commit()

    monkeypatch.setattr(payments_api, "get_settings", lambda: settings)

    # 1. Firma inválida -> 401
    monkeypatch.setattr(payments_api, "verify_paypal_webhook_signature", lambda *a, **k: False)
    bad_req = _FakeRequest(json.dumps({"id": "WH-EVT-1", "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": {}}).encode("utf-8"))
    with pytest.raises(HTTPException) as exc_sig:
        _run_sync(payments_api.paypal_webhook(bad_req, db=db_session))
    assert exc_sig.value.status_code == 401

    # 2. Firma válida + PAYMENT.CAPTURE.COMPLETED -> activa orden
    monkeypatch.setattr(payments_api, "verify_paypal_webhook_signature", lambda *a, **k: True)
    completed_payload = {
        "id": "WH-EVT-COMP-1",
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {
            "id": "CAP-WH-99",
            "custom_id": order.order_code,
            "amount": {"currency_code": "USD", "value": "30.00"},
        },
    }
    r1 = _run_sync(payments_api.paypal_webhook(_FakeRequest(json.dumps(completed_payload).encode("utf-8")), db=db_session))
    db_session.commit()
    assert r1["activated"] is True

    # 3. Reenvío duplicado del mismo event_id -> idempotente
    r2 = _run_sync(payments_api.paypal_webhook(_FakeRequest(json.dumps(completed_payload).encode("utf-8")), db=db_session))
    assert r2["activated"] is False

    # Emitir certificado ligado a la suscripción para verificar revocación en reembolso
    sub = db_session.execute(select(Subscription).where(Subscription.payment_order_id == order.id)).scalar_one()
    cert = AcademyCertificate(
        cert_id="JW-CERT-PP-01",
        account_id=account.account_id,
        subscription_id=sub.subscription_id,
        path_id="python",
        holder_name="Test Buyer",
        holder_full_name="Test Buyer",
        cert_type="language",
        target_slug="python",
        language_code="es",
        signature="sig-dummy",
    )
    db_session.add(cert)
    db_session.commit()

    # 4. Evento adverso PAYMENT.CAPTURE.REFUNDED -> revoca suscripción + certificado
    refund_payload = {
        "id": "WH-EVT-REF-1",
        "event_type": "PAYMENT.CAPTURE.REFUNDED",
        "resource": {
            "id": "REF-99",
            "custom_id": order.order_code,
        },
    }
    r_ref = _run_sync(payments_api.paypal_webhook(_FakeRequest(json.dumps(refund_payload).encode("utf-8")), db=db_session))
    db_session.commit()
    assert r_ref["revoked"] is True
    assert r_ref["revoked_certificates"] == 1

    db_session.expire_all()
    refreshed_sub = db_session.execute(select(Subscription).where(Subscription.subscription_id == sub.subscription_id)).scalar_one()
    refreshed_cert = db_session.execute(select(AcademyCertificate).where(AcademyCertificate.cert_id == "JW-CERT-PP-01")).scalar_one()
    refreshed_acc = db_session.get(Account, account.account_id)
    assert refreshed_sub.status == "REVOKED"
    assert refreshed_cert.revoked_at is not None
    assert refreshed_cert.status == "revoked"
    assert refreshed_acc.plan == "free"

    # 5. Reembolso duplicado -> idempotente
    r_ref_dup = _run_sync(payments_api.paypal_webhook(_FakeRequest(json.dumps(refund_payload).encode("utf-8")), db=db_session))
    assert r_ref_dup["revoked"] is False
