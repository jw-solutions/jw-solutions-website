from __future__ import annotations

import types
import uuid

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.defense import decoy_export_dump, decoy_limiter
from app.api.newsletter import SubscribeBody, subscribe
from app.models.newsletter import NewsletterSubscriber
from app.security.anti_scraping import AntiScrapingEngine, defense_engine, sanitize_route


def _fake_request(path: str, *, ua: str = "Mozilla/5.0", accept: str = "application/json", ip: str = "198.51.100.10"):
    return types.SimpleNamespace(
        url=types.SimpleNamespace(path=path),
        headers={"user-agent": ua, "accept": accept},
        client=types.SimpleNamespace(host=ip),
    )


def test_anti_scraping_gradual_classification_and_verified_bot_allowlist():
    engine = AntiScrapingEngine(max_keys=64)

    # 1. Tráfico limpio de navegador normal
    clean = engine.assess_request(
        client_key="ip-clean",
        route="/api/payments/channels",
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        accept_header="application/json",
    )
    assert clean.risk_level == "clean"
    assert clean.risk_score == 0

    # 2. Bot verificado (Googlebot) nunca se bloquea ni penaliza
    gbot = engine.assess_request(
        client_key="ip-gbot",
        route="/tools/code-formatter/tips/python/",
        user_agent="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        accept_header="",
    )
    assert gbot.risk_level == "clean"
    assert gbot.user_agent_class == "verified_bot"
    assert gbot.action_taken == "allow_verified"

    # 3. Una sola señal débil (ej. curl aislado) NO dispara confirmed_bot
    single_weak = engine.assess_request(
        client_key="ip-curl",
        route="/api/payments/channels",
        user_agent="curl/8.5.0",
        accept_header="*/*",
    )
    assert single_weak.risk_level == "clean"
    assert single_weak.risk_score == 25

    # 4. Combinación de señales múltiples (script UA + sin Accept + origin incoherente) -> suspicious
    susp = engine.assess_request(
        client_key="ip-susp",
        route="/api/payments/channels",
        user_agent="python-requests/2.31",
        accept_header="",
        origin_coherent=False,
    )
    assert susp.risk_level == "suspicious"
    assert 40 <= susp.risk_score < 80

    # 5. Activación de trampa -> confirmed_bot con monetización indirecta pública
    bot = engine.assess_request(
        client_key="ip-bot",
        route="/api/_internal/export-dump",
        user_agent="Scrapy/2.11",
        decoy_triggered=True,
    )
    assert bot.risk_level == "confirmed_bot"
    assert bot.risk_score >= 80
    assert bot.monetization_event == "public_offer_routed"
    assert bot.monetization_target and bot.monetization_target.startswith("https://jw-solutions.com/")


def test_decoy_endpoint_returns_public_links_without_pii_and_emits_structured_telemetry():
    defense_engine.reset()
    decoy_limiter._hits.clear()
    req = _fake_request("/api/_internal/export-dump", ua="python-requests/2.31", accept="")
    res = decoy_export_dump(req)

    assert res["status"] == "public_catalog"
    assert len(res["links"]) >= 2
    assert all(link["url"].startswith("https://jw-solutions.com/") for link in res["links"])
    serialized = str(res).lower()
    assert "secret" not in serialized
    assert "password" not in serialized
    assert "@" not in serialized

    # Verificar sanitización de ruta y formato de telemetría sin PII
    assessment = defense_engine.assess_request(
        client_key="ip-t",
        route="/api/test/user@example.com/tok_1234567890123456789012345678?email=x@y.com",
        user_agent="Scrapy/2.11",
        decoy_triggered=True,
    )
    rec = defense_engine.emit_telemetry(
        assessment,
        route="/api/test/user@example.com/tok_1234567890123456789012345678?email=x@y.com",
    )
    for field in ("timestamp", "route", "user_agent_class", "risk_score", "action_taken", "monetization_event"):
        assert field in rec
    assert "user@example.com" not in rec["route"]
    assert "email=x@y.com" not in rec["route"]
    assert "[redacted-email]" in sanitize_route("/u/user@example.com")


def test_newsletter_honeypot_accepts_silently_without_persisting_subscriber():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE newsletter_subscribers (
                id TEXT PRIMARY KEY,
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
    LocalSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db: Session = LocalSession()
    try:
        req = _fake_request("/api/newsletter/subscribe", ua="python-requests/2.31", ip=f"203.0.113.{uuid.uuid4().int % 200}")
        body = SubscribeBody(email="bot@spam.test", lang="es", channel="code-formatter", _gotcha="https://spam.invalid")
        out = subscribe(body, req, db)
        assert out == {"ok": True, "status": "subscribed"}
        rows = db.execute(select(NewsletterSubscriber)).scalars().all()
        assert rows == [], "El honeypot relleno no debe insertar ningún suscriptor en BD"
    finally:
        db.close()
        engine.dispose()
