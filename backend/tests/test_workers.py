from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.workers.expiration_worker import expiration_window

ALLOWED = ["https://jw-solutions.com", "https://www.jw-solutions.com"]


def test_window_is_one_business_day_in_utc():
    now = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)  # 11:00 en Nueva York (EDT)
    start, end = expiration_window(3, "America/New_York", now)
    assert start == datetime(2026, 10, 30, 4, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 10, 31, 4, 0, tzinfo=timezone.utc)


def test_window_handles_dst_fall_back_day_with_25_hours():
    now = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)  # el 1-nov-2026 termina el horario de verano
    start, end = expiration_window(0, "America/New_York", now)
    assert (end - start).total_seconds() == 25 * 3600


def test_window_handles_dst_spring_forward_day_with_23_hours():
    now = datetime(2026, 3, 8, 12, 0, tzinfo=timezone.utc)
    start, end = expiration_window(0, "America/New_York", now)
    assert (end - start).total_seconds() == 23 * 3600


def test_origin_get_is_not_checked():
    from app.security.origin_validation import check_origin

    check_origin("GET", "/api/me", None, ALLOWED)


@pytest.mark.parametrize("origin", [None, "", "null", "https://evil.test", "https://jw-solutions.com.evil.test", "http://jw-solutions.com"])
def test_origin_rejected_on_writes(origin):
    from app.security.origin_validation import check_origin

    with pytest.raises(HTTPException) as exc:
        check_origin("POST", "/api/auth/login", origin, ALLOWED)
    assert exc.value.status_code == 403


def test_origin_allowed_on_writes():
    from app.security.origin_validation import check_origin

    check_origin("DELETE", "/api/x", "https://www.jw-solutions.com", ALLOWED)


def test_csrf_token_is_bound_to_session_and_generation():
    import uuid

    from app.security.csrf import csrf_token_for, verify_csrf
    from app.security.sessions import SessionInfo

    sid, acc = uuid.uuid4(), uuid.uuid4()
    expires = datetime(2030, 1, 1, tzinfo=timezone.utc)
    s1 = SessionInfo(sid, acc, 1, expires)
    token = csrf_token_for(s1, "secret")
    assert verify_csrf(s1, token, "secret")
    assert not verify_csrf(SessionInfo(sid, acc, 2, expires), token, "secret")
    assert not verify_csrf(SessionInfo(uuid.uuid4(), acc, 1, expires), token, "secret")
    assert not verify_csrf(s1, None, "secret")
    assert not verify_csrf(s1, token, "other-secret")


def test_settings_reject_wildcard_origins_and_non_host_cookie(monkeypatch):
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(allowed_origins="*")  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        Settings(session_cookie_name="jw_session")  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        Settings(payment_review_required=False)  # type: ignore[call-arg]


def test_outbox_templates_render_and_unknown_event_is_permanent():
    from app.core.config import get_settings
    from app.services.notification_service import PermanentDeliveryError, render

    settings = get_settings()
    to, subject, body = render(
        "subscription_reminder", {"to": "u@example.test", "reminder_days": 3, "expires_at": "2026-11-01T00:00:00+00:00"}, settings
    )
    assert to == "u@example.test" and "3 días" in subject and settings.payment_recipient_id in body
    with pytest.raises(PermanentDeliveryError):
        render("nope", {}, settings)
