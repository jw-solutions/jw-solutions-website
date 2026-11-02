"""Registro, sesión, CSRF y reporte de pago contra PostgreSQL real (ver conftest)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import session_scope
from app.security import rate_limit

PWD = "correct-horse-battery"


@pytest.fixture
def client(monkeypatch):
    origin = get_settings().allowed_origins_list[0]
    from app.main import create_app

    rate_limit.auth_limiter._hits.clear()
    rate_limit.payment_limiter._hits.clear()
    c = TestClient(create_app(), base_url="https://testserver", headers={"Origin": origin})
    return c


def count(sql, **p):
    with session_scope() as s:
        return s.execute(text(sql), p).scalar()


def register(client, email="nuevo@example.com", password=PWD):
    return client.post("/api/auth/register", json={"email": email, "password": password})


def test_register_creates_account_and_session(client):
    r = register(client)
    assert r.status_code == 201 and r.json()["csrf_token"]
    assert get_settings().session_cookie_name in r.cookies or client.cookies
    assert count("SELECT password_hash FROM accounts WHERE email='nuevo@example.com'").startswith("$argon2id$")
    assert client.get("/api/me").json()["email"] == "nuevo@example.com"


def test_register_duplicate_is_409_case_insensitive(client):
    assert register(client).status_code == 201
    assert register(client, email="NUEVO@example.com").status_code == 409


@pytest.mark.parametrize("email,password", [("no-es-correo", PWD), ("a@example.com", "corta"), ("a@example.com", "x" * 129)])
def test_register_invalid_is_422(client, email, password):
    assert register(client, email, password).status_code == 422


def test_register_rejects_missing_origin(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "password": PWD}, headers={"Origin": ""})
    assert r.status_code == 403


def test_payment_report_requires_session_and_csrf(client):
    body = {"txid": "TX123456789", "asset": "USDT", "amount": "10.5", "paid_at": __import__("datetime").date.today().isoformat()}
    assert client.post("/api/payments/report", json=body).status_code == 401
    token = register(client).json()["csrf_token"]
    assert client.post("/api/payments/report", json=body).status_code == 403  # sin X-CSRF-Token
    ok = client.post("/api/payments/report", json=body, headers={"X-CSRF-Token": token})
    assert ok.status_code == 201 and ok.json()["reportId"]
    assert count("SELECT status FROM payment_reports") == "pending"
    assert count("SELECT count(*) FROM notification_outbox WHERE event_type='payment_report_created' AND status='queued'") == 1
    dup = client.post("/api/payments/report", json={**body, "txid": "tx123456789"}, headers={"X-CSRF-Token": token})
    assert dup.status_code == 409
    assert client.get("/api/csrf").json()["csrf_token"] == token


def test_payment_report_validation(client):
    token = register(client).json()["csrf_token"]
    bad = {"txid": "x", "asset": "DOGE", "amount": "-1", "paid_at": "2020-01-01"}
    assert client.post("/api/payments/report", json=bad, headers={"X-CSRF-Token": token}).status_code == 422


def test_login_after_register_replaces_session(client):
    register(client)
    other = TestClient(client.app, base_url="https://testserver", headers={"Origin": get_settings().allowed_origins_list[0]})
    assert other.post("/api/auth/login", json={"email": "nuevo@example.com", "password": PWD}).status_code == 200
    assert client.get("/api/me").status_code == 401  # sesión única: la anterior queda revocada
