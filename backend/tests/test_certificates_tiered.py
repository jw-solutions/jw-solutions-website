from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.models.academy import UserLearningProgress
from app.models.account import Account
from app.models.subscription import Subscription
from app.services.certificate_service import (
    CertificateError,
    get_portfolio_public,
    issue_certificate_tx,
    revoke_certificates_for_subscription,
    update_holder_name_tx,
    verify_certificate_public,
)


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
                portfolio_slug TEXT UNIQUE,
                birth_month INTEGER,
                birth_day INTEGER,
                birthday_last_sent_year INTEGER,
                preferred_lang TEXT
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
            CREATE TABLE user_learning_progress (
                account_id TEXT PRIMARY KEY,
                completed TEXT NOT NULL DEFAULT '[]',
                remedial_completed TEXT NOT NULL DEFAULT '[]',
                daily_streak INTEGER NOT NULL DEFAULT 0,
                last_daily_date TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
                issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, cert_type, target_slug)
            )
        """))

    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _settings() -> Settings:
    return Settings(
        database_url="sqlite:///:memory:",
        session_secret="z" * 40,
        binance_notification_senders="notify@binance.test",
        trusted_forwarders="fwd@forwarder.test",
        imap_username="mailbox@example.test",
    )


def _setup_user(
    db: Session,
    email: str,
    *,
    plan_id: str | None = None,
    approved_by: str = "auto",
    completed: list[str] | None = None,
    daily_streak: int = 0,
    now: datetime | None = None,
) -> tuple[Account, Subscription | None]:
    now = now or datetime.now(timezone.utc)
    acc = Account(account_id=uuid.uuid4(), email=email, password_hash="x", plan="pro" if plan_id else "free", status="active")
    db.add(acc)
    db.flush()

    all_completed = completed if completed is not None else [
        f"{t}-{lvl}" for t in ("python", "javascript", "typescript", "sql", "dax", "java", "csharp", "php", "json", "yaml") for lvl in (1, 2)
    ]
    prog = UserLearningProgress(account_id=acc.account_id, completed=all_completed, remedial_completed=[], daily_streak=daily_streak)
    db.add(prog)

    sub = None
    if plan_id is not None:
        days = 7 if plan_id == "trial_7d" else (30 if plan_id == "pro_30d" else (90 if plan_id == "pro_90d" else 365))
        sub = Subscription(
            subscription_id=uuid.uuid4(),
            account_id=acc.account_id,
            plan_id=plan_id,
            status="ACTIVE",
            starts_at=now,
            expires_at=now + timedelta(days=days),
            approved_by=approved_by,
        )
        db.add(sub)
    db.flush()
    return acc, sub


def test_trial_7d_cannot_issue_official_certificate(db_session: Session):
    settings = _settings()
    acc, _ = _setup_user(db_session, "trial@example.com", plan_id="trial_7d", approved_by="trial_auto")

    with pytest.raises(CertificateError) as exc:
        issue_certificate_tx(
            db_session,
            settings,
            acc,
            cert_type="language",
            target_slug="python",
            language_code="es",
            holder_full_name="Trial User",
        )
    assert exc.value.status_code == 403
    assert exc.value.code == "TRIAL_PREVIEW_ONLY"


def test_pro_30d_quota_limit_and_path_restriction(db_session: Session):
    settings = _settings()
    acc, _ = _setup_user(db_session, "p30@example.com", plan_id="pro_30d")

    c1, st1 = issue_certificate_tx(
        db_session, settings, acc, cert_type="language", target_slug="python", language_code="es", holder_full_name="Ada Lovelace"
    )
    assert st1 == 201
    assert c1["cert_code"].startswith("JWS-CERT-")

    c2, st2 = issue_certificate_tx(
        db_session, settings, acc, cert_type="language", target_slug="sql", language_code="es"
    )
    assert st2 == 201

    # 3er certificado en mismo ciclo -> 403 QUOTA_EXCEEDED
    with pytest.raises(CertificateError) as exc_q:
        issue_certificate_tx(db_session, settings, acc, cert_type="language", target_slug="javascript", language_code="es")
    assert exc_q.value.status_code == 403
    assert exc_q.value.code == "QUOTA_EXCEEDED"

    # Ruta profesional en pro_30d -> 403 PLAN_TIER_REQUIRED
    with pytest.raises(CertificateError) as exc_t:
        issue_certificate_tx(db_session, settings, acc, cert_type="path", target_slug="data-bi", language_code="es")
    assert exc_t.value.status_code == 403
    assert exc_t.value.code == "PLAN_TIER_REQUIRED"


def test_pro_90d_allows_paths_and_6_certs(db_session: Session):
    settings = _settings()
    acc, _ = _setup_user(db_session, "p90@example.com", plan_id="pro_90d")

    # Permite path y cualquier idioma de los 7
    p1, st1 = issue_certificate_tx(
        db_session, settings, acc, cert_type="path", target_slug="data-bi", language_code="en", holder_full_name="Grace Hopper"
    )
    assert st1 == 201
    assert p1["allow_linkedin_deeplink"] is True

    for tech in ("python", "sql", "javascript", "typescript", "java"):
        _, st = issue_certificate_tx(db_session, settings, acc, cert_type="language", target_slug=tech, language_code="fr")
        assert st == 201

    # 7mo -> QUOTA_EXCEEDED
    with pytest.raises(CertificateError) as exc:
        issue_certificate_tx(db_session, settings, acc, cert_type="language", target_slug="php", language_code="es")
    assert exc.value.code == "QUOTA_EXCEEDED"


def test_pro_365d_unlimited_bilingual_and_portfolio(db_session: Session):
    settings = _settings()
    acc, _ = _setup_user(db_session, "p365@example.com", plan_id="pro_365d", daily_streak=10)

    c_bi, st = issue_certificate_tx(
        db_session, settings, acc, cert_type="annual_streak", target_slug="clean-doc-master", language_code="bilingual", holder_full_name="Linus Torvalds"
    )
    assert st == 201
    assert c_bi["portfolio_url"] is not None
    assert acc.portfolio_slug is not None

    for tech in ("python", "sql", "javascript", "typescript", "java", "csharp", "php"):
        _, st_t = issue_certificate_tx(db_session, settings, acc, cert_type="language", target_slug=tech, language_code="bilingual")
        assert st_t == 201

    pf = get_portfolio_public(db_session, acc.portfolio_slug)
    assert pf is not None
    assert len(pf["certificates"]) == 8


def test_certificate_reissue_is_idempotent_without_consuming_quota(db_session: Session):
    settings = _settings()
    acc, _ = _setup_user(db_session, "idem@example.com", plan_id="pro_30d")

    c1, st1 = issue_certificate_tx(
        db_session, settings, acc, cert_type="language", target_slug="python", language_code="es", holder_full_name="Alan Turing"
    )
    assert st1 == 201

    c1_again, st2 = issue_certificate_tx(
        db_session, settings, acc, cert_type="language", target_slug="python", language_code="es"
    )
    assert st2 == 200
    assert c1_again["cert_code"] == c1["cert_code"]

    # Todavía queda 1 cupo disponible (max 2)
    c2, st3 = issue_certificate_tx(db_session, settings, acc, cert_type="language", target_slug="sql", language_code="es")
    assert st3 == 201
    assert c2["cert_code"] != c1["cert_code"]


def test_holder_name_locking_and_24h_grace_window(db_session: Session):
    settings = _settings()
    now = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
    acc, _ = _setup_user(db_session, "lock@example.com", plan_id="pro_90d", now=now)

    c1, _ = issue_certificate_tx(
        db_session, settings, acc, cert_type="language", target_slug="python", language_code="es", holder_full_name="Jhon Doe", now=now
    )
    # Corrección permitida dentro de 24h con 0 vistas verificadas
    updated = update_holder_name_tx(db_session, acc, "John Doe", now=now + timedelta(hours=2))
    assert updated == "John Doe"

    # Segundo intento debe fallar (solo 1 corrección)
    with pytest.raises(CertificateError) as exc:
        update_holder_name_tx(db_session, acc, "Johnny Doe", now=now + timedelta(hours=3))
    assert exc.value.code == "NAME_LOCKED"

    # Otro usuario que ya recibió una vista verificada también queda bloqueado
    acc2, _ = _setup_user(db_session, "lock2@example.com", plan_id="pro_90d", now=now)
    c2, _ = issue_certificate_tx(
        db_session, settings, acc2, cert_type="language", target_slug="python", language_code="es", holder_full_name="Jane Doe", now=now
    )
    verify_certificate_public(db_session, settings, c2["cert_code"], increment_views=True)
    with pytest.raises(CertificateError) as exc2:
        update_holder_name_tx(db_session, acc2, "Janet Doe", now=now + timedelta(hours=1))
    assert exc2.value.code == "NAME_LOCKED"


def test_expired_subscription_keeps_cert_valid_but_revoked_shows_revoked(db_session: Session):
    settings = _settings()
    now = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
    acc, sub = _setup_user(db_session, "life@example.com", plan_id="pro_30d", now=now)
    assert sub is not None

    cert, _ = issue_certificate_tx(
        db_session, settings, acc, cert_type="language", target_slug="python", language_code="es", holder_full_name="Margaret Hamilton", now=now
    )
    # Expiración natural mantiene status == valid
    sub.status = "EXPIRED"
    db_session.flush()
    v1 = verify_certificate_public(db_session, settings, cert["cert_code"], increment_views=False)
    assert v1 is not None and v1["valid"] is True and v1["status"] == "valid"

    # Revocación por reembolso/disputa cambia a revoked
    revoked_count = revoke_certificates_for_subscription(db_session, sub.subscription_id, "Chargeback")
    assert revoked_count == 1
    v2 = verify_certificate_public(db_session, settings, cert["cert_code"], increment_views=False)
    assert v2 is not None and v2["valid"] is False and v2["status"] == "revoked"
    assert v2["revoked_reason"] == "Chargeback"
