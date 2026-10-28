import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import session_scope
from app.services.notification_service import enqueue
from app.services.subscription_service import expire_due_subscriptions, has_active_pro
from app.workers import outbox_worker
from app.workers.expiration_worker import create_reminders, expiration_window, run_once

NOW = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)


def count(sql, **p):
    with session_scope() as s:
        return s.execute(text(sql), p).scalar()


def add_subscription(account_id, report_id, expires_at, status="ACTIVE"):
    with session_scope() as s:
        s.execute(
            text(
                "INSERT INTO subscriptions (account_id, plan_id, status, starts_at, expires_at, payment_report_id, approved_by) "
                "VALUES (:a, 'pro', :st, :s, :e, :r, 'admin')"
            ),
            {"a": account_id, "st": status, "s": expires_at - timedelta(days=30), "e": expires_at, "r": report_id},
        )


def test_reminders_are_idempotent_and_ignore_other_days(make_account, make_report):
    settings = get_settings()
    a1, a2 = make_account(), make_account()
    start3, _ = expiration_window(3, settings.business_timezone, NOW)
    start5, _ = expiration_window(5, settings.business_timezone, NOW)
    add_subscription(a1, make_report(a1, txid="TX111111111"), start3 + timedelta(hours=5))
    add_subscription(a2, make_report(a2, txid="TX222222222"), start5 + timedelta(hours=5))

    for _ in range(3):  # re-ejecuciones del cron
        with session_scope() as s:
            create_reminders(s, settings, 3, NOW)
    assert count("SELECT count(*) FROM subscription_reminders") == 1
    assert count("SELECT count(*) FROM notification_outbox WHERE event_type='subscription_reminder'") == 1
    assert count("SELECT count(*) FROM subscription_reminders WHERE outbox_event_id IS NOT NULL") == 1


def test_concurrent_crons_create_one_reminder(make_account, make_report):
    settings = get_settings()
    account = make_account()
    start, _ = expiration_window(1, settings.business_timezone, NOW)
    add_subscription(account, make_report(account), start + timedelta(hours=2))

    def go():
        with session_scope() as s:
            create_reminders(s, settings, 1, NOW)

    threads = [threading.Thread(target=go) for _ in range(5)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert count("SELECT count(*) FROM notification_outbox WHERE event_type='subscription_reminder'") == 1


def test_renewal_creates_new_reminder_cycle(make_account, make_report):
    settings = get_settings()
    account = make_account()
    start, _ = expiration_window(3, settings.business_timezone, NOW)
    first = start + timedelta(hours=3)
    add_subscription(account, make_report(account, txid="TX111111111"), first)
    with session_scope() as s:
        create_reminders(s, settings, 3, NOW)
    with session_scope() as s:  # simula renovación: el mismo registro con nueva expiración que vuelve a caer en la ventana
        s.execute(text("UPDATE subscriptions SET expires_at = :e"), {"e": first + timedelta(hours=1)})
        create_reminders(s, settings, 3, NOW)
    assert count("SELECT count(*) FROM subscription_reminders") == 2


def test_expiration_removes_pro_only_when_no_active_subscription_remains(make_account, make_report):
    a1, a2 = make_account(), make_account()
    with session_scope() as s:
        s.execute(text("UPDATE accounts SET plan='pro'"))
    add_subscription(a1, make_report(a1, txid="TX111111111"), NOW - timedelta(hours=1))
    add_subscription(a2, make_report(a2, txid="TX222222222"), NOW - timedelta(hours=1))
    add_subscription(a2, make_report(a2, txid="TX333333333"), NOW + timedelta(days=10))
    with session_scope() as s:
        assert expire_due_subscriptions(s, NOW) == 2
    assert count("SELECT plan FROM accounts WHERE account_id=:a", a=a1) == "free"
    assert count("SELECT plan FROM accounts WHERE account_id=:a", a=a2) == "pro"
    with session_scope() as s:
        assert has_active_pro(s, a2, NOW) and not has_active_pro(s, a1, NOW)


def test_run_once_end_to_end(make_account, make_report):
    account = make_account()
    add_subscription(account, make_report(account), datetime.now(timezone.utc) - timedelta(minutes=1))
    assert run_once(get_settings())["expired"] == 1


def test_outbox_claim_is_disjoint_under_concurrency():
    with session_scope() as s:
        for i in range(40):
            enqueue(s, "imap_alert", {"n": i}, idempotency_key=f"k{i}")
    claimed: list[list[int]] = []

    def go():
        claimed.append([e["id"] for e in outbox_worker.claim_batch(batch=10)])

    threads = [threading.Thread(target=go) for _ in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    flat = [i for batch in claimed for i in batch]
    assert len(flat) == len(set(flat)) == 40


def test_enqueue_idempotency_key_prevents_duplicates():
    with session_scope() as s:
        assert enqueue(s, "imap_alert", {}, idempotency_key="same") is not None
        assert enqueue(s, "imap_alert", {}, idempotency_key="same") is None
    assert count("SELECT count(*) FROM notification_outbox") == 1


def test_abandoned_processing_events_are_reclaimed_and_node_pending_untouched():
    with session_scope() as s:
        enqueue(s, "imap_alert", {}, idempotency_key="stale")
        s.execute(text("INSERT INTO notification_outbox (event_type, payload) VALUES ('payment_reported', '{}')"))
    assert len(outbox_worker.claim_batch(lease=-1)) == 1  # lease ya vencido al reclamar (worker "caído")
    assert len(outbox_worker.claim_batch()) == 1  # se recupera
    assert len(outbox_worker.claim_batch()) == 0
    assert count("SELECT count(*) FROM notification_outbox WHERE status='pending'") == 1


def test_failed_send_retries_with_backoff_then_fails_permanently(monkeypatch):
    with session_scope() as s:
        enqueue(s, "imap_alert", {"subject": "x"}, idempotency_key="boom")

    def broken(*_a, **_k):
        raise ConnectionError("smtp down")

    monkeypatch.setattr(outbox_worker, "send_email", broken)
    settings = get_settings()
    assert outbox_worker.run_once(settings)["retry"] == 1
    assert count("SELECT status FROM notification_outbox") == "queued"
    assert count("SELECT next_attempt_at > now() FROM notification_outbox") is True
    with session_scope() as s:
        s.execute(text("UPDATE notification_outbox SET attempts = :m, next_attempt_at = now()"), {"m": outbox_worker.MAX_ATTEMPTS - 1})
    assert outbox_worker.run_once(settings)["failed"] == 1
    assert count("SELECT status FROM notification_outbox") == "failed"


def test_successful_send_marks_sent(monkeypatch):
    sent = []
    monkeypatch.setattr(outbox_worker, "send_email", lambda _s, to, subject, body: sent.append(to))
    with session_scope() as s:
        enqueue(s, "imap_alert", {"subject": "x"}, idempotency_key="ok")
    assert outbox_worker.run_once(get_settings())["sent"] == 1
    assert sent == [get_settings().mail_to]
    assert count("SELECT status FROM notification_outbox") == "sent"
