from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.academy import (
    AcademyHintBody,
    AcademySyncBody,
    CertificateIssueBody,
    get_pro_level,
    get_progress,
    get_socratic_hint,
    issue_certificate,
    sync_progress,
    verify_certificate,
)
from app.core.config import get_settings
from app.core.database import Base
from app.models.academy import (
    AcademyCertificate,
    AcademyHintCache,
    AcademyProLevel,
    UserAchievement,
    UserLearningProgress,
)
from app.services.newsletter_service import SUPPORTED_LANGS, _render_code_formatter_email
from app.models.account import Account
from app.models.payment import PaymentReport
from app.models.subscription import Subscription
from app.security.sessions import SessionInfo


@pytest.fixture()
def academy_db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///:memory:")
    monkeypatch.setenv("SESSION_SECRET", "x" * 40)
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://jw-solutions.com")
    get_settings.cache_clear()

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        bind=engine,
        tables=[
            Account.__table__,
            PaymentReport.__table__,
            Subscription.__table__,
            UserLearningProgress.__table__,
            UserAchievement.__table__,
            AcademyProLevel.__table__,
            AcademyHintCache.__table__,
            AcademyCertificate.__table__,
        ],
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    free_id = uuid.uuid4()
    pro_id = uuid.uuid4()
    with TestingSession() as db:
        db.add(Account(account_id=free_id, email="free@jw.local", password_hash="h", plan="free", status="active"))
        db.add(Account(account_id=pro_id, email="pro@jw.local", password_hash="h", plan="pro", status="active"))
        db.add(
            AcademyProLevel(
                tech="python",
                level=3,
                locale="es",
                title="PYTHON 3 · Refactorización modular (Pro)",
                payload={"id": "python-3", "tier": "pay", "concept_capsule": "Pro capsule"},
            )
        )
        db.commit()

    def make_session(account_id: uuid.UUID) -> SessionInfo:
        return SessionInfo(
            session_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
            account_id=account_id,
            generation=1,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )

    with TestingSession() as db:
        yield db, free_id, pro_id, make_session
    get_settings.cache_clear()


def test_academy_sync_and_progress_roundtrip(academy_db):
    db, free_id, _, make_session = academy_db
    sess = make_session(free_id)

    synced = sync_progress(
        AcademySyncBody(
            completed=["python-1"],
            remedial_completed=["py1-d-syntax"],
            achievements=["first_level"],
            daily_streak=2,
        ),
        session=sess,
        db=db,
    )
    db.commit()
    assert synced["completed"] == ["python-1"]
    assert synced["achievements"] == ["first_level"]
    assert synced["daily_streak"] == 2

    prog = get_progress(session=sess, db=db)
    assert prog["is_pro"] is False
    assert prog["completed"] == ["python-1"]


def test_pro_level_and_hint_semantic_cache(academy_db):
    db, free_id, pro_id, make_session = academy_db
    free_sess = make_session(free_id)
    pro_sess = make_session(pro_id)

    with pytest.raises(HTTPException) as exc_lvl:
        get_pro_level(tech="python", level=3, session=free_sess, db=db)
    assert exc_lvl.value.status_code == 403

    with pytest.raises(HTTPException) as exc_hint:
        get_socratic_hint(
            AcademyHintBody(challenge_id="python-1", error_code="syntax", ast_signature="def_missing_colon", locale="es"),
            session=free_sess,
            db=db,
        )
    assert exc_hint.value.status_code == 403

    lvl = get_pro_level(tech="python", level=3, session=pro_sess, db=db)
    assert lvl["tier"] == "pay"
    assert lvl["id"] == "python-3"

    hint_body = AcademyHintBody(
        challenge_id="python-1", error_code="syntax", ast_signature="def_missing_colon", locale="es"
    )
    first = get_socratic_hint(hint_body, session=pro_sess, db=db)
    db.commit()
    assert first["cached"] is False

    second = get_socratic_hint(hint_body, session=pro_sess, db=db)
    assert second["cached"] is True
    assert second["hint"] == first["hint"]


def test_certificate_issue_and_hmac_verification(academy_db):
    from fastapi import Response
    db, free_id, pro_id, make_session = academy_db
    free_sess = make_session(free_id)
    pro_sess = make_session(pro_id)

    with pytest.raises(HTTPException) as exc_free:
        issue_certificate(CertificateIssueBody(cert_type="language", target_slug="python", holder_name="Alumno Test"), response=Response(), session=free_sess, db=db)
    assert exc_free.value.status_code == 403

    from app.models.academy import UserLearningProgress
    from app.models.subscription import Subscription
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    db.add(UserLearningProgress(account_id=pro_id, completed=["python-1", "python-2"], remedial_completed=[], daily_streak=0))
    db.add(Subscription(account_id=pro_id, plan_id="pro_30d", status="ACTIVE", starts_at=now, expires_at=now + timedelta(days=30), approved_by="test"))
    db.flush()

    issued = issue_certificate(CertificateIssueBody(cert_type="language", target_slug="python", holder_name="Alumno Test"), response=Response(), session=pro_sess, db=db)
    db.commit()
    assert issued["cert_id"].startswith("JWS-CERT-")

    verified = verify_certificate(issued["cert_id"], response=Response(), db=db)
    assert verified["valid"] is True
    assert verified["holder_name"] == "Alumno Test"


def test_newsletter_academy_cta_in_all_7_languages():
    article = {
        "slug": "python-312-pep8-tips",
        "programming_language": "python",
        "title_es": "Guía PEP 8",
        "summary_es": "Resumen",
        "url_es": "https://jw-solutions.com/tools/code-formatter/tips/python/python-312-pep8-tips/es/",
    }
    for loc in SUPPORTED_LANGS:
        _, text_body, html_body = _render_code_formatter_email(article, loc, "https://api.jw-solutions.com/unsub?t=1")
        assert "mode=learn" in text_body
        assert "utm_source=newsletter" in html_body


def test_register_auto_activates_trial_7d_and_falls_back_on_abuse(academy_db):
    from fastapi import Request, Response
    from sqlalchemy import text
    from app.api.auth import RegisterBody, register
    from app.models.subscription import Subscription
    from app.services.subscription_service import TrialAlreadyUsedError, activate_trial_7d

    db, _, _, _ = academy_db
    # Crear tablas trial_usage y notification_outbox mínimas en SQLite
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS trial_usage (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL UNIQUE,
            normalized_email TEXT NOT NULL UNIQUE,
            ip_hash TEXT NOT NULL,
            device_fingerprint_hash TEXT NOT NULL,
            granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT NOT NULL
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            user_agent TEXT,
            generation INTEGER NOT NULL DEFAULT 1,
            expires_at TEXT NOT NULL,
            revoked_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS notification_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            idempotency_key TEXT UNIQUE
        )
    """))
    import app.services.notification_service as ns
    import app.services.subscription_service as ss
    orig_enqueue = ss.enqueue
    ss.enqueue = lambda s, et, p, idempotency_key=None: 1

    try:
        from app.models.account import Account
        import uuid
        acc1 = Account(account_id=uuid.uuid4(), email="newdev@gmail.com", password_hash="h", plan="free", status="active")
        db.add(acc1)
        db.flush()

        from app.core.config import get_settings
        sub = activate_trial_7d(db, get_settings(), account=acc1, client_ip_addr="198.51.100.10", device_fingerprint="fp-new-1")
        assert sub.plan_id == "trial_7d"
        assert acc1.plan == "pro"

        # Segundo registro desde la misma IP/dispositivo: lanza TrialAlreadyUsedError pero permite fallback a free
        acc2 = Account(account_id=uuid.uuid4(), email="otherdev@gmail.com", password_hash="h", plan="free", status="active")
        db.add(acc2)
        db.flush()
        with pytest.raises(TrialAlreadyUsedError):
            activate_trial_7d(db, get_settings(), account=acc2, client_ip_addr="198.51.100.10", device_fingerprint="fp-new-1")
        assert acc2.plan == "free"
    finally:
        ss.enqueue = orig_enqueue
