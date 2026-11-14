from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.newsletter import (
    ArticlePayload,
    BroadcastBody,
    SubscribeBody,
    broadcast,
    list_subscribers,
    subscribe,
    unsubscribe,
)


def _make_request(ip: str = "127.0.0.1"):
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={})


def _make_sub(sub_id: int, email: str, lang: str = "es", status: str = "active", token: str = "tok_1234567890"):
    return SimpleNamespace(
        id=sub_id,
        email=email,
        lang=lang,
        status=status,
        unsubscribe_token=token,
        source="website",
        subscribed_at=None,
        unsubscribed_at=None,
    )


def test_subscribe_new_and_idempotent():
    fake_db = MagicMock()
    req = _make_request("10.0.0.1")

    # 1) Nuevo suscriptor
    fake_db.execute.return_value.scalar_one_or_none.return_value = None
    res = subscribe(SubscribeBody(email="User@Example.COM", lang="es", source="main-website"), req, fake_db)
    assert res == {"ok": True, "status": "subscribed"}
    assert fake_db.add.called

    # 2) Ya suscrito (idempotente)
    fake_db.execute.return_value.scalar_one_or_none.return_value = _make_sub(1, "user@example.com", "es", "active")
    res2 = subscribe(SubscribeBody(email="user@example.com", lang="es"), req, fake_db)
    assert res2 == {"ok": True, "status": "already_subscribed"}

    # 3) Reactivación desde unsubscribed
    unsub = _make_sub(2, "back@example.com", "es", "unsubscribed")
    fake_db.execute.return_value.scalar_one_or_none.return_value = unsub
    res3 = subscribe(SubscribeBody(email="back@example.com", lang="en"), req, fake_db)
    assert res3 == {"ok": True, "status": "subscribed"}
    assert unsub.status == "active"
    assert unsub.lang == "en"

    # 4) Email inválido
    with pytest.raises(HTTPException) as exc:
        subscribe(SubscribeBody(email="no-valido", lang="es"), req, fake_db)
    assert exc.value.status_code == 422


def test_unsubscribe_valid_and_invalid():
    fake_db = MagicMock()
    sub = _make_sub(1, "sub@example.com", "es", "active", "valid_token_123456")
    fake_db.execute.return_value.scalar_one_or_none.return_value = sub

    res = unsubscribe(token="valid_token_123456", db=fake_db)
    assert res.status_code == 200
    assert sub.status == "unsubscribed"
    assert "dado de baja" in res.body.decode("utf-8")

    fake_db.execute.return_value.scalar_one_or_none.return_value = None
    res_404 = unsubscribe(token="unknown_token_123456", db=fake_db)
    assert res_404.status_code == 404


def test_broadcast_auth_and_idempotency(monkeypatch):
    monkeypatch.setenv("NEWSLETTER_WEBHOOK_TOKEN", "super-secret-webhook-token-123")
    from app.core.config import get_settings
    get_settings.cache_clear()

    fake_db = MagicMock()
    sub1 = _make_sub(1, "uno@example.com", "es", "active", "tok_1")
    sub2 = _make_sub(2, "dos@example.com", "en", "active", "tok_2")

    res_subs = MagicMock()
    res_subs.scalars.return_value.all.return_value = [sub1, sub2]
    res_sent = MagicMock()
    res_sent.scalars.return_value.all.return_value = [2]
    fake_db.execute.side_effect = [res_subs, res_sent, MagicMock()]

    payload = BroadcastBody(
        event="article.published",
        event_id="jw-blog-20261114-test",
        article=ArticlePayload(
            slug="test-slug",
            title_es="Título ES",
            title_en="Title EN",
            summary_es="Resumen ES",
            summary_en="Summary EN",
            url_es="https://jw-solutions.com/blog/test-slug/",
            url_en="https://jw-solutions.com/blog/test-slug/?lang=en",
        ),
    )

    with pytest.raises(HTTPException) as exc:
        broadcast(payload, fake_db, authorization=None)
    assert exc.value.status_code == 401

    with patch("app.api.newsletter.send_html_email") as mock_send:
        ok = broadcast(payload, fake_db, authorization="Bearer super-secret-webhook-token-123")
    assert ok == {"ok": True, "sent": 1, "skipped": 1, "failed": 0}
    mock_send.assert_called_once()


def test_list_subscribers_requires_bearer_and_hides_tokens(monkeypatch):
    monkeypatch.setenv("NEWSLETTER_WEBHOOK_TOKEN", "super-secret-webhook-token-123")
    from app.core.config import get_settings
    get_settings.cache_clear()

    fake_db = MagicMock()
    sub1 = _make_sub(1, "uno@example.com", "es", "active", "secret_tok_1")
    sub2 = _make_sub(2, "dos@example.com", "en", "unsubscribed", "secret_tok_2")
    fake_db.execute.return_value.scalars.return_value.all.return_value = [sub1, sub2]

    with pytest.raises(HTTPException) as exc:
        list_subscribers(fake_db, authorization="Bearer wrong-token")
    assert exc.value.status_code == 401

    res = list_subscribers(fake_db, authorization="Bearer super-secret-webhook-token-123")
    assert res["ok"] is True
    assert res["total_active"] == 1
    assert res["total_unsubscribed"] == 1
    assert len(res["subscribers"]) == 2
    assert "unsubscribe_token" not in res["subscribers"][0]
